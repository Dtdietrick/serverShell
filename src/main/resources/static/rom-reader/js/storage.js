// Auto-upload polling loop: wait until save exists, then start interval uploads
function waitForSaveFileAndStartAutoSave(romName, initialRetryDelayMs = 60000, uploadIntervalMs = 300000) {
  let autoSaveStarted = false;

  async function tryDetectSave() {
    const manager = window.wrc?.getSaveManager?.();
    if (!manager || typeof manager.getSaveBlob !== "function") {
      console.log("⏳ SaveManager not ready yet — will retry.");
      setTimeout(tryDetectSave, initialRetryDelayMs);
      return;
    }

    try {
      // Attempt to get the save blob
      const blob = await window.getSaveStateBlob?.(); // <- manually calls saveState + flush
      if (blob instanceof Blob) {
        console.log("✅ First save blob detected — enabling auto-upload every", uploadIntervalMs / 1000, "seconds.");
        autoSaveStarted = true;

        // Start background auto-upload loop
        setInterval(() => {
          autoUploadSave(romName);
        }, uploadIntervalMs);
      } else {
        console.log("⏳ No save blob found yet — will retry.");
        setTimeout(tryDetectSave, initialRetryDelayMs);
      }
    } catch (err) {
      console.warn("⚠️ Error while checking for save blob:", err);
      setTimeout(tryDetectSave, initialRetryDelayMs);
    }
  }

  // Only run detection if not already running
  if (!autoSaveStarted) {
    tryDetectSave();
  }
}

// Clear browser storage before launching new emulator session
async function fullClear() {
  console.log("🧹 Clearing emulator storage...");
  localStorage.clear();
  sessionStorage.clear();
  if (window.indexedDB) {
    const req = indexedDB.deleteDatabase("webrcade");
    req.onsuccess = () => console.log("✅ IndexedDB cleared");
    req.onerror = () => console.warn("⚠️ Failed to clear IndexedDB");
    req.onblocked = () => console.warn("⛔ IndexedDB clear blocked (still in use)");
  }
}

// Periodically uploads the user's save blob to the backend
async function autoUploadSave(romName) {
  const file = await getSaveBlob();

  if (!file) {
    console.warn("❌ No save blob found for upload");
    return;
  }

  const form = new FormData();
  form.append("file", file, `${romName}.sav`);

  try {
    const res = await fetch(`/saves/${romName}.sav`, {
      method: "POST",
      body: form,
    });

    if (res.ok) {
      console.log("✅ Auto-uploaded save file");
    } else {
      console.warn("❌ Upload failed:", await res.text());
    }
  } catch (err) {
    console.error("❌ Auto-upload error:", err);
  }
}

// Abstract saveBlob getter — uses WebRCade’s exposed helper
async function getSaveBlob() {
  const { emulator, iframeWin } = await waitForApp();
  if (!emulator || !iframeWin) {
    console.warn("❌ Emulator not ready — cannot get save blob.");
    return null;
  }

  // ✅ Force emulator to commit SRAM to /tmp/game.srm
  try {
    emulator.saveState();
    console.log("📥 Called emulator.saveState() to sync SRAM.");
  } catch (err) {
    console.warn("⚠️ saveState() failed:", err);
  }

  // ✅ Flush FS → IDB
  if (iframeWin.wrc?.flushSaveData) {
    try {
      console.log("💾 Flushing emulator save data before blob fetch...");
      await iframeWin.wrc.flushSaveData();
    } catch (err) {
      console.warn("⚠️ flushSaveData failed:", err);
    }
  }

  // 🔍 Attempt to get blob via WebRCade helper
  if (iframeWin.wrc?.getSaveBlob) {
    try {
      const maybeResult = iframeWin.wrc.getSaveBlob();

      if (maybeResult && typeof maybeResult.then === "function") {
        const blob = await maybeResult;
        if (blob instanceof Blob) return blob;
      }

      if (typeof maybeResult === "function") {
        const nested = await maybeResult();
        if (nested instanceof Blob) return nested;
      }

      console.warn("⚠️ getSaveBlob returned unknown type:", maybeResult);
    } catch (err) {
      console.warn("❌ Error while calling getSaveBlob:", err);
    }
  }

  // 🔄 Fallback: Check IndexedDB directly
  console.warn("⚠️ getSaveBlob not available — checking IndexedDB...");

  return new Promise((resolve) => {
    const dbReq = indexedDB.open("webrcade");

    dbReq.onsuccess = () => {
      const db = dbReq.result;

      if (!db.objectStoreNames.contains("STORAGE")) {
        resolve(null);
        return;
      }

      const tx = db.transaction("STORAGE", "readonly");
      const store = tx.objectStore("STORAGE");

      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const key = cursor.key;
          if (typeof key === "string" && key.endsWith("/sav.zip")) {
            const blob = cursor.value?.data;
            if (blob instanceof Blob) {
              console.log("💾 Found save in STORAGE:", key);
              resolve(blob);
              return;
            }
          }
          cursor.continue();
        } else {
          resolve(null);
        }
      };

      cursorReq.onerror = () => resolve(null);
    };

    dbReq.onerror = () => resolve(null);
  });
}

// ✅ Export
export {
  fullClear,
  waitForSaveFileAndStartAutoSave as waitForVfsAndStartAutoSave,
  getSaveBlob,
  autoUploadSave
};
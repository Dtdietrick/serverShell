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
async function autoUploadSave(romName, blobOverride = null) {
  const file = blobOverride || await getSaveBlob();

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
  const saveManager = window?.wrc?.getSaveManager?.();
  const emulator = saveManager?.emulator;
  const iframeWin = window;

  if (!emulator || typeof emulator.saveState !== "function") {
    console.warn("❌ Emulator not ready — cannot get save blob.");
    return null;
  }

  try {
    console.log("📥 Calling saveState() to sync SRAM...");
    emulator.saveState();

    await new Promise(res => setTimeout(res, 100)); // small flush buffer

    if (iframeWin.wrc?.flushSaveData) {
      console.log("💾 Flushing VFS to IndexedDB...");
      await iframeWin.wrc.flushSaveData();
    }
  } catch (err) {
    console.warn("⚠️ saveState() or flushSaveData() failed:", err);
  }

  if (iframeWin.wrc?.getSaveBlob) {
    try {
      const result = iframeWin.wrc.getSaveBlob();
      const blob = typeof result.then === "function" ? await result : (typeof result === "function" ? await result() : null);
      if (blob instanceof Blob) return blob;

      console.warn("⚠️ getSaveBlob returned unknown:", result);
    } catch (err) {
      console.warn("❌ Error while calling getSaveBlob:", err);
    }
  }

  // 🔄 Fallback: Check IndexedDB directly
  console.warn("⚠️ getSaveBlob not available — checking IndexedDB directly...");

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

// Auto-upload polling loop: waits for save blob then begins periodic uploads
function waitForSaveFileAndStartAutoSave(romName, initialRetryDelayMs = 60000, uploadIntervalMs = 300000) {
  let autoSaveStarted = false;

  async function tryDetectSave() {
    const blob = await getSaveBlob();

    if (blob instanceof Blob) {
      console.log("✅ First save blob detected — enabling auto-upload every", uploadIntervalMs / 1000, "seconds.");
      autoSaveStarted = true;

      setInterval(() => {
        autoUploadSave(romName);
      }, uploadIntervalMs);
    } else {
      console.log("⏳ No save blob found yet — will retry.");
      setTimeout(tryDetectSave, initialRetryDelayMs);
    }
  }

  if (!autoSaveStarted) {
    tryDetectSave();
  }
}

// ✅ Export
export {
  fullClear,
  waitForSaveFileAndStartAutoSave as waitForVfsAndStartAutoSave,
  getSaveBlob,
  autoUploadSave
};
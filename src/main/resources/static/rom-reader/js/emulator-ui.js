let saveManager = null;
let emulator = null;

// 📌 Shared helper to get to the deepest emulator window (/gba)
export function resolveEmulatorWindow(launcherIframe) {
  const win = launcherIframe?.contentWindow;

  if (!win) {
    console.warn("⚠️ Could not access iframe window.");
    return null;
  }

  console.log("🧪 Resolved emulator iframe window.href:", win.location?.href);
  console.log("🧪 Resolved window.feedItem:", win.feedItem);
  // Assert flat mode
  if (!win?.app?.emulator) {
    console.warn("⚠️ Expected flat mode, but emulator not found in iframe window.");
  }

  return win;
}

// Returns: true if ready, false otherwise
async function waitForSaveIdReady(maxTries = 10, delay = 200) {
  let tries = 0;
  while (tries < maxTries) {
    const id = saveManager?.getId?.();
    if (id) return true;

    console.log(`⏳ Waiting for saveManager.getId()... attempt ${tries + 1}`);
    await new Promise(res => setTimeout(res, delay));
    tries++;
  }
  return false;
}

// ✅ New internal IndexedDB fallback
async function getSaveBlobFromIndexedDb(label) {
  return new Promise((resolve) => {
    const dbReq = indexedDB.open("webrcade");

    dbReq.onsuccess = () => {
      const db = dbReq.result;

      if (!db.objectStoreNames.contains("STORAGE")) {
        console.warn(`[${label}] ⚠️ STORAGE store not found in IndexedDB`);
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
              console.log(`[${label}] 💾 Found save blob in IndexedDB:`, key);
              resolve(blob);
              return;
            }
          }
          cursor.continue();
        } else {
          console.warn(`[${label}] ❌ No .zip save found in STORAGE`);
          resolve(null);
        }
      };

      cursorReq.onerror = () => {
        console.warn(`[${label}] ❌ Error reading STORAGE cursor`);
        resolve(null);
      };
    };

    dbReq.onerror = () => {
      console.warn(`[${label}] ❌ Failed to open webrcade DB`);
      resolve(null);
    };
  });
}

// ✅ Main callable function
export async function getSaveBlobFromEmulator(label = "unspecified") {
  console.log(`📍 getSaveBlobFromEmulator() called from: ${label}`);

  if (!saveManager || !emulator) {
    console.warn(`[${label}] ❌ Emulator or saveManager not ready`);
    return await getSaveBlobFromIndexedDb(label);
  }

  try {
    console.log(`[${label}] 📥 Calling saveState() to sync SRAM...`);
    emulator.saveState();
    await new Promise(res => setTimeout(res, 100));

    if (window?.wrc?.flushSaveData) {
      console.log(`[${label}] 💾 Flushing VFS to IndexedDB...`);
      await window.wrc.flushSaveData().catch(e => {
        console.warn(`[${label}] 🚨 flushSaveData error:`, e);
      });
      await new Promise(res => setTimeout(res, 200));
    }

    const id = emulator?.saveStatePath;
    if (!id) {
      console.warn(`[${label}] ❌ emulator.saveStatePath not available — fallback to IndexedDB`);
      return await getSaveBlobFromIndexedDb(label);
    }
    console.log(`[${label}] 🔐 Derived - patched - Save ID:`, id);

    const files = await saveManager.loadLocal(id);
    console.log(`[${label}] 🧪 Files returned from loadLocal:`, files);

    if (files) {
      const zip = await saveManager.createZip(files);
      console.log(`[${label}] 📦 Created zip blob`);
      return zip;
    }

    console.warn(`[${label}] ⚠️ loadLocal returned no files — falling back to IndexedDB`);
    return await getSaveBlobFromIndexedDb(label);

  } catch (err) {
    console.warn(`[${label}] ❌ getSaveBlobFromEmulator failed:`, err);
    return await getSaveBlobFromIndexedDb(label);
  }
}

export function patchEmulatorWRC(launcherIframe, romName, typeHint, onReadyCallback) {
  let patchAttempts = 0;

  const patchInterval = setInterval(() => {
    patchAttempts++;
    console.log(`🔁 WRC Patch Attempt ${patchAttempts}`);

    const emulatorWin = resolveEmulatorWindow(launcherIframe);
    const emulatorRef = emulatorWin?.app?.emulator;
    const managerRef = emulatorRef?.saveManager;

    if (emulatorRef && managerRef) {
      try {
        const title = emulatorRef.getTitle?.();
        const romMd5 = emulatorRef?.romMd5 || null;
        const type = emulatorRef?.getType?.() || emulatorRef?.props?.type;

        if (!title || !romMd5) {
          console.warn("⏳ Emulator metadata incomplete, waiting...");
          return;
        }
        if (!type) {
          console.error("❌ Emulator type not found — aborting patch.");
          clearInterval(patchInterval);
          return;
        }
        console.log("🧪 feedProps raw from emulatorWin.feedItem?.props:", emulatorWin.feedItem?.props);
        const feedProps = emulatorWin.feedItem?.props || {};
        const user = feedProps.user || "unknown";
        emulatorRef.saveStatePrefix = `/wrc/${user}/${romMd5}/`;
        emulatorRef.saveStatePath = `${emulatorRef.saveStatePrefix}sav`;
        const savePath = feedProps.save || `/saves/${romName}.sav`;
        
        console.log("🧩 Patch Info — Save Title:", title);
        console.log("🧩 Patch Info — Save Type:", type);
        console.log("🧩 Patch Info — ROM MD5 Hash:", romMd5);
        console.log("🧩 Patch Info — Username:", user);
        console.log("🧩 Patch Info — Save Path:", savePath);
        
        // Set globals for external access
        emulator = emulatorRef;
        saveManager = managerRef;

        const module = emulatorRef?.module || managerRef?.module;
        const FS = module?.FS;

        emulatorWin.FS = FS;
        emulatorWin.wrc = {
          ...(emulatorWin.wrc || {}),
          getSaveManager: () => managerRef,
          flushSaveData: () => managerRef?.flushSaveData?.(),
          getSaveBlob: () => getSaveBlobFromEmulator("window.wrc.getSaveBlob"),
          FS,
          title,
          type,
          romMd5,
          user,
          savePath
        };

        window.wrc = emulatorWin.wrc;

        console.log("✅ Emulator is initialized — injecting save tools...");
        clearInterval(patchInterval);

        // Call onReadyCallback (was waitForVfsAndStartAutoSave)
        if (typeof onReadyCallback === "function") {
          try {
            onReadyCallback(romName);
          } catch (err) {
            console.error("❌ Error running post-patch callback:", err);
          }
        }
      } catch (e) {
        console.warn("⚠️ Error injecting wrc:", e);
        clearInterval(patchInterval);
      }
    }

    if (patchAttempts > 30) {
      console.warn("❌ Timed out trying to patch wrc.");
      clearInterval(patchInterval);
    }
  }, 1000);
}


// === WATCHDOG for PLAY-button launched emulator ===
export function pollForActiveEmulatorFrame(launcherIframe, romName, typeHint, onReadyCallback, timeoutMs = 60000) {
  let attempts = 0;
  const maxAttempts = timeoutMs / 500;

  const interval = setInterval(() => {
    attempts++;
    const emulatorWin = resolveEmulatorWindow(launcherIframe);
    const maybeEmulator = emulatorWin?.app?.emulator;
    const maybeSaveManager = maybeEmulator?.saveManager;


    if (maybeEmulator && maybeSaveManager) {
      console.log("✅ Nested emulator found — patching now...");
      clearInterval(interval);
      patchEmulatorWRC(launcherIframe, romName, typeHint, onReadyCallback); // ✅ centralize logic
    }

    if (attempts >= maxAttempts) {
      console.warn("❌ Timeout — no nested emulator found to patch");
      clearInterval(interval);
    }
  }, 500);
}
let saveManager = null;
let emulator = null;

// 📌 Shared helper to get to the deepest emulator window (/gba)
export function resolveEmulatorWindow(launcherIframe) {
  const launcherWin = launcherIframe?.contentWindow; // /webrcade/play/
  const emulatorIframe = launcherWin?.document?.getElementById("webrcade-app-iframe"); // /webrcade/play/gba
  const emulatorWin = emulatorIframe?.contentWindow;
  return emulatorWin || null;
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
      await window.wrc.flushSaveData();
      await new Promise(res => setTimeout(res, 200));
    }

    // Instead of relying on saveManager.getId(), manually construct the ID
    const title = emulator.getTitle?.();
    const type = emulator.getType?.();
    const hash = window?.wrc?.md5?.(title); // OR use your own md5(title) if exposed

    if (!title || !type || !hash) {
      console.warn(`[${label}] ❌ Failed to derive ID (missing title, type, or hash)`);
      return await getSaveBlobFromIndexedDb(label);
    }

    const id = `/wrc/${type}/${hash}/sav`;
    console.log(`[${label}] 🔐 Derived Save ID:`, id);

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

export function patchEmulatorWRC(launcherIframe, romName, onReadyCallback) {
  let patchAttempts = 0;

  const patchInterval = setInterval(() => {
    patchAttempts++;
    console.log(`🔁 WRC Patch Attempt ${patchAttempts}`);

    const emulatorWin = resolveEmulatorWindow(launcherIframe);
    const emulatorRef = emulatorWin?.app?.emulator;
    const managerRef = emulatorRef?.saveManager;

    console.log("🔎 Checking nested iframe internals...");
    console.log("📦 nested win.app.emulator.saveManager:", managerRef);

    if (emulatorRef && managerRef) {
      try {
        const title = emulatorRef.getTitle?.();
        const type = emulatorRef?.props?.type || "gba"; // fallback safe
        const romMd5 = emulatorRef?.romMd5 || null;

        if (!title || !romMd5) {
          console.warn("⏳ Emulator metadata incomplete, waiting...");
          return;
        }

        console.log("🧩 Patch Info — Save Title:", title);
        console.log("🧩 Patch Info — Save Type:", type);
        console.log("🧩 Patch Info — ROM MD5 Hash:", romMd5);

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
          romMd5
        };

        window.wrc = emulatorWin.wrc;

        console.log("✅ Emulator is initialized, starting save logic...");
        clearInterval(patchInterval);
        onReadyCallback(romName);
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
export function pollForActiveEmulatorFrame(launcherIframe, romName, onReadyCallback, timeoutMs = 60000) {
  let attempts = 0;
  const maxAttempts = timeoutMs / 500;

  const interval = setInterval(() => {
    attempts++;
    const emulatorWin = resolveEmulatorWindow(launcherIframe);
    const maybeEmulator = emulatorWin?.app?.emulator;
    const maybeSaveManager = maybeEmulator?.saveManager;

    console.log("🔎 Checking nested iframe internals...");
    console.log("📦 nested win.app.emulator.saveManager:", maybeSaveManager);

    if (maybeEmulator && maybeSaveManager) {
      console.log("✅ Nested emulator found — patching now...");
      clearInterval(interval);
      patchEmulatorWRC(launcherIframe, romName, onReadyCallback); // ✅ centralize logic
    }

    if (attempts >= maxAttempts) {
      console.warn("❌ Timeout — no nested emulator found to patch");
      clearInterval(interval);
    }
  }, 500);
}
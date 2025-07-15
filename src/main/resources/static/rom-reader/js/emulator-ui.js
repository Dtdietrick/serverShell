export function patchEmulatorWRC(outerIframe, romName, waitForVfs) {
  let patchAttempts = 0;

  const patchInterval = setInterval(() => {
    patchAttempts++;
    console.log(`🔁 WRC Patch Attempt ${patchAttempts}`);

    const outerWin = outerIframe?.contentWindow;
    if (!outerWin) {
      console.warn("⚠️ Could not access outer iframe window.");
      return;
    }

    const innerIframe = outerWin.document?.getElementById("webrcade-app-iframe");
    const win = innerIframe?.contentWindow;
    const emulator = win?.app?.emulator;

    console.log("🔎 Checking inner iframe internals...");
    console.log("📦 inner win:", win);
    console.log("📦 inner win.app:", win?.app);
    console.log("📦 inner win.app.emulator:", emulator);
    console.log("📦 inner win.app.emulator.saveManager:", emulator?.saveManager);

    if (emulator && emulator.saveManager) {
      try {
        const saveManager = emulator.saveManager;
        const module = emulator?.module || saveManager?.module;
        const FS = module?.FS;
        const title = emulator.getTitle?.();

        win.FS = FS;
        win.wrc = {
          ...(win.wrc || {}),
          getSaveManager: () => saveManager,
          flushSaveData: () => saveManager?.flushSaveData?.(),
          FS
        };

        console.log("✅ Emulator is initialized, starting save logic...");
        console.log("✅ Patched window.wrc after emulator load");

        clearInterval(patchInterval);
        waitForVfs(romName);
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
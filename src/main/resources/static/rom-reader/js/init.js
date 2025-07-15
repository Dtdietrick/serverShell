import { fullClear, waitForVfsAndStartAutoSave, autoUploadSave } from './storage.js';
import { setupUploadForm } from './uploader.js';
import { patchEmulatorWRC } from './emulator-ui.js';

const urlParams     = new URLSearchParams(window.location.search);
const rawRomName    = urlParams.get("rom") || null;
const displayName   = rawRomName?.trim() || "";

const overlay           = document.getElementById("emulator-overlay");
const romSelector       = document.getElementById("rom-selector");
const saveControls      = document.getElementById("save-controls");
const emulatorBtn       = document.getElementById("emulator-button");
const romNameText       = document.getElementById("save-rom-name");
const overlaySaveBtn    = document.getElementById("overlay-save-btn");
const emulatorFrame     = document.getElementById("emulator-frame");

document.addEventListener("DOMContentLoaded", async () => {
  if (!rawRomName) {
    romSelector.style.display = "block";
    return;
  }

  romNameText.textContent = displayName;
  saveControls.style.display = "block";
  emulatorBtn.style.display = "inline-block";

  setupUploadForm(rawRomName);

  emulatorBtn.addEventListener("click", async () => {
    overlay.style.display = "flex";
    await fullClear();

    try {
      const response = await fetch('/feeds/user-feed.json');
      const feed = await response.json();

      const items = feed.categories.flatMap(c => c.items);
      const item = items.find(item => item?.props?.rom?.includes(rawRomName));
      const index = items.findIndex(i => i === item);

      if (!item || index === -1) {
        console.error(`❌ Could not find ${rawRomName} in user-feed.json`);
        return;
      }

      const type = item.type;
      const props = item.props;
      const feedUrl = `${window.location.origin}/feeds/user-feed.json`;
      const encodedFeedUrl = encodeURIComponent(feedUrl);

      emulatorFrame.src = `/webrcade/play/index.html?feed=${encodedFeedUrl}&index=${index}`;
      
      console.log("🎮 Launching WebRCade launcher:");
      console.log("➡️  type:", type);
      console.log("➡️  props:", props);
      console.log("➡️  feed URL:", feedUrl);
      console.log("➡️  index:", index);
      console.log("➡️  full URL:", emulatorFrame.src);

      emulatorFrame.onload = () => {
        console.log("✅ Emulator iframe loaded");
        patchEmulatorWRC(emulatorFrame, rawRomName, waitForVfsAndStartAutoSave);
      };

    } catch (err) {
      console.error("❌ Failed to load feed or locate ROM:", err);
    }
  });

  // Save Now (manual) flow
  async function waitForApp(retries = 30, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      const win = emulatorFrame?.contentWindow;
      const app = win?.app;
      const emulator = app?.emulator;

      if (emulator && typeof emulator.saveState === "function") {
        return emulator;
      }

      console.warn(`⏳ Waiting for emulator.app... (${i + 1}/${retries})`);
      await new Promise(res => setTimeout(res, delay));
    }

    console.error("❌ Emulator never became ready.");
    return null;
  }

  async function forceSaveToVfs() {
    const emulator = await waitForApp();
    if (!emulator) {
      console.warn("❌ Emulator not ready — can't flush save.");
      return false;
    }

    try {
      console.log("💾 Forcing saveState → SRAM → VFS...");
      emulator.saveState();
      return true;
    } catch (err) {
      console.error("❌ saveState failed:", err);
      return false;
    }
  }

  async function uploadCurrentSaveBlob(romName) {
    const wrc = emulatorFrame.contentWindow?.wrc;
    const manager = wrc?.getSaveManager?.();

    if (!manager || typeof manager.getSaveBlob !== "function") {
      console.warn("❌ SaveManager not ready — can't get save blob.");
      return;
    }

    try {
      const blob = await manager.getSaveBlob();
      if (blob) {
        console.log("📦 Save blob ready, uploading...");
        await autoUploadSave(romName, blob);
        console.log("✅ Save uploaded successfully.");
      } else {
        console.warn("⚠️ No save blob found.");
      }
    } catch (err) {
      console.error("❌ Failed to upload save blob:", err);
    }
  }

  overlaySaveBtn.addEventListener("click", async () => {
    const flushed = await forceSaveToVfs();
    if (!flushed) return;
    setTimeout(() => uploadCurrentSaveBlob(rawRomName), 1000);
  });
});
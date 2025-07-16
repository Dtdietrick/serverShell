import { waitForVfsAndStartAutoSave, autoUploadSave, getSaveBlob } from './storage.js';
import { setupUploadForm } from './uploader.js';
import { getSaveBlobFromEmulator, patchEmulatorWRC } from './emulator-ui.js';
import { pollForActiveEmulatorFrame } from './emulator-ui.js';

const urlParams     = new URLSearchParams(window.location.search);
const rawRomName    = urlParams.get("rom") || null;
const displayName   = rawRomName?.trim() || "";

const overlay           = document.getElementById("emulator-overlay");
const romSelector       = document.getElementById("rom-selector");
const saveControls      = document.getElementById("save-controls");
const emulatorBtn       = document.getElementById("emulator-button");
const romNameText       = document.getElementById("save-rom-name");
const overlaySaveBtn    = document.getElementById("overlay-save-btn");
const launcherIframe     = document.getElementById("emulator-frame");

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

      launcherIframe.src = `/webrcade/play/app/${type}/index.html?props=${btoa(JSON.stringify(props))}`;
      
      console.log("🎮 Launching WebRCade launcher:");
      console.log("➡️  type:", type);
      console.log("➡️  props:", props);
      console.log("➡️  feed URL:", feedUrl);
      console.log("➡️  index:", index);
      console.log("➡️  launch frame url:", launcherIframe.src);

	  launcherIframe.onload = () => {
	    console.log("✅ Emulator launcher iframe loaded");
	    pollForActiveEmulatorFrame(launcherIframe, rawRomName, waitForVfsAndStartAutoSave);
	  };

    } catch (err) {
      console.error("❌ Failed to load feed or locate ROM:", err);
    }
  });
  
  async function uploadCurrentSaveBlob(romName) {
    const manager = window?.wrc?.getSaveManager?.();

    if (!manager || typeof window.wrc.getSaveBlob !== "function") {
      console.warn("❌ SaveManager not ready — can't get save blob.");
      return;
    }

    try {
      const blob = await getSaveBlobFromEmulator("manual-button");
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

  // ✅ Manual save button
  overlaySaveBtn.addEventListener("click", async () => {
    try {
      console.log("💾 Manual save triggered...");
      const blob = await getSaveBlobFromEmulator("manual-button-listener"); // ✅ uses unified flush and fallback
      if (blob instanceof Blob) {
        console.log("📦 Save blob ready, uploading...");
        await autoUploadSave(rawRomName, blob);
        console.log("✅ Manual save uploaded successfully.");
      } else {
        console.warn("⚠️ No blob found after flush.");
      }
    } catch (err) {
      console.error("❌ Manual save failed:", err);
    }
  });
});
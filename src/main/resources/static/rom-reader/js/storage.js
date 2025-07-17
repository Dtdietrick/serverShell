// Clear browser storage before launching new emulator session
import { getSaveBlobFromEmulator } from './emulator-ui.js';

// Periodically uploads the user's save blob to the backend
async function autoUploadSave(romName, blobOverride = null) {
  const file = blobOverride || await getSaveBlob("autoUploadSave");

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
async function getSaveBlob(label = "unspecified") {
  return await getSaveBlobFromEmulator(label);
}

// Auto-upload polling loop: waits for save blob then begins periodic uploads
function waitForSaveFileAndStartAutoSave(
  romName,
  initialRetryDelayMs = 300000, // ⏳ retry every 5 mins if no save yet
  uploadIntervalMs = 300000,    // 🕒 upload every 5 mins once started
  initialStartupDelay = 300000  // 🛑 wait 5 mins before first check at all
) {
  let autoSaveStarted = false;

  async function tryDetectSave() {
    const blob = await getSaveBlob("auto-upload-init");

    if (blob instanceof Blob) {
      console.log("✅ First save blob detected — enabling periodic auto-upload every", uploadIntervalMs / 1000, "seconds.");
      autoSaveStarted = true;

      setInterval(() => {
        autoUploadSave(romName);
      }, uploadIntervalMs);
    } else {
      console.log("⏳ No save blob found yet — will retry in", initialRetryDelayMs / 1000, "seconds.");
      setTimeout(tryDetectSave, initialRetryDelayMs);
    }
  }

  if (!autoSaveStarted) {
    console.log("🕐 Delaying first auto-save check for", initialStartupDelay / 1000, "seconds...");
    setTimeout(tryDetectSave, initialStartupDelay);
  }
}

// ✅ Export
export {
  waitForSaveFileAndStartAutoSave as waitForVfsAndStartAutoSave,
  getSaveBlob,
  autoUploadSave
};
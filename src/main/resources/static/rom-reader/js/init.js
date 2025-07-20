import { waitForVfsAndStartAutoSave, autoUploadSave } from './storage.js';
import { setupUploadForm } from './uploader.js';
import { getSaveBlobFromEmulator, pollForActiveEmulatorFrame } from './emulator-ui.js';

const romList          = document.getElementById("rom-list");
const romSelector      = document.getElementById("rom-selector");
const saveControls     = document.getElementById("save-controls");
const romNameText      = document.getElementById("save-rom-name");
const overlay          = document.getElementById("emulator-overlay");
const launcherIframe   = document.getElementById("emulator-frame");
const overlaySaveBtn   = document.getElementById("overlay-save-btn");

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch('/rom-reader/feeds/user-feed.json');
    const feed = await response.json();

    const items = feed.categories.flatMap(c => c.items);

    // Populate ROM list dynamically
    items.forEach(item => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = `Play ${item.title}`;
      link.addEventListener("click", () => launchGame(item));
      li.appendChild(link);
      romList.appendChild(li);
    });

    romSelector.style.display = "block";
  } catch (err) {
    console.error("❌ Failed to load feed:", err);
  }

  overlaySaveBtn.addEventListener("click", async () => {
    try {
      console.log("💾 Manual save triggered...");
      const blob = await getSaveBlobFromEmulator("manual-button-listener");
      if (blob instanceof Blob) {
        console.log("📦 Save blob ready, uploading...");
        const rom = romNameText.textContent;
        await autoUploadSave(rom, blob);
        console.log("✅ Manual save uploaded successfully.");
      } else {
        console.warn("⚠️ No blob found after flush.");
      }
    } catch (err) {
      console.error("❌ Manual save failed:", err);
    }
  });
});

function encodeAppProps(props) {
  // Match the emulator's AppProps.encode()
  return btoa(encodeURIComponent(JSON.stringify(props)));
}

async function launchGame(item) {
  const romPath = item?.props?.rom;
  const type = item?.type;
  if (!romPath || !type) {
    console.error("❌ Invalid ROM item:", item);
    return;
  }

  const romName = romPath.split('/').pop();
  romNameText.textContent = romName;

  setupUploadForm(romName);
  saveControls.style.display = "block";
  overlay.style.display = "flex";

  const props = {
    title: item.title,
    type: item.type,
    props: {
      rom: item.props.rom,
      save: item.props.save,
      user: item.props.user
    }
  };

  const encodedProps = encodeAppProps(props);
  const launchUrl = `/rom-reader/webrcade/play/app/${type}/index.html?props=${encodedProps}`;

  launcherIframe.src = launchUrl;

  launcherIframe.onload = () => {
    console.log("✅ Emulator iframe loaded");
    pollForActiveEmulatorFrame(launcherIframe, romName, item.type, (romName) => {
      console.log("🧪 ROM patching complete — starting autosave watch.");
      waitForVfsAndStartAutoSave(romName);
    });
  };
}
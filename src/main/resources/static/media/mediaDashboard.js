//File: mediaDashboard.js
import { firstRender, renderFolder, stageAutoplayFor } from '/explorer/explorer.js';

//User dashboard to jump to media
export async function handleJumpParam() {
  const params = new URLSearchParams(window.location.search);
  const jumpTo = params.get("jumpTo");
  if (!jumpTo) return;

  const parts = jumpTo.split("/").filter(Boolean);
  if (!parts.length) return;

  // Derive root and season folder from the jump path
  const root = parts[0]; // e.g., "TV", "Movies", etc.

  let seasonFolder;
  const last = parts[parts.length - 1].toLowerCase();
  if (last === "index.m3u8" && parts.length >= 3) {
    // .../Season X/<Episode>/index.m3u8  → render .../Season X
    seasonFolder = parts.slice(0, -2).join("/");
  } else {
    // generic fallback: render the parent folder
    seasonFolder = parts.slice(0, -1).join("/");
  }

  // 1) Ensure explorer is initialized (safe even if already initialized)
  await firstRender(root); // sets media root, binds UI, starts initial render

  // 2) Render the correct folder (grouping is only for root)
  renderFolder(seasonFolder, /*useGrouping*/ false);

  // 3) Stage autoplay from the *library* path and start playback
  setTimeout(() => {
    stageAutoplayFor(jumpTo);
    if (window.AppPlayer) {
      window.AppPlayer.playMedia(jumpTo);
    }
  }, 150);
}
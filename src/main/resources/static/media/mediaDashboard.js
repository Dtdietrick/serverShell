// File: mediaDashboard.js
import { firstRender, renderFolder, stageAutoplayFor } from '/explorer/explorer.js';

// User dashboard to jump to media
export async function handleJumpParam() {
  const params = new URLSearchParams(window.location.search);
  const jumpTo = params.get("jumpTo");
  if (!jumpTo) return;

  const parts = jumpTo.split("/").filter(Boolean);
  if (parts.length < 2) return;

  // "TV" | "Movies" | "Music"
  const root = parts[0];      
  // stop before "index.m3u8"
  const endIdx = parts.length - 1;      
  // render root first
  await firstRender(root);              

  // walk directory tree
  let acc = root;                       
  for (let i = 1; i < endIdx; i++) {
    acc = `${acc}/${parts[i]}`.replace(/\/{2,}/g, "/");
    await renderFolder(acc);           
  }

  // done walking; trigger autoplay + playback
  stageAutoplayFor(jumpTo);
  window.AppPlayer?.playMedia(jumpTo);
}
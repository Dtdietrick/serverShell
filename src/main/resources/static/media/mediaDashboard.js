// File: mediaDashboard.js

import { renderFolder } from '/explorer/explorer.js';

//User dashboard to jump to media
export function handleJumpParam() {
  const params = new URLSearchParams(window.location.search);
  const jumpTo = params.get("jumpTo");

  if (!jumpTo) return;

  const parts = jumpTo.split("/");
  const file = parts.pop();
  const folder = parts.join("/");

  setTimeout(() => {
    renderFolder(folder);
    AppPlayer.playMedia(jumpTo);
  }, 500); // Or shorter if renderFolder is fast
}
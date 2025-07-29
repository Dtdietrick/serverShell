// File: /explorer/jumpHandler.js

import { renderFolder } from '/explorer/virtualExplorer.js';

export function handleJumpParam() {
  const params = new URLSearchParams(window.location.search);
  const jumpTo = params.get("jumpTo");

  if (!jumpTo) return;

  if (jumpTo.endsWith(".mp4") || jumpTo.endsWith(".epub")) {
    const parts = jumpTo.split("/");
    const file = parts.pop();
    const folder = parts.join("/");

    setTimeout(() => {
      renderFolder(folder);
      setTimeout(() => {
        // Trigger backend stream request
        fetch(`/media/stream?path=${encodeURIComponent(jumpTo)}`);

        // Optional: visually display the video
        document.getElementById("viewer-player").innerHTML = `
          <h3>📺 Viewer</h3>
          <video controls autoplay width="100%">
            <source src="/media/stream?path=${encodeURIComponent(jumpTo)}" type="video/mp4">
            Your browser does not support video.
          </video>
        `;
      }, 500);
    }, 300);
  } else {
    renderFolder(jumpTo);
  }
}
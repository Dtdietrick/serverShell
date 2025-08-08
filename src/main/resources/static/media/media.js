// FILE:mediaExplorer.js

//state logic
import {
  getLastClickedGroupLabel,
  setLastClickedGroupLabel,
} from '/explorer/path.js';

import {
    getFileList,
    setFileList
} from '/explorer/file.js';

// DOM references
const player = document.getElementById("viewer-player");
const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");
let plyrInstance = null;

/**
 * Plays a media file (audio/video) in either main player or popup.
 * @param {string} filename - Full file path
 */
export async function playMedia(filename) {
  if (!filename || typeof filename !== "string") {
    console.warn("playMedia called with invalid filename");
    return;
  }

  const sessionId = sessionStorage.getItem("vlcSessionId");
  if (!sessionId) {
    console.error("No VLC session preloaded");
    return;
  }

  try {
    const res = await fetch("/vlc/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename })
    });

    const responseText = await res.text();
    if (!res.ok) throw new Error(responseText);

    console.log("[VLC] File sent to active container");

  } catch (err) {
    console.error("Failed to play media in VLC container:", err);
    const mediaContainer = document.getElementById("media-container");
    if (mediaContainer) {
      mediaContainer.innerHTML = `<div style="color: red;">Failed to play ${filename}</div>`;
    }
  }
}
/**
 * Stop and clear any playing media from both main player and popup.
 */
export function stopAllMedia() {
  const mainMedia = player.querySelector("audio, video, iframe");
  if (mainMedia) {
    if (mainMedia.tagName === "VIDEO" || mainMedia.tagName === "AUDIO") {
      mainMedia.pause();
      mainMedia.src = "";
      mainMedia.load();
    }
  }
  player.innerHTML = "";

  const popupMedia = popupPlayer.querySelector("audio, video, iframe");
  if (popupMedia) {
    if (popupMedia.tagName === "VIDEO" || popupMedia.tagName === "AUDIO") {
      popupMedia.pause();
      popupMedia.src = "";
      popupMedia.load();
    }
  }
  popupPlayer.innerHTML = "";

  const viewerContainer = document.getElementById("viewer-player");
  if (viewerContainer) {
    viewerContainer.innerHTML = "<h3> Viewer</h3>";
  }
}
async function waitForVncReady(sessionId) {
  const url = `/proxy/vnc/${sessionId}/vnc.html`;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      console.log(`[VNC] not ready yet (${i + 1})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
/**
 * Apply volume and mute settings from localStorage to media element,
 * and save changes persistently.
 * @param {HTMLMediaElement} playerElement
 */
export function applyPlayerSettings(playerElement) {
  const volume = localStorage.getItem("playerVolume");
  const muted = localStorage.getItem("playerMuted");

  if (volume !== null) playerElement.volume = parseFloat(volume);
  if (muted !== null) playerElement.muted = muted === "true";

  playerElement.addEventListener("volumechange", () => {
    localStorage.setItem("playerVolume", playerElement.volume);
    localStorage.setItem("playerMuted", playerElement.muted);
  });
}


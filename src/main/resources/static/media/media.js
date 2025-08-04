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

import { loadMedia } from '/util/player.js';
// DOM references
const player = document.getElementById("viewer-player");
const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");
let plyrInstance = null;

/**
 * Plays a media file (audio/video) in either main player or popup.
 * @param {string} filename - Full file path
 * @param {boolean} usePopup - Play in popup if true
 * @param {boolean} fromPlaylist - If playing from playlist (adds query param)
 */
export function playMedia(filename, usePopup = false, fromPlaylist = false) {
  stopAllMedia();

  const ext = filename.split(".").pop().toLowerCase();
  const encodedPath = encodeURIComponent(filename).replace(/%2F/g, "/");
  const src = `/media/api/stream/${encodedPath}${fromPlaylist ? "?fromPlaylist=true" : ""}`;
  const type = ext === "mp3" ? "audio/mpeg" : `video/${ext}`;
  const isVideo = ["mp4", "webm", "ogg"].includes(ext);

  const displayName = filename.split("/").pop().replace(/\.[^/.]+$/, "");
  const header = `<div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.5rem;">${isVideo ? "📺" : "🎵"} ${displayName}</div>`;

  const target = usePopup ? popupPlayer : player;
  target.innerHTML = header;

  const mediaElement = loadMedia(target, src, type, isVideo);
  if (mediaElement) applyPlayerSettings(mediaElement);
}

/**
 * Stop and clear any playing media from both main player and popup.
 */
export function stopAllMedia() {
  const mainMedia = player.querySelector("audio, video");
  if (mainMedia) {
    mainMedia.pause();
    mainMedia.src = "";
    mainMedia.load();
  }
  player.innerHTML = "";

  const popupMedia = popupPlayer.querySelector("audio, video");
  if (popupMedia) {
    popupMedia.pause();
    popupMedia.src = "";
    popupMedia.load();
  }
  popupPlayer.innerHTML = "";
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


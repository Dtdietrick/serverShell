// FILE:mediaExplorer.js

//mediaState logic for variables
import {
  getCurrentPath,
  setCurrentPath,
  getLastClickedGroupLabel,
  setLastClickedGroupLabel,
  getFileList,
  setFileList
} from '/media/mediaState.js';

// DOM references
const player = document.getElementById("player");
const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");

// Show/hide the search input based on whether we're in root
export function updateSearchVisibility() {
  const searchInput = document.getElementById("media-search");
  if (searchInput) {
    if (!getCurrentPath()) {
      searchInput.style.display = "none";
      searchInput.value = "";
    } else {
      searchInput.style.display = "block";
    }
  }
}

// Extract folders and files under currentPath
export function getFolderAndFileLists(prefix) {
  const foldersSet = new Set();
  const filesList = [];

  const allFiles = getFileList();
  // Filter fileList to entries inside currentPath
  allFiles.forEach((item) => {
    if (!item.startsWith(prefix)) return;

    const rest = item.slice(prefix.length);
    const parts = rest.split("/");

    if (parts.length === 1) {
      // direct child (file or folder)
      if (item.endsWith("/")) {
        foldersSet.add(parts[0]);
      } else {
        filesList.push(parts[0]);
      }
    } else if (parts.length > 1) {
      // deeper path => first segment is folder
      foldersSet.add(parts[0]);
    }
  });

  let folders = Array.from(foldersSet);

  const path = getCurrentPath();
  // Special handling to pin 'playlists' to top if in Music
  if (path === "Music" || path.startsWith("Music/")) {
    const playlistsIndex = folders.findIndex((f) => f.toLowerCase() === "playlists");
    if (playlistsIndex > -1) {
      const playlistsFolder = folders.splice(playlistsIndex, 1)[0];
      folders.unshift(playlistsFolder);
    }
  }

  // Final folder sort order: pinned + sorted rest
  const pinned = folders.slice(0, 1); // either ['playlists'] or empty
  const rest = folders.slice(1).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const sortedFolders = pinned.concat(rest);

  const sortedFiles = filesList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return { folders: sortedFolders, files: sortedFiles };
}

// Get the current lowercase search input
export function getSearchQuery() {
  return (document.getElementById("media-search")?.value || "").toLowerCase();
}

const searchInput = document.getElementById("media-search");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderFolder(getCurrentPath());
  });
}

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

  // Determine media type for source element
  const type = ext === "mp3" ? "mpeg" : ext;
  const isVideo = ["mp4", "webm", "ogg"].includes(ext);
  
  // Remove extension for display
  const displayName = filename.split("/").pop().replace(/\.[^/.]+$/, ""); 

  const header = `<div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.5rem;">🎵 ${displayName}</div>`;
  const mediaHTML = isVideo
    ? `<video controls autoplay style="width: 100%;"><source src="${src}" type="video/${ext}">Video not supported.</video>`
    : `<audio controls autoplay style="width: 100%;"><source src="${src}" type="audio/${type}">Audio not supported.</audio>`;

  // Choose target container
  const target = usePopup ? popupPlayer : player;
  target.innerHTML = `${header}${mediaHTML}`;

  // Apply volume/mute settings persistence
  const mediaElement = target.querySelector("audio, video");
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


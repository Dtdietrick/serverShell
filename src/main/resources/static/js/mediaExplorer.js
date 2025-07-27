// FILE:mediaExplorer.js

//mediaState logic for variables
import {
  getCurrentPath,
  setCurrentPath,
  getLastClickedGroupLabel,
  setLastClickedGroupLabel,
  getFileList,
  setFileList
} from '/js/mediaState.js';

//virtual group logic
import { renderGroupedAZView, renderVirtualGroup } from '/js/virtualExplorer.js';

// DOM references
const mediaTree = document.getElementById("mediaTree");
const player = document.getElementById("player");
const backButton = document.getElementById("back-button");
const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");

/**
 * Fetches folder contents from backend for given path,
 * then calls renderFolder() to update UI.
 * @param {string} path - Folder path to fetch
 */
export function fetchAndRenderPath(path) {
  fetch("/media/list?path=" + encodeURIComponent(path))
    .then((res) => {
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      return res.json();
    })
    .then((files) => {
      if (!files) return;

      const prefix = path ? path + "/" : "";
      const folders = new Set();
      const filesInFolder = [];

      files.forEach((file) => {
        if (!file.startsWith(prefix)) return;

        const rest = file.slice(prefix.length);
        const parts = rest.split("/");

        if (parts.length === 1) {
          filesInFolder.push(rest);
        } else {
          folders.add(parts[0]);
        }
      });

      if (filesInFolder.length === 0 && folders.size === 1) {
        const onlyFolder = Array.from(folders)[0];
        const currentFolderName = path ? path.split("/").pop() : "";
        if (onlyFolder === currentFolderName) {
          fetchAndRenderPath(path + "/" + onlyFolder);
          return;
        }
      }

      setFileList(files);
      setCurrentPath(path);
      renderFolder(path);
    })
    .catch(() => {
      mediaTree.innerHTML = "<p>Error loading media list.</p>";
    });
}

export function fetchMediaTree() {
  console.log("Fetching media list...");
  fetch("/media/list")
    .then((res) => {
      console.log("Got response:", res);
      if (!res.ok) throw new Error("Fetch failed with status " + res.status);
      return res.json();
    })
    .then((files) => {
      console.log("Received files:", files);
      if (!Array.isArray(files)) throw new Error("Invalid file list");
      setFileList(files);
      renderFolder("");
    })
    .catch((err) => {
      console.error("Failed to fetch media list:", err);
      mediaTree.innerHTML = "<p>Error loading media list.</p>";
    });
}

/**
 * Render the folder view UI, grouping folders and files,
 * and setting up click handlers for navigation and playback.
 * @param {string} path - Current folder path
 */
export function renderFolder(path) {
  setCurrentPath(path || "");

  updateSearchVisibility();

  const prefix = getCurrentPath() ? getCurrentPath() + "/" : "";
  const searchQuery = getSearchQuery();
  const { folders, files } = getFolderAndFileLists(prefix);

  mediaTree.innerHTML = getLastClickedGroupLabel()
    ? `<h4>Group: ${getLastClickedGroupLabel()}</h4>`
    : "";

  const threshold = 10;
  const topLevelGrouping = ["Movies", "Music", "Books", "TV"];
  const pathRoot = getCurrentPath().split("/")[0];
  const shouldGroup = topLevelGrouping.includes(pathRoot) && (folders.length + files.length > threshold);

  if (shouldGroup) {
    renderGroupedAZView(getCurrentPath(), folders, files, prefix, searchQuery);
  } else {
    renderSimpleListView(folders, files, prefix);
  }

  backButton.style.display = getCurrentPath() ? "block" : "none";
}

// Show/hide the search input based on whether we're in root
function updateSearchVisibility() {
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

// Render normal folders and files
function renderSimpleListView(folders, files, prefix) {
  const ul = document.createElement("ul");

  folders.forEach((folder) => {
    const li = document.createElement("li");
    li.classList.add("folder");
    li.textContent = folder;
    li.onclick = () => {
      setLastClickedGroupLabel(folder);
      renderFolder(prefix + folder);
    };
    ul.appendChild(li);
  });

  files.forEach((file) => {
    const li = document.createElement("li");

    if (file.toLowerCase().endsWith(".m3u")) {
      console.log("Loading playlist:", prefix + file.slice(0, -4));
      li.classList.add("playlist-file");
      li.textContent = file;
      li.onclick = () => loadPlaylist(prefix + file.slice(0, -4));
    } else if (file.toLowerCase().endsWith(".epub")) {
      li.classList.add("file");
      li.textContent = file;

      const link = document.createElement("a");
      const encodedPath = encodeURIComponent(prefix + file);
      link.href = `/epubReader.html?file=${encodedPath}`;
      link.textContent = "📘 Read Online";
      link.style.marginLeft = "1rem";

      li.appendChild(link);
    } else {
      li.classList.add("file");
      li.textContent = file;
      li.onclick = () => playMedia(prefix + file);
    }

    ul.appendChild(li);
  });

  mediaTree.appendChild(ul);
}
// Extract folders and files under currentPath
function getFolderAndFileLists(prefix) {
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
function getSearchQuery() {
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
  const src = `/media/${encodedPath}${fromPlaylist ? "?fromPlaylist=true" : ""}`;

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

// Back button navigates up one folder and fetches new data
backButton.onclick = () => {
  const currentPath = getCurrentPath();
  if (!currentPath) return;

  const isInMusic = currentPath === "Music" || currentPath.startsWith("Music/");
  const group = getLastClickedGroupLabel();
  const isVirtualGroup = /^[A-Z0-9#]$/.test(group); // Virtual group is single A-Z, 0-9, or #

  if (isInMusic && isVirtualGroup) {
    // Go back to virtual A–Z view
    setLastClickedGroupLabel("");
    renderFolder(currentPath); // Re-render group view (A-Z folders + pinned playlists)
    return;
  }

  // Normal folder navigation
  const parts = currentPath.split("/");
  parts.pop();
  const parent = parts.join("/");
  
  if (!parent) {
    setLastClickedGroupLabel("");
  } else {
     setLastClickedGroupLabel(parent.split("/").pop());
  }
  setCurrentPath(parent);
  fetchAndRenderPath(currentPath);
};

//File:mediaState.js

//handle media explorer variables globally
let currentPath = "";
let lastClickedGroupLabel = null;
let fileList = [];
let inVirtualGroup = false;
let mediaRoot = "";
let pathHistory = [];

export function getCurrentPath() { return currentPath; }
export function setCurrentPath(path) { currentPath = path; }

export function getFileList() { return fileList; }
export function setFileList(file) { fileList = file; }

export function getLastClickedGroupLabel() { return lastClickedGroupLabel; }
export function setLastClickedGroupLabel(label) { lastClickedGroupLabel = label; }

export function isInVirtualGroup() { return inVirtualGroup; }
export function setInVirtualGroup(flag) { inVirtualGroup = flag; }

export function setMediaRoot(path) {mediaRoot = path.split("/")[0];} // e.g., "TV" from "TV/B"
export function getMediaRoot() { return mediaRoot; }

export function groupFoldersByLetter(folders, files, searchQuery = "") {
  const letterGroups = {};

  folders
    .filter((f) => !searchQuery || f.toLowerCase().includes(searchQuery))
    .forEach((folder) => {
      const letter = getLetter(folder);
      if (!letterGroups[letter]) letterGroups[letter] = new Set();
      letterGroups[letter].add(folder + "/");
    });

  files
    .filter((f) => !searchQuery || f.toLowerCase().includes(searchQuery))
    .forEach((file) => {
      const letter = getLetter(file);
      if (!letterGroups[letter]) letterGroups[letter] = new Set();
      letterGroups[letter].add(file);
    });

  return letterGroups;
}

function getLetter(name) {
  const c = name[0];
  return /^[A-Z0-9]$/i.test(c) ? c.toUpperCase() : "#";
}

// Sort alphabetically
export function sortItems(items) {
  return [...items]
    .filter(item => item && item.trim() !== "" && item !== "/")
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

//stack style history track
export function popPreviousPath() {
  if (pathHistory.length > 1) {
    pathHistory.pop(); // remove current
    currentPath = pathHistory[pathHistory.length - 1]; // peek
    return currentPath;
  }
  return currentPath;
}
export function resetHistory(path) {
  currentPath = path;
  pathHistory = [path];
}

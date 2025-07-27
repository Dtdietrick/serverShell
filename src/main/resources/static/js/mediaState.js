//handle media explorer variables
let currentPath = "";
let lastClickedGroupLabel = null;
let fileList = [];

export function getCurrentPath() { return currentPath; }
export function setCurrentPath(p) { currentPath = p; }

export function getFileList() { return fileList; }
export function setFileList(f) { fileList = f; }

export function getLastClickedGroupLabel() { return lastClickedGroupLabel; }
export function setLastClickedGroupLabel(label) { lastClickedGroupLabel = label; }

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

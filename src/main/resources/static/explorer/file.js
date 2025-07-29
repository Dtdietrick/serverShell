//File:file.js

//file util functions
let fileList = [];

export function getFileList() { return fileList; }
export function setFileList(file) { fileList = file; }

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

export async function isAllowedMediaType(path) {
  const res = await fetch(`/media/allowedType?path=${encodeURIComponent(path)}`);
  if (!res.ok) return false;

  const allowed = await res.json(); // boolean from backend
  return 
  
  allowed === true;
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

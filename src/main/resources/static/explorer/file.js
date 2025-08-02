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

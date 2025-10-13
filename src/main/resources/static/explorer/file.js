//File: file.js

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

// Sort numerically then alphabetically
export function sortItems(items) {
  if (!Array.isArray(items)) return [];

  const sortKey = (p) => {
    const parts = String(p || "").split("/").filter(Boolean);
    if (parts.length === 0) return "";

    let leaf = parts[parts.length - 1];

    // If this is an "index.m3u8", sort by its parent folder name
    if (leaf.toLowerCase() === "index.m3u8" && parts.length >= 2) {
      leaf = parts[parts.length - 2];
    }

    // Nicer titles for .m3u playlist files (match your displayNameFor)
    leaf = leaf.replace(/\.m3u$/i, "");

    return leaf.toLowerCase();
  };

  return [...items].sort((a, b) => {
    const ak = sortKey(a);
    const bk = sortKey(b);
    const cmp = ak.localeCompare(bk, undefined, { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return cmp;
    // tie-break deterministically by full path
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  });
}

export async function isAllowedMediaType(path) {
  const res = await fetch(`/media/allowedType?path=${encodeURIComponent(path)}`);
  if (!res.ok) return false;

  const allowed = await res.json(); // boolean from backend
  return 
  
  allowed === true;
}  

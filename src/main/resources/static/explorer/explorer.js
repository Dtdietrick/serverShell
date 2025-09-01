// File: NEW explorer.js

import {
  setLastClickedGroupLabel,
  getLastClickedGroupLabel,
  setMediaRoot,
  getMediaRoot,
  setCurrentPath
} from "/explorer/path.js";

import {
  setFileList,
  groupFoldersByLetter,
  sortItems
} from "/explorer/file.js";

import {
  peekHistory,
  pushHistory,
  resetHistory,
} from "/explorer/history.js";

import { loadPlaylist } from "/media/mediaPlaylist.js";
import { updateBackButton } from "/ui/backButton.js";
import { getIsLoading, setIsLoading, toggleMediaButtons } from "/ui/loading.js";

const mediaTree = document.getElementById("mediaTree");
let supportedExtensions = [];

const AUTOPLAY_ENABLED = true;

/* A–Z toggle (UI & root only) */
const GROUP_KEY = "explorer.groupAtRoot";
const readGroupPref = () => (localStorage.getItem(GROUP_KEY) ?? "true") === "true";
let groupAtRoot = readGroupPref(); 
const autoplaySiblingCache = new Map();

document.getElementById('toggle-grouping')?.addEventListener('click', () => {
  groupAtRoot = !groupAtRoot;
  localStorage.setItem(GROUP_KEY, String(groupAtRoot));
  refreshToggleLabel(groupAtRoot);

  // If we don't have a cached list yet, do a single fetch at the root.
  if (!window.currentFileList || !window.currentFileList.length) {
    return renderFolder(getMediaRoot(), groupAtRoot); // fetch once, then we’ll re-render using the cache
  }
  rerenderRootList(); // pure visual re-render (no fetch, no history)
});

function refreshToggleLabel(groupAtRoot) {
  const btn = document.getElementById('toggle-grouping');
  if (btn) btn.textContent = groupAtRoot ? 'A–Z: On' : 'A–Z: Off';
}

//helper to derive sibling order
function deriveSiblingNamesFromListing({ folders, files }) {
  // Preferred: files that are episode indexes (e.g., "Ep 01/index.m3u8" or "index.m3u8")
  const indexFiles = (files || []).filter(f => {
    const lower = f.toLowerCase();
    return lower.endsWith('/index.m3u8') || lower === 'index.m3u8';
  });

  if (indexFiles.length > 0) {
    // Map each "…/index.m3u8" to its immediate directory name. If it's just "index.m3u8",
    // treat the directory name as the *current folder* (there's only one item).
    const names = indexFiles.map(f => {
      const parts = f.split('/').filter(Boolean);
      if (parts.length >= 2) return parts[parts.length - 2]; // “…/<leaf>/index.m3u8”
      return 'index.m3u8'; // rare case: single playable index at folder root
    });
    // Keep original order; remove dupes just in case
    return [...new Set(names)];
  }

  // Fallback: we didn’t get flattened index files; use folders list
  return (folders || []).map(f => f.replace(/\/+$/,'').split('/').pop());
}

function rerenderRootList() {
  const root = getMediaRoot();
  const files = window.currentFileList || [];

  // Mirror the same prefix logic used by renderFolder()
  const prefix = (peekHistory() ? peekHistory() + "/" : "");

  const folders = [];
  const normalFiles = [];

  files.forEach((item) => {
    // Slice items relative to prefix exactly like renderFolder()
    const name = item.startsWith(prefix) ? item.slice(prefix.length) : item;

    if (item.endsWith("/")) {
      if (!folders.includes(name)) folders.push(name);
    } else if (isSupportedMedia(name)) {
      normalFiles.push(name);
    }
  });

  // Preserve letter “Group: X” if the user clicked a letter
  const groupLabel = getLastClickedGroupLabel();
  const shouldGroup = !!(groupAtRoot && !groupLabel); // group only at root when no specific letter is active

  mediaTree.innerHTML = groupLabel ? `<h4>Group: ${groupLabel}</h4>` : "";

  renderListView({
    folders,
    files: normalFiles,
    prefix,
    isGrouped: shouldGroup,
    groupLabel
  });
}

function hideUtilButtons(){
  const search = document.getElementById("media-search");
  if (search) search.style.display = "block";
	 
  const backButton = document.querySelector(".back-btn");
  if (backButton) backButton.style.display = "block";   
		                        
  const azGroup = document.getElementById("toggle-grouping");
  if (azGroup) azGroup.style.display = "inline-block";  
}
//fetch folder listing (return array of folders/files)
async function fetchFolderContents(path) {
  const encoded = encodeURIComponent(path);
  const res = await fetch(`/media/list?path=${encoded}`);
  if (!res.ok) throw new Error(`Failed to list ${path}: ${res.status}`);
  const items = await res.json();
  const folders = [];
  const files = [];
  const prefix = path ? path.replace(/\/+$/,'') + "/" : "";

  items.forEach(item => {
    const name = item.startsWith(prefix) ? item.slice(prefix.length) : item;
    if (item.endsWith("/")) {
      if (!folders.includes(name)) folders.push(name);
    } else {
      if (isSupportedMedia(name)) files.push(name);
    }
  });

  return { folders, files, prefix };
}

//compute BASE folder two levels (ex: index>file>season)
async function computeNextIndexPath(currentFullPath) {
  if (!currentFullPath) return null;

  const parts = currentFullPath.split("/").filter(Boolean);
  if (parts.length < 3) {
    console.log("[autoplay] too few parts for", currentFullPath);
    return null;
  }

  const isIndex = parts[parts.length - 1].toLowerCase() === "index.m3u8";
  const baseParts = isIndex ? parts.slice(0, -2) : parts.slice(0, -1);
  const leafFolder = (isIndex ? parts[parts.length - 2] : parts[parts.length - 1]) || "";
  const basePath = baseParts.join("/").replace(/\/+$/,'');

  if (!basePath) {
    console.log("[autoplay] empty basePath for", currentFullPath);
    return null;
  }

  // 1) Try cached ordering first (populated by renderFolder)
  let siblingNames = autoplaySiblingCache.get(basePath);

  // 2) If no cache, fetch and derive using the same “new knowledge” rules
  if (!siblingNames || siblingNames.length === 0) {
    const { folders, files } = await fetchFolderContents(basePath);
    siblingNames = deriveSiblingNamesFromListing({ folders, files });
  }

  // Normalize + sort exactly like your list rendering
  const ordered = sortItems(siblingNames || []);

  const leafLower = (leafFolder || "").toLowerCase();
  const curIdx = ordered.findIndex(n => (n || "").toLowerCase() === leafLower);
  if (curIdx < 0) {
    console.log("[autoplay] current leaf not found among siblings", { basePath, leafFolder, ordered });
    return null;
  }

  const nextIdx = curIdx + 1;
  if (nextIdx >= ordered.length) {
    console.log("[autoplay] no next sibling (end of list)", { basePath, ordered });
    return null;
  }

  const nextFolderName = ordered[nextIdx];
  const nextPath = `${basePath}/${nextFolderName}/index.m3u8`;
  console.log("[autoplay] next candidate:", nextPath);
  return nextPath;
}

//auto play check
function showNextPrompt(nextPath) {
  const container = document.getElementById('player-container');
  if (!container) return;

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const existing = document.getElementById('next-prompt');
  if (existing) existing.remove();

  const display = displayNameFor(nextPath);

  const prompt = document.createElement('div');
  prompt.id = 'next-prompt';
  prompt.setAttribute('role', 'dialog');
  prompt.style.position = 'absolute';
  prompt.style.top = '12px';
  prompt.style.right = '12px';
  prompt.style.padding = '10px 12px';
  prompt.style.borderRadius = '12px';
  prompt.style.background = 'rgba(0,0,0,0.72)';
  prompt.style.color = '#fff';
  prompt.style.backdropFilter = 'blur(2px)';
  prompt.style.boxShadow = '0 4px 14px rgba(0,0,0,.35)';
  prompt.style.zIndex = '9999'; // stronger to ensure above <video>
  prompt.style.maxWidth = '60%';
  prompt.style.pointerEvents = 'auto';

  prompt.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="opacity:.9">Up next:</span>
      <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45ch">${display}</strong>
      <button id="next-play-btn" style="margin-left:auto;cursor:pointer;border:0;border-radius:10px;padding:6px 10px">
        ▶ Play next
      </button>
      <button id="next-dismiss-btn" title="Dismiss" style="cursor:pointer;border:0;background:transparent;color:#fff;opacity:.75">✕</button>
    </div>
  `;

  prompt.querySelector('#next-dismiss-btn')?.addEventListener('click', () => {
    prompt.remove();
  });

  prompt.querySelector('#next-play-btn')?.addEventListener('click', async () => {
    try {
      const viewerHeader = document.querySelector('#viewer-player h3');
      if (viewerHeader) viewerHeader.textContent = display;
      setCurrentPath(nextPath);
      await window.AppPlayer.playMedia(nextPath);
    } finally {
      prompt.remove();
    }
  });

  container.appendChild(prompt);
  console.log("[autoplay] prompt injected for:", nextPath);
}

//autoplay path; set AppPlayer.onEnded once per click
export function stageAutoplayFor(libraryPath) {
  if (!AUTOPLAY_ENABLED || !window.AppPlayer) return;

  window.AppPlayer.onEnded = async () => {
    try {
      console.log("[autoplay] ended detected for:", libraryPath);
      const nextPath = await computeNextIndexPath(libraryPath);
      if (!nextPath) return;
      showNextPrompt(nextPath);
    } catch (e) {
      console.warn("[autoplay] failed to compute next:", e);
    }
  };
}

window.stageAutoplayFor = stageAutoplayFor;

// Entry point for root-level navigation
export async function firstRender(path) {
  resetHistory(path);
  setMediaRoot(path);
  setCurrentPath(path);
  toggleMediaButtons(false);
  //util buttons
  groupAtRoot = readGroupPref();
  refreshToggleLabel(groupAtRoot);
  hideUtilButtons();
  autoplaySiblingCache.clear();
  await getAllowedMediaList();
  renderFolder(path, groupAtRoot); //honor toggle at root
}

export function renderFolder(path, useGrouping = false) {
  const encoded = encodeURIComponent(path);
  const apiPath = `/media/list?path=${encoded}`;
  setLastClickedGroupLabel("");

  if (getIsLoading()) return;

  setIsLoading(true);
  if (mediaTree) mediaTree.innerHTML = "Loading...";

  console.log("Fetching folder contents:", apiPath);

  fetch(apiPath)
    .then((res) => {
      if (res.status === 401) { window.location.href = "/login"; return; }
      return res.json();
    })
    .then((files) => {
      if (!files) return;

      setFileList(files);
	  window.currentFileList = files;
      setCurrentPath(path);

      const root = getMediaRoot();
      if (path !== root && peekHistory() !== path) {
        pushHistory(path);
      }

      updateSearchVisibility();
      updateBackButton(path);

      const prefix = peekHistory() ? peekHistory() + "/" : "";
      const folders = [];
      const normalFiles = [];

      files.forEach((item) => {
        const name = item.startsWith(prefix) ? item.slice(prefix.length) : item;
        if (item.endsWith("/")) {
          if (!folders.includes(name)) folders.push(name);
        } else if (isSupportedMedia(name)) {
          normalFiles.push(name);
        }
      });

      const isRoot = path === getMediaRoot();
      const shouldGroup = isRoot && !!useGrouping;

      mediaTree.innerHTML = getLastClickedGroupLabel()
        ? `<h4>Group: ${getLastClickedGroupLabel()}</h4>` : "";

	  //cache sibling order for autoplay
	  const siblingNames = deriveSiblingNamesFromListing({ folders, files: normalFiles });
	  autoplaySiblingCache.set(path.replace(/\/+$/,'') || '', siblingNames);
		
      renderListView({
        folders: folders,
        files: normalFiles,
        prefix,
        isGrouped: shouldGroup
      });
    })
    .catch((err) => {
      console.error("Error loading folder:", err);
      mediaTree.innerHTML = "<p>Error loading media list.</p>";
    })
    .finally(() => {
      setIsLoading(false);
      toggleMediaButtons(true);
    });
}

async function tryPlayFolderIfIndex(fullFolderPath) {
  try {
    const { files } = await fetchFolderContents(fullFolderPath); // returns names relative to folder
    // Look for an index.m3u8 directly in the folder listing (backend tweak will already surface it)
    const idx = files.find(f => f.toLowerCase().endsWith('/index.m3u8') || f.toLowerCase() === 'index.m3u8');
    if (idx) {
      const playPath = idx.startsWith(fullFolderPath) ? idx : `${fullFolderPath}/${idx}`.replace(/\/{2,}/g,'/');
      const display = displayNameFor(playPath);
      const viewerHeader = document.querySelector('#viewer-player h3');
      if (viewerHeader) viewerHeader.textContent = display;
      setCurrentPath(playPath);
      await window.AppPlayer.playMedia(playPath);
      // stage autoplay prompt for this item
      stageAutoplayFor(playPath);
      return true;
    }
  } catch (e) {
    console.log("tryPlayFolderIfIndex error:", e);
  }
  return false;
}

function renderListView({ folders, files, prefix, isGrouped = false, groupLabel = null }) {
  mediaTree.innerHTML = groupLabel ? `<h4>Group: ${groupLabel}</h4>` : "";

  let ul;
  if (isGrouped && !groupLabel) {
    const letterGroups = groupFoldersByLetter(folders, files, getSearchQuery());
    ul = renderGroupedAZView(letterGroups, prefix);
  } else {
    const sortedFolders = sortItems(folders);
    const sortedFiles = sortItems(files);
    ul = renderStandardFolderView(sortedFolders, sortedFiles, prefix);
  }

  const scrollContainer = document.createElement("div");
  scrollContainer.id = "media-scroll";
  scrollContainer.appendChild(ul);
  mediaTree.appendChild(scrollContainer);
}

// A–Z letter view
function renderGroupedAZView(letterGroups, prefix) {
  const ul = document.createElement("ul");

  Object.keys(letterGroups).sort().forEach((letter) => {
    const li = document.createElement("li");
    li.classList.add("folder");
    li.textContent = letter;

    li.onclick = () => {
      const groupFiles = Array.from(letterGroups[letter]);
      const fullFolderPaths = groupFiles.filter(f => f.endsWith("/"));
      const fullFilePaths = groupFiles.filter(f => !f.endsWith("/"));

      // If the letter maps to exactly ONE real folder, auto-enter it (so Back is enabled)
      const realFolders = fullFolderPaths.map(f => {
        let p = f.startsWith(prefix) ? f : (prefix + f);
        return p.replace(/\/{2,}/g, "/");
      });
      if (realFolders.length === 1 && fullFilePaths.length === 0) {
        // navigate to the single real folder
        return renderFolder(realFolders[0].slice(0, -1));
      }

      // Otherwise, show the filtered list in-place (still at root; no history push)
      setLastClickedGroupLabel(letter);
      setCurrentPath(prefix);

      renderListView({
        folders: fullFolderPaths,
        files: fullFilePaths,
        prefix,
        isGrouped: false,
        groupLabel: letter
      });
    };

    ul.appendChild(li);
  });

  return ul;
}

//Normal DIR view
function renderStandardFolderView(sortedFolders, sortedFiles, prefix) {
  const ul = document.createElement("ul");

  for (const folderPath of sortedFolders) {
    const parts = folderPath.split("/").filter(Boolean);
    const folderName = parts.length > 0 ? parts[parts.length - 1] : folderPath;
    const li = document.createElement("li");

    li.classList.add("folder");
    li.textContent = folderName;

    let fullPath = folderPath;
    if (!folderPath.startsWith(prefix)) {
      fullPath = prefix + folderPath;
    }
    fullPath = fullPath.replace(/\/{2,}/g, "/");

	li.onclick = async () => {
	  const folder = fullPath.slice(0, -1);
	  // Try to auto-play if folder has an index.m3u8; otherwise navigate
	  const played = await tryPlayFolderIfIndex(folder);
	  if (!played) renderFolder(folder);
	};
	
    console.log("Folder click:", fullPath.slice(0, -1));

    ul.appendChild(li);
  }

  for (const filePath of sortedFiles) {
    const segments = filePath.split("/");
    const fileName = segments[segments.length - 1];
    const li = document.createElement("li");

    li.classList.add("file");
    const fullPath = filePath.startsWith(prefix) ? filePath : prefix + filePath;
    const display = displayNameFor(fullPath);
    li.textContent = display;

    if (fileName.toLowerCase().endsWith(".epub")) {
      li.onclick = () => {
        window.location.href = `/epubReader.html?file=${encodeURIComponent(fullPath)}`;
      };
    } else {
      setCurrentPath(fullPath);
      li.onclick = () => {
        // start playback
        AppPlayer.playMedia(fullPath);

        // update viewer label immediately
        const viewerHeader = document.querySelector('#viewer-player h3');
        if (viewerHeader) viewerHeader.textContent = display;

        // stage autoplay for the NEXT sibling (relative)
        stageAutoplayFor(fullPath);
      };
    }

    ul.appendChild(li);
  }

  return ul;
}

// unchanged
function displayNameFor(path) {
  const parts = (path || "").split("/").filter(Boolean);
  if (parts.length === 0) return path || "";
  const last = parts[parts.length - 1].toLowerCase();
  if (last === "index.m3u8") {
    return parts.length >= 2 ? parts[parts.length - 2] : "Video";
  }
  return parts[parts.length - 1];
}

export function updateSearchVisibility() {
  const searchInput = document.getElementById("media-search");
  if (searchInput) {
	searchInput.style.display = "block";
  }
}

export function getSearchQuery() {
  return (document.getElementById("media-search")?.value || "").toLowerCase();
}

const searchInput = document.getElementById("media-search");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderFolder(peekHistory());
  });
}

function isSupportedMedia(name) {
  const lower = name.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const extension = lower.substring(dotIndex);
  return supportedExtensions.includes(extension);
}

function getAllowedMediaList() {
  return fetch("/media/allowedMedia")
    .then((res) => res.json())
    .then((data) => {
      supportedExtensions = data.map(ext => ext.toLowerCase());
    })
    .catch((err) => {
      console.error("Failed to fetch supported media extensions:", err);
    });
}
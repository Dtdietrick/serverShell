// File: explorer.js with autoplay functionality

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
import { updateBackButton, showBackButton } from "/ui/backButton.js";
import { getIsLoading, setIsLoading, toggleMediaButtons } from "/ui/loading.js";

const mediaTree = document.getElementById("mediaTree");
let supportedExtensions = [];

const AUTOPLAY_ENABLED = true;

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
    console.debug("[autoplay] too few parts for", currentFullPath);
    return null;
  }

  const isIndex = parts[parts.length - 1].toLowerCase() === "index.m3u8";
  const baseParts = isIndex ? parts.slice(0, -2) : parts.slice(0, -1);
  const leafFolder = (isIndex ? parts[parts.length - 2] : parts[parts.length - 1]) || "";
  const basePath = baseParts.join("/");

  if (!basePath) {
    console.debug("[autoplay] empty basePath for", currentFullPath);
    return null;
  }

  const { folders } = await fetchFolderContents(basePath);
  // Normalize all sibling folder names to plain names without trailing slash
  const siblingNames = sortItems(folders).map(f =>
    f.replace(/\/+$/,'').split("/").pop()
  );

  const leafLower = leafFolder.toLowerCase();
  const curIdx = siblingNames.findIndex(n => (n || "").toLowerCase() === leafLower);
  if (curIdx < 0) {
    console.debug("[autoplay] current leaf not found among siblings", { basePath, leafFolder, siblingNames });
    return null;
  }

  const nextIdx = curIdx + 1;
  if (nextIdx >= siblingNames.length) {
    console.debug("[autoplay] no next sibling (end of list)", { basePath, siblingNames });
    return null;
  }

  const nextFolderName = siblingNames[nextIdx];
  const nextPath = `${basePath}/${nextFolderName}/index.m3u8`;
  console.debug("[autoplay] next candidate:", nextPath);
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
  console.debug("[autoplay] prompt injected for:", nextPath);
}

//autoplay path; set AppPlayer.onEnded once per click
function stageAutoplayFor(fullPath) {
  if (!AUTOPLAY_ENABLED || !window.AppPlayer) return;

  window.AppPlayer.onEnded = async (endedPath) => {
    const from = endedPath || fullPath;
    try {
      console.debug("[autoplay] ended detected for:", from);
      const nextPath = await computeNextIndexPath(from);
      if (!nextPath) return;
      showNextPrompt(nextPath);
    } catch (e) {
      console.warn("[autoplay] failed to compute next:", e);
    }
  };
}

// Entry point for root-level navigation
export async function firstRender(path) {
  resetHistory(path);
  setMediaRoot(path);
  setCurrentPath(path);
  toggleMediaButtons(false);
  showBackButton();
  await getAllowedMediaList();
  renderFolder(path, true);
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
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      return res.json();
    })
    .then((files) => {
      if (!files) return;

      setFileList(files);
      setCurrentPath(path);
      pushHistory(path);
      updateSearchVisibility();
      updateBackButton(path);

      const prefix = peekHistory() ? peekHistory() + "/" : "";
      const searchQuery = getSearchQuery();

      const folders = [];
      const normalFiles = [];

      files.forEach((item) => {
        const name = item.startsWith(prefix) ? item.slice(prefix.length) : item;
        if (item.endsWith("/")) {
          if (!folders.includes(name)) folders.push(name);
        } else {
          if (isSupportedMedia(name)) normalFiles.push(name);
        }
      });

      mediaTree.innerHTML = getLastClickedGroupLabel()
        ? `<h4>Group: ${getLastClickedGroupLabel()}</h4>`
        : "";

      renderListView({
        folders,
        files: normalFiles,
        prefix,
        isGrouped: useGrouping
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

    li.onclick = () => renderFolder(fullPath.slice(0, -1));
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
    if (!peekHistory()) {
      searchInput.style.display = "none";
      searchInput.value = "";
    } else {
      searchInput.style.display = "block";
    }
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
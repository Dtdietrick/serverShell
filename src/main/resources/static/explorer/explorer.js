// File: explorer.js

// state logic for variables
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
import { 
    updateBackButton, 
    showBackButton,
} from "/ui/backButton.js";

import {
    getIsLoading,
    setIsLoading,
    toggleMediaButtons,
} from "/ui/loading.js"

const mediaTree = document.getElementById("mediaTree");
let supportedExtensions = [];

// Entry point for root-level navigation
export async function firstRender(path) {
  resetHistory(path);
  setMediaRoot(path);
  setCurrentPath(path);
  toggleMediaButtons(false);
  showBackButton();
  await getAllowedMediaList();
  renderFolder(path, true); // Root level gets grouped A-Z view
}

// Render a folder: fetch contents, determine grouping, trigger view
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

// Core view renderer: decides between grouped or standard view
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

// Renders the A-Z letter folders when grouping is enabled
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
      
      // update label + current path, but not history
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

// Renders a standard folder view (files and folders)
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
	
	 //Epub goes to the epub.html - no current path
	 if (fileName.toLowerCase().endsWith(".epub")) {	
		li.onclick = () => {
		    window.location.href = `/epubReader.html?file=${encodeURIComponent(fullPath)}`;
		};
    }
	//video & audio to embedded player 
	else {
      setCurrentPath(fullPath); 
      li.onclick = () =>{
		AppPlayer.playMedia(fullPath);
		
		//Video Viewer label
		const viewerHeader = document.querySelector('#viewer-player h3');
		if (viewerHeader) viewerHeader.textContent = display;	
	  }; 
    }

    ul.appendChild(li);
  }

  return ul;
}

//helps track a name to display for the file
function displayNameFor(path) {
  const parts = (path || "").split("/").filter(Boolean);
  if (parts.length === 0) return path || "";
  const last = parts[parts.length - 1].toLowerCase();
  if (last === "index.m3u8") {
    // parent folder name, e.g. ".../Heavy Metal/index.m3u8" → "Heavy Metal"
    return parts.length >= 2 ? parts[parts.length - 2] : "Video";
  }
  return parts[parts.length - 1];
}
// Toggle visibility of search bar based on whether we're at the root
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

// Returns the lowercase search string input by user
export function getSearchQuery() {
  return (document.getElementById("media-search")?.value || "").toLowerCase();
}

// Bind search input to re-render on text change
const searchInput = document.getElementById("media-search");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderFolder(peekHistory());
  });
}

// Checks whether a file extension is one of the allowed types
function isSupportedMedia(name) {
  const lower = name.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const extension = lower.substring(dotIndex);
  return supportedExtensions.includes(extension);
}

// Fetch the list of supported media extensions (once at startup)
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
// File: explorer.js

// state logic for variables
import {
  getCurrentPath,
  setCurrentPath,
  setLastClickedGroupLabel,
  getLastClickedGroupLabel,
  setMediaRoot,
} from "/explorer/path.js";

import {
  setFileList,
  groupFoldersByLetter,
  sortItems
} from "/explorer/file.js";

import {
  peekHistory,
  resetHistory,
} from "/explorer/history.js";

import {
  playMedia
} from "/media/media.js";

import { loadPlaylist } from "/media/mediaPlaylist.js";
import { updateBackButton } from "/ui/backButton.js";
import {
    getIsLoading,
    setIsLoading,
    setShowBackButton,
    toggleMediaButtons,
} from "/ui/loading.js"

const mediaTree = document.getElementById("mediaTree");

//avoid recursion where i dont want
export function firstRender(path){
    resetHistory(path);
    setMediaRoot(path);
    toggleMediaButtons(false);
    setShowBackButton(false);
    renderFolder(path);
}

//logic to render the folder structure based on directory found
export function renderFolder(path) {
  const encoded = encodeURIComponent(path);
  const apiPath = `/media/api/list?path=${encoded}`;

  if (getIsLoading()) return;
  
  //set current load logic
  setIsLoading(true);
  if (mediaTree) mediaTree.innerHTML = "Loading...";
  
  console.log("Fetching folder contents:", apiPath);
  
  //fetch data
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
      setCurrentPath(path || "");
      updateSearchVisibility();
      updateBackButton(path);
      const prefix = getCurrentPath() ? getCurrentPath() + "/" : "";
      const searchQuery = getSearchQuery();

      const folders = [];
      const normalFiles = [];

      files.forEach((file) => {
        const name = file.replace(prefix, "");
        if (name.includes("/")) {
          const topFolder = name.split("/")[0];
          if (!folders.includes(topFolder)) folders.push(topFolder);
        } else {
          normalFiles.push(name);
        }
      });

      mediaTree.innerHTML = getLastClickedGroupLabel()
        ? `<h4>Group: ${getLastClickedGroupLabel()}</h4>`
        : "";

      const threshold = 10;
      const pathRoot = getCurrentPath().split("/")[0];
      const shouldGroup = (folders.length + normalFiles.length > threshold);

      renderListView({
        folders,
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

function renderListView({ folders, files, prefix, isGrouped = false, groupLabel = null }) {
  mediaTree.innerHTML = groupLabel ? `<h4>Group: ${groupLabel}</h4>` : "";

  const ul = document.createElement("ul");

  if (isGrouped && !groupLabel) {
    const letterGroups = groupFoldersByLetter(folders, files, getSearchQuery());

    Object.keys(letterGroups).sort().forEach(letter => {
      const li = document.createElement("li");
      li.classList.add("folder");
      li.textContent = letter;
      li.onclick = () => {
        setLastClickedGroupLabel(letter);
        renderListView({
          folders: [],
          files: Array.from(letterGroups[letter]),
          prefix,
          isGrouped: false,
          groupLabel: letter
        });
      };
      ul.appendChild(li);
    });

  } else {
    const sortedFolders = sortItems(folders.map(f => f + "/"));
    const sortedFiles = sortItems(files);

    for (const folder of sortedFolders) {
      const folderName = folder.slice(0, -1);
      const li = document.createElement("li");
      li.classList.add("folder");
      li.textContent = folderName;
      li.onclick = () => renderFolder(prefix + folderName);
      ul.appendChild(li);
    }

    for (const file of sortedFiles) {
      const li = document.createElement("li");
      const fullPath = prefix + file;

      if (file.toLowerCase().endsWith(".m3u")) {
        li.classList.add("playlist-file");
        li.textContent = file;
        li.onclick = () => loadPlaylist(fullPath.slice(0, -4));
      } else if (file.toLowerCase().endsWith(".epub")) {
        li.classList.add("file");
        li.textContent = file;

        const link = document.createElement("a");
        link.href = `/epubReader.html?file=${encodeURIComponent(fullPath)}`;
        link.textContent = "📘 Read Online";
        link.style.marginLeft = "1rem";
        li.appendChild(link);
      } else {
        li.classList.add("file");
        li.textContent = file;
        li.onclick = () => playMedia(fullPath);
      }

      ul.appendChild(li);
    }
  }

  const scrollContainer = document.createElement("div");
  scrollContainer.id = "media-scroll";
  scrollContainer.appendChild(ul);
  mediaTree.appendChild(scrollContainer);
}

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

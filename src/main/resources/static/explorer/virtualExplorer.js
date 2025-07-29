// File: virtualExplorer.js

// mediaState logic for variables
import {
  getCurrentPath,
  setCurrentPath,
  peekPath,
  setFileList,
  setLastClickedGroupLabel,
  getLastClickedGroupLabel,
  setMediaRoot,
  resetPathHistory,
  groupFoldersByLetter,
  sortItems
} from "/media/mediaState.js";

import {
  updateSearchVisibility,
  getSearchQuery,
  playMedia
} from "/explorer/mediaExplorer.js";

import { loadPlaylist } from "/media/playlistManager.js";
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
    resetPathHistory(path);
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

      if (shouldGroup) {
        renderGroupedAZView(folders, normalFiles, prefix, searchQuery);
      } else {
        renderSimpleListView(folders, normalFiles, prefix);
      }
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

export function renderGroupedAZView(folders, files, prefix, searchQuery) {
  const ul = document.createElement("ul");
  const currentPath = getCurrentPath();
  console.log("Virtual render for current path:", currentPath);

  const letterGroups = groupFoldersByLetter(folders, files, searchQuery);

  Object.keys(letterGroups)
    .sort()
    .forEach((letter) => {
      const li = document.createElement("li");
      li.classList.add("folder");
      li.textContent = letter;
      li.onclick = () => {
        setLastClickedGroupLabel(letter);
        renderVirtualGroup(letter, Array.from(letterGroups[letter]));
      };
      ul.appendChild(li);
    });

  const scrollContainer = document.createElement("div");
  scrollContainer.id = "media-scroll";
  scrollContainer.appendChild(ul);
  mediaTree.appendChild(scrollContainer);
}

export function renderVirtualGroup(letter, items) {
  mediaTree.innerHTML = `<h4>Group: ${letter}</h4>`;
  setLastClickedGroupLabel(letter);
  
  const ul = document.createElement("ul");
  const prefix = getCurrentPath() ? getCurrentPath() + "/" : "";
  const sortedItems = sortItems(items);

  if (getCurrentPath() === "Music" || getCurrentPath().startsWith("Music/")) {
    const index = sortedItems.findIndex(i => i.toLowerCase() === "playlists/");
    if (index > -1) {
      const [playlistItem] = sortedItems.splice(index, 1);
      sortedItems.unshift(playlistItem);
    }
  }

  for (const item of sortedItems) {
    const li = document.createElement("li");

    if (item.endsWith("/")) {
      const folderName = item.slice(0, -1);
      li.classList.add("folder");
      li.textContent = folderName;
      li.onclick = () => {
        setLastClickedGroupLabel(folderName);
        renderFolder(prefix + folderName);
      };
    } else if (item.toLowerCase().endsWith(".m3u")) {
      li.classList.add("playlist-file");
      li.textContent = item;
      li.onclick = () => loadPlaylist(prefix + item.slice(0, -4));
    } else if (item.toLowerCase().endsWith(".epub")) {
      li.classList.add("file");
      li.textContent = item;

      const link = document.createElement("a");
      const encodedPath = encodeURIComponent(prefix + item);
      link.href = `/epubReader.html?file=${encodedPath}`;
      link.textContent = "📘 Read Online";
      link.style.marginLeft = "1rem";

      li.appendChild(link);
    } else {
      li.classList.add("file");
      li.textContent = item;
      li.onclick = () => playMedia(prefix + item);
    }

    ul.appendChild(li);
  }

  const scrollContainer = document.createElement("div");
  scrollContainer.id = "media-scroll";
  scrollContainer.appendChild(ul);
  mediaTree.appendChild(scrollContainer);
}

function renderSimpleListView(folders, files, prefix) {
  const ul = document.createElement("ul");

  const sortedFolders = sortItems(folders.map((f) => f + "/"));
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

    if (file.toLowerCase().endsWith(".m3u")) {
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
  }

  const scrollContainer = document.createElement("div");
  scrollContainer.id = "media-scroll";
  scrollContainer.appendChild(ul);
  mediaTree.appendChild(scrollContainer);
}
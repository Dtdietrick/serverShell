// mediaExplorer.js

// DOM references
const mediaTree = document.getElementById("mediaTree");
const player = document.getElementById("player");
const backButton = document.getElementById("back-button");

const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");

// State variables
let fileList = []; // Holds current folder contents fetched from backend
let currentPath = ""; // Tracks current folder path
let lastClickedGroupLabel = null;

/**
 * Fetches folder contents from backend for given path,
 * then calls renderFolder() to update UI.
 * @param {string} path - Folder path to fetch
 */
export function fetchAndRenderPath(path) {
  fetch("/media/list?path=" + encodeURIComponent(path))
    .then((res) => {
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      return res.json();
    })
    .then((files) => {
      if (!files) return;

      // Check if folder contains exactly one folder and no files
      const prefix = path ? path + "/" : "";
      const folders = new Set();
      const filesInFolder = [];

      files.forEach((file) => {
        if (!file.startsWith(prefix)) return;

        const rest = file.slice(prefix.length);
        const parts = rest.split("/");

        if (parts.length === 1) {
          filesInFolder.push(rest);
        } else {
          folders.add(parts[0]);
        }
      });

      // Auto-dive if only one folder and no files
      if (filesInFolder.length === 0 && folders.size === 1) {
        const onlyFolder = Array.from(folders)[0];
        const currentFolderName = path ? path.split("/").pop() : "";
        if (onlyFolder === currentFolderName) {
          // Auto dive into the nested same-named folder
          fetchAndRenderPath(path + "/" + onlyFolder);
          return;
        }
      }

      // If no auto dive, set fileList and render normally
      fileList = files;
      currentPath = path;
      renderFolder(path);
    })
    .catch(() => {
      mediaTree.innerHTML = "<p>Error loading media list.</p>";
    });
}

export function fetchMediaTree() {
  console.log("Fetching media list...");
  fetch("/media/list")
    .then((res) => {
      console.log("Got response:", res);
      if (!res.ok) throw new Error("Fetch failed with status " + res.status);
      return res.json();
    })
    .then((files) => {
      console.log("Received files:", files);
      if (!Array.isArray(files)) throw new Error("Invalid file list");
      fileList = files;
      renderFolder("");
    })
    .catch((err) => {
      console.error("Failed to fetch media list:", err);
      mediaTree.innerHTML = "<p>Error loading media list.</p>";
    });
}

/**
 * Render the folder view UI, grouping folders and files,
 * and setting up click handlers for navigation and playback.
 * @param {string} path - Current folder path
 */
export function renderFolder(path) {
  currentPath = path || ""; // update global currentPath

  const searchInput = document.getElementById("media-search");
  if (searchInput) {
    if (!currentPath) {
      searchInput.style.display = "none";
      searchInput.value = ""; // Clear search when returning to root
    } else {
      searchInput.style.display = "block";
    }
  }
  
  const prefix = currentPath ? currentPath + "/" : "";
  const searchQuery = (document.getElementById("media-search")?.value || "").toLowerCase();
  // Separate folders and files under currentPath
  const foldersSet = new Set();
  const filesList = [];

  // Filter fileList to entries inside currentPath
  fileList.forEach((item) => {
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

  const folders = Array.from(foldersSet);

  if (currentPath === "Music" || currentPath.startsWith("Music/")) {
    const playlistsIndex = folders.findIndex((f) => f.toLowerCase() === "playlists");
    if (playlistsIndex > -1) {
      const playlistsFolder = folders.splice(playlistsIndex, 1)[0];
      folders.unshift(playlistsFolder);
    }
  }

  // Special handling to pin 'playlists' to top if in Music
  let pinned = [];
  let restFolders = folders;

  if (currentPath === "Music" || currentPath.startsWith("Music/")) {
    const playlistsIndex = folders.findIndex((f) => f.toLowerCase() === "playlists");
    if (playlistsIndex > -1) {
      pinned = [folders[playlistsIndex]];
      restFolders = folders.slice(0, playlistsIndex).concat(folders.slice(playlistsIndex + 1));
    }
  }

  // Final folder sort order: pinned + sorted rest
  const sortedFolders = pinned.concat(restFolders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
  const files = filesList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  mediaTree.innerHTML = lastClickedGroupLabel ? `<h4>Group: ${lastClickedGroupLabel}</h4>` : "";

  const threshold = 10;
  const totalItems = folders.length + files.length;

  const topLevelGrouping = ["Movies", "Music", "Books"];
  const pathRoot = currentPath.split("/")[0];
  const shouldGroup = topLevelGrouping.includes(pathRoot);

  if (shouldGroup && totalItems > threshold) {
    const letterGroups = {};

    // Separate 'playlists' if we're in Music
    let pinnedFolders = [];
    if (currentPath === "Music" || currentPath.startsWith("Music/")) {
      const playlistsIndex = folders.findIndex((f) => f.toLowerCase() === "playlists");
      if (playlistsIndex > -1) {
        pinnedFolders = [folders[playlistsIndex]];
        folders.splice(playlistsIndex, 1); // remove playlists from normal group
      }
    }

    // Helper: get first letter uppercase or '#'
    function getLetter(name) {
      const c = name[0];
      return /^[A-Z0-9]$/i.test(c) ? c.toUpperCase() : "#";
    }

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

    const ul = document.createElement("ul");

    // Add pinned 'playlists' folder manually first
    pinnedFolders.forEach((folder) => {
      const li = document.createElement("li");
      li.classList.add("folder", "playlist-folder-icon");
      li.textContent = folder;
      li.onclick = () => {
        lastClickedGroupLabel = folder;
        renderFolder(prefix + folder);
      };
      ul.appendChild(li);
    });

    // Now render A-Z groups
    Object.keys(letterGroups)
      .sort()
      .forEach((letter) => {
        const li = document.createElement("li");
        li.classList.add("folder");
        li.textContent = letter;

        li.onclick = () => {
          lastClickedGroupLabel = letter;
          renderVirtualGroup(letter, Array.from(letterGroups[letter]).sort());
          backButton.style.display = "block";
        };

        ul.appendChild(li);
      });

    const scrollContainer = document.createElement("div");
    scrollContainer.id = "media-scroll";
    scrollContainer.appendChild(ul);

    mediaTree.appendChild(scrollContainer);
  } else {
    // Render normal folders and files

    const ul = document.createElement("ul");

    sortedFolders.forEach((folder) => {
      const li = document.createElement("li");
      li.classList.add("folder");
      li.textContent = folder;
      li.onclick = () => {
        lastClickedGroupLabel = folder; // track real folder name
        renderFolder(prefix + folder);
      };
      ul.appendChild(li);
    });

	files.forEach((file) => {
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
	});

    mediaTree.appendChild(ul);
  }

  backButton.style.display = currentPath ? "block" : "none";
}

const searchInput = document.getElementById("media-search");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderFolder(currentPath);
  });
}

export function renderVirtualGroup(letter, items) {
  mediaTree.innerHTML = `<h4>Group: ${letter}</h4>`;
  lastClickedGroupLabel = letter;

  const ul = document.createElement("ul");
  const prefix = currentPath ? currentPath + "/" : "";

  // Sort alphabetically
  const sortedItems = [...items]
    .filter(item => item && item.trim() !== "" && item !== "/") // ✨ Filter out invalid entries
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	
  // Detect and pin playlists/ only once, only at top-level Music
  if ((currentPath === "Music" || currentPath.startsWith("Music/")) && sortedItems.includes("playlists/")) {
    sortedItems.splice(sortedItems.indexOf("playlists/"), 1);
    sortedItems.unshift("playlists/");
  }

  for (const item of sortedItems) {
    const li = document.createElement("li");

    if (item.endsWith("/")) {
      const folderName = item.slice(0, -1);
      li.classList.add("folder");
      li.textContent = folderName;
      li.onclick = () => {
        lastClickedGroupLabel = folderName;
        fetchAndRenderPath(prefix + folderName);
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

/**
 * Plays a media file (audio/video) in either main player or popup.
 * @param {string} filename - Full file path
 * @param {boolean} usePopup - Play in popup if true
 * @param {boolean} fromPlaylist - If playing from playlist (adds query param)
 */
export function playMedia(filename, usePopup = false, fromPlaylist = false) {
  stopAllMedia();

  const ext = filename.split(".").pop().toLowerCase();
  const encodedPath = encodeURIComponent(filename).replace(/%2F/g, "/");
  const src = `/media/${encodedPath}${fromPlaylist ? "?fromPlaylist=true" : ""}`;

  // Determine media type for source element
  const type = ext === "mp3" ? "mpeg" : ext;
  const element = ["mp4", "webm", "ogg"].includes(ext)
    ? `<video controls autoplay><source src="${src}" type="video/${ext}">Video not supported.</video>`
    : `<audio controls autoplay><source src="${src}" type="audio/${type}">Audio not supported.</audio>`;

  // Choose target container
  const target = usePopup ? popupPlayer : player;
  target.innerHTML = element;

  // Apply volume/mute settings persistence
  const mediaElement = target.querySelector("audio, video");
  if (mediaElement) applyPlayerSettings(mediaElement);
}

/**
 * Stop and clear any playing media from both main player and popup.
 */
export function stopAllMedia() {
  const mainMedia = player.querySelector("audio, video");
  if (mainMedia) {
    mainMedia.pause();
    mainMedia.src = "";
    mainMedia.load();
  }
  player.innerHTML = "";

  const popupMedia = popupPlayer.querySelector("audio, video");
  if (popupMedia) {
    popupMedia.pause();
    popupMedia.src = "";
    popupMedia.load();
  }
  popupPlayer.innerHTML = "";
}

/**
 * Apply volume and mute settings from localStorage to media element,
 * and save changes persistently.
 * @param {HTMLMediaElement} playerElement
 */
export function applyPlayerSettings(playerElement) {
  const volume = localStorage.getItem("playerVolume");
  const muted = localStorage.getItem("playerMuted");

  if (volume !== null) playerElement.volume = parseFloat(volume);
  if (muted !== null) playerElement.muted = muted === "true";

  playerElement.addEventListener("volumechange", () => {
    localStorage.setItem("playerVolume", playerElement.volume);
    localStorage.setItem("playerMuted", playerElement.muted);
  });
}

// Back button navigates up one folder and fetches new data
backButton.onclick = () => {
  if (!currentPath) return;

  const parts = currentPath.split("/");
  parts.pop();
  currentPath = parts.join("/");

  if (!currentPath) {
    lastClickedGroupLabel = "";
  } else {
    lastClickedGroupLabel = currentPath.split("/").pop();
  }

  fetchAndRenderPath(currentPath);
};

// Initial load
fetchMediaTree();
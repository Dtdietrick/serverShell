// virtualExplorer.js

// Render A-Z group folders and files with optional pinned 'playlists'
export function renderGroupedAZView(folders, files, prefix, searchQuery) {
  const letterGroups = {};

  // Helper: get first letter uppercase or '#'
  function getLetter(name) {
    const c = name[0];
    return /^[A-Z0-9]$/i.test(c) ? c.toUpperCase() : "#";
  }

  const ul = document.createElement("ul");

  // Add pinned 'playlists' folder manually first
  if (currentPath === "Music" || currentPath.startsWith("Music/")) {
    const playlistsIndex = folders.findIndex((f) => f.toLowerCase() === "playlists");
    if (playlistsIndex > -1) {
      const folder = folders[playlistsIndex];
      const li = document.createElement("li");
      li.classList.add("folder", "playlist-folder-icon");
      li.textContent = folder;
      li.onclick = () => {
        lastClickedGroupLabel = folder;
        renderFolder(prefix + folder);
      };
      ul.appendChild(li);
    }
  }

  // Group folders by letter
  folders
    .filter((f) => !searchQuery || f.toLowerCase().includes(searchQuery))
    .forEach((folder) => {
      const letter = getLetter(folder);
      if (!letterGroups[letter]) letterGroups[letter] = new Set();
      letterGroups[letter].add(folder + "/");
    });

  // Group files by letter
  files
    .filter((f) => !searchQuery || f.toLowerCase().includes(searchQuery))
    .forEach((file) => {
      const letter = getLetter(file);
      if (!letterGroups[letter]) letterGroups[letter] = new Set();
      letterGroups[letter].add(file);
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
// File: mediaPlaylist.js

// DOM references (assumed to be available globally or passed in)
const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");

// Playlist management variables
let currentPlaylistName = null;
let playlistOffset = 0;
const playlistLimit = 10;
let playlistLoading = false;
let playlistHasMore = true;
let currentPlaylist = [];
let currentTrackIndex = -1;

//remember original player mount to move it into popup
let originalPlayerParent = null;

function openPlaylistPopup() {
  playlistPopup.classList.add('open');     
}

// helper: normalize server item -> { path, title?, duration? }
function normalizeItem(item) {
  if (typeof item === "string") {
    const leaf = item.split("/").filter(Boolean).slice(-2, -1)[0] || item.split("/").pop();
    return { path: item, title: leaf, duration: null };
  }
  // defensive copy if server returns {path,title,duration}
  return {
    path: item.path,
    title: item.title || (item.path?.split("/").pop() ?? ""),
    duration: typeof item.duration === "number" ? item.duration : null
  };
}

function renderLiForItem(nItem, idx) {
  const li = document.createElement("li");
  li.innerHTML = `
    <span class="title" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nItem.title}</span>
    ${nItem.duration ? `<span class="chip">${formatDuration(nItem.duration)}</span>` : ""}
  `;
  li.onclick = () => {
    setActiveIndex(idx);
    playMedia(nItem.path, true, true);
  };
  return li;
}

function setActiveIndex(nextIdx) {
  currentTrackIndex = nextIdx;
  // toggle row highlight
  Array.from(playlistItems.children).forEach((li, i) => {
    li.classList.toggle("active", i === currentTrackIndex);
  });
}

// simple mm:ss or m:ss formatter
function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function loadPlaylist(nameOrPath, reset = true) {
  if (reset) {
    currentPlaylistName = nameOrPath;
    playlistOffset = 0;
    playlistHasMore = true;
    playlistItems.innerHTML = "";
    ensurePopupHasPlayer();             // <-- mount player UI inside popup
	playlistPopup.classList.add('open');
	currentPlaylist = [];
    currentTrackIndex = -1;
  }
  if (!playlistHasMore || playlistLoading) return;

  playlistLoading = true;
  updateShuffleButton();

  // Prefer sending 'path' (your controller supports it). Works if it still expects 'name' too.
  const qs = new URLSearchParams({
    path: nameOrPath,
    offset: String(playlistOffset),
    limit: String(playlistLimit)
  });

  fetch(`/media/playlist?${qs.toString()}`)
    .then(res => res.json())
    .then(items => {
      if (!Array.isArray(items) || items.length === 0) {
        playlistHasMore = false;
        return;
      }

      items.forEach((raw, i) => {
        const n = normalizeItem(raw);
        const li = renderLiForItem(n, currentPlaylist.length + i);
        playlistItems.appendChild(li);
        currentPlaylist.push(n);

        // Autoplay the first on fresh reset
        if (reset && i === 0 && playlistOffset === 0) {
          setActiveIndex(0);
          playMedia(n.path, true, true);
        }
      });

      playlistOffset += items.length;
      openPlaylistPopup();
    })
    .finally(() => {
      playlistLoading = false;
      updateShuffleButton();
    });
}

function updateShuffleButton() {
  const b = document.getElementById("shuffle-button");
  if (b) {
    b.disabled = playlistLoading || currentPlaylist.length <= 1;
    b.classList.toggle("disabled", b.disabled);
  }
}

/**
 * Play next track in current playlist if available.
 */
export function nextInPlaylist() {
  if (currentTrackIndex < currentPlaylist.length - 1) {
    setActiveIndex(currentTrackIndex + 1);
    playMedia(currentPlaylist[currentTrackIndex].path, true, true);
  } else {
    const before = currentPlaylist.length;
    loadPlaylist(currentPlaylistName, false);
    setTimeout(() => {
      if (currentPlaylist.length > before) {
        setActiveIndex(currentTrackIndex + 1);
        playMedia(currentPlaylist[currentTrackIndex].path, true, true);
      }
    }, 400);
  }
}

/**
 * Play previous track in current playlist if available.
 */
export function prevInPlaylist() {
  if (currentTrackIndex > 0) {
    setActiveIndex(currentTrackIndex - 1);
    playMedia(currentPlaylist[currentTrackIndex].path, true, true);
  }
}

/**
 * Shuffle playlist and play a random track.
 */
export function shufflePlaylist() {
  if (playlistLoading || currentPlaylist.length <= 1) return;
  let r;
  do { r = Math.floor(Math.random() * currentPlaylist.length); } while (r === currentTrackIndex);
  setActiveIndex(r);
  playMedia(currentPlaylist[r].path, true, true);
}

function ensurePopupHasPlayer() {
  const player = document.getElementById("player-container");
  if (!player) return;
  if (!originalPlayerParent) {
    originalPlayerParent = player.parentElement || null;
  }
  if (popupPlayer && player.parentElement !== popupPlayer) {
    popupPlayer.appendChild(player);
    player.classList.add("in-popup");
  }
}

function pausePlayback() {
  try {
    // Prefer player API if available
    if (window.AppPlayer && typeof window.AppPlayer.pause === "function") {
      window.AppPlayer.pause();
      return;
    }
  } catch (e) {
    console.warn("AppPlayer.pause failed:", e);
  }

  // Fallback: pause the media element
  const mediaEl = document.querySelector('#player-container video, #player-container audio');
  if (mediaEl && typeof mediaEl.pause === "function") {
    mediaEl.autoplay = false;   // guard against auto-resume
    mediaEl.pause();
  }
}

/**
 * Close and reset the playlist popup.
 */
export function closePlaylist() {
  pausePlayback();

  playlistPopup.classList.remove('open');
  playlistItems.innerHTML = "";

  const player = document.getElementById("player-container");
  if (originalPlayerParent && player && player.parentElement !== originalPlayerParent) {
    originalPlayerParent.appendChild(player);
    player.classList.remove("in-popup");
  }

  currentPlaylist = [];
  currentTrackIndex = -1;
  currentPlaylistName = null;
  playlistOffset = 0;
  playlistHasMore = true;
  playlistLoading = false;
}
// Export helper needed by playlist
export let playMediaCallback = null;

export function setPlayMediaCallback(callback) {
  playMediaCallback = callback;
}

function playMedia(...args) {
  if (playMediaCallback) {
    playMediaCallback(...args);
  } else {
    console.warn("playMedia callback not set!");
  }
}

const playlistSearchInput = document.getElementById("playlist-search");
const playlistItemsList = document.getElementById("playlist-items");

playlistSearchInput?.addEventListener("input", () => {
  const query = playlistSearchInput.value.toLowerCase();
  Array.from(playlistItemsList.children).forEach((li) => {
    const text = li.textContent.toLowerCase();
    li.style.display = text.includes(query) ? "" : "none";
  });
});

// Export an init function to setup any event listeners or initial state
export function initPlaylist() {
  // Add infinite scroll listener to playlistItems
  playlistItems.addEventListener("scroll", () => {
    const scrollThreshold = 20; // px from bottom to trigger load

    if (
      playlistItems.scrollHeight -
        playlistItems.scrollTop -
        playlistItems.clientHeight <
      scrollThreshold
    ) {
      loadPlaylist(currentPlaylistName, false);
    }
  });
}
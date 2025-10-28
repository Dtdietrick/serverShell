// File: mediaPlaylist.js

// DOM references (assumed to be available globally or passed in)
const playlistPopup = document.getElementById("playlist-popup");
const popupPlayer = document.getElementById("popup-player");
const playlistItems = document.getElementById("playlist-items");
const playlistMediaLabel = document.getElementById("playlist-media"); 
const viewerPlayer = document.getElementById("viewer-player"); 

// Playlist management variables
let currentPlaylistName = null;
let nowPlayingPath = null;
let playlistOffset = 0;
const playlistLimit = 10;
let playlistLoading = false;
let playlistHasMore = true;
let currentPlaylist = [];
let currentTrackIndex = -1;
let savedViewerHeading = null;

//remember original player mount to move it into popup
let originalPlayerParent = null;

function getViewerMediaTitleEl() {
  return document.getElementById('media-title');
}

function openPlaylistPopup() {
  playlistPopup.classList.add('open');   
  moveLabelToPopup();  
}

function setNowPlayingLabelText(text) {
  if (!playlistMediaLabel) return;
  const val = (text ?? '').toString().trim();
  playlistMediaLabel.textContent = val;

  // If the popup is closed, keep the viewer title in sync
  const viewerH3 = getViewerMediaTitleEl();
  if (viewerH3 && !playlistMediaLabel.classList.contains('in-popup')) {
    viewerH3.textContent = val;
  }
}

function moveLabelToPopup() {
  if (!playlistMediaLabel || !playlistPopup) return;

  // Ensure the label element is placed back inside the popup UI (but we never move it out anymore)
  const search = document.getElementById('playlist-search');
  if (search && search.parentElement === playlistPopup) {
    playlistPopup.insertBefore(playlistMediaLabel, search);
  } else if (playlistItems) {
    playlistPopup.insertBefore(playlistMediaLabel, playlistItems);
  } else {
    playlistPopup.appendChild(playlistMediaLabel);
  }

  playlistMediaLabel.classList.add('in-popup');

  // Optional: restore the viewer title to its original text when the popup opens
  const viewerH3 = getViewerMediaTitleEl();
  if (viewerH3 && viewerH3.dataset.origText) {
    viewerH3.textContent = viewerH3.dataset.origText;
    delete viewerH3.dataset.origText;
  }
}
function moveLabelToViewer() {
  if (!playlistMediaLabel) return;

  const viewerH3 = getViewerMediaTitleEl();
  if (viewerH3) {
    // stash original once so we can restore when popup opens (optional but nice)
    if (!viewerH3.dataset.origText) {
      viewerH3.dataset.origText = viewerH3.textContent || '';
    }
    viewerH3.textContent = playlistMediaLabel.textContent.trim();
  }

  // mark that the label is no longer in the popup so future updates mirror to #media-title
  playlistMediaLabel.classList.remove('in-popup');
}

// helper: normalize server item -> { path, title?, duration? }
function normalizeItem(item) {
  if (typeof item === "string") {
    const segs = item.split("/").filter(Boolean);
    let leaf = segs[segs.length - 1] || item;
    const low = leaf.toLowerCase();
    if (low === "index.m3u8" || low === "index.mp3" || low === "index.m4a") {
      leaf = segs[segs.length - 2] || leaf;
    }
    return { path: item, title: leaf, duration: null };
  }
  // defensive copy if server returns {path,title,duration}
  const segs = (item.path || "").split("/").filter(Boolean);
  let title = item.title || segs[segs.length - 1] || "";
  const low = title.toLowerCase();
  if (low === "index.m3u8" || low === "index.mp3" || low === "index.m4a") {
    title = segs[segs.length - 2] || title;
  }
  return {
    path: item.path,
    title,
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
    playSelected(nItem);
  };
  return li;
}

function playSelected(n) {
  // record path
  nowPlayingPath = n.path;
  setActiveIndexByPath(nowPlayingPath);
  // label from title
  setNowPlayingLabelText(n.title || n.path);

  // (unchanged) actually start playback in the popup
  playMedia(n.path, true, true);

  // in case UI jitter, re-check on the next tick
  queueMicrotask?.(() => {
    setActiveIndexByPath(nowPlayingPath);
    // NEW: tell explorer that a playlist item has begun playing
    try {
      window.dispatchEvent(new CustomEvent("playlist:played", {
        detail: { path: nowPlayingPath }
      }));
    } catch {}
  });
}

function setActiveIndex(nextIdx) {
  currentTrackIndex = nextIdx;
  Array.from(playlistItems.children).forEach((li, i) => {
    li.classList.toggle("active", i === currentTrackIndex);
  });
  const cur = currentPlaylist[currentTrackIndex];
  if (cur) setNowPlayingLabelText(cur.title || cur.path);
}

function setActiveIndexByPath(path) {
  if (!path) return;
  const i = currentPlaylist.findIndex(it => it.path === path);
  if (i >= 0 && i !== currentTrackIndex) {
    setActiveIndex(i);
  }
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
          playSelected(n); 
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
    playSelected(currentPlaylist[currentTrackIndex]); 
  } else {
    const before = currentPlaylist.length;
    loadPlaylist(currentPlaylistName, false);
    setTimeout(() => {
      if (currentPlaylist.length > before) {
        setActiveIndex(currentTrackIndex + 1);
        playSelected(currentPlaylist[currentTrackIndex]); 
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
    playSelected(currentPlaylist[currentTrackIndex]);
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
  playSelected(currentPlaylist[r]);
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
  moveLabelToPopup();
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

  moveLabelToViewer();
  
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
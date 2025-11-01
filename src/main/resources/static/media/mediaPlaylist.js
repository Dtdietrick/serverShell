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

let playlistMode = "linear";  // "linear" | "shuffle"
let __shuffle = null;         // { order:number[], cursor:number, seed:number }

// real shuffle
function randomizer(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s) {
  // cheap integer hash from string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

//quick exit shuffle (one-shot)
function exitShuffleMode() {
  playlistMode = "linear";
  __shuffle = null;
  if (typeof updateShuffleButton === "function") updateShuffleButton(); 
}

function makeShuffledOrder(n, lastIdx, seed) {
  const rng = randomizer(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  // Fisher–Yates
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Avoid immediate repeat if possible
  if (n > 1 && a[0] === lastIdx) {
    const swapWith = Math.floor(rng() * (n - 1)) + 1;
    [a[0], a[swapWith]] = [a[swapWith], a[0]];
  }
  return a;
}

function ensureActiveVisible() {
  var list = document.getElementById("playlist-items") || playlistItems; 
  if (!list) return;

  var el = list.querySelector(".playlist-item.active") ||
           (list.children && list.children[currentTrackIndex]);
  if (!el) return;

  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  } catch (e) { /* no-op */ }
}
	
//keep DOM in sync (no autoplay side-effects)
async function hydrateFullPlaylistInBackground() {
  // If we already exhausted pages, nothing to do.
  if (!playlistHasMore) return;

  // Continue fetching pages (offset/limit already tracked globally)
  while (playlistHasMore && !playlistLoading) {
    playlistLoading = true;
    updateShuffleButton();
    try {
      const qs = new URLSearchParams({
        path: currentPlaylistName,
        offset: String(playlistOffset),
        limit: String(playlistLimit)
      });
      const items = await fetch(`/media/playlist?${qs}`).then(r => r.json());

      if (!Array.isArray(items) || items.length === 0) {
        playlistHasMore = false;
        break;
      }

      // Append to DOM & currentPlaylist, matching loadPlaylist() behavior
      items.forEach((raw, i) => {
        const n = normalizeItem(raw);
        // guard against dupes
        if (!currentPlaylist.some(x => x.path === n.path)) {
          const li = renderLiForItem(n, currentPlaylist.length);
          playlistItems.appendChild(li);
          currentPlaylist.push(n);
        }
      });

      playlistOffset += items.length;
    } catch (e) {
      console.warn("[playlist][hydrate] failed:", e);
      break; // bail; UI still works with what we have
    } finally {
      playlistLoading = false;
      updateShuffleButton();
    }
  }

  // If shuffle mode is active, (re)build order to include all hydrated items
  if (playlistMode === "shuffle") {
    const seed = (__shuffle?.seed ?? hashSeed(String(currentPlaylistName))) ^ hashSeed(String(Date.now()));
    __shuffle = {
      seed,
      order: makeShuffledOrder(currentPlaylist.length, currentTrackIndex, seed),
      cursor: -1
    };
  }
}

//autoplay
let __popupAutoplayTimer = null;
const AUTOPLAY_DELAY_KEY = "explorer.autoplayDelayMs";
function readAutoplayDelayMsFromExplorer() {
  const raw = localStorage.getItem(AUTOPLAY_DELAY_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5000; // default 5s (same as explorer)
}

// Helper to schedule headless autoplay in popup
function schedulePopupAutoplay() {
  // only when the player is mounted in popup
  const playerContainer = document.getElementById("player-container");
  const inPopup = !!playerContainer?.classList.contains("in-popup");
  if (!inPopup) return;

  const delay = readAutoplayDelayMsFromExplorer();
  // If user set Auto: Off, do nothing
  if (delay <= 0) return;

  // clear any prior timer then schedule
  if (__popupAutoplayTimer) { clearTimeout(__popupAutoplayTimer); __popupAutoplayTimer = null; }
  __popupAutoplayTimer = setTimeout(async () => {
    __popupAutoplayTimer = null;
    try {
      await nextInPlaylist();
    } catch (e) {
      console.warn("[popup][autoplay] next failed:", e);
    }
  }, delay);

  // Any user interaction in the popup cancels the pending autoplay
  const popupRoot = document.getElementById("playlist-popup");
  const cancel = () => {
    if (__popupAutoplayTimer) { clearTimeout(__popupAutoplayTimer); __popupAutoplayTimer = null; }
    popupRoot?.removeEventListener("click", cancel);
    document.removeEventListener("keydown", cancel);
  };
  popupRoot?.addEventListener("click", cancel, { once: true });
  document.addEventListener("keydown", cancel, { once: true });
}

function getViewerMediaTitleEl() {
  return document.getElementById('media-title');
}

function openPlaylistPopup() {
  playlistPopup.classList.add('open');   
  moveLabelToPopup();  
}

function setNowPlayingLabelText(text) {
  if (!playlistMediaLabel) return;

  // Raw input from callers (often just n.title)
  const raw = (text ?? '').toString().trim();

  // If caller passed a path-like string, use it. Otherwise derive from nowPlayingPath.
  // Path-like: starts with "./" or contains a slash.
  const looksLikePath = raw.startsWith("./") || raw.includes("/");
  const pathForLabel = looksLikePath ? raw : (nowPlayingPath || "");

  let val = raw;

  if (pathForLabel) {
    // Normalize "./" and slashes
    let p = String(pathForLabel)
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    const segs = p.split("/").filter(Boolean);
    const root = segs[0] || "";
    const isKnown = root === "Music" || root === "Movies" || root === "TV";

    // Artist (folder under root)
    const artist = segs.length > 1 ? segs[1] : "";

    // Item: prefer the provided title; else last meaningful leaf
    let item = raw;
    if (!item || looksLikePath) {
      item = segs[segs.length - 1] || "";
      const low = item.toLowerCase();
      if (low === "index.m3u8" || low === "index.mp3" || low === "index.m4a") {
        item = segs[segs.length - 2] || item;
      }
    }
    item = (item || "").trim();

    // Avoid "Artist 🔊 Artist"
    const dup = artist && item && artist.toLowerCase() === item.toLowerCase();

    // Compose only for known roots with a non-dup artist; else fall back to item or original text
    val = (isKnown && artist && !dup) ? `🔎 ${artist} 🔊 ${item}` : (item || raw);
  }

  // Write label
  playlistMediaLabel.textContent = val;

  // Mirror to viewer title when the label isn't currently in the popup
  const viewerH3 = getViewerMediaTitleEl();
  if (viewerH3 && !playlistMediaLabel.classList.contains('in-popup')) {
    viewerH3.textContent = val;
  }
}
function moveLabelToPopup() {
  if (!playlistMediaLabel || !playlistPopup) return;

  // Ensure the label element is placed back inside the popup UI (but we never move it out anymore)
  const controls = document.getElementById('playlist-controls');
  const search   = document.getElementById('playlist-search');
  
  /// If controls row exists at top, put label right BEFORE it
  if (controls && controls.parentElement) {
    controls.parentElement.insertBefore(playlistMediaLabel, controls);
  }
  // Else, if the list exists, insert the label right BEFORE the <ul> **in the UL's parent**
  else if (playlistItems && playlistItems.parentElement) {
    playlistItems.parentElement.insertBefore(playlistMediaLabel, playlistItems);
  }
  // Fallback: append to popup
  else {
    playlistPopup.appendChild(playlistMediaLabel);
  }

  playlistMediaLabel.classList.add('in-popup');

  // restore the viewer title to its original text when the popup opens
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
  li.className = "playlist-item";  
  li.innerHTML = `
	<span id="media-scroll" class="media-row">
	  <span class="title" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nItem.title}</span>
	  ${nItem.duration ? `<span class="chip">${formatDuration(nItem.duration)}</span>` : ""}
	</span>
  `;
  li.onclick = () => {
	exitShuffleMode();
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

  //start playback in the popup
  playMedia(n.path, true, true);

  // in case UI jitter, re-check on the next tick
  queueMicrotask?.(() => {
    setActiveIndexByPath(nowPlayingPath);

    //when the current media ends, schedule autoplay using user's setting
	try {
	  const mediaEl = document.getElementById("media-player");
	  if (mediaEl) {
	    // remove prior hook if any to avoid duplicates after next/prev
	    if (mediaEl.__popupOnEnded) {
	      mediaEl.removeEventListener("ended", mediaEl.__popupOnEnded);
	    }
	    mediaEl.__popupOnEnded = () => {
	      try { window.AppPlayer?.onEnded?.(); } catch (e) { console.warn("[popup] onEnded call failed:", e); }
	    };
	    mediaEl.addEventListener("ended", mediaEl.__popupOnEnded);
	  }
	} catch {}


    // Tell explorer that a playlist item began
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
	playlistMode = "linear";        
	__shuffle = null; 
    currentPlaylistName = nameOrPath;
    playlistOffset = 0;
    playlistHasMore = true;
    playlistItems.innerHTML = "";
	//mount player UI inside popup
    ensurePopupHasPlayer();             
	playlistPopup.classList.add('open');
	currentPlaylist = [];
    currentTrackIndex = -1;
  }
  if (!playlistHasMore || playlistLoading) return;

  playlistLoading = true;
  updateShuffleButton();

  // Prefer sending 'path'
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
	  //shuffle
	  if (reset) {
	    queueMicrotask?.(() => { hydrateFullPlaylistInBackground(); });
	  }
	  
    });
}

function playNextShuffled() {
  if (!currentPlaylist.length) return;

  // Build/refresh order if needed
  if (!__shuffle || __shuffle.order.length !== currentPlaylist.length) {
    const seed = (__shuffle?.seed ?? hashSeed(String(currentPlaylistName))) ^ hashSeed(String(Date.now()));
    __shuffle = {
      seed,
      order: makeShuffledOrder(currentPlaylist.length, currentTrackIndex, seed),
      cursor: -1
    };
  }

  // Move cursor and pick item
  __shuffle.cursor++;
  if (__shuffle.cursor >= __shuffle.order.length) {
    // If this ever hits, we still avoid repeating the last track
    __shuffle.order = makeShuffledOrder(
      currentPlaylist.length,
      currentTrackIndex,
      __shuffle.seed ^ hashSeed(String(Date.now()))
    );
    __shuffle.cursor = 0;
  }
  
  const idx = __shuffle.order[__shuffle.cursor];
  if (idx === currentTrackIndex && currentPlaylist.length > 1) {
    // ultra-rare edge case; bump once more
    __shuffle.cursor = (__shuffle.cursor + 1) % __shuffle.order.length;
  }

  const nextIdx = __shuffle.order[__shuffle.cursor];
  setActiveIndex(nextIdx);
  if (typeof ensureActiveVisible === "function") ensureActiveVisible();
  playSelected(currentPlaylist[nextIdx]);
}

/**
 * Play next track in current playlist if available.
 */
export function nextInPlaylist() {
  if (playlistMode === "shuffle") {
    return playNextShuffled();
  }
	
  if (currentTrackIndex < currentPlaylist.length - 1) {
    setActiveIndex(currentTrackIndex + 1);
	if (typeof ensureActiveVisible === "function") ensureActiveVisible();
    playSelected(currentPlaylist[currentTrackIndex]); 
  } else {
    const before = currentPlaylist.length;
    loadPlaylist(currentPlaylistName, false);
    setTimeout(() => {
      if (currentPlaylist.length > before) {
        setActiveIndex(currentTrackIndex + 1);
		if (typeof ensureActiveVisible === "function") ensureActiveVisible();
        playSelected(currentPlaylist[currentTrackIndex]); 
      }
    }, 400);
  }
}

function updateShuffleButton() {
  const b = document.getElementById("shuffle-button");
  if (b) {
    b.disabled = playlistLoading || currentPlaylist.length <= 1;
    b.classList.toggle("disabled", b.disabled);
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

  playlistMode = "shuffle";

  // If we already have a track, advance to a different one via the shuffle order.
  // If nothing playing yet, just pick the first from the order (guaranteed != lastIdx when n>1).
  if (currentTrackIndex >= 0) {
    playNextShuffled();
	exitShuffleMode();
  } else {
    const seed = hashSeed(String(currentPlaylistName)) ^ hashSeed(String(Date.now()));
    __shuffle = { seed, order: makeShuffledOrder(currentPlaylist.length, -1, seed), cursor: 0 };
    const idx = __shuffle.order[0];
    setActiveIndex(idx);
	ensureActiveVisible();
    playSelected(currentPlaylist[idx]);
	exitShuffleMode();
  }

  // If hydration hasn’t finished yet, it will re-seed and expand the order when complete.
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
  
  try { if (window.stageAutoplayFor) window.stageAutoplayFor("POPUP"); } catch {}
  
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


  //Prefer the canonical main element
  let mediaEl = document.getElementById('media-player');

  //Fallback: pick any media in #player-container that is NOT the ambient bg
  if (!mediaEl) {
    mediaEl = document.querySelector('#player-container video:not(#ambient-bg), #player-container audio');
  }

  if (mediaEl && typeof mediaEl.pause === "function") {
    mediaEl.autoplay = false;   // guard against auto-resume
    mediaEl.pause();
  }
}

/**
 * Close and reset the playlist popup.
 */
export function closePlaylist() {
  if (__popupAutoplayTimer) { clearTimeout(__popupAutoplayTimer); __popupAutoplayTimer = null; }
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
  playlistMode = "linear";
  __shuffle = null;
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

window.MediaPlaylist = {
  playNext:  nextInPlaylist,
  playPrev:  prevInPlaylist,
  shuffle:   shufflePlaylist
};
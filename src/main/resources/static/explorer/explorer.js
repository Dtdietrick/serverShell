// File: explorer.js

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

import { loadPlaylist, setPlayMediaCallback } from "/media/mediaPlaylist.js";
import { updateBackButton } from "/ui/backButton.js";
import { getIsLoading, setIsLoading, toggleMediaButtons } from "/ui/loading.js";

const mediaTree = document.getElementById("mediaTree");
let supportedExtensions = [];
const _favoritesCache = new Map(); 
const AUTOPLAY_ENABLED = true;

/* A–Z toggle (UI & root only) */
const GROUP_KEY = "explorer.groupAtRoot";
const readGroupPref = () => (localStorage.getItem(GROUP_KEY) ?? "true") === "true";
let groupAtRoot = readGroupPref(); 
let groupBindController = null;

const AUTOPLAY_DELAY_KEY = "explorer.autoplayDelayMs";
// Rotate among Off, 5s, 10s by default; tweak list if you want more
const AUTOPLAY_DELAY_OPTIONS = [0, 5000, 10000];

function readAutoplayDelayMs() {
  const raw = localStorage.getItem(AUTOPLAY_DELAY_KEY);
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return 5000; // default 5s
}

function writeAutoplayDelayMs(ms) {
  try { localStorage.setItem(AUTOPLAY_DELAY_KEY, String(ms)); } catch {}
}

function formatDelayLabel(ms) {
  return ms <= 0 ? "Auto: Off" : `Auto: ${Math.round(ms/1000)}s`;
}

const autoplaySiblingCache = new Map();
const isPlaylistFile = (name) => (name || "").toLowerCase().endsWith(".m3u");
const isIndexLeaf = (name) => (name || "").toLowerCase() === "index.m3u8";
const LS_FAV_KEY = (cat) => `explorer.favorites.${cat}`;
function readLocalFavorites(category) {
  try {
    const raw = localStorage.getItem(LS_FAV_KEY(category));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function resolveVodM3U8(relPath) {
  const clean = String(relPath).replace(/^\/+/, "");
  const res = await fetch("/media/vod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: clean })
  });
  if (!res.ok) throw new Error(`VOD resolve failed: ${res.status}`);
  const { m3u8 } = await res.json();
  return m3u8; // e.g. /media/vod/fs/Movies/BGs/SomeLoop/index.m3u8
}

function waitForMediaPlayer(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const el = document.getElementById('media-player');
    if (el) return resolve(el);

    const to = setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
    const obs = new MutationObserver(() => {
      const n = document.getElementById('media-player');
      if (n) { clearTimeout(to); obs.disconnect(); resolve(n); }
    });
    // observe whole doc; player can appear in viewer or in popup
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function writeLocalFavorites(category, set) {
  try {
    localStorage.setItem(LS_FAV_KEY(category), JSON.stringify([...set]));
  } catch {}
}

setPlayMediaCallback((path, inPopup = true, fromPlaylist = true) => {
  return window.AppPlayer?.playMedia(path, inPopup, fromPlaylist);
});

export function renderGroupLabel() {
  const el = document.getElementById("mediaTree-label");
  if (!el) return;
  const label = getLastClickedGroupLabel?.() || "";
  if (label && label.trim()) {
    el.textContent = label.trim();
    el.setAttribute("data-has-label", "true");
  } else {
    el.textContent = "";
    el.removeAttribute("data-has-label");
  }
}

document.addEventListener("explorer:navigated", (e) => {
  const path = String(e.detail?.path || "");
  const segs = path.split("/").filter(Boolean);
  const leaf = segs[segs.length - 1] || "";
  setLastClickedGroupLabel(leaf);
  renderGroupLabel();
});

const PIXELART_DIR = "Movies/BGs";   

function isUnderPixelArt(fullRel) {
  const ex = (PIXELART_DIR || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

  const p = String(fullRel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .toLowerCase();

  if (!ex) return false;
  return p === ex || p.startsWith(ex + "/");
}

function normalizeRelForClient(p) {
  // Collapse slashes and strip any leading slash; keep media-root-relative
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "");
}

function getGroupingBtn() {
  return document.getElementById('toggle-grouping');
}

function syncGroupingToggleUI() {
  const btn = getGroupingBtn();
  if (!btn) return;
  groupAtRoot = readGroupPref();
  btn.textContent = groupAtRoot ? 'A–Z: On' : 'A–Z: Off';
}

async function getFavoritesForCategory(category) {
  if (!category) return new Set();

  // 1) RAM cache
  if (_favoritesCache.has(category)) return _favoritesCache.get(category);

  // 2) localStorage bootstrap (instant stars on cold session)
  const localSet = readLocalFavorites(category);
  _favoritesCache.set(category, new Set(localSet));   // clone to decouple

  // 3) try server; if it works, merge & persist
  try {
    const res = await fetch(`/media/favorites?category=${encodeURIComponent(category)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json(); // array of rel paths
    const merged = new Set(localSet);
    for (const p of (Array.isArray(arr) ? arr : [])) merged.add(p);
    _favoritesCache.set(category, merged);
    writeLocalFavorites(category, merged);
    return merged;
  } catch (e) {
    console.warn("Failed to fetch favorites (using local only):", e);
    return _favoritesCache.get(category);
  }
}

function categoryOf(relPath) {
  // expects paths like "Movies/SomeTitle/Season 1/Ep 01/index.m3u8"
  const first = (relPath || "").split("/").filter(Boolean)[0] || "";
  const cat = first.toLowerCase();
  if (cat === "movies") return "Movies";
  if (cat === "tv")     return "TV";
  if (cat === "music")  return "Music";
  return null; // unsupported categories won't expose star
}

function makeStarButton(relPath, { isFav = false } = {}) {
  const rel = normalizeRelForClient(relPath);
  const btn = document.createElement("button");
  btn.className = "fav-star";
  btn.setAttribute("aria-label", "favorite");

  if (isFav) btn.classList.add("is-fav");
  btn.innerHTML = btn.classList.contains("is-fav") ? "★" : "☆";
  btn.title = btn.classList.contains("is-fav") ? "Remove from Favorites" : "Add to Favorites";

  btn.onclick = async (e) => {
    e.stopPropagation();
    const category = categoryOf(rel);
    if (!category) return;

    const toFilled = !btn.classList.contains("is-fav");
    btn.classList.toggle("is-fav", toFilled);
    btn.innerHTML = toFilled ? "★" : "☆";
    btn.title = toFilled ? "Remove from Favorites" : "Add to Favorites";

    try {
      const res = await fetch(`/media/favorite`, {
        method: toFilled ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rel })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

	  const set = _favoritesCache.get(category) || new Set();
	  if (toFilled) set.add(rel); else set.delete(rel);
	  _favoritesCache.set(category, set);
	  writeLocalFavorites(category, set);
    } catch (err) {
      // revert UI
      btn.classList.toggle("is-fav", !toFilled);
      btn.innerHTML = btn.classList.contains("is-fav") ? "★" : "☆";
      btn.title = btn.classList.contains("is-fav") ? "Remove from Favorites" : "Add to Favorites";
      console.warn("favorite toggle failed:", err);
      alert("Could not update favorites.");
    }
  };

  return btn;
}

let _ambientList = null;            
let _ambientHls  = null;       

async function fetchAmbientList() {
  if (_ambientList) return _ambientList;
  try {
    const res = await fetch(`/media/list?path=${encodeURIComponent(PIXELART_DIR)}`);
    if (!res.ok) throw new Error(`ambient list HTTP ${res.status}`);
    const items = await res.json();
    // Accept either folders OR index files; normalize to "…/index.m3u8" paths.
    _ambientList = (items || []).map(p => {
      p = String(p).replace(/^\/+/, "");
      return p.toLowerCase().endsWith(".m3u8") ? p : `${p.replace(/\/+$/,"")}/index.m3u8`;
    });
  } catch (e) {
    console.warn("[ambient] no list:", e);
    _ambientList = [];
  }
  return _ambientList;
}

function ensurePlayerStage() {                                               
  const mediaEl = document.getElementById("media-player");                  
  if (!mediaEl) return null;                                                 
  let stage = mediaEl.parentElement;                                        
  if (stage && stage.id === "player-stage") return stage;                    

  stage = document.createElement("div");                                     
  stage.id = "player-stage";                                                
  Object.assign(stage.style, { position: "relative", width: "100%" });                                                
  mediaEl.insertAdjacentElement("beforebegin", stage);                     
  stage.appendChild(mediaEl);                                              
  if (!mediaEl.style.position) mediaEl.style.position = "relative";         
  if (!mediaEl.style.zIndex)    mediaEl.style.zIndex = "1";                 
  return stage;                                                            
}

// ambient music video player functions
function stopAmbient() {
  try { if (_ambientHls) { _ambientHls.destroy(); _ambientHls = null; } } catch {}
  const el = document.getElementById("ambient-bg");
  if (el && el.parentNode) el.parentNode.removeChild(el);

  const stage = document.getElementById("player-stage");
  if (stage) { stage.style.minHeight = ""; stage.style.height = ""; }

  const player = document.getElementById("media-player");
  if (player) { player.style.height = ""; player.style.maxHeight = ""; }

  const container = document.getElementById("player-container");
  if (container) container.classList.remove("music-ambient-on");

  document.body.classList.remove("ambient-on");
}

let _ambientBooting = false;

async function startAmbientForMusic() {
  if (_ambientBooting) return;
  _ambientBooting = true;

  try {
    const list = await fetchAmbientList();
    if (!list || list.length === 0) { stopAmbient(); return; }

    const mediaEl = await waitForMediaPlayer(3000);
    if (!mediaEl) { console.warn("[ambient] timed out waiting for #media-player"); return; }

    const stage = ensurePlayerStage();
    if (!stage) { console.warn("[ambient] no stage after wait"); return; }

    stopAmbient(); // ensure a clean slate

    const vid = document.createElement("video");
    vid.id = "ambient-bg";
    vid.muted = true; vid.autoplay = true; vid.loop = true;
    vid.playsInline = true; vid.setAttribute("webkit-playsinline", "true");
    Object.assign(vid.style, {
      position: "absolute", inset: "0",
      width: "100%", height: "100%",
      objectFit: "cover", zIndex: "0",
      pointerEvents: "none", opacity: "0.9", flex: "none"
    });
    stage.prepend(vid);

    // give ambient room
	let _resizeBound = null;
	const player = mediaEl; // #media-player
	const sizeStage = () => {
	  try {
	    const w = vid.videoWidth  || 1920;
	    const h = vid.videoHeight || 1080;
	    const ratio = h / w;

	    const stageWidth = stage.clientWidth || player.clientWidth || 800;
	    const desiredH = Math.round(stageWidth * ratio);

	    const maxH = Math.round(window.innerHeight * 0.60); 
	    const minH = 240;                                  
	    const finalH = Math.max(minH, Math.min(desiredH, maxH));

	    // apply to stage
	    stage.style.minHeight = finalH + "px";
	    stage.style.height    = finalH + "px";
        // mirror real player 
        player.style.height    = finalH + "px";
        player.style.maxHeight = finalH + "px";
        player.style.width     = "100%";   
        player.style.display   = "block";  
        player.style.position  = player.style.position || "relative";
        player.style.zIndex    = player.style.zIndex || "1";
      } catch {}
    };

    vid.addEventListener("loadedmetadata", sizeStage);
    sizeStage();
    _resizeBound = () => sizeStage();
    window.addEventListener("resize", _resizeBound);
    vid.addEventListener("error", () => {
      try { window.removeEventListener("resize", _resizeBound); } catch {}
    });

    // logging
    vid.addEventListener("loadeddata", () => console.log("[ambient] loadeddata"));
    vid.addEventListener("playing",    () => console.log("[ambient] playing"));
    vid.addEventListener("error",      () => console.warn("[ambient] <video> error", vid.error));
    const pick = list[Math.floor(Math.random() * list.length)];
    const m3u8Url = await resolveVodM3U8(pick);
    console.log("[ambient] using", m3u8Url);

    if (window.Hls && window.Hls.isSupported()) {
      _ambientHls = new window.Hls({ autoStartLoad: true });
      _ambientHls.on(window.Hls.Events.ERROR, (_, data) => console.warn("[ambient][hls] error", data));
      _ambientHls.loadSource(m3u8Url);
      _ambientHls.attachMedia(vid);
      _ambientHls.on(window.Hls.Events.MANIFEST_PARSED, () => vid.play().catch(()=>{}));
    } else {
      vid.src = m3u8Url;
      vid.play().catch(()=>{});
    }

    document.body.classList.add("ambient-on");
    addAmbientFullscreenButton(stage, vid);
    document.getElementById("player-container")?.classList.add("music-ambient-on");
  } finally {
    _ambientBooting = false;
  }
}

function addAmbientFullscreenButton(stage) {
  stage.querySelectorAll(".ambient-fullscreen-btn").forEach(el => el.remove());
  const btn = document.createElement("button");
  btn.className = "ambient-fullscreen-btn";
  btn.type = "button";
  btn.title = "Fullscreen ambient";
  btn.setAttribute("aria-label", "Fullscreen ambient");
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 14H5v5h5v-2H7v-3zm0-4h3V7h2v5H7V10zm10 9h-3v2h5v-5h-2v3zm0-14h-5v2h3v3h2V5z"/>
  </svg>`;

  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch (e) {
      console.warn("[ambient] fullscreen toggle failed:", e);
    }
  };
  btn.addEventListener("click", toggle);
  stage.appendChild(btn);

  document.addEventListener("fullscreenchange", () => {
    const fs = !!document.fullscreenElement;
    btn.title = fs ? "Exit fullscreen" : "Fullscreen ambient";
    btn.setAttribute("aria-label", btn.title);
  });
}

function initGroupingToggle() {
  const btn = getGroupingBtn();
  if (!btn) return;

  // If bound before, abort old listener (safe if null)
  if (groupBindController) groupBindController.abort();
  groupBindController = new AbortController();

  // Sync label to storage on every (re)bind
  syncGroupingToggleUI();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !readGroupPref();
    localStorage.setItem(GROUP_KEY, String(next));
    groupAtRoot = next;
    syncGroupingToggleUI();
    rerenderRootList?.() ?? renderFolder(getMediaRoot(), next);
  }, { passive: true, signal: groupBindController.signal });
}

const groupingObserver = new MutationObserver(() => {
  const btn = getGroupingBtn();
  // Only (re)bind if the node exists no listener or the node changed
  if (btn && (!groupBindController || btn.textContent.includes('Toggle Folder Names'))) {
    initGroupingToggle();
  }
});

groupingObserver.observe(document.body, { childList: true, subtree: true });

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

function filterFoldersByQuery(folders, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return folders;
  return folders.filter(f => {
    const leaf = f.replace(/\/+$/,'').split('/').pop();
    return (leaf || "").toLowerCase().includes(q);
  });
}

function filterFilesByQuery(files, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return files;

  return files.filter((f) => {
	// Normalize relative path & compute label
    const rel = normalizeRelForClient(f);
    const display = (displayNameFor(rel) || "").toLowerCase();

    // match immediate parent folder 
    const parts = rel.split("/").filter(Boolean);
    const parent = (parts.length >= 2 ? parts[parts.length - 2] : "").toLowerCase();

    return display.includes(q) || parent.includes(q);
  });
}

function rerenderRootList() {
  const root = getMediaRoot();
  const files = window.currentFileList || [];
  const prefix = (peekHistory() ? peekHistory() + "/" : "");

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

  const groupLabel = getLastClickedGroupLabel();
  const shouldGroup = !!(groupAtRoot && !groupLabel);

  const query = getSearchQuery();
  const searchedFolders = filterFoldersByQuery(folders, query);
  const searchedFiles   = filterFilesByQuery(normalFiles, query); 

  mediaTree.innerHTML = groupLabel ? `<h4>Group: ${groupLabel}</h4>` : "";

  renderListView({
    folders: searchedFolders,
    files: searchedFiles,
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

// helper used for all playback starts
export async function playAndStage(path) {                          
  const rel = normalizeRelForClient(path);                   

  const display = displayNameFor(rel);                        
  const viewerHeader = document.querySelector('#viewer-player h3'); 
  if (viewerHeader) viewerHeader.textContent = display;     
  setCurrentPath(rel);                                       


  await window.AppPlayer.playMedia(rel);                      

 
  const isMusic = (categoryOf(rel) === "Music");             
  if (isMusic) startAmbientForMusic(); else stopAmbient();   

  stageAutoplayFor(rel);                                    
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
  const currentDelay = readAutoplayDelayMs();

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
  prompt.style.zIndex = '9999'; // above <video>
  prompt.style.maxWidth = '60%';
  prompt.style.pointerEvents = 'auto';

  // countdown chip lives next to the toggle; we update its text while counting
  const countdownId = `next-countdown-${Date.now()}`;
  prompt.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="opacity:.9">Up next:</span>
      <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45ch">${display}</strong>

      <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
        <span id="${countdownId}" style="opacity:.8"></span>
        <button id="next-auto-toggle" title="Toggle autoplay delay" style="cursor:pointer;border:0;border-radius:8px;padding:4px 8px;background:#222;color:#ddd">
          ${formatDelayLabel(currentDelay)}
        </button>
        <button id="next-play-btn" style="cursor:pointer;border:0;border-radius:10px;padding:6px 10px">
          ▶ Play next
        </button>
        <button id="next-dismiss-btn" title="Dismiss" style="cursor:pointer;border:0;background:transparent;color:#fff;opacity:.75">✕</button>
      </div>
    </div>
  `;

  // ----- controls
  const elDismiss   = prompt.querySelector('#next-dismiss-btn');
  const elPlay      = prompt.querySelector('#next-play-btn');
  const elToggle    = prompt.querySelector('#next-auto-toggle');
  const elCountdown = prompt.querySelector(`#${countdownId}`);

  let timer = null;
  let ticker = null;
  let deadlineTs = 0;

  const clearTimers = () => {
    if (timer)  { clearTimeout(timer);  timer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
  };

  const removePrompt = () => {
    clearTimers();
    try { prompt.remove(); } catch {}
  };

  elDismiss?.addEventListener('click', () => {
    removePrompt();
  });

  elPlay?.addEventListener('click', async () => {
    clearTimers();
    try {
      await playAndStage(nextPath);
    } finally {
      removePrompt();
    }
  });

  // cycle delay options on each click: Off -> 5s -> 10s -> Off ...
  elToggle?.addEventListener('click', () => {
    const cur = readAutoplayDelayMs();
    const idx = AUTOPLAY_DELAY_OPTIONS.indexOf(cur);
    const nextIdx = (idx >= 0 ? (idx + 1) % AUTOPLAY_DELAY_OPTIONS.length : 0);
    const nextVal = AUTOPLAY_DELAY_OPTIONS[nextIdx];
    writeAutoplayDelayMs(nextVal);
    elToggle.textContent = formatDelayLabel(nextVal);

    // restart countdown with new value
    clearTimers();
    startCountdown(nextVal);
  });

  function startCountdown(ms) {
    if (!elCountdown) return;
    if (ms <= 0) { elCountdown.textContent = formatDelayLabel(0); return; }

    deadlineTs = Date.now() + ms;

    // UI ticker every 250ms
    const update = () => {
      const remain = Math.max(0, deadlineTs - Date.now());
      const s = Math.ceil(remain / 1000);
      elCountdown.textContent = `Autoplay in ${s}s…`;
    };
    update();
    ticker = setInterval(update, 250);

    // fire actual auto-play
    timer = setTimeout(async () => {
      clearTimers();
      try {
        await playAndStage(nextPath);
      } finally {
        removePrompt();
      }
    }, ms);
  }

  container.appendChild(prompt);
  console.log("[autoplay] prompt injected for:", nextPath);

  // kick off with whatever is currently configured
  startCountdown(currentDelay);
}

window.addEventListener("playlist:played", (e) => {
  const raw = (e?.detail?.path ?? "");
  const rel = normalizeRelForClient(raw); 

  const isMusic = (categoryOf(rel) === "Music");
  if (isMusic) {
    startAmbientForMusic();
  } else {
    stopAmbient();
  }
});

//autoplay path; set AppPlayer.onEnded once per click
export function stageAutoplayFor(libraryPath) {
  if (!AUTOPLAY_ENABLED || !window.AppPlayer) return;

  window.AppPlayer.onEnded = async () => {
    try {
      // Prefer the last path we just set (via playAndStage); fall back to provided argument
      const basePath = libraryPath;
      console.log("[autoplay] ended detected for:", basePath);
      const nextPath = await computeNextIndexPath(basePath);
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
  setLastClickedGroupLabel("");
  renderGroupLabel();
  resetHistory(path);
  setMediaRoot(path);
  setCurrentPath(path);
  toggleMediaButtons(false);
  initGroupingToggle(); 
  initGroupingToggle();
  hideUtilButtons();
  autoplaySiblingCache.clear();
  await getAllowedMediaList();
  await renderFolder(path, groupAtRoot); //honor toggle at root
}

export function renderFolder(path, useGrouping = false) {
  const encoded = encodeURIComponent(path);
  const apiPath = `/media/list?path=${encoded}`;
  
  if (path === getMediaRoot()) {
    setLastClickedGroupLabel("");
	renderGroupLabel();
  }

  if (getIsLoading()) return Promise.resolve();

  setIsLoading(true);
  if (mediaTree) mediaTree.innerHTML = "Loading...";

  console.log("Fetching folder contents:", apiPath);

    return fetch(apiPath)
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
		document.dispatchEvent(new CustomEvent("explorer:navigated", { detail: { path } }));
		
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

        // cache sibling order for autoplay
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
    const { files } = await fetchFolderContents(fullFolderPath);
    const hasDirectIndex = (files || []).some(f => f.toLowerCase() === 'index.m3u8');
    if (!hasDirectIndex) return false;

    const playPath = `${fullFolderPath}/index.m3u8`;
    await playAndStage(playPath);                       
    return true;
  } catch (e) {
    console.log("tryPlayFolderIfIndex error:", e);
  }
  return false;
}

function renderListView({ folders, files, prefix, isGrouped = false, groupLabel = null }) {
  mediaTree.innerHTML = groupLabel ? `<h4>Group: ${groupLabel}</h4>` : "";

  const query = getSearchQuery();

  let foldersOnly = filterFoldersByQuery(folders, query);
  let filesForView = filterFilesByQuery(files, query);

  //remove pixelart dir
  const pref = String(prefix || "");
  foldersOnly = foldersOnly.filter(name => !isUnderPixelArt((pref + name).replace(/\/{2,}/g, "/")));
  filesForView = filesForView.filter(name => !isUnderPixelArt((pref + name).replace(/\/{2,}/g, "/")));
  
  if (query && foldersOnly.length === 0 && filesForView.length === 0) {
    const wrap = document.createElement("div");
    wrap.id = "media-scroll";
    wrap.innerHTML = `<p style="opacity:.8">No matching items for “${query}”.</p>`;
    mediaTree.appendChild(wrap);
    return;
  }

  let ul;
  //searching, ignore A–Z grouping 
  if (!query && isGrouped && !groupLabel) {
    const letterGroups = groupFoldersByLetter(foldersOnly, [], query);
    ul = renderGroupedAZView(letterGroups, prefix);
  } else {
    const sortedFolders = sortItems(foldersOnly);
    const sortedFiles   = sortItems(filesForView);
    ul = renderStandardFolderView(sortedFolders, sortedFiles, prefix);
  }

  const scrollContainer = document.createElement("div");
  scrollContainer.id = "media-scroll";
  scrollContainer.appendChild(ul);
  mediaTree.appendChild(scrollContainer);

  // Post-render favorite pass
  decorateFavoritesInView(prefix);
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
		// record label for the auto-entered folder
		const only = realFolders[0];
		const leaf = only.replace(/\/+$/,'').split('/').filter(Boolean).pop() || "";
		setLastClickedGroupLabel(leaf);
		renderGroupLabel();
        // navigate to the single real folder
        return renderFolder(realFolders[0].slice(0, -1));
      }

      // Otherwise, show the filtered list in-place (still at root; no history push)
      setLastClickedGroupLabel(letter);
	  renderGroupLabel();
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

  // Pin "*Playlists*" first 
  const pinName = "*Playlists*";
  const pinned = [], others = [];
  for (const folderPath of sortedFolders) {
    const leaf = folderPath.split("/").filter(Boolean).pop() || folderPath;
    (leaf === pinName ? pinned : others).push(folderPath);
  }
  const orderedFolders = [...pinned, ...others];

  // Folders
  for (const folderPath of orderedFolders) {
    const leaf = folderPath.split("/").filter(Boolean).pop() || folderPath;
    let fullPath = folderPath.startsWith(prefix) ? folderPath : prefix + folderPath;
    fullPath = fullPath.replace(/\/{2,}/g, "/");

    const li = document.createElement("li");
    li.classList.add("folder");

    const label = document.createElement("span");
    label.className = "media-label";
    label.textContent = leaf;

    li.appendChild(label);
	li.onclick = () => {
	  setLastClickedGroupLabel(leaf);
	  renderGroupLabel();
	  renderFolder(fullPath.slice(0, -1));
	};
    ul.appendChild(li);
  }

  // Files (build rows; set data attributes; NO star yet)
  for (const filePath of sortedFiles) {
    const fullPath = filePath.startsWith(prefix) ? filePath : prefix + filePath;
    const rel = normalizeRelForClient(fullPath);
    const leaf = rel.split("/").pop() || "";
    const display = displayNameFor(rel);

	const li = document.createElement("li");
	li.classList.add("media-row");       
	li.style.overflow = "visible";
	li.dataset.rel = rel;

	//check top level for icon
	const topLevel = rel.replace(/^\/+/, "").split("/")[0] || "";
	const isMusicTop = topLevel.toLowerCase() === "music";
	li.dataset.top = topLevel; 
	
	//check if playlist or file
	const lower = leaf.toLowerCase();
	if (isPlaylistFile(leaf.toLowerCase())) {
	  li.classList.add("playlist-file");  
	  li.dataset.kind = "playlist";
	} else {
		li.classList.add("file"); 
		li.classList.add(isMusicTop ? "music-file" : "video-file");
		li.dataset.kind = "file";
		li.classList.add("is-index"); 
	}

    const label = document.createElement("span");
    label.className = "media-label";
    label.textContent = display;

    if (leaf.toLowerCase().endsWith(".epub")) {
      li.onclick = () => window.location.href = `/epubReader.html?file=${encodeURIComponent(rel)}`;
    } else if (isPlaylistFile(leaf)) {
      li.onclick = () => loadPlaylist(rel);
    } else {
      li.onclick = () => playAndStage(rel);
    }

    li.appendChild(label);
    ul.appendChild(li);
  }

  return ul;
}

async function decorateFavoritesInView(prefix) {
  const prefixClean = normalizeRelForClient(prefix || "");
  const category = categoryOf(prefixClean);
  if (!category) return;

  const favSet = await getFavoritesForCategory(category);

  // Find only index rows (the ones eligible for star)
  const rows = document.querySelectorAll("#mediaTree #media-scroll li.file.is-index");
  rows.forEach((li) => {
    const rel = normalizeRelForClient(li.dataset.rel || "");
    // skip if we somehow lack rel or already have a star
    if (!rel || li.querySelector(".fav-star")) return;

    const isFav = favSet.has(rel);
    const star = makeStarButton(rel, { isFav });

    // place to the left, just after the optional icon if present
    const icon = li.querySelector(".media-icon");
    if (icon && icon.parentElement === li) icon.after(star);
    else li.insertBefore(star, li.firstChild);
  });
}

function displayNameFor(path) {
  const parts = (path || "").split("/").filter(Boolean);
  if (parts.length === 0) return path || "";
  const last = parts[parts.length - 1].toLowerCase();
  if (last === "index.m3u8") {
    return parts.length >= 2 ? parts[parts.length - 2] : "Video";
  }
  // NEW: strip ".m3u" extension for nicer titles
  if (last.endsWith(".m3u")) {
    const leaf = parts[parts.length - 1];
    return leaf.replace(/\.m3u$/i, "");
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
    const path = peekHistory(); // current folder
    // If at root, let rerenderRootList handle grouping label preservation
    if (path === getMediaRoot()) {
      rerenderRootList();
    } else {
      renderFolder(path, /*useGrouping*/ false);
    }
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
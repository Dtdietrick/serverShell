// File:playlistManager.js

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

/**
 * Loads playlist tracks from backend in paginated fashion.
 * @param {string} name - Playlist name/path
 * @param {boolean} reset - Reset playlist and UI if true
 */
export function loadPlaylist(name, reset = true) {
  if (reset) {
    currentPlaylistName = name;
    playlistOffset = 0;
    playlistHasMore = true;
    playlistItems.innerHTML = "";
    popupPlayer.innerHTML = "";
    currentPlaylist = [];
    currentTrackIndex = -1;
  }

  if (!playlistHasMore || playlistLoading) return;

  playlistLoading = true;
  
  const shuffleButton = document.getElementById("shuffle-button");
  if (shuffleButton) {
    shuffleButton.disabled = playlistLoading || currentPlaylist.length <= 1;
    shuffleButton.classList.toggle("disabled", shuffleButton.disabled);
  }
  
  fetch(
    `/media/api/playlist?name=${encodeURIComponent(
      name
    )}&offset=${playlistOffset}&limit=${playlistLimit}`
  )
    .then((res) => res.json())
    .then((files) => {
      if (!Array.isArray(files) || files.length === 0) {
        playlistHasMore = false;
        playlistLoading = false;
        return;
      }

      files.forEach((file, i) => {
        const li = document.createElement("li");
        li.textContent = file.split("/").pop();
        li.onclick = () => {
          currentTrackIndex = Array.from(playlistItems.children).indexOf(li);
          playMedia(file, true, true); // Play in popup, from playlist
        };
        playlistItems.appendChild(li);

        // Auto play first track when resetting playlist
        if (reset && i === 0 && playlistOffset === 0) {
          currentTrackIndex = 0;
          playMedia(file, true, true);
        }

        currentPlaylist.push(file);
      });

      playlistOffset += files.length;
      playlistLoading = false;
      playlistPopup.style.display = "block"; // Show popup
    })
    .catch(() => {
      playlistLoading = false;
	  
	  const shuffleButton = document.getElementById("shuffle-button");
	  if (shuffleButton) {
	    shuffleButton.disabled = playlistLoading || currentPlaylist.length <= 1;
	    shuffleButton.classList.toggle("disabled", shuffleButton.disabled);
	  }
    });
}

/**
 * Play next track in current playlist if available.
 */
export function nextInPlaylist() {
  if (currentTrackIndex < currentPlaylist.length - 1) {
    currentTrackIndex++;
    playMedia(currentPlaylist[currentTrackIndex], true, true);
  } else {
    // Attempt to load more tracks if available
    const before = currentPlaylist.length;
    loadPlaylist(currentPlaylistName, false);
    setTimeout(() => {
      if (currentPlaylist.length > before) {
        currentTrackIndex++;
        playMedia(currentPlaylist[currentTrackIndex], true, true);
      }
    }, 500);
  }
}

/**
 * Play previous track in current playlist if available.
 */
export function prevInPlaylist() {
  if (currentTrackIndex > 0) {
    currentTrackIndex--;
    playMedia(currentPlaylist[currentTrackIndex], true, true);
  }
}

/**
 * Close and reset the playlist popup.
 */
export function closePlaylist() {
  playlistPopup.style.display = "none";
  popupPlayer.innerHTML = "";
  playlistItems.innerHTML = "";

  // Clear the playlist search input value too
  const playlistSearchInput = document.getElementById("playlist-search");
  if (playlistSearchInput) {
    playlistSearchInput.value = "";
  }

  currentPlaylist = [];
  currentTrackIndex = -1;
  currentPlaylistName = null;
  playlistOffset = 0;
  playlistHasMore = true;
  playlistLoading = false;
}

/**
 * Shuffle playlist and play a random track.
 */
export function shufflePlaylist() {
  if (playlistLoading) {
    console.warn("Playlist still loading. Try again in a second.");
    return;
  }

  if (currentPlaylist.length <= 1) return;

  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * currentPlaylist.length);
  } while (randomIndex === currentTrackIndex);

  currentTrackIndex = randomIndex;
  playMedia(currentPlaylist[randomIndex], true, true);
}

// Export helper needed by playlist (playMedia is in mediaExplorer.js)
// We’ll import and set a callback from mediaExplorer.js
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
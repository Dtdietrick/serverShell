})();// FILE: mediaManager.js - Media session and streaming management

(function () {
  const state = { 
    sid: null, 
    m3u8: null, 
    videoPlayer: null,
    musicPlayer: null 
  };

  function isMusicFile(filename) {
    return filename.startsWith('/Music') || filename.startsWith('Music/');
  }

  function getMusicExtensions() {
    return ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma'];
  }

  let _cleanupSent = false;

  function toAbsolute(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url; // already absolute
    if (!url.startsWith('/')) url = '/' + url;
    return window.location.origin + url;
  }

  async function startVideoHls(filename) {
    const response = await fetch('/media/hls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });

    if (!response.ok) {
      throw new Error(`HLS start failed: ${response.status} ${response.statusText}`);
    }

    const { m3u8, sessionId } = await response.json();
    if (!m3u8 || !sessionId) {
      throw new Error('Invalid response from /media/hls');
    }

    return { m3u8, sessionId };
  }

  async function waitForPlayableManifest(url, minSegments = 3, totalMs = 15000) {
    const start = Date.now();
    let delay = 150;

    while ((Date.now() - start) < totalMs) {
    async function playVideo(filename) {
        const response = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (response.ok) {
          const text = await response.text();
          // Count EXTINF occurrences
          const segCount = (text.match(/#EXTINF:/g) || []).length;
          if (segCount >= minSegments) return true;
        }
      } catch (error) {
        console.warn('Error checking manifest:', error);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(Math.floor(delay * 1.6), 1000);
    }
    return false;
  }

  async function stopAllMedia(opts = {}) {
    const keepalive = !!opts.keepalive;

    // Destroy video player
    if (state.videoPlayer) {
      state.videoPlayer.destroy();
      state.videoPlayer = null;
    }

    // Destroy music player
    if (state.musicPlayer) {
      state.musicPlayer.destroy();
      state.musicPlayer = null;
    }

    // Clean up backend session (only needed for video HLS)
    if (state.sid) {
      try {
        await fetch(`/media/hls/${encodeURIComponent(state.sid)}`, {
          method: 'DELETE',
          keepalive,                   // survives navigation/close
          credentials: 'same-origin',  // include cookies on unload
          headers: { 'Accept': 'application/json' }
        });
      } catch (error) {
        console.warn('Failed to cleanup session:', error);
      }
    }

    state.sid = null;
    state.m3u8 = null;
  }

  function sendCleanupOnce() {
    if (_cleanupSent) return;
    _cleanupSent = true;
    try { 
      AppPlayer.stopAllMedia({ keepalive: true }); 
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  }

  async function playMusic(filename) {
    try {
    try {
      await stopAllMedia();

      // Initialize music player if not exists
      if (!state.musicPlayer) {
        if (!window.MusicPlayer) {
          throw new Error('MusicPlayer class not found. Make sure musicPlayer.js is loaded.');
        }
        state.musicPlayer = new window.MusicPlayer('player-container');
      }

      // Show loading message
      state.musicPlayer.showLoadingMessage(filename);

      // Setup music player
      await state.musicPlayer.setupMusic(filename);
      
      // Attempt autoplay (will gracefully fall back to click-to-play)
      await state.musicPlayer.attemptAutoplay();

    } catch (error) {
      console.error('Failed to play music:', error);
      if (state.musicPlayer) {
        state.musicPlayer.showMessage(`Failed to load music: ${String(error)}`, true);
      }
      throw error;
    }
  }
    try {
      // Clean up any existing media
      await stopAllMedia();

      // Initialize video player if not exists
      if (!state.videoPlayer) {
        if (!window.VideoPlayer) {
          throw new Error('VideoPlayer class not found. Make sure videoPlayer.js is loaded.');
        }
        state.videoPlayer = new window.VideoPlayer('player-container');
      }

      // Show loading message
      state.videoPlayer.showLoadingMessage(filename);

      // Start backend session
      const { m3u8, sessionId } = await startVideoHls(filename);
      const absM3u8 = toAbsolute(m3u8);
      const primingUrl = absM3u8 + (absM3u8.includes('?') ? '&' : '?') + 't=' + Date.now();

      state.sid = sessionId;
      state.m3u8 = absM3u8;

      // Wait for playlist to be ready
      const ready = await waitForPlayableManifest(primingUrl, 3, 15000);
      if (!ready) {
        console.error('HLS not ready after wait:', { m3u8: absM3u8, sid: sessionId });
        throw new Error('Stream not ready (timeout)');
      }

      // Setup video player
      await state.videoPlayer.setupVideo(absM3u8);
      
      // Attempt autoplay
      await state.videoPlayer.attemptAutoplay();

  async function playMedia(filename) {
    // Determine if this is a music file and route accordingly
    if (isMusicFile(filename) || isMusicExtension(filename)) {
      return await playMusic(filename);
    } else {
      return await playVideo(filename);
    }
  }

    } catch (error) {
      console.error('Failed to play video:', error);
      if (state.videoPlayer) {
        state.videoPlayer.showMessage(`Failed to start: ${String(error)}`, true);
      }
      throw error;
    }
  }
  // Expose public API

  window.AppPlayer = { 
    playMedia, 
    playMusic,
    playVideo,
    stopAllMedia,
    getState: () => ({ ...state }) // For debugging
  };
  // Setup cleanup handlers

  window.addEventListener('pagehide', sendCleanupOnce, { once: true });
  window.addEventListener('beforeunload', sendCleanupOnce, { once: true });
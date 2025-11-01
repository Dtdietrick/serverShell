//File: player.js

/*Frontend Media Player */

(function () {
  let hls = null;
  const state = { m3u8: null, video: null, sourcePath: null };

  function toAbsolute(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (!url.startsWith('/')) url = '/' + url;
    return window.location.origin + url;
  }

  function _cleanRelPath(p) {                    
    if (!p) return p;
    let s = String(p);
    try { s = decodeURIComponent(s); } catch {}
    s = s.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
    s = s.replace(/^\/+/, "");
    const hasTraversal = /(^|\/)\.\.(?=\/|$)/.test(s);
    if (hasTraversal) throw new Error("Unsafe path");   

    return s;
  }
  
  async function stopAllMedia() {
    try {
      if (hls) { try { hls.destroy(); } catch {} hls = null; }
      if (state.video) {
        state.video.pause();
        state.video.removeAttribute('src');
        state.video.load();
      }
    } catch {}
    state.video = null;
    state.m3u8 = null;
    state.sourcePath = null; // track last requested path
  }

  function addSkipToEndButton(video) {
    // remove any prior instance
    document.querySelectorAll('.player-skip-end-btn').forEach(b => b.remove());

    const titlebar = document.querySelector('#player-header .player-titlebar');
    if (!titlebar) return;

    const btn = document.createElement('button');
    btn.className = 'player-skip-end-btn';
    btn.type = 'button';
    btn.title = 'Skip to end';
    btn.setAttribute('aria-label', 'Skip to end');
    btn.textContent = 'Jump To End »|';

    // enable once metadata is ready
    btn.disabled = true;
    const enable = () => { btn.disabled = false; };
    if (Number.isFinite(video.duration)) enable();
    else video.addEventListener('loadedmetadata', enable, { once: true });

    // jump to ~EOF so your natural 'ended' handlers run
    btn.addEventListener('click', () => {
      const d = Number(video.duration);
      if (Number.isFinite(d) && d > 0.6) video.currentTime = Math.max(0, d - 0.5);
    });

    titlebar.appendChild(btn);
  }

  async function loadSubtitles(video, sourcePath) {
    try {
      // --- keep your logic, but make dir detection a bit safer ---
      let dirPath = sourcePath;
      // If it's a file path (index.m3u8 or any extension), peel to directory
      const lastSlash = sourcePath.lastIndexOf('/');
      const lastDot   = sourcePath.lastIndexOf('.');
      if (lastDot > lastSlash && !sourcePath.endsWith('/')) {
        dirPath = sourcePath.substring(0, lastSlash);
      }

      // Only collapse duplicate slashes and remove a single trailing slash.
      dirPath = dirPath.replace(/\/{2,}/g, '/').replace(/\/$/, '');
      if (!dirPath.startsWith('/')) {
        // Change: keep a leading slash so backends that expect absolute-like paths work.
        dirPath = '/' + dirPath;
      }

      const subsUrl = `/media/subs?path=${encodeURIComponent(dirPath)}`;
      console.log('Attempting to load subtitles from:', subsUrl);

      const r = await fetch(subsUrl, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      if (!r.ok) {
        if (r.status === 404) {
          console.log('No subtitles available for this media');
        } else if (r.status === 204) {
          console.log('Subtitles endpoint returned 204 (no content)');
        } else {
          console.warn(`Subtitles request failed: ${r.status} ${r.statusText}`);
        }
        return;
      }

      // --- tolerate empty body / wrong content-type when body is empty ---
      let tracks = [];
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        // normal path
        tracks = await r.json();
      } else {
        // try to be forgiving: empty => [], JSON string => parse, else bail
        const txt = await r.text();
        if (!txt.trim()) {
          tracks = [];
        } else {
          try { tracks = JSON.parse(txt); }
          catch { console.warn('Subtitles endpoint returned non-JSON body'); return; }
        }
      }

      console.log('Loaded subtitle tracks:', tracks);
      if (!Array.isArray(tracks) || tracks.length === 0) {
        console.log('No subtitle tracks found');
        return;
      }

      let defaultTrackSet = false;
      tracks.forEach((t, index) => {
        if (!t || !t.src) { console.warn('Subtitle track missing src:', t); return; }
		const track = document.createElement('track');
		track.kind  = 'subtitles';
		track.label = t.label || `Subtitles ${index + 1}`;

		// ensure srclang exists (required for subtitles)
		track.srclang = t.lang || 'en'; // <-- fallback if controller provided none

		track.src = t.src.startsWith('http')
		  ? t.src
		  : (t.src.startsWith('/') ? window.location.origin + t.src : t.src);

		// keep your default logic
		if (!defaultTrackSet && (t.lang === 'en' || index === 0)) {
		  track.default = true;
		  defaultTrackSet = true;
		}

		video.appendChild(track);
		
		if (track.default) {
		  // after the element attaches, force "showing"
		  track.addEventListener('load', () => {
		    try { track.track.mode = 'showing'; } catch {}
		    // Some browsers only expose via video.textTracks
		    const list = video.textTracks;
		    for (let i = 0; i < list.length; i++) {
		      if (list[i].label === track.label) { list[i].mode = 'showing'; break; }
		    }
		  });
		}
		
        console.log(`Added subtitle track: ${track.label} (${track.srclang || 'no-lang'})`);
      });

      if (tracks.length > 0) showSubtitleNotification(tracks.length);
    } catch (error) {
      console.error('Error loading subtitles:', error);
    }
  }
  
  // Optional: Show a brief notification when subtitles are loaded
  function showSubtitleNotification(count) {
    const notification = document.createElement('div');
    notification.textContent = `${count} subtitle track${count > 1 ? 's' : ''} loaded`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font: 12px system-ui;
      z-index: 1000;
      transition: opacity 0.3s;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
  
  async function startVod(pathOrFolder) {
    const clean = _cleanRelPath(pathOrFolder);    
    const res = await fetch('/media/vod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: clean })        
    });
    if (!res.ok) throw new Error(`VOD resolve failed: ${res.status} ${res.statusText}`);
    const { m3u8, error } = await res.json();
    if (error) throw new Error(error);
    if (!m3u8) throw new Error('Invalid /media/vod response (missing m3u8)');
    return { m3u8 };
  }

  async function playMedia(filenameOrFolder) {
    await stopAllMedia(); // keeps your cleanup semantics
    state.sourcePath = filenameOrFolder;

    // remove any prior "next" prompt
    const oldPrompt = document.getElementById('next-prompt');
    if (oldPrompt) oldPrompt.remove();

    const container = document.getElementById('player-container');
    if (!container) throw new Error('player container missing');

    const inPopup =
      document.getElementById('playlist-popup')?.classList.contains('open') &&
      document.getElementById('playlist-popup')?.contains(container);

    const name = filenameOrFolder.split('/').pop().replace(/\.[^/.]+$/, '');

    // do NOT replace the whole container each time (this would drop FS)
    // Show a lightweight loading label without nuking the video element if it exists
    let loadingLabel = container.querySelector('.player-loading-label');
    if (!loadingLabel) {
      loadingLabel = document.createElement('div');
      loadingLabel.className = 'player-loading-label';
      loadingLabel.style.opacity = '.7';
      container.appendChild(loadingLabel);
    }
    loadingLabel.innerHTML = `Loading <b>${name}</b>…`;

    // ensure there is ONE persistent <video id="media-player">
    let video = document.getElementById('media-player');
    const needCreate = !video;
    if (needCreate) {
      video = document.createElement('video');
      video.id = 'media-player';
      video.setAttribute('controls', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('crossorigin', '');
      container.appendChild(video);

      // wire ended only once
      video.addEventListener('ended', () => {
        try {
          if (window.AppPlayer && typeof window.AppPlayer.onEnded === 'function') {
            window.AppPlayer.onEnded(state.sourcePath);
          }
        } catch {}
      });
    }

    // adjust styling based on popup-state without recreating the node
    if (inPopup) {
      container.classList.add('in-popup');
      Object.assign(video.style, {
        width: '100%',
        height: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        display: 'block'
      });
    } else {
      container.classList.remove('in-popup');
      Object.assign(video.style, {
        width: '100%',
        height: '',
        maxHeight: '70vh',
        objectFit: '',
        display: 'block'
      });
    }

    // if reusing, clear previous media bindings safely
    try { if (hls) { hls.destroy(); } } catch {}
    hls = null;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {}

    state.video = video;

    try {
      const { m3u8 } = await startVod(filenameOrFolder);
      const absM3u8 = toAbsolute(m3u8);
      const primedM3u8 = absM3u8 + (absM3u8.includes('?') ? '&' : '?') + 't=' + Date.now();
      state.m3u8 = absM3u8;

      // load subtitles for the new source
      await loadSubtitles(video, filenameOrFolder);

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = primedM3u8;
      } else if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls({
          maxBufferLength: 30,
          backBufferLength: 60,
          maxBufferHole: 1,
          maxFragLookUpTolerance: 0.5,
          enableWorker: true
        });
        hls.on(window.Hls.Events.ERROR, (evt, data) => {
          console.warn('HLS error:', data.type, data.details, data);
          if (data.fatal) {
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR: try { hls.startLoad(); } catch {} break;
              case window.Hls.ErrorTypes.MEDIA_ERROR:   try { hls.recoverMediaError(); } catch {} break;
              default: try { hls.destroy(); } catch {}; hls = null; break;
            }
          } else if (data.details === window.Hls.ErrorDetails.BUFFER_APPEND_ERROR) {
            try { hls.recoverMediaError(); } catch {}
          }
        });
        hls.loadSource(primedM3u8);
        hls.attachMedia(video);
      } else {
        // compact error without replacing the video (so FS state/DOM remains stable)
        loadingLabel.innerHTML = `<div style="color:#c00">HLS not supported in this browser.</div>`;
        return;
      }

      addSkipToEndButton(video);

      // clear the loading label once we’re playing or at least attempting
      try { await video.play(); }
      catch {
		if (inPopup) {
		  // In popup, do not show overlay; retry quietly when the media is ready.
		  const retry = () => { video.play().catch(()=>{}); };
		  // Quick retry + on readiness:
		  setTimeout(retry, 80);
		  video.addEventListener('canplay', retry, { once: true });
		  video.addEventListener('loadeddata', retry, { once: true });
		} else {
		  // viewer-only: keep your click-to-play overlay
		  const clickToPlay = document.createElement('div');
		  clickToPlay.textContent = 'Click to play';
		  clickToPlay.style.cssText =
		    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 16px system-ui;background:rgba(0,0,0,.35);color:#fff;cursor:pointer;';
		  container.style.position = 'relative';
		  container.appendChild(clickToPlay);
		  const start = () => { video.play().catch(()=>{}); clickToPlay.remove(); };
		  clickToPlay.addEventListener('click', start, { once: true });
		  video.addEventListener('click', start, { once: true });
		}
      } finally {
        try { loadingLabel.remove(); } catch {}
      }
    } catch (e) {
      try { loadingLabel.innerHTML = `<div style="color:#c00">Failed to start: ${String(e)}</div>`; }
      catch {}
    }
  }

  // expose a tiny API – onEnded is optional and unset by default
  window.AppPlayer = {
    playMedia,
    stopAllMedia,
    onEnded: null,
    getLastSource: () => state.sourcePath
  };
})();

(function () {
  // [player.js] keep a single Hls.js instance and a tiny runtime state
  let hls = null;
  const state = { m3u8: null, video: null };

  // [player.js] unchanged: helper to absolutize URLs if needed
  function toAbsolute(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url; // already absolute
    if (!url.startsWith('/')) url = '/' + url;
    return window.location.origin + url;
  }

  // [player.js] simplified: stop only media; NO DELETE to backend (no sessions anymore)
  async function stopAllMedia() {
    try {
      if (hls) {
        try { hls.destroy(); } catch {}
        hls = null;
      }
      if (state.video) {
        state.video.pause();
        state.video.removeAttribute('src');
        state.video.load();
      }
    } catch {}
    state.video = null;
    state.m3u8 = null;
  }

  // [player.js] NEW: ask backend to resolve a ready-made VOD manifest
  async function startVod(pathOrFolder) {
    const res = await fetch('/media/vod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathOrFolder })
    });
    if (!res.ok) throw new Error(`VOD resolve failed: ${res.status} ${res.statusText}`);
    const { m3u8, error } = await res.json();
    if (error) throw new Error(error);
    if (!m3u8) throw new Error('Invalid /media/vod response (missing m3u8)');
    return { m3u8 };
  }

  // [player.js] REPLACED: removed session-based HLS start + waitForPlayableManifest
  async function playMedia(filenameOrFolder) {
    await stopAllMedia();

    const container = document.getElementById('player-container');
    if (!container) throw new Error('player container missing');

    const name = filenameOrFolder.split('/').pop().replace(/\.[^/.]+$/, '');
    container.innerHTML = `<div style="opacity:.7">Loading <b>${name}</b>…</div>`;

    try {
      // [player.js] Resolve VOD manifest from folder or direct index.m3u8 path
      const { m3u8 } = await startVod(filenameOrFolder);
      const absM3u8 = toAbsolute(m3u8);
      // Small cache-buster to avoid stale manifests on first load
      const primedM3u8 = absM3u8 + (absM3u8.includes('?') ? '&' : '?') + 't=' + Date.now();

      state.m3u8 = absM3u8;

      // [player.js] Build the video element (fresh each play)
      container.innerHTML = `<video id="media-player" controls playsinline crossorigin style="width:100%;max-height:70vh;"></video>`;
      const video = document.getElementById('media-player');
      state.video = video;

      // [player.js] Optional subtitles: /subs.json next to index.m3u8 (non-blocking)
      (async () => {
        try {
          const subsUrl = absM3u8.replace(/\/index\.m3u8(?:\?.*)?$/, "/subs.json");
          const r = await fetch(subsUrl, { cache: 'no-store' });
          if (r.ok) {
            const tracks = await r.json();
            if (Array.isArray(tracks)) {
              tracks.forEach(t => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = t.label || (t.lang || 'Sub');
                if (t.lang) track.srclang = t.lang;
                track.src = t.src;
                video.appendChild(track);
              });
            }
          }
        } catch {}
      })();

      // [player.js] Native HLS (Safari) or Hls.js
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = primedM3u8;
      } else if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls({
          // Reasonable VOD defaults (you can tune later)
          maxBufferLength: 30,
          backBufferLength: 60,
          maxBufferHole: 1,
          maxFragLookUpTolerance: 0.5,
          enableWorker: true
        });

        // [player.js] Unified error handling; keep it resilient
        hls.on(window.Hls.Events.ERROR, (evt, data) => {
          console.warn('HLS error:', data.type, data.details, data);
          if (data.fatal) {
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                try { hls.startLoad(); } catch {}
                break;
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                try { hls.recoverMediaError(); } catch {}
                break;
              default:
                try { hls.destroy(); } catch {}
                hls = null;
                break;
            }
          } else if (data.details === window.Hls.ErrorDetails.BUFFER_APPEND_ERROR) {
            try { hls.recoverMediaError(); } catch {}
          }
        });

        hls.loadSource(primedM3u8);
        hls.attachMedia(video);
      } else {
        container.innerHTML = `<div style="color:#c00">HLS not supported in this browser.</div>`;
        return;
      }

      // [player.js] Autoplay handling
      try {
        await video.play();
      } catch {
        const clickToPlay = document.createElement('div');
        clickToPlay.textContent = 'Click to play';
        clickToPlay.style.cssText =
          'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 16px system-ui;background:rgba(0,0,0,.35);color:#fff;cursor:pointer;';
        const parent = container;
        parent.style.position = 'relative';
        parent.appendChild(clickToPlay);
        const start = () => { video.play().catch(()=>{}); clickToPlay.remove(); };
        clickToPlay.addEventListener('click', start, { once: true });
        video.addEventListener('click', start, { once: true });
      }
    } catch (e) {
      container.innerHTML = `<div style="color:#c00">Failed to start: ${String(e)}</div>`;
    }
  }

  // [player.js] public API (unchanged names)
  window.AppPlayer = { playMedia, stopAllMedia };
})();
//player.js
(function () {
  let hls = null;
  const state = { m3u8: null, video: null, sourcePath: null };

  function toAbsolute(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (!url.startsWith('/')) url = '/' + url;
    return window.location.origin + url;
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

  async function playMedia(filenameOrFolder) {
    await stopAllMedia();
    state.sourcePath = filenameOrFolder; // <- track the logical input path

	//refresh for play next
	const oldPrompt = document.getElementById('next-prompt');
	if (oldPrompt) oldPrompt.remove();
	
    const container = document.getElementById('player-container');
    if (!container) throw new Error('player container missing');

    const name = filenameOrFolder.split('/').pop().replace(/\.[^/.]+$/, '');
    container.innerHTML = `<div style="opacity:.7">Loading <b>${name}</b>…</div>`;

    try {
      const { m3u8 } = await startVod(filenameOrFolder);
      const absM3u8 = toAbsolute(m3u8);
      const primedM3u8 = absM3u8 + (absM3u8.includes('?') ? '&' : '?') + 't=' + Date.now();

      state.m3u8 = absM3u8;

      container.innerHTML = `<video id="media-player" controls playsinline crossorigin style="width:100%;max-height:70vh;"></video>`;
      const video = document.getElementById('media-player');
      state.video = video;

      // Fire-and-forget optional subtitles load
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
              case window.Hls.ErrorTypes.MEDIA_ERROR: try { hls.recoverMediaError(); } catch {} break;
              default: try { hls.destroy(); } catch {}; hls = null; break;
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

      //notify explorer on natural end
	  video.addEventListener('ended', () => {
	    try {
	      if (window.AppPlayer && typeof window.AppPlayer.onEnded === 'function') {
	        window.AppPlayer.onEnded(state.sourcePath);
	      }
	    } catch {}
	  });

      try { await video.play(); }
      catch {
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

  // expose a tiny API — onEnded is optional and unset by default
  window.AppPlayer = {
    playMedia,
    stopAllMedia,
    onEnded: null,
    getLastSource: () => state.sourcePath
  };
})();
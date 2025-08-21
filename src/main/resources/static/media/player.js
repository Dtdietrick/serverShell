// FILE:player.js

(function () {
  let hls = null;
  const state = { sid: null, m3u8: null, video: null };

  function toAbsolute(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url; // already absolute
    if (!url.startsWith('/')) url = '/' + url;
    return window.location.origin + url;
  }


  async function stopAllMedia(opts = {}) {
    const keepalive = !!opts.keepalive;

    try {
      if (state.video) {
        state.video.pause();
        state.video.removeAttribute('src');
        state.video.load();
      }
    } catch {}
    state.video = null;

    if (state.sid) {
      try {
        await fetch(`/video/hls/${encodeURIComponent(state.sid)}`, {
          method: 'DELETE',
          keepalive,                   // survives navigation/close
          credentials: 'same-origin',  // include cookies on unload
          headers: { 'Accept': 'application/json' }
        });
      } catch {}
    }
    state.sid = null;
    state.m3u8 = null;
  }

  //don’t spam DELETE multiple times
  let _cleanupSent = false;
  function sendCleanupOnce() {
    if (_cleanupSent) return;
    _cleanupSent = true;
    try { AppPlayer.stopAllMedia({ keepalive: true }); } catch {}
  }
  
  async function startvideoHls(filename) {
    const res = await fetch('/video/hls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) });
    if (!res.ok) throw new Error(`HLS start failed: ${res.status} ${res.statusText}`);
    const { m3u8, sessionId } = await res.json();
    if (!m3u8 || !sessionId) throw new Error('Invalid response from /video/hls');
    return { m3u8, sessionId };
  }

  // FILE:player.js  — Replace your waitForHeadWithBackoff with a content-aware check
  async function waitForPlayableManifest(url, minSegments = 3, totalMs = 15000) {
    const start = Date.now();
    let delay = 150;
    while ((Date.now() - start) < totalMs) {
      try {
        const r = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (r.ok) {
          const text = await r.text();
          // Count EXTINF occurrences
          const segCount = (text.match(/#EXTINF:/g) || []).length;
          if (segCount >= minSegments) return true;
        }
      } catch {}
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(Math.floor(delay * 1.6), 1000);
    }
    return false;
  }

  async function playMedia(filename) {
    await stopAllMedia();

    const container = document.getElementById('player-container');
    if (!container) throw new Error('player container missing');

    const name = filename.split('/').pop().replace(/\.[^/.]+$/, '');
    container.innerHTML = `<div style="opacity:.7">Starting stream for <b>${name}</b>…</div>`;

    try {
      //start backend session
      const { m3u8, sessionId } = await startvideoHls(filename);
      const absM3u8 = toAbsolute(m3u8);
      const primingUrl = absM3u8 + (absM3u8.includes('?') ? '&' : '?') + 't=' + Date.now();

      state.sid = sessionId;
      state.m3u8 = absM3u8;

      //wait for playlist to exist
      const ready = await waitForPlayableManifest(primingUrl, /*minSegments*/ 3, /*timeout*/ 15000);
      if (!ready) {
        console.error('HLS not ready after wait:', { m3u8: absM3u8, sid: sessionId });
        throw new Error('Stream not ready (timeout)');
      }

      //build video and attach src
      container.innerHTML = `<video id="media-player" controls playsinline crossorigin style="width:100%;max-height:70vh;"></video>`;
      const video = document.getElementById('media-player');
      state.video = video;

      // after creating <video>, auto-attach optional subtitiles if present
      (async () => {
        try {
          const subsUrl = state.m3u8.replace(/\/index\.m3u8(?:\?.*)?$/, "/subs.json");
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
                state.video.appendChild(track);
              });
            }
          }
        } catch {}
      })();
        
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari
        video.src = absM3u8;
      } else if (window.Hls && window.Hls.isSupported()) {
          // FILE: player.js — Hls.js setup with live-friendly tuning and unified error handling
          hls = new window.Hls({
            // Live defaults for ~2–4s segments
            liveSyncDuration: 6,            // target seconds behind live edge
            liveMaxLatencyDuration: 18,     // cap latency growth
            maxBufferLength: 20,            // seconds to buffer ahead
            lowLatencyMode: false,          // TS HLS, not LL-HLS

            // Be patient with the MSE append path
            appendErrorMaxRetry: 8,
            backBufferLength: 60,
            maxBufferHole: 1,
            maxFragLookUpTolerance: 0.5,
            enableWorker: true
          });

          let manifestRetryTimer = null;

          hls.on(window.Hls.Events.ERROR, (evt, data) => {
            console.warn('HLS error:', data.type, data.details, data);

            if (data.fatal) {
              switch (data.type) {
                case window.Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();          // restart loading on network errors
                  break;
                case window.Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();  // recover MSE pipeline
                  break;
                default:
                  hls.destroy();            // unrecoverable
                  break;
              }
              return;
            }

            // Early session: manifest may be empty/sliding — retry once with a cache-buster
            if (
              data.details === window.Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
              data.details === window.Hls.ErrorDetails.MANIFEST_LOAD_ERROR
            ) {
              clearTimeout(manifestRetryTimer);
              manifestRetryTimer = setTimeout(() => {
                const bust = state.m3u8 + (state.m3u8.includes('?') ? '&' : '?') + 'r=' + Date.now();
                hls.loadSource(bust);
              }, 800);
            }

            // Non-fatal append hiccup: gently nudge the media pipeline
            if (data.details === window.Hls.ErrorDetails.BUFFER_APPEND_ERROR) {
              try { hls.recoverMediaError(); } catch {}
            }
          });

          hls.loadSource(absM3u8);
          hls.attachMedia(video);
        }else {
        container.innerHTML = `<div style="color:#c00">HLS not supported in this browser.</div>`;
        return;
      }

      try { 
        await video.play(); 
    } catch {
        // Autoplay likely blocked; ask for a click to start
        const clickToPlay = document.createElement('div'); // [player.js]
        clickToPlay.textContent = 'Click to play';
        clickToPlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 16px system-ui;background:rgba(0,0,0,.35);color:#fff;cursor:pointer;';
        const parent = container; // same element you appended the <video> to
        parent.style.position = 'relative';
        parent.appendChild(clickToPlay);
        const start = () => { video.play().catch(()=>{}); clickToPlay.remove(); };
        clickToPlay.addEventListener('click', start, { once: true });
        video.addEventListener('click', start, { once: true }); // clicking the video also starts
    }
    } catch (e) {
      container.innerHTML = `<div style="color:#c00">Failed to start: ${String(e)}</div>`;
    }
  }

  // expose globals
  window.AppPlayer = { playMedia, stopAllMedia };

  window.addEventListener('pagehide',    sendCleanupOnce, { once: true });
  window.addEventListener('beforeunload',sendCleanupOnce, { once: true });
  
})();
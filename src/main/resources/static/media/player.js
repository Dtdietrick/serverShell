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

  async function stopAllMedia() {
	try {
	  if (state.video) {
	    state.video.pause();
	    state.video.removeAttribute('src');
	    state.video.load(); // clears the current media element state
	  }
	} catch {}
	state.video = null;
  }

  async function startVlcHls(filename) {
    const res = await fetch('/vlc/hls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) });
    if (!res.ok) throw new Error(`HLS start failed: ${res.status} ${res.statusText}`);
    const { m3u8, sessionId } = await res.json();
    if (!m3u8 || !sessionId) throw new Error('Invalid response from /vlc/hls');
    return { m3u8, sessionId };
  }

  // FILE:player.js  — Replace your waitForHeadWithBackoff with a content-aware check
  async function waitForPlayableManifest(url, totalMs = 15000) {
    const start = Date.now();
    let delay = 150;
    while ((Date.now() - start) < totalMs) {
      try {
        const r = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (r.ok) {
          const text = await r.text();
          // Must contain at least one segment entry to be playable
          if (text.includes('#EXTINF')) return true;
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
	  const { m3u8, sessionId } = await startVlcHls(filename);
	  const absM3u8 = toAbsolute(m3u8);
	  const primingUrl = absM3u8 + (absM3u8.includes('?') ? '&' : '?') + 't=' + Date.now();

      state.sid = sessionId;
      state.m3u8 = absM3u8;

      //wait for playlist to exist
	  const ready = await waitForPlayableManifest(primingUrl, 15000);
	  if (!ready) {
	    console.error('HLS not ready after wait:', { m3u8: absM3u8, sid: sessionId });
	    throw new Error('Stream not ready (timeout)');
	  }

      //build video and attach src
      container.innerHTML = `<video id="media-player" controls playsinline muted crossorigin style="width:100%;max-height:70vh;"></video>`;
      const video = document.getElementById('media-player');
      state.video = video;

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari
        video.src = absM3u8;
      }	else if (window.Hls && window.Hls.isSupported()) {
		 hls = new window.Hls({
		   // Live defaults that work well with your 2–4s segments
		   liveSyncDuration: 6,             // seconds to stay behind live edge
		   liveMaxLatencyDuration: 18,      // cap latency growth
		   maxBufferLength: 20,             // seconds of media buffer
		   lowLatencyMode: false
		 });

		 let manifestRetryTimer = null;
		 hls.on(window.Hls.Events.ERROR, (evt, data) => {
		   console.warn('HLS error:', data.type, data.details, data);
		   if (data.fatal) {
		     switch (data.type) {
		       case window.Hls.ErrorTypes.NETWORK_ERROR:
		         hls.startLoad();
		         break;
		       case window.Hls.ErrorTypes.MEDIA_ERROR:
		         hls.recoverMediaError();
		         break;
		       default:
		         hls.destroy();
		     }
		   } else if (
		     data.details === window.Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
		     data.details === window.Hls.ErrorDetails.MANIFEST_LOAD_ERROR
		   ) {
		     // Early in the session the manifest can be empty; retry once after a short delay
		     clearTimeout(manifestRetryTimer);
		     manifestRetryTimer = setTimeout(() => {
		       // Add a one-off cache-buster on retry
		       const bust = state.m3u8 + (state.m3u8.includes('?') ? '&' : '?') + 'r=' + Date.now();
		       hls.loadSource(bust);
		     }, 800);
		   }
		 });

		hls.loadSource(absM3u8);
		hls.attachMedia(video);
      } else {
        container.innerHTML = `<div style="color:#c00">HLS not supported in this browser.</div>`;
        return;
      }

      try { await video.play(); } catch {}
    } catch (e) {
      container.innerHTML = `<div style="color:#c00">Failed to start: ${String(e)}</div>`;
    }
  }

  // expose globals
  window.AppPlayer = { playMedia, stopAllMedia };
})();
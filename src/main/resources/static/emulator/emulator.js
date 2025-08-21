/* audio player */
function playWsWebmOpus(wsUrl) {
  const mime = 'audio/webm; codecs="opus"';
  if (!window.MediaSource || !MediaSource.isTypeSupported(mime)) {
    console.warn('[emulator] MediaSource or Opus not supported');
    return Promise.reject(new Error('MediaSource/Opus not supported'));
  }

  let audio = document.getElementById('emu-audio');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'emu-audio';
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = false;
    audio.style.display = 'none';
    document.body.appendChild(audio);
  }

  try { if (window.__emuAudioWS) window.__emuAudioWS.close(); } catch {}

  const ms = new MediaSource();
  audio.src = URL.createObjectURL(ms);

  // Return Promise that resolves when WebSocket connects
  return new Promise((resolve, reject) => {
    const preQueue = [];
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    window.__emuAudioWS = ws;
    window.__emuAudioEl = audio;

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Audio WebSocket connection timeout'));
      }
    }, 10000); // 10 second timeout

    ws.onopen = () => {
      console.log('[emulator] Audio WebSocket connected to:', wsUrl);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve();
      }
    };

    ws.onerror = (err) => {
      console.error('[emulator] Audio WebSocket error:', err);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(new Error('Audio WebSocket connection failed'));
      }
    };

    ws.onclose = (event) => {
      console.log('[emulator] Audio WebSocket closed:', event.code, event.reason);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(new Error(`Audio WebSocket closed: ${event.code} ${event.reason}`));
      }
      try { if (ms.readyState === 'open') ms.endOfStream(); } catch {}
    };

    ws.onmessage = (e) => { preQueue.push(new Uint8Array(e.data)); };

    ms.addEventListener('sourceopen', () => {
      const sb = ms.addSourceBuffer(mime);
      try { sb.mode = 'sequence'; } catch {}

      const queue = preQueue;
      const pump = () => {
        if (queue.length && !sb.updating && ms.readyState === 'open') {
          sb.appendBuffer(queue.shift());
        }
      };
      sb.addEventListener('updateend', pump);

      ws.onmessage = (e) => { queue.push(new Uint8Array(e.data)); pump(); };

      pump();
      audio.muted = false;
      audio.volume = 1.0;
      audio.play().catch((playErr) => {
        console.warn('[emulator] Audio play failed (user interaction required?):', playErr);
      });
    });
  });
}

/* 
 * NEW APPROACH (works):
 * 1. Open popup with immediate content 
 * 2. Update popup content during async work
 * 3. Browser sees popup as legitimate
 */
export function launchEmulator(rom, button) {
  if (!rom || typeof rom !== 'string') throw new Error('[emulator] ROM is required');
  if (button && button.disabled) return;

  const originalText = button ? button.textContent : '';
  const resetUI = () => { if (button) { button.disabled = false; button.textContent = originalText; } };

  // CRITICAL: Open popup IMMEDIATELY with content some (not blank)
  const win = window.open('about:blank', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
  if (!win) { 
    alert('Popup blocked. Please allow popups for this site and try again.'); 
    return; 
  }

  // Give popup content IMMEDIATELY (popup blocker pain)
  win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🎮 Starting Emulator...</title>
<style>
  body { 
    font-family: system-ui, sans-serif; 
    background: #000; 
    color: #fff; 
    margin: 0; 
    padding: 40px; 
    text-align: center; 
  }
  .loading { 
    background: #111; 
    padding: 30px; 
    border-radius: 8px; 
    margin: 50px auto; 
    max-width: 500px; 
  }
  .status { 
    font-size: 18px; 
    margin: 20px 0; 
    color: #4CAF50; 
  }
  .rom-name { 
    color: #FFC107; 
    font-weight: bold; 
  }
  .spinner {
    border: 3px solid #333;
    border-top: 3px solid #4CAF50;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 20px auto;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
</head><body>
<div class="loading">
  <h1>🎮 Starting Emulator</h1>
  <div class="rom-name">${rom}</div>
  <div class="spinner"></div>
  <div class="status" id="status">Contacting server...</div>
</div>
</body></html>`);
  
  // Close the document to finish initial load
  win.document.close();

  if (button) { button.disabled = true; button.textContent = 'Launching…'; }

  // Helper function to update status in the popup
  const updateStatus = (message) => {
    try {
      const statusEl = win.document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = message;
      }
    } catch (e) {
      // Popup might be closed, ignore
    }
    console.log('[emulator]', message);
  };

  // async work while popup is live with content
  fetch('/emulator/launch?rom=' + encodeURIComponent(rom), {
    method: 'POST',
    credentials: 'same-origin',
    headers: (() => {
      // Simple CSRF handling for your current setup
      const m = (document.cookie || '').match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
      return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
    })(),
    cache: 'no-store',
  })
  .then(async (res) => {
    updateStatus('Server responded, parsing response...');
    
    if (!res.ok) throw new Error(`Launch failed: HTTP ${res.status}`);

    // Handle JSON response with VNC(Video) & WS(Audio)
    const response = await res.json();
    
    // Check for error response
    if (response.error) {
      throw new Error(response.error);
    }
    
    let vncUrl = response.vncUrl;
    let audioUrl = response.audioUrl;
    if (!vncUrl) throw new Error('Backend returned no vncUrl');
    if (!audioUrl) throw new Error('Backend returned no audioUrl');

    updateStatus('Got VNC URL, container is ready!');
    console.log('[emulator] VNC URL:', vncUrl);

    // Normalize URL (HTTP - For now)  
    const u = new URL(vncUrl, window.location.href);
    u.protocol = 'http:';  // Force HTTP
    vncUrl = u.toString();

    updateStatus('Starting audio...');

    // Use dynamic audio URL from backend (not pre-computed frontend)
    console.log('[emulator] Attempting audio connection to:', audioUrl);
    
    try {
      // Start audio in the POPUP window, not the main window
      await playWsWebmOpus(audioUrl);
      updateStatus('Audio connected! Loading game...');
      console.log('[emulator] Audio connected successfully');
    }
	//audio is ride or die - no audio, no go 
	catch (e) {
      console.error('[emulator] Audio connection failed:', e);
      updateStatus('Error Loading Emulator Audio...');
    }

    //Redirect popup to the emulator
    updateStatus('Loading emulator interface...');
    
    setTimeout(() => {
      try {
        win.location.href = vncUrl;  // Simple redirect to VNC
      } catch (e) {
        console.error('[emulator] Failed to redirect popup:', e);
        updateStatus('Error loading emulator. Please close and try again.');
      }
    }, 1000); // Small delay to show final status

    resetUI();
  })
  .catch((err) => {
    console.error('[emulator] Launch error:', err);
    
    // Show error in popup instead of alert
    try {
      win.document.body.innerHTML = `
        <div style="font-family:system-ui;background:#000;color:#fff;padding:40px;text-align:center;">
          <div style="background:#222;padding:30px;border-radius:8px;margin:50px auto;max-width:500px;">
            <h1 style="color:#f44336;">Emulator Failed to Start</h1>
            <div style="color:#ff9800;margin:20px 0;font-weight:bold;">${rom}</div>
            <div style="margin:20px 0;">${err.message}</div>
            <button onclick="window.close()" style="background:#4CAF50;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-size:16px;">
              Close Window
            </button>
          </div>
        </div>
      `;
    } catch (e) {
      // Fallback if popup is closed
      alert('Emulator error: ' + err.message);
      try { win.close(); } catch {}
    }
    
    resetUI();
  });
}
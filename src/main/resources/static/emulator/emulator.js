/* 
 * NEW APPROACH LESSONS LEARNED(works):
 * 1 function launchEmulator(rom, button) -> Open popup with immediate content (blank)
 * 2. ALL emulator logic on new popup const win = window.open();
 * 3. vnc url for <video> fetch('/emulator/launch?rom=' + encodeURIComponent(rom) {method: 'POST'}
 * 4. ws url for <audio> playWsWebmOpus(wsUrl) 
*/


//  export stays the same for callers
let __emuWin = null;         
let __emuSession = 0;       
let __currentSid = 0;        
let __gpWS = null;           
let __gpForwarder = null;   
let __gpTickRaf = 0;
let __gpLastSent = null;
let __gpLastSentAt = 0;
const __gpEpsilon = 0.02;      
const __gpMinInterval = 30;
let __emuCleanupWatch = null;

function updateStatus(msg) {
  try {
    const d = __emuWin?.document;
    const el = d && d.getElementById('status');
    if (el) el.textContent = msg;
  } catch {}
  console.log("[emulator]", msg);
}

function extractPortFromUrl(urlString) {
  try {
    const u = new URL(urlString, location.href);
    if (u.port) return u.port; 
    // Try common query names
    const qp = u.searchParams.get('port') || u.searchParams.get('vnc') || u.searchParams.get('p');
    if (qp && /^\d{2,5}$/.test(qp)) return qp;
    // Try path patterns like "/novnc/52300/" or ":52300"
    const m = u.href.match(/[:/](\d{2,5})(?:\/|$)/);
    return m ? m[1] : null;
  } catch {
    // last resort: original regex on the raw string
    const m = (urlString || '').match(/:(\d{2,5})/);
    return m ? m[1] : null;
  }
}

//cleanup poster
function postCleanup(port) {
  //prefer beacon; fallback to keepalive fetch
  const payload = JSON.stringify({ port: port || 0 });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/emulator/cleanup', blob);
      return;
    }
  } catch {}
  try {
    fetch('/emulator/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => {});
  } catch {}
}

function approxEqual(a, b, eps = __gpEpsilon) {
  return Math.abs((a || 0) - (b || 0)) <= eps;
}
function arraysApproxEqual(A = [], B = [], eps = __gpEpsilon) {
  if (!A || !B || A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) if (!approxEqual(A[i], B[i], eps)) return false;
  return true;
}
function statesEquivalent(cur, prev) {
  if (!prev) return false;
  if (cur.hatx !== prev.hatx || cur.haty !== prev.haty) return false;
  if (!arraysApproxEqual(cur.axes, prev.axes)) return false;
  if (!arraysApproxEqual(cur.buttons, prev.buttons, 0.5)) return false; // buttons are 0/1; tolerate bounce
  if (!approxEqual(cur.trigL, prev.trigL) || !approxEqual(cur.trigR, prev.trigR)) return false;
  return true;
}

function waitForEmuMount(win, state, retries = 30) {
  if (!win || win.closed) throw new Error('Popup closed before bootstrapping');
  try {
    if (typeof win._emuMount === 'function') {
      win._emuMount(state);
      return;
    }
  } catch (_) {}

  if (retries <= 0) throw new Error('Timed out waiting for popup bootstrap');
  setTimeout(() => waitForEmuMount(win, state, retries - 1), 200);
}

export function launchEmulator(rom, button) {
  //basic guards
  if (!rom || typeof rom !== "string") throw new Error("[emulator] ROM is required");
  if (button && button.disabled) return;

  const originalText = button ? button.textContent : "";
  const resetUI = () => {
    if (button) { button.disabled = false; button.textContent = originalText; }
  };

  //single popup: reuse/focus a named window instead of _blank
  const features = "width=1200,height=800,scrollbars=yes,resizable=yes";
  let reused = false;
  try {
    if (!__emuWin || __emuWin.closed) {
      __emuWin = window.open("about:blank", "emuPopup", features);
    } else {
      reused = true;
      __emuWin.focus();
      try { __emuWin.location.replace("about:blank"); } catch {}
    }
  } catch {}
  if (!__emuWin) { alert("Popup blocked. Please allow popups for this site and try again."); return; }
  if (button) { button.disabled = true; button.textContent = "Launching…"; }

  //loader in popup
  function renderLoader(win, romName) {
    try {
      const d = win.document;
      d.open();
      d.write(`<!DOCTYPE html>
  <html><head><meta charset="utf-8"><title>Starting Emulator…</title>
  <style>
    html,body{height:100%}
    body{font-family:system-ui,sans-serif;background:#000;color:#fff;margin:0;padding:40px;text-align:center}
    .loading{background:#111;padding:30px;border-radius:8px;margin:50px auto;max-width:500px}
    .status{font-size:18px;margin:20px 0;color:#4CAF50}
    .rom-name{color:#FFC107;font-weight:bold}
    .spinner{border:3px solid #333;border-top:3px solid #4CAF50;border-radius:50%;width:30px;height:30px;animation:spin 1s linear infinite;margin:20px auto}
    @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
  </style></head>
  <body>
    <div class="loading">
      <h1>🎮 Starting Emulator</h1>
      <div class="rom-name">${romName || ""}</div>
      <div class="spinner"></div>
      <div id="status" class="status">Contacting server…</div>
    </div>
  </body></html>`);
      d.close();
    } catch {}
  }

  if (reused) {
    setTimeout(() => renderLoader(__emuWin, rom), 50); 
  } else {
    renderLoader(__emuWin, rom);
  }
  
  // inject popup bootstrap (_emuMount) with pad->parent postMessage (includes sid)
  (function installPopupBootstrap(w) {
	updateStatus("Contacting server…");
    const code = [
      "(function(){",
      "  function setText(id,t){var el=document.getElementById(id);if(el)el.textContent=t||'';}",

      "  // Exposed to parent: mounts VNC and starts gamepad client",
      "  window._emuMount = function(state){",
      "    try{",
      "      document.title='Emulator';",
      "      document.documentElement.style.cssText='height:100%';",
      "      document.body.style.cssText='margin:0;padding:0;background:#000;height:100%';",
	  "      try{ window.focus(); }catch(_){ }",
	  
	  "      // Minimal chrome (status + iframe + debug HUD)",
	  "      document.body.innerHTML =",
	  "        \"<div id=\\\"wrap\\\" style=\\\"position:fixed;inset:0;display:flex;flex-direction:column;background:#000;\\\">\" +",
	  "        \"  <div id=\\\"bar\\\" style=\\\"font-family:system-ui,sans-serif;color:#bbb;background:#111;padding:6px 10px;font-size:12px;display:flex;gap:12px;align-items:center;z-index:2147483647;\\\">\" +",
	  "        \"    <span>🎮 Controller:</span>\" +",
	  "        \"    <span id=\\\"gp-status\\\" style=\\\"width:8px;height:8px;border-radius:50%;background:#666;display:inline-block;\\\"></span>\" +",
	  "        \"    <span id=\\\"gp-msg\\\"></span>\" +",
	  "        \"  </div>\" +",
	  "        \"  <iframe id=\\\"vnc-frame\\\" src=\\\"\\\" allow=\\\"clipboard-read; clipboard-write\\\" style=\\\"border:0;flex:1;width:100%;height:100%\\\"></iframe>\" +",
	  "        \"</div>\" +",
	  "        \"<div id=\\\"gp-debug\\\" style=\\\"position:fixed;right:8px;top:30px;color:#888;font:11px/1.2 system-ui;white-space:pre;z-index:2147483648;pointer-events:none;\\\"></div>\";",
	  
      "      // Wire VNC src",
      "      var v=document.getElementById('vnc-frame'); ",
	  "        if (v) {",
	  "           setTimeout(function(){ v.setAttribute('src', state.vncUrl); }, 500);",
	  "        }",
	  
      "      // --- Gamepad client (popup -> parent relay; steady heartbeat) ---",
      "      var DEADZONE=0.12, HEARTBEAT_MS=200;",
	  
	  "      function seedActive(){",
	  "        var pads=(navigator.getGamepads&&navigator.getGamepads())||[];",
	  "        for (var i=0;i<pads.length;i++){ if(pads[i]){ ACTIVE_IDX=i; return; } }",
	  "      }",
	  "      seedActive();",
	  "      function dz(x){ return Math.abs(x)<DEADZONE ? 0 : x; }",
	  
	  "      // Make sure we light up when a controller arrives late",
	  "      window.addEventListener('gamepadconnected', function(e){",
	  "        try{ ACTIVE_IDX = (e && e.gamepad) ? e.gamepad.index : ACTIVE_IDX; setMsg('pad detected'); setDot(true); }catch(_){}",
	  "      });",
	  "      window.addEventListener('gamepaddisconnected', function(e){",
	  "        try{ if(e && e.gamepad && e.gamepad.index===ACTIVE_IDX){ ACTIVE_IDX = -1; setMsg('pad removed'); } }catch(_){}",
	  "      });",

	  "      var msg=document.getElementById('gp-msg'), dbg=document.getElementById('gp-debug');",
	  "      function setMsg(t){ if(msg) msg.textContent=t||''; }",
	  "      function setDot(on){ var d=document.getElementById('gp-status'); if(d) d.style.background = on ? '#4CAF50' : '#666'; }",
	  "      function setDbg(t){ try{ if(dbg){ dbg.textContent = t||''; } }catch(e){ console.error('[emulator] dbg write failed', e); } }",
	  "      if(!dbg){ console.warn('[emulator] gp-debug not found yet'); }",
	  
	  "      function same(a,b){",
	  "        if(!b) return false;",
	  "        var eps=0.02, beps=0.5;",
	  "        function eq(x,y,e){ x=x||0; y=y||0; return Math.abs(x-y)<=e; }",
	  "        function arrEq(A,B,e){ if(!A||!B||A.length!==B.length) return false; for(var i=0;i<A.length;i++){ if(!eq(+A[i],+B[i],e)) return false; } return true; }",
	  "        if(a.hatx!==b.hatx || a.haty!==b.haty) return false;",
	  "        if(!arrEq(a.axes,b.axes,eps)) return false;",
	  "        if(!arrEq(a.buttons,b.buttons,beps)) return false;",
	  "        if(!eq(a.trigL,b.trigL,eps) || !eq(a.trigR,b.trigR,eps)) return false;",
	  "        return true;",
	  "      }",

	  "      function buildState(){",
	  "        var pads=(navigator.getGamepads&&navigator.getGamepads())||[];",
	  "        var gp = null;",
	  "        if (ACTIVE_IDX>=0 && pads[ACTIVE_IDX]) { gp = pads[ACTIVE_IDX]; }",
	  "        else { for (var i=0;i<pads.length;i++){ if(pads[i]){ gp=pads[i]; ACTIVE_IDX=i; break; } } }",
	  "        if(!gp) return null;",
	  "        var axes=[], raw=[], i;",
	  "        for(i=0;i<4 && i<gp.axes.length;i++) axes.push(dz(gp.axes[i]));",
	  "        for(i=0;i<gp.buttons.length;i++){ var b=gp.buttons[i]; raw.push(b && (b.pressed || (typeof b.value==='number' && b.value>0.5)) ? 1 : 0); }",
	  "        var up=raw[12]||0,down=raw[13]||0,left=raw[14]||0,right=raw[15]||0;",
	  "        var hatx=(right?1:0)-(left?1:0), haty=(down?1:0)-(up?1:0);",
	  "        var trigL=(gp.buttons[6]&&typeof gp.buttons[6].value==='number')?gp.buttons[6].value:0;",
	  "        var trigR=(gp.buttons[7]&&typeof gp.buttons[7].value==='number')?gp.buttons[7].value:0;",
	  "        // Standard indices WITHOUT LT/RT in buttons: A,B,X,Y, LB,RB, SELECT,START, L3,R3",
	  "        var buttons=[ (raw[0]||0),(raw[1]||0),(raw[2]||0),(raw[3]||0), (raw[4]||0),(raw[5]||0), (raw[8]||0),(raw[9]||0), (raw[10]||0),(raw[11]||0) ];",
	  "        return { t:Date.now(), id:'gp-0', axes:axes, buttons:buttons, hatx:hatx, haty:haty, trigL:trigL, trigR:trigR, map: gp.mapping || 'unknown' };",
	  "      }",

      "      var last=null, lastSendTs=0, acked=false, sendTimer=0;",
      "      function startSending(){ if(sendTimer) clearInterval(sendTimer); sendTimer=setInterval(sendState,33); }", // ~30 Hz
      "      function stopSending(){ if(sendTimer){ clearInterval(sendTimer); sendTimer=0; } }",

      "      function sendState(){",
      "        var s=buildState(); if(!s) return;",
      "        setDbg('idx:'+ACTIVE_IDX+'  map:'+(s.map||'n/a')+'  hat:'+s.hatx+','+s.haty+'  trig:'+s.trigL.toFixed(2)+','+s.trigR.toFixed(2)+'\\nbtn:'+s.buttons.join(''));",
      "        if(!acked){ acked=true; setMsg('pad detected'); setDot(true); }",
      "        var now=s.t, changed=!same(s,last), due=(now-lastSendTs)>=HEARTBEAT_MS;",
	  "        if (!acked) { /* no-op */ } else {",
	  "          // if we’ve been polling but buttons/axes never change for ~2s, rescan once",
	  "          if (last && (s.t - last.t) > 2000) { seedActive(); }",
	  "        }",
      "        if(changed || due){",
      "          try{ if(window.opener){ window.opener.postMessage({ type:'emu:pad', sid: state.sid, payload:s }, '*'); last=s; lastSendTs=now; } }catch(_){ }",
      "        }",
      "      }",

      "      // Pause loop when hidden; resume when visible",
      "      document.addEventListener('visibilitychange', function(){",
      "         /* keep sending even when hidden; popup must stay live */",
      "      });",

      "      // If the opener disappears, stop sending",
      "      var openerCheck=setInterval(function(){",
      "        if(!window.opener){ try{ setMsg('parent closed'); setDot(false);}catch(_){} stopSending(); clearInterval(openerCheck); }",
      "      },1000);",

      "      // Start the 30 Hz loop",
      "      startSending();",

      "      // Popup-side cleanup: notify backend; container handles full teardown",
      "      window.addEventListener('beforeunload', function(){",
      "        try { postCleanup(state.vncPort || 0); } catch(_) {}",
      "      });",

      "    }catch(err){ console.error('[emulator] _emuMount failed:', err); setText('status','Error loading emulator.'); }",
      "  };",
      "})();"
    ].join("\n");

	  try {
	    const s = w.document.createElement('script');
	    s.textContent = code;
	    w.document.body.appendChild(s);
	  } catch (e) {
	    console.error('[emulator] bootstrap inject failed', e);
	  }
	})(__emuWin);

  updateStatus("Loading emulator interface…");

  // kick-off emulator
  fetch("/emulator/launch?rom=" + encodeURIComponent(rom), {
    method: "POST",
    credentials: "same-origin",
    headers: (() => {
      const m = (document.cookie || "").match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/);
      return m ? { "X-XSRF-TOKEN": decodeURIComponent(m[1]) } : {};
    })(),
    cache: "no-store",
  })
  .then(async (res) => {
    updateStatus("Server responded, parsing response…");
    if (!res.ok) throw new Error("Launch failed: HTTP " + res.status);
    const response = await res.json();
    if (response.error) throw new Error(response.error);

    const vncUrl     = response.vncUrl;
    const audioUrl   = response.audioUrl;
    const gamepadUrl = response.gamepadUrl || "";
    if (!vncUrl)  throw new Error("Backend returned no vncUrl");
    if (!audioUrl) throw new Error("Backend returned no audioUrl");

    const vncPort = extractPortFromUrl(vncUrl);
	const knownPort = vncPort || 0;
    // assign new session id; only this sid is accepted by forwarder
    const sid = ++__emuSession;
    __currentSid = sid;

	function openParentGamepadWS(url) {
	  try { __gpWS = new WebSocket(url); }
	  catch (e) { console.error("[parent-gp] ctor failed", url, e); __gpWS = null; return; }
	  __gpWS.onopen  = () => console.log("[parent-gp] connected", url);
	  __gpWS.onerror = (err) => console.error("[parent-gp] error", err);
	  __gpWS.onclose = (ev)  => console.warn("[parent-gp] closed", ev?.code, ev?.reason);
	}
	
    // start audio
    updateStatus("Starting audio…");
    try { await playWsWebmOpus(audioUrl); updateStatus("Audio connected! Loading game…"); }
    catch (e) { console.error("[emulator] Audio connection failed:", e); updateStatus("Audio error — continuing without sound…"); }

    // parent-side gamepad WS + guarded forwarder
    // Close prior WS and forwarder if present (avoid duplicates)
    try { if (__gpWS) __gpWS.close(); } catch {}
    try { if (__gpForwarder) window.removeEventListener("message", __gpForwarder); } catch {}

	if (!window.__gpForwarder) {
	  window.__gpForwarder = (evt) => {
	    try {
	      if (evt.source !== __emuWin) return;             // only our popup
	      const m = evt?.data;
	      if (!m || m.type !== "emu:pad" || !m.payload) return;
	      if (m.sid !== __currentSid) return;              // ignore stale sessions
	      if (__gpWS && __gpWS.readyState === WebSocket.OPEN) {
	        __gpWS.send(JSON.stringify(m.payload));
	      }
	    } catch (e) {
	      console.error("[parent-gp] forward error:", e);
	    }
	  };
	}
	
	window.addEventListener("message", window.__gpForwarder, { passive: true });
	
	if (gamepadUrl) {
	  openParentGamepadWS(gamepadUrl);
	}

    // mount popup when bootstrap is ready
    updateStatus("Mount popup bootstrap…");
    let tries = 0; const maxTries = 30; // ~6s
    const iv = setInterval(() => {
      try {
        if (__emuWin && typeof __emuWin._emuMount === "function") {
          clearInterval(iv);
          __emuWin._emuMount({ vncUrl, gamepadUrl, vncPort: vncPort || 0, sid }); // pass sid for tagging
        } else if (++tries > maxTries) {
          clearInterval(iv);
          console.error("[emulator] Timed out waiting for popup bootstrap");
        }
      } catch (err) {
        clearInterval(iv);
        console.error("[emulator] popup mount error:", err);
      }
    }, 200);
	
	
    // parent-side cleanup (on popup close or page unload)
    if (vncPort) {
		let done = false;
		const cleanup = () => {
		  if (done) return; done = true;
		  try { window.__emuAudioWS && window.__emuAudioWS.close(); } catch {}
		  try { if (window.__emuAudioEl) { window.__emuAudioEl.pause(); window.__emuAudioEl.src = ""; } } catch {}
		  try { if (__gpWS) __gpWS.close(); } catch {}
		  try { if (__gpForwarder) window.removeEventListener("message", __gpForwarder); } catch {}
		  try { __currentSid = 0; } catch {}
		  // resilient post + keepalive
		  postCleanup(knownPort);
		};

		// de-dupe any previous watch from an older sid
		if (__emuCleanupWatch) { try { clearInterval(__emuCleanupWatch); } catch {} __emuCleanupWatch = null; }

		// always set a parent heartbeat that watches the popup
		__emuCleanupWatch = setInterval(() => {
		  try {
		    if (!__emuWin || __emuWin.closed) {
		      clearInterval(__emuCleanupWatch);
		      __emuCleanupWatch = null;
		      cleanup();
		    }
		  } catch {
		    // If we lose access, assume closed and cleanup
		    clearInterval(__emuCleanupWatch);
		    __emuCleanupWatch = null;
		    cleanup();
		  }
		}, 1000);

		// keep parent/tab unload cleanup, using beacon
		try { window.addEventListener("beforeunload", cleanup); } catch {}
    }

    resetUI();
  })
  .catch((err) => {
    console.error("[emulator] Launch error:", err);
    try {
      __emuWin.document.body.innerHTML = `
        <div style="font-family:system-ui;background:#000;color:#fff;padding:40px;text-align:center;">
          <div style="background:#222;padding:30px;border-radius:8px;margin:50px auto;max-width:500px;">
            <h1 style="color:#f44336;">Emulator Failed to Start</h1>
            <div style="color:#ff9800;margin:20px 0;font-weight:bold;">${rom}</div>
            <div style="margin:20px 0;">${err.message}</div>
            <button onclick="window.close()" style="background:#4CAF50;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-size:16px;">
              Close Window
            </button>
          </div>
        </div>`;
    } catch { alert("Emulator error: " + err.message); try { __emuWin.close(); } catch {} }
    resetUI();
  });
}

/*  emulator audio player — MAIN window only (stable) */
function playWsWebmOpus(wsUrl) {
  const mime = 'audio/webm; codecs="opus"';
  if (!window.MediaSource || !MediaSource.isTypeSupported(mime)) {
    console.warn('[emulator] MediaSource or Opus not supported');
    return Promise.reject(new Error('MediaSource/Opus not supported'));
  }

  // Create/reuse a hidden audio element in MAIN window
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

  return new Promise((resolve, reject) => {
    const preQueue = [];
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    window.__emuAudioWS = ws;
    window.__emuAudioEl = audio;

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) { resolved = true; reject(new Error('Audio WebSocket connection timeout')); }
    }, 10000);

    ws.onerror = (err) => {
      console.error('[emulator] Audio WebSocket error:', err);
      if (!resolved) { resolved = true; clearTimeout(timeoutId); reject(new Error('Audio WebSocket connection failed')); }
    };

    ws.onmessage = (e) => { preQueue.push(new Uint8Array(e.data)); };

    ms.addEventListener('sourceopen', () => {
      const sb = ms.addSourceBuffer(mime);
      try { sb.mode = 'sequence'; } catch {}
      const queue = preQueue;
      const pump = () => {
        if (queue.length && !sb.updating && ms.readyState === 'open') sb.appendBuffer(queue.shift());
      };
      sb.addEventListener('updateend', pump);
      ws.onmessage = (e) => { queue.push(new Uint8Array(e.data)); pump(); };

      pump();
      audio.muted = false; audio.volume = 1.0;
      audio.play().catch(e => console.warn('[emulator] Audio play failed (interaction required?):', e));
      clearTimeout(timeoutId); if (!resolved) { resolved = true; resolve(); }
    });
  });
}

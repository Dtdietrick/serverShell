<script>
(function () {
  const ENABLED  = (window.CLIENT_LOGGING_ENABLED !== false); 
  const ENDPOINT = "/client-log"; 
  const MAX_LEN  = 2000;
  if (!ENABLED) return;

  const orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: (console.debug || console.log).bind(console),
  };

  function toStr(x) {
    if (x instanceof Error) return x.stack || x.message || String(x);
    if (typeof x === "object") { try { return JSON.stringify(x); } catch { return "[object]"; } }
    return String(x);
  }

  function post(level, args) {
    try {
      const message = args.map(toStr).join(" ");
      const body = JSON.stringify({
        level,
        message: message.length > MAX_LEN ? message.slice(0, MAX_LEN) : message,
        user: window.CURRENT_USER || null,
        path: location.pathname,
        meta: null
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "include" })
          .catch(()=>{});
      }
    } catch (_) {}
  }

  console.log   = (...a) => { orig.log(...a);   post("INFO",  a); };
  console.info  = (...a) => { orig.info(...a);  post("INFO",  a); };
  console.warn  = (...a) => { orig.warn(...a);  post("WARN",  a); };
  console.error = (...a) => { orig.error(...a); post("ERROR", a); };
  console.debug = (...a) => { orig.debug(...a); post("DEBUG", a); };
})();
</script>
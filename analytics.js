/* Midad anonymous, privacy-conscious visit measurement */
(() => {
  "use strict";
  const PROJECT_URL = "https://dheazidcgmvjauchesey.supabase.co";
  const PUBLIC_KEY = "sb_publishable_eI6CH_F8ThW5qFpkVMEGbA_GMDis66s";
  const ENDPOINT = PROJECT_URL + "/functions/v1/track-visitor";
  const SESSION_KEY = "midad_analytics_session_v1";
  if (location.hostname !== "midaad.space" && location.hostname !== "www.midaad.space") return;

  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY) || "";
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(sessionId)) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (_) {
    sessionId = crypto.randomUUID();
  }

  const deviceType = matchMedia("(max-width: 640px)").matches
    ? "mobile"
    : matchMedia("(max-width: 1024px)").matches ? "tablet" : "desktop";

  const send = (eventName, keepalive = false) => {
    const payload = {
      session_id: sessionId,
      event_name: eventName,
      page_path: location.pathname || "/",
      referrer: document.referrer || "",
      device_type: deviceType
    };
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": PUBLIC_KEY },
      body: JSON.stringify(payload),
      keepalive
    }).catch(() => {});
  };

  send("page_view");
  const heartbeat = setInterval(() => {
    if (!document.hidden) send("heartbeat");
  }, 20000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) send("page_exit", true);
    else send("heartbeat");
  });

  window.addEventListener("pagehide", () => {
    clearInterval(heartbeat);
    send("page_exit", true);
  }, { once: true });
})();

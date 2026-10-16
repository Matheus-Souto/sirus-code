// Sirus Code service worker (ADR-082, ADR-084): shows alerts the Mac pushes and
// opens their conversation when tapped. It also keeps the app shell, so the
// home-screen app opens (and says it is reconnecting) when the Mac is out of reach
// instead of showing a blank page. The Mac stays the source: pages are fetched
// from it first; API calls are never cached.
const SHELL = "sirus-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(SHELL)).put("/", response.clone());
        return response;
      } catch {
        return (await caches.match("/")) ?? Response.error();
      }
    })());
    return;
  }
  // Built files carry a content hash in their name, so a stored copy never goes stale.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/pwa/") || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(SHELL)).put(request, response.clone());
      return response;
    })());
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
  // The Mac sends how many conversations need the person with session alerts (ADR-124);
  // the app icon shows it. Browsers without the Badging API skip this quietly.
  const badge = Number.isInteger(data.badge) && data.badge >= 0 ? Math.min(data.badge, 999) : null;
  if (badge !== null && "setAppBadge" in self.navigator) {
    const update = badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge ? self.navigator.clearAppBadge() : self.navigator.setAppBadge(0);
    event.waitUntil(Promise.resolve(update).catch(() => undefined));
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Sirus Code";
  const body = typeof data.body === "string" ? data.body : "";
  const group = data.group && typeof data.group.kind === "string" && typeof data.group.label === "string" ? data.group : null;
  event.waitUntil(show(title, body, sessionId, group));
});

/** Alerts of one kind from other conversations still on screen (or an earlier summary). */
const GROUP_WINDOW_MS = 30 * 60 * 1000;

/**
 * One alert per conversation (its tag replaces the earlier one quietly). When alerts of the
 * same kind from other conversations are still on screen, they fold into one summary:
 * "3 conversas concluídas" with the conversations listed under it.
 */
async function show(title, body, sessionId, group) {
  const options = { icon: "/pwa/icon-192.png", badge: "/pwa/icon-192.png" };
  if (!group) return self.registration.showNotification(title, { ...options, body, tag: sessionId || undefined, data: { sessionId } });
  const now = Date.now();
  const shown = await self.registration.getNotifications();
  const entries = [];
  for (const notification of shown) {
    const info = notification.data || {};
    if (info.kind !== group.kind || now - (info.at || 0) > GROUP_WINDOW_MS) continue;
    for (const entry of info.entries || [{ sessionId: info.sessionId, title: notification.title }]) {
      if (entry.sessionId !== sessionId && !entries.some((known) => known.sessionId === entry.sessionId)) entries.push(entry);
    }
    notification.close();
  }
  if (!entries.length) {
    return self.registration.showNotification(title, { ...options, body, tag: sessionId || undefined, data: { sessionId, kind: group.kind, at: now } });
  }
  const all = [{ sessionId, title }, ...entries].slice(0, 20);
  return self.registration.showNotification(`${all.length} ${group.label}`, {
    ...options,
    body: all.slice(0, 5).map((entry) => entry.title).join(" · ") + (all.length > 5 ? " …" : ""),
    tag: `group:${group.kind}`,
    // Tapping the summary opens Home, where those conversations wait.
    data: { sessionId: "", kind: group.kind, at: now, entries: all },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const sessionId = event.notification.data && event.notification.data.sessionId;
  const url = sessionId ? `/?session=${encodeURIComponent(sessionId)}` : "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if (sessionId) client.postMessage({ type: "open-session", sessionId });
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

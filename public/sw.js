// La Cueva — portal service worker.
// Handles PWA installability and web-push notifications.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Minimal fetch handler (network passthrough) — its presence keeps the app
// installable on browsers that require a fetch handler.
self.addEventListener("fetch", () => {});

// ── Push ────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "La Cueva", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "La Cueva";
  const options = {
    body: data.body || "",
    icon: "/icons/portal-192.png",
    badge: "/icons/portal-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/portal/hoy" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal/hoy";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          if (client.url.includes("/portal") && "focus" in client) {
            client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});

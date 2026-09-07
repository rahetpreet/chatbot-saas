/**
 * Service worker for lead notifications.
 *
 * Kept deliberately small: it exists only to show a notification when the
 * server pushes one, and to focus the dashboard when the agent taps it. The
 * browser runs this even when the panel is closed, which is the whole point —
 * a lead that arrives overnight still reaches the phone.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "New lead", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "New lead", {
      body: payload.body || "A visitor left their details.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Tagging by lead means a retry replaces the old notification instead of
      // stacking duplicates for the same person.
      tag: payload.tag || "lead",
      data: { url: payload.url || "/leads" },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/leads";

  // Focus an already-open dashboard rather than piling up tabs.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});

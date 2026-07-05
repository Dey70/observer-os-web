// Cache versioning: bump CACHE_NAME (e.g. "observer-os-cache-v2") whenever a
// deploy changes cached assets significantly. The activate handler below
// deletes any cache that doesn't match the current name, so old versions
// never stick around and serve stale content.
const CACHE_NAME = "observer-os-cache-v1";

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      caches.keys().then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      }),
      clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || Promise.reject("no-cache-match");
        });
      }),
  );
});

self.addEventListener("push", function (event) {
  let data = { title: "Observer OS", body: "You have a new notification." };
  try {
    if (event.data) data = event.data.json();
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      tag: data.tag || "observer-os",
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(function (clientList) {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow("/checkin");
    }),
  );
});

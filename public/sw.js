// Cache versioning: bump CACHE_NAME (e.g. "observer-os-cache-v3") whenever a
// deploy changes cached assets significantly. The activate handler below
// deletes any cache that doesn't match the current name, so old versions
// never stick around and serve stale content. Bumped to v2 here to flush
// out any 404 responses an earlier version of this file may have cached
// (see the fetch handler below — it used to cache every response
// including error ones, which could permanently wedge a client on a
// now-deleted JS chunk hash after a deploy, showing a blank screen).
const CACHE_NAME = "observer-os-cache-v2";

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

  // Navigation requests (the HTML document itself) never fall back to a
  // cached copy while online. A cached HTML shell from a previous deploy
  // references JS/CSS chunk filenames that are hashed per-build — once a
  // new deploy replaces those files, the old hashes 404 forever, and a
  // client stuck on that stale shell renders a blank white screen with no
  // visible error. Cache fallback here is a last resort for genuinely
  // offline launches only.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(request);
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(function (response) {
        // Only cache successful responses — caching a 404/500 (e.g. a
        // chunk hash that no longer exists post-deploy) would keep
        // serving that failure forever instead of self-healing on the
        // next successful network fetch.
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, responseClone);
          });
        }
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

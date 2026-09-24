// PWA service worker.
//
// Page loads (navigations) are network-first: after a redeploy the app
// opens on the new version immediately, and only falls back to the cached
// page when offline. Serving the cached page first would open every
// redeploy one launch late.
//
// Everything else (Next's content-hashed JS/CSS, icons, worklet and worker
// bundles) is stale-while-revalidate: instant from cache, refreshed in the
// background. Hashed filenames change per build, so there's no precache
// list to maintain — assets are cached as they're first requested.
const CACHE_NAME = "cuepoint-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheResponse(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});

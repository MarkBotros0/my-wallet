// Bump this version to invalidate the cached app shell on next load.
const CACHE_NAME = "wallet-v2";
const SHELL_ASSETS = ["/", "/icons/wallet-logo-192.png", "/icons/wallet-logo-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Network-first for API calls and navigation, cache only as an offline
  // fallback. Everything the user CHANGES (transactions, settings) must show
  // its fresh copy first — a stale response would let an edit appear not to
  // have taken. Nothing here is served stale-while-revalidate today; if a
  // read-only, whole-dataset endpoint ever earns it, add it deliberately.
  //
  // INVARIANT: every backend route keeps the "/api/" path prefix so this
  // substring match works even if the API moves to another origin.
  if (request.url.includes("/api/") || request.mode === "navigate") {
    // An explicit user refresh carries `fresh=`. Such a request must reach the
    // network and must NOT be cached — otherwise every refresh leaves another
    // one-shot entry behind.
    const isExplicitRefresh = request.url.includes("fresh=");

    const revalidate = fetch(request)
      .then((response) => {
        // Only cache what we could serve back. Caching a 401 or a 500 would
        // leave the worker replaying an error page offline.
        if (response && response.ok && request.method === "GET" && !isExplicitRefresh) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => undefined);

    event.respondWith(revalidate.then((r) => r || caches.match(request)));
    return;
  }

  // Cache-first for static assets
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

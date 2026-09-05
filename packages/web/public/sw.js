// Minimal service worker: enough for installability and an offline app shell.
// API and WebSocket traffic always go to the network, never the cache.

// Bump this on any sw.js change: the activate handler deletes every cache that isn't the current
// one, so a version bump purges stale entries on update.
const CACHE = "wherever-v4";
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache realtime / API traffic.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) return;
  if (request.method !== "GET") return;

  // Navigations: network first, and refresh the cached shell so an offline return visit gets the
  // most recent shell instead of the one frozen at first install.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only a good response. Caching a 500 here freezes the error page as the offline shell.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(SHELL);
          // respondWith(undefined) is a network error, not a fallback. First visit offline lands here.
          return (
            hit ??
            new Response("Offline, and nothing cached yet.", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
    return;
  }

  /*
   * Static assets: serve the cached copy, then quietly replace it for next time.
   *
   * Cache-first alone was wrong for everything in public/ that has no content hash in its name --
   * og.png, the icons, the teaser photos. Those keep their URL when their contents change, so a
   * cached copy was kept until somebody remembered to bump CACHE by hand. Vite's hashed bundles do
   * not care either way: their URL changes, so the revalidation is a cheap miss.
   */
  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        // A failed revalidation must not become the answer when a cached copy exists.
        .catch(() => hit);
      return hit ?? fresh;
    }),
  );
});

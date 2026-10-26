// Minimal service worker: enough for installability and an offline app shell.
// API and WebSocket traffic always go to the network, never the cache.

// Clear older shells and asset entries when the caching boundaries change.
const CACHE = "wherever-v5";
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
  if (request.cache === "no-store") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache realtime / API traffic.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) return;
  if (request.method !== "GET") return;

  // Shared room and share-target responses cannot replace the public offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only a good response. Caching a 500 here freezes the error page as the offline shell.
          if (url.pathname === SHELL && res.ok && res.headers.get("content-type")?.includes("text/html")) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(SHELL, copy)));
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

  // Fingerprinted bundles are immutable; stable icons and photos refresh in the background.
  const immutable = url.pathname.startsWith("/assets/") && /-[\w-]{8,}\./.test(url.pathname);
  event.respondWith(
    caches.match(request).then((hit) => {
      if (immutable && hit) return hit;
      const fresh = fetch(request, immutable ? undefined : { cache: "no-cache" })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
        // A failed revalidation must not become the answer when a cached copy exists.
        .catch(() => hit);
      event.waitUntil(fresh.then(() => undefined));
      return hit ?? fresh;
    }),
  );
});

// Minimal service worker: enough for installability and an offline app shell.
// API and WebSocket traffic always go to the network, never the cache.

// Clear older shells and asset entries when the caching boundaries change.
const CACHE = "wherever-v8";
const SHELL_VERSION = 3;
const SHELL_CACHE = `${CACHE}-shell-v${SHELL_VERSION}`;
const SHELL = "/";
const LEGAL = new Set(["/privacy", "/terms"]);
const MAX_ASSETS = 48;
let shellWrite = Promise.resolve();

async function storeShell(response) {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Could not fetch the app shell");
  }
  const html = await response.clone().text();
  // Cloudflare can serve the previous HTML while the new worker is already available.
  if (!html.includes(`name="wherever-offline-shell" content="${SHELL_VERSION}"`)) return false;
  // The HTML declares Vite’s entry assets and the logo used by the offline screens.
  const paths = [
    ...new Set(
      Array.from(html.matchAll(/\s(?:src|href)="(\/assets\/[\w.-]+|\/icon\.svg)"/g), ([, path]) => path),
    ),
  ];
  if (!paths.some((path) => path.endsWith(".js"))) throw new Error("Missing the app entry script");

  const cache = await caches.open(SHELL_CACHE);
  const cached = await Promise.all(paths.map((path) => cache.match(path)));
  const missing = paths.filter((_, index) => !cached[index]);
  if (missing.length) await cache.addAll(missing);
  // Publish the new HTML only once its assets are available, and keep them outside runtime eviction.
  await cache.put(SHELL, response);
  const current = new Set([SHELL, ...paths]);
  const obsolete = (await cache.keys()).filter((entry) => !current.has(new URL(entry.url).pathname));
  // A tab that just received the previous HTML can still request its assets during an update.
  const excess = Math.max(0, obsolete.length + paths.length - MAX_ASSETS);
  await Promise.all(obsolete.slice(0, excess).map((entry) => cache.delete(entry)));
  return true;
}

async function installShell() {
  for (const delay of [0, 1000, 3000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (await storeShell(await fetch(SHELL, { cache: "no-store" }))) return;
  }
  throw new Error("Matching offline shell is not available yet");
}

async function storeAsset(request, response) {
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
  const assets = (await cache.keys()).filter(
    (entry) => new URL(entry.url).pathname !== SHELL && !LEGAL.has(new URL(entry.url).pathname),
  );
  await Promise.all(
    assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map((entry) => cache.delete(entry)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("wherever-") && k !== CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
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
    const path = url.pathname.replace(/\.html$/, "");
    const legal = LEGAL.has(path);
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only a good response. Caching a 500 here freezes the error page as the offline shell.
          if (
            (url.pathname === SHELL || legal) &&
            res.ok &&
            res.headers.get("content-type")?.includes("text/html")
          ) {
            const copy = res.clone();
            if (legal) {
              event.waitUntil(caches.open(CACHE).then((c) => c.put(path, copy)));
            } else {
              shellWrite = shellWrite.then(() => storeShell(copy)).catch(() => undefined);
              event.waitUntil(shellWrite);
            }
          }
          return res;
        })
        .catch(async () => {
          if (legal) {
            const page = await caches.match(path);
            return (
              page ??
              new Response(
                '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline | Wherever</title><main><h1>You’re offline</h1><p>Reconnect and reload to read this page.</p><a href="/">Back to Wherever</a></main></html>',
                { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
              )
            );
          }
          const hit = await caches.match(SHELL, { cacheName: SHELL_CACHE });
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
            event.waitUntil(storeAsset(request, copy));
          }
          return res;
        })
        // A failed revalidation must not become the answer when a cached copy exists.
        .catch(() => hit ?? new Response(null, { status: 503 }));
      event.waitUntil(fresh.then(() => undefined));
      return hit ?? fresh;
    }),
  );
});

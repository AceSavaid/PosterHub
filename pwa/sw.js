// PosterHub service worker: makes the web app open and work with no internet.
// The build (pwa/plugin.ts) replaces the two placeholders below with a version
// hash and the list of every built file, so each release gets a fresh cache.
// Not registered in the desktop app, which already has everything on disk.
const VERSION = '__POSTERHUB_VERSION__';
const PRECACHE = __POSTERHUB_PRECACHE__;
const APP_CACHE = `posterhub-app-${VERSION}`;
// Fonts survive app updates, so a poster keeps its typefaces offline.
const FONT_CACHE = 'posterhub-fonts-v1';
const FONT_CACHE_LIMIT = 300;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(scopeUrl(p), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('posterhub-app-') && key !== APP_CACHE) await caches.delete(key);
      }
      // Take over the page that installed us, so it works offline without a reload.
      await self.clients.claim();
    })(),
  );
});

// The page asks a waiting update to take over when the person clicks "Reload".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

function isFontRequest(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@fontsource/'))
  );
}

async function trimFonts(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - FONT_CACHE_LIMIT; i++) await cache.delete(keys[i]);
}

async function fromNetworkAndStore(request, cacheName) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (cacheName === FONT_CACHE) trimFonts(cache);
  }
  return response;
}

// Font files never change at a given URL: use the saved copy when there is one.
async function cacheFirst(request) {
  const hit = await caches.match(request, { cacheName: FONT_CACHE });
  if (hit) return hit;
  try {
    return await fromNetworkAndStore(request, FONT_CACHE);
  } catch {
    return Response.error();
  }
}

// Google Fonts CSS can change: answer from the cache at once, refresh it in the background.
async function staleWhileRevalidate(event) {
  const hit = await caches.match(event.request, { cacheName: FONT_CACHE });
  const refresh = fromNetworkAndStore(event.request, FONT_CACHE).catch(() => Response.error());
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return refresh;
}

async function appFile(request) {
  const cache = await caches.open(APP_CACHE);
  // Every page of the app is index.html (the rest lives after the #).
  const key = request.mode === 'navigate' ? scopeUrl('index.html') : request;
  // ignoreVary: dev/preview servers send "Vary: Origin", and module scripts are fetched with an Origin header.
  const hit = await cache.match(key, { ignoreSearch: request.mode === 'navigate', ignoreVary: true });
  if (hit) return hit;
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.href.startsWith(self.registration.scope)) event.respondWith(appFile(request));
    return;
  }
  if (!isFontRequest(url)) return; // DOI lookups etc. go straight to the network.
  event.respondWith(url.hostname === 'fonts.googleapis.com' ? staleWhileRevalidate(event) : cacheFirst(request));
});

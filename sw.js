// Service worker: precaches the app shell, then serves everything network-first
// with a cache fallback. Network-first keeps authored packs fresh while online;
// the cache makes the whole thing (including every pack the app has fetched)
// work offline once installed.
//
// Other apps share this origin, so the worker only touches caches under its own
// CACHE_PREFIX and only handles requests inside its own scope.

const VERSION = 'v6';
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `rya:${SCOPE.pathname}:`;
const CACHE = `${CACHE_PREFIX}${VERSION}`;
// Caches from before the prefix included the scope ('rya-v1' … 'rya-v4').
const isLegacy = (k) => /^rya-v\d+$/.test(k);
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/book.js',
  'js/engine.js',
  'js/markdown.js',
  'js/parser.js',
  'js/store.js',
  'js/sports/index.js',
  'js/sports/common.js',
  'js/sports/bjj.js',
  'js/sports/fencing.js',
  'css/sports/bjj.css',
  'css/sports/fencing.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'packs/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith(CACHE_PREFIX) || isLegacy(k)) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // 'no-cache' revalidates past the long max-age Cloudflare stamps on scripts.
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('index.html');
      throw err;
    }
  })());
});

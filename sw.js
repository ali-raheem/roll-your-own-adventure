// Service worker: precaches the app shell, then serves everything network-first
// with a cache fallback. Network-first keeps authored packs fresh while online;
// the cache makes the whole thing (including every pack the app has fetched)
// work offline once installed.

const CACHE = 'rya-v3';
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
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
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

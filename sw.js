// Offline support. Online: always fetch fresh files (so a new push shows up
// right away) and refresh the cache. Offline: serve the cached copy.
// Bump VERSION when you add or rename files below.

const VERSION = 'kustom-audio-v1';

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/audio.js',
  'js/store.js',
  'js/ui.js',
  'js/screen.js',
  'js/tools/kustom.js',
  'js/tools/reverse.js',
  'js/tools/dj.js',
  'fonts/bricolage-grotesque.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const fresh = await fetch(request);
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(request, { ignoreSearch: true }))
        ?? (request.mode === 'navigate' ? cache.match('./') : Response.error());
    }
  })());
});

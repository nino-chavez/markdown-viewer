// Build replaces these values with a content version and an exact app-file list.
const CACHE = 'markdown-viewer-__VERSION__';
const FILES = __FILES__;
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
const allowed = new Set(urls);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
  // Do not skipWaiting: an update must not reload a session containing documents.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('markdown-viewer-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  // Only the build's public app files enter Cache Storage. Never cache documents,
  // arbitrary URLs, query strings, POST bodies, or resources from another origin.
  if (event.request.method !== 'GET' || !allowed.has(event.request.url)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)));
});

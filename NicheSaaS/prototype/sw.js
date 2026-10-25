/* Cache the shell so the app opens in a mechanical room with no signal.
 *
 * Shell only — never inspection data. Captured media lives in IndexedDB, which
 * survives independently and is not something a cache eviction may drop.
 */

const SHELL = 'attest-shell-v1';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache the draft endpoint: a stale draft on a compliance document is
  // worse than an honest failure the queue will retry.
  if (url.pathname.endsWith('/api/draft')) return;

  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() =>
      caches.match('index.html')))
  );
});

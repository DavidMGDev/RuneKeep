/**
 * RuneKeep service worker (v0.24.4). Web only; it never reaches the native app.
 *
 * It exists for two reasons.
 *
 * **Android will not install a real app without one.** Chrome only builds a WebAPK (its own icon, its
 * own window, no address bar) for a site that registers a service worker with a `fetch` handler. With
 * a manifest alone, "Add to Home screen" makes a plain bookmark that opens in a browser tab, which is
 * exactly what it looked like was happening.
 *
 * **The table has bad wifi.** Once the app has been opened, everything it needs is on the device, so
 * it starts without a connection.
 *
 * The caching rule is the part worth getting right, because the failure mode of getting it wrong is a
 * player stuck on an old build with no way to know:
 *
 * - **Navigations and code: network first.** A new deploy is picked up the moment it is reachable; the
 *   cache is only a fallback for when the network is not. This is deliberate. Stale HTML is how a
 *   browser ends up loading a JS bundle from a build that no longer exists.
 * - **Everything else (card art, fonts, sounds): cache first.** Those are content-hashed by the export
 *   or never change, and they are the 59 MB that makes a cold start slow.
 *
 * `CACHE` carries the app version, so a release drops every old cache on activate.
 */
const VERSION = '0.40.2';
const CACHE = `runekeep-${VERSION}`;

// The shell: enough to boot offline. Everything else is cached as it is requested.
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready; without this a player keeps the previous build
  // until every tab is closed, which for an installed app can be days.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Individually, so one 404 cannot fail the whole install.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Content-addressed or immutable: worth keeping, never worth revalidating. */
function isAsset(url) {
  return /\/assets\/|\/_expo\/static\/(?!js\/)|\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf|mp3|wav|m4a)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch third-party requests

  if (isAsset(url)) {
    // Cache first: serve instantly, fetch and store on a miss.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations, JS, JSON: network first, cache as a fallback for offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(request)) ?? (await caches.match('/index.html')) ?? Response.error()),
  );
});

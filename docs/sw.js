// Lightweight offline shell for the marketing site + catalog — NOT an
// attempt to cache the AniList/Supabase API responses (those already have
// their own sessionStorage cache in anilist.js and need to stay fresh).
// Bump the cache name whenever the precache list changes so old clients
// pick up the new shell instead of serving stale assets forever.
var CACHE_NAME = 'mangarecs-shell-v1';
var PRECACHE = [
  '/',
  '/catalog/',
  '/assets/base.css',
  '/assets/motion.css',
  '/assets/motion.js',
  '/assets/anilist.js',
  '/assets/auth.js',
  '/assets/nav-widgets.js',
  '/assets/badges.js',
  '/assets/fonts.css',
  '/assets/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let AniList/Supabase/CDN calls pass straight through

  if (req.mode === 'navigate') {
    // Network-first for HTML so signed-in state / live data stays current
    // when online; falls back to whatever shell page was last cached.
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) { return cached || caches.match('/'); });
      })
    );
    return;
  }

  // Stale-while-revalidate for static assets: instant from cache, then
  // quietly refreshed in the background for next time.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) caches.open(CACHE_NAME).then(function (cache) { cache.put(req, res.clone()); });
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

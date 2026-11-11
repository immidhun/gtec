/* G-TEC web app v2.0.0: works offline with the last loaded screens; always fetches fresh files when online. */
var CACHE = 'gtec-web-2.0.0';
var FILES = ["./", "config.js", "css/app.css", "css/manage.css", "fonts/Aspekta-400.woff2", "fonts/Aspekta-500.woff2", "fonts/Aspekta-600.woff2", "fonts/Aspekta-700.woff2", "fonts/Nippo-Bold.woff2", "fonts/Nippo-Medium.woff2", "fonts/Nippo-Regular.woff2", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "img/gtec-logo-card.png", "img/gtec-logo-mark.png", "index.html", "js/common.js", "js/demo.js", "js/director.js", "js/manage.js", "js/student.js", "js/display.js", "js/tutor.js", "manifest.webmanifest"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // server calls go straight to the network
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});

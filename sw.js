/* 日文單字測驗：離線快取（由 tools/gen_sw.py 自動產生，請勿手動修改） */
var CACHE = "jpquiz-e55598fefa07";
var ASSETS = [
 "./",
 "./index.html",
 "./manifest.webmanifest",
 "./css/app.css",
 "./icons/apple-touch-icon.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon-maskable-512.png",
 "./js/app.js",
 "./js/audio.js",
 "./js/bridge.js",
 "./js/importer.js",
 "./js/parser.js",
 "./js/quiz.js",
 "./js/store.js",
 "./lib/LICENSES.txt",
 "./lib/cmaps.json",
 "./lib/jszip.min.js",
 "./lib/pdf.min.js",
 "./lib/pdf.worker.min.js",
 "./lib/wanakana.min.js",
 "./lib/xlsx.full.min.js"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('jpquiz-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }, function (err) {
      if (req.mode === 'navigate') return caches.match('./index.html');
      throw err;
    });
  }));
});

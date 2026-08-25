// Service worker minimo: guarda a casca do app pra instalar como PWA.
// Nao faz cache de video (isso e ao vivo) nem do token.
const CACHE = "sala-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname === "/token") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("/"))));
});

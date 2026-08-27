// Service worker minimo: guarda a casca do app para instalacao como PWA.
// Midia ao vivo, tokens, controles de sala e arquivos temporarios nunca entram no cache.
const CACHE = "sala-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    "/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"
  ])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // API e conteudo efemero sempre sao rede pura. Em especial, nunca transformar
  // um POST que falhou em um index.html cacheado com status 200.
  if (request.method !== "GET"
    || url.pathname === "/token"
    || url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/shared/")) return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      // Only navigations may fall back to the cached application shell.
      // Returning index.html for a missing JS/CSS asset causes MIME errors and
      // a blank screen after an offline deploy or a stale service worker.
      if (request.mode === "navigate") {
        const shell = await caches.match("/");
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});

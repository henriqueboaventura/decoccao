importScripts("version.js");
// Nome do cache atrelado à versão do app: todo bump de versão troca o nome
// do cache e força o "activate" abaixo a descartar o cache antigo — não dá
// pra esquecer de "lembrar" de invalidar, como acontecia antes (ver
// CHANGELOG.md, item de correção do aviso de atualização).
const CACHE_VERSION = "decoccao-v" + APP_VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./version.js",
  "./app.js",
  "./app-core.js",
  "./methods.js",
  "./manifest.webmanifest",
  "./icons/favicon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

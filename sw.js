// Cazachollos · funciona sin conexión: la app se guarda en el móvil; los datos de la nube se piden siempre frescos.
const V = "cz-app-v1";
const SHELL = ["./", "index.html", "app.css", "app.js", "scanner.js", "seller.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname === "raw.githubusercontent.com") {
    // datos: primero red, si no hay conexión lo último guardado
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(V + "-data").then((c) => c.put(u.origin + u.pathname, cp)); return r; }).catch(() => caches.match(u.origin + u.pathname)));
    return;
  }
  if (u.origin === location.origin) {
    // app: rápido desde caché y se actualiza por detrás
    e.respondWith(caches.match(e.request).then((hit) => { const net = fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); } return r; }).catch(() => hit); return hit || net; }));
  }
});

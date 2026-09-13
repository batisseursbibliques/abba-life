const CACHE = "abba-life-v12";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./sync.js",
  "./firebase-config.js", "./manifest.json", "./logo.png",
  "./icon-192.png", "./icon-512.png",
];

// Installation : mettre tous les fichiers en cache immédiatement
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation : supprimer les anciens caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch : cache d'abord (hors ligne garanti), réseau en arrière-plan
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Firebase, Google APIs : réseau uniquement (pas de cache)
  if (url.hostname.includes("firebase") ||
      url.hostname.includes("googleapis") ||
      url.hostname.includes("gstatic") ||
      url.hostname.includes("firebaseio")) {
    return; // le navigateur gère directement
  }

  // Fichiers de l'app : cache d'abord, mise à jour réseau en arrière-plan
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(response => {
          if (response && response.status === 200 && response.type !== "opaque") {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);
        // Retourner le cache immédiatement si disponible, sinon attendre le réseau
        return cached || networkFetch;
      })
    )
  );
});

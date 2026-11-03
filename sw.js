const CACHE_NAME = "abba-life-v26";
const ASSETS = [
  "./", "./index.html", "./style.css", "./i18n.js", "./lang/en.json", "./bible.js", "./lecture.js", "./plans.js", "./voixNative.js", "./app.js", "./sync.js", "./firebase-config.js",
  "./manifest.json", "./logo.png", "./icon-192.png", "./icon-512.png",
  // Habillage commun (même adresse que l'accueil : l'image n'est téléchargée qu'une fois pour les trois apps)
  "/abba-batisseur/habillage.css", "/abba-batisseur/habillage.js", "/abba-batisseur/fond-accueil.webp",
  // Le SDK Firebase lui-même (fichiers statiques et versionnés) : indispensable pour que
  // l'app puisse même démarrer hors connexion, avant toute synchronisation.
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
];

// Le réseau d'abord (toujours la dernière version quand il y a du réseau, sans passer par le cache HTTP du téléphone),
// le cache en secours : hors ligne, ou si le réseau met plus de 6 secondes à répondre.
function reseauPuisCache(req, nomCache) {
  const cacheOuvert = caches.open(nomCache);
  const reseau = fetch(new Request(req, { cache: "no-cache" })).then((res) => {
    if (res && res.ok && res.type !== "opaque") { const copie = res.clone(); cacheOuvert.then((c) => c.put(req, copie)); }
    return res;
  });
  const secours = () => cacheOuvert.then((c) => c.match(req)).then((hit) => hit || reseau);
  const delai = new Promise((resolve) => setTimeout(() => resolve(secours()), 6000));
  return Promise.race([reseau.catch(secours), delai]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(ASSETS.map((u) => fetch(new Request(u, { cache: "reload" })).then((r) => (r.ok ? cache.put(u, r) : null)).catch(() => null)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Le SDK Firebase (fichiers statiques, versionnés dans l'adresse) : on le sert du cache
  // pour que l'app puisse démarrer même sans connexion.
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Les vraies requêtes Firebase (authentification, Firestore) doivent toujours
  // aller directement au réseau — jamais interceptées, jamais mises en cache.
  if (url.origin !== self.location.origin) return;

  // L'image du bandeau ne change pas : on la sert du cache sans jamais la retélécharger (forfaits limités).
  if (url.pathname === "/abba-batisseur/fond-accueil.webp") {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      if (res && res.ok) { const copie = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(event.request, copie)); }
      return res;
    })));
    return;
  }
  event.respondWith(reseauPuisCache(event.request, CACHE_NAME));
});

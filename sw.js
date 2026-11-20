// Police Management — service minimal : réseau d'abord (toujours revalidé), copie locale en secours hors ligne.
// Les appels à Supabase et aux autres sites ne sont jamais mis en cache.
const CACHE = "police-management-202611201203";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Vidéos : lues par morceaux (requêtes partielles), jamais mises en cache
  if (req.headers.has("range") || /\.(mp4|webm|mov)$/i.test(new URL(req.url).pathname)) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((rep) => {
        if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
        return rep;
      })
      .catch(() => caches.match(req))
  );
});

// Notifications : affichage et ouverture de la bonne section de l'app
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corps: e.data ? e.data.text() : "" }; }
  const titre = d.titre || "Police Management";
  e.waitUntil(Promise.all([
    self.registration.showNotification(titre, {
      body: d.corps || "",
      icon: "assets/icone-192.png",
      badge: "assets/badge-96.png", // silhouette blanche (barre d'état Android)
      image: d.image || undefined, // image de l'annonce (Android et ordinateur)
      lang: "fr-CA",
      timestamp: Date.now(),
      tag: d.tag || undefined,
      renotify: !!d.tag,
      requireInteraction: !!d.urgent, // annonce urgente : reste affichée jusqu'à ce qu'on la touche
      vibrate: d.urgent ? [300, 120, 300, 120, 300] : [120, 60, 120],
      actions: d.url && /^#annonce=/.test(d.url) ? [{ action: "ouvrir", title: "Lire l'annonce" }] : [],
      data: { url: d.url || "#accueil" },
    }),
    // Pastille de l'icône : seulement ce qui attend une action (demandes d'accès pour l'admin), sinon effacée
    self.navigator && self.navigator.setAppBadge
      ? (d.pastille > 0 ? self.navigator.setAppBadge(d.pastille) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve(),
  ]));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const cible = new URL("./" + (e.notification.data && e.notification.data.url || ""), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
    for (const f of fenetres) {
      if (f.url.startsWith(self.registration.scope)) { f.postMessage({ aller: e.notification.data && e.notification.data.url }); return f.focus(); }
    }
    return self.clients.openWindow(cible);
  }));
});

/* ============================================================
   PONT AVEC L'APPLICATION ANDROID « ABBA Parcours »
   Dans l'APK, la lecture à voix haute passe par un service Android de premier plan :
   elle continue quand on quitte l'application et quand l'écran s'éteint.
   Dans un navigateur ordinaire, ce fichier ne fait rien (la voix du navigateur est utilisée).
   ============================================================ */
export const estNatif = () => !!(typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.());

let plugin = null;
let ecouteurs = [];
// Les ordres envoyés au service (lire, pause) sont exécutés l'un après l'autre : une pause tardive ne coupe jamais une nouvelle lecture
let file = Promise.resolve();
const enFile = (op) => { const r = file.then(op, op); file = r.catch(() => {}); return r; };

const P = () => {
  if (!plugin) {
    const C = window.Capacitor;
    plugin = typeof C.registerPlugin === "function" ? C.registerPlugin("AbbaVoix") : C.Plugins?.AbbaVoix;
    if (!plugin) throw new Error("native voice module unavailable");
  }
  return plugin;
};

async function nettoyer() {
  const anciens = ecouteurs; ecouteurs = [];
  await Promise.all(anciens.map((h) => Promise.resolve().then(() => h?.remove?.()).catch(() => {})));
}

// textes : liste des morceaux à lire ; depuis : indice du premier ; langue : "fr" ou "en"
export function lireNatif({ textes, depuis = 0, vitesse = 1, titre = "ABBA Parcours", details = "", langue = "fr", onIndex, onFin, onPause, onReprise, onErreur }) {
  return enFile(async () => {
    await nettoyer();
    const p = P();
    const abonner = async (nom, f) => {
      try { const h = await p.addListener(nom, f); if (h) ecouteurs.push(h); } catch { /* évènement indisponible */ }
    };
    await abonner("index", (e) => onIndex?.(e.index));
    await abonner("fin", () => onFin?.());
    await abonner("pause", (e) => onPause?.(e.index));
    await abonner("reprise", (e) => onReprise?.(e.index));
    await abonner("erreur", (e) => onErreur?.(e.message));
    await p.lire({ textes, depuis, vitesse, titre, details, langue });
  });
}

// Arrête la lecture ; renvoie l'indice du morceau en cours (-1 si aucun)
export function pauseNatif() {
  return enFile(async () => {
    const r = await P().pause();
    await nettoyer();
    return r?.index ?? -1;
  });
}

// Ouvre les réglages Android pour ne pas limiter l'application (économie de batterie)
export const reglagesBatterie = () => P().batterie();

// État du service Android (lecture en cours, en pause, terminée) : sert à remettre l'affichage d'accord avec ce que le téléphone lit
export async function etatNatif() { try { return await P().etat(); } catch { return null; } }

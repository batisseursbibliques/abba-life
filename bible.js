import { estNatif, etatNatif, lireNatif, pauseNatif, reglagesBatterie } from "./voixNative.js";
/* ============================================================
   BIBLE — onglet « Bible » (ABBA Life, repris du Parcours Bâtisseur)
   Reprend ce qui existe dans ABBA Gestion : lecture, versions du domaine public
   (Louis Segond 1910, Perret-Gentil et Rilliet 1847, World English Bible, King James), lecture audio,
   recherche, références croisées, reprise de la lecture et lecture hors connexion.
   Les textes sont les fichiers du site : /bible/index.json, /bible/<version>/<NN>.json
   et /bible/xref/<NN>.json (Parcours est servi par le même domaine qu'ABBA Gestion).
   Aucune version protégée n'est utilisée ici : uniquement le domaine public.
   ============================================================ */

const BASE = "/bible";
const LIVRES = ["Genèse","Exode","Lévitique","Nombres","Deutéronome","Josué","Juges","Ruth","1 Samuel","2 Samuel","1 Rois","2 Rois","1 Chroniques","2 Chroniques","Esdras","Néhémie","Esther","Job","Psaumes","Proverbes","Ecclésiaste","Cantique des Cantiques","Ésaïe","Jérémie","Lamentations","Ézéchiel","Daniel","Osée","Joël","Amos","Abdias","Jonas","Michée","Nahum","Habacuc","Sophonie","Aggée","Zacharie","Malachie","Matthieu","Marc","Luc","Jean","Actes","Romains","1 Corinthiens","2 Corinthiens","Galates","Éphésiens","Philippiens","Colossiens","1 Thessaloniciens","2 Thessaloniciens","1 Timothée","2 Timothée","Tite","Philémon","Hébreux","Jacques","1 Pierre","2 Pierre","1 Jean","2 Jean","3 Jean","Jude","Apocalypse"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nn = (n) => String(n).padStart(2, "0");
const plat = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignoré */ } };

/* ---------- Langue de l'application (Français / English) : choisie dans les Réglages, lue via I18N ---------- */
const EN = () => window.I18N?.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const LIVRES_EN = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];

/* ---------- Stockage local (IndexedDB) : mêmes noms et mêmes clés qu'ABBA Gestion, donc les textes téléchargés sont partagés ---------- */
let ouverture = null;
function ouvrir() {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      const r = indexedDB.open("abba-bible", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }
  return ouverture;
}
const requete = (mode, f) => ouvrir().then((db) => new Promise((ok, ko) => {
  const r = f(db.transaction("kv", mode).objectStore("kv"));
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
}));
const lireLocal = (cle) => requete("readonly", (s) => s.get(cle)).catch(() => undefined);
const ecrireLocal = (cle, val) => requete("readwrite", (s) => s.put(val, cle)).then(() => true).catch(() => false);

/* ---------- Chargement des textes ---------- */
const msgPasTelecharge = () => T("Ce livre n'est pas encore sur le téléphone : ouvrez la Bible une fois avec du réseau (le téléchargement se fait seul).", "This book is not on your phone yet: open the Bible once with a network connection (it downloads by itself).");
let indexCache = null;
const livresCache = {};
const xrefCache = {};

let protegeesIds = new Set();
async function metasProtegees() {
  // Versions réservées que le PPV a rendues visibles aux Bâtisseurs ; la liste est gardée pour le hors connexion
  try {
    if (window.AbbaSync?.loadBibleMetas) { const l = await window.AbbaSync.loadBibleMetas(); ecrireLocal("metasProt", l); return l; }
  } catch { /* pas connecté ou pas de réseau */ }
  return (await lireLocal("metasProt")) || [];
}
async function chargerIndex() {
  if (indexCache) return indexCache;
  let base;
  try {
    base = await (await fetch(`${BASE}/index.json`)).json();
    ecrireLocal("index", base);
  } catch (err) {
    base = await lireLocal("index");
    if (!base) throw err;
  }
  const prot = await metasProtegees();
  protegeesIds = new Set(prot.map((m) => m.id));
  indexCache = { ...base, versions: [...base.versions, ...prot.filter((m) => !base.versions.some((v) => v.id === m.id))
    .map((m) => ({ id: m.id, nom: m.nom, langue: m.langue, licence: m.credit || m.licence || "", protegee: true }))] };
  return indexCache;
}
async function chargerLivre(version, numero) {
  const cle = `${version}/${numero}`;
  if (livresCache[cle]) return livresCache[cle];
  const local = await lireLocal(`s:${cle}`);
  if (local) { livresCache[cle] = local; return local; }
  if (protegeesIds.has(version)) {
    // Version réservée : le livre est lu dans la base (puis gardé sur le téléphone)
    let d;
    try { d = await window.AbbaSync.loadBibleLivre(`${version}_${nn(numero)}`); } catch { throw new Error(msgPasTelecharge()); }
    if (!d) throw new Error(T("Livre indisponible", "Book unavailable"));
    const out = [];
    Object.keys(d.chapitres || {}).forEach((k) => { out[Number(k) - 1] = d.chapitres[k]; });
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    livresCache[cle] = out; ecrireLocal(`s:${cle}`, out);
    return out;
  }
  let r;
  try { r = await fetch(`${BASE}/${version}/${nn(numero)}.json`); } catch { throw new Error(msgPasTelecharge()); }
  if (!r.ok) throw new Error(navigator.onLine === false ? msgPasTelecharge() : T("Livre indisponible", "Book unavailable"));
  livresCache[cle] = await r.json();
  ecrireLocal(`s:${cle}`, livresCache[cle]);
  return livresCache[cle];
}
async function chargerXref(numero) {
  if (xrefCache[numero]) return xrefCache[numero];
  const local = await lireLocal(`x2:${numero}`);
  if (local) { xrefCache[numero] = local; return local; }
  const r = await fetch(`${BASE}/xref/${nn(numero)}.json`);
  if (!r.ok) throw new Error(T("Références indisponibles", "Cross-references unavailable"));
  xrefCache[numero] = await r.json();
  ecrireLocal(`x2:${numero}`, xrefCache[numero]);
  return xrefCache[numero];
}
function lireRefXref(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(s);
  return m ? { livre: +m[1], chapitre: +m[2], verset: +m[3], fin: m[4] ? +m[4] : +m[3] } : null;
}

/* ---------- Lecture en arrière-plan (piste silencieuse + commandes de l'écran verrouillé) ---------- */
let elSilence = null;
let urlSilence = null;
function silence() {
  if (urlSilence) return urlSilence;
  const n = 8000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  urlSilence = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return urlSilence;
}
function arrierePlanDemarrer({ titre, details, onPause, onPrecedent, onSuivant }) {
  try {
    if (!elSilence) { elSilence = new Audio(silence()); elSilence.loop = true; }
    elSilence.play().catch(() => {});
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: titre, artist: "ABBA", album: details || "Bible" });
      navigator.mediaSession.playbackState = "playing";
      const poser = (nom, f) => { try { navigator.mediaSession.setActionHandler(nom, f || null); } catch { /* non pris en charge */ } };
      poser("pause", onPause); poser("stop", onPause); poser("previoustrack", onPrecedent); poser("nexttrack", onSuivant);
    }
  } catch { /* ignoré */ }
}
function arrierePlanTitre(titre, details) {
  try { if ("mediaSession" in navigator && elSilence && !elSilence.paused) navigator.mediaSession.metadata = new MediaMetadata({ title: titre, artist: "ABBA", album: details || "Bible" }); } catch { /* ignoré */ }
}
function arrierePlanArreter() {
  try {
    if (elSilence) elSilence.pause();
    if ("mediaSession" in navigator) { navigator.mediaSession.playbackState = "none"; navigator.mediaSession.metadata = null; }
  } catch { /* ignoré */ }
}

/* ---------- État ---------- */
const S = {
  pret: false,
  index: null,
  version: "lsg", livre: 43, chap: 1, verset: null,
  versets: [],
  xref: null,
  vue: "lire", // lire | chercher
  options: false,
  ecoute: false, enPause: false, courant: null, jeton: 0,
  vitesse: Number(lsGet("abba_bible_vitesse", "1")) || 1,
  enchainer: lsGet("abba_bible_enchainer", "oui") !== "non",
  ecranAllume: lsGet("abba_bible_ecran", "oui") !== "non",
  alerte: "",
  erreur: "",
  repriseAuto: false,
  verrou: null,
  dl: { phase: "inactif", fait: 0, total: 0, echecs: 0 },
  rech: { q: "", portee: "tout", exacte: false, phase: "attente", fait: 0, total: 0, res: [], trop: false, absents: 0, jeton: 0 },
};
const MAX_RESULTATS = 300;
const synthOk = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const infoV = () => (S.index?.versions || []).find((v) => v.id === S.version) || S.index?.versions?.[0];
const langueV = () => infoV()?.langue || "fr";
const audioOk = () => (synthOk() || estNatif()) && (langueV() === "fr" || langueV() === "en");
const nbChapitres = (l) => S.index?.chapitres?.[l - 1] || 1;
const nomLivre = (l) => (EN() ? LIVRES_EN : LIVRES)[l - 1] || "";

/* ---------- Reprise de la lecture : on retient où l'on en était ---------- */
function sauverPosition() {
  lsSet(EN() ? "abba_bible_ver_en" : "abba_bible_ver_fr", S.version);
  lsSet("abba_bible_pos", JSON.stringify({ version: S.version, l: S.livre, c: S.chap, v: S.verset || null }));
}
function lirePosition() {
  try { return JSON.parse(lsGet("abba_bible_pos", "null")); } catch { return null; }
}

/* ---------- Chargement d'un chapitre ---------- */
async function chargerChapitre() {
  S.erreur = "";
  const moi = ++chargementJeton;
  try {
    const ch = await chargerLivre(S.version, S.livre);
    if (moi !== chargementJeton) return;
    S.versets = ch[S.chap - 1] || [];
  } catch (e) {
    if (moi !== chargementJeton) return;
    S.versets = [];
    S.erreur = e?.message || T("Ce texte n'est pas disponible pour le moment.", "This text is not available right now.");
  }
  rendreTexte();
  rendreNav();
  if (S.repriseAuto && S.versets.length) { S.repriseAuto = false; lire(0); }
  chargerXref(S.livre).then((x) => { if (S.livre === livreXrefAttendu) { S.xref = x; rendreTexte(); } }).catch(() => {});
}
let chargementJeton = 0;
let livreXrefAttendu = 0;

function aller(l, c, v = null, { garderLecture = false } = {}) {
  if (!garderLecture) arreter();
  if (l !== S.livre) { S.xref = null; livreXrefAttendu = l; }
  S.livre = l; S.chap = c; S.verset = v;
  if (garderLecture) S.courant = null;
  sauverPosition();
  rendreBarre();
  chargerChapitre().then(() => {
    if (v) $(`bv${v}`)?.scrollIntoView({ block: "center" });
    else window.scrollTo({ top: 0 });
  });
}
function precedent() {
  if (S.chap > 1) aller(S.livre, S.chap - 1);
  else if (S.livre > 1) aller(S.livre - 1, nbChapitres(S.livre - 1));
}
function suivant(opts) {
  if (S.chap < nbChapitres(S.livre)) aller(S.livre, S.chap + 1, null, opts);
  else if (S.livre < 66) aller(S.livre + 1, 1, null, opts);
}
function changerVersion(id) {
  arreter();
  S.version = id;
  sauverPosition();
  chargerChapitre();
  rendreBarre();
}

/* ---------- Lecture audio (synthèse vocale de l'appareil, gratuite) ---------- */
function attendreVoix() {
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    if (synth.getVoices().length) { resolve(synth.getVoices()); return; }
    let fini = false;
    const fin = () => { if (fini) return; fini = true; synth.removeEventListener("voiceschanged", fin); resolve(synth.getVoices()); };
    synth.addEventListener("voiceschanged", fin);
    setTimeout(fin, 1500);
  });
}
let ctxNatif = null; // lecture native en cours (sert à se remettre d'accord avec le service Android)
function arreter() {
  S.jeton += 1;
  ctxNatif = null;
  if (synthOk()) window.speechSynthesis.cancel();
  if (estNatif() && (S.ecoute || S.enPause)) pauseNatif().catch(() => {});
  const etait = S.ecoute;
  S.ecoute = false; S.courant = null; S.enPause = false;
  arrierePlanArreter();
  verrouLiberer();
  if (etait) { rendreBarre(); majSurbrillance(); }
  majMini();
}
// Pause : on arrête, mais on retient le verset atteint pour reprendre exactement à cet endroit
function pause() {
  const reste = S.courant;
  arreter();
  if (reste) { S.verset = reste; S.enPause = true; sauverPosition(); rendreBarre(); majSurbrillance(); majMini(); }
}
// Application Android : les versets restants sont confiés au service de lecture (continue écran éteint, application quittée)
async function lireBibleNatif(depuis, liste, livre, chap, titre, details) {
  S.jeton += 1;
  const moi = S.jeton;
  S.ecoute = true; S.enPause = false; S.alerte = "";
  rendreBarre(); majMini();
  const ctx = { moi, dec: 0, fin: null, finFait: false };
  ctxNatif = ctx;
  const finDuChapitre = () => {
    if (moi !== S.jeton || ctx.finFait) return;
    ctx.finFait = true;
    const aSuivre = chap < nbChapitres(livre) || livre < 66;
    if (S.enchainer && aSuivre) { S.repriseAuto = true; suivant({ garderLecture: true }); } else arreter();
  };
  ctx.fin = finDuChapitre;
  if (!liste.some((t) => t)) { finDuChapitre(); return; }
  // Au début d'un chapitre, la voix annonce « Marc, chapitre 2 » (le premier morceau n'est pas un verset)
  const annonce = depuis === 0 ? [T(`${nomLivre(livre)}, chapitre ${chap}.`, `${nomLivre(livre)}, chapter ${chap}.`)] : [];
  const dec = annonce.length;
  ctx.dec = dec;
  try {
    await lireNatif({
      textes: [...annonce, ...liste], depuis, vitesse: S.vitesse, titre, details, langue: langueV() === "en" ? "en" : "fr",
      onIndex: (k) => {
        if (moi !== S.jeton) return;
        const i = k - dec;
        if (i < 0) return;
        S.courant = i + 1; S.verset = i + 1;
        sauverPosition(); majMiniTitre(); majSurbrillance();
        $(`bv${i + 1}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      },
      onFin: finDuChapitre,
      onReprise: () => { // bouton « Lecture » de la notification : la lecture reprend
        if (S.jeton !== moi + 1) return;
        S.jeton = moi; S.ecoute = true; S.enPause = false;
        rendreBarre(); majSurbrillance(); majMini();
      },
      onPause: (i) => { // pause demandée depuis la notification Android
        if (moi !== S.jeton) return;
        const reste = i >= 0 ? Math.max(i - dec, 0) + 1 : S.courant;
        S.jeton += 1; S.ecoute = false; S.courant = null;
        if (reste) { S.verset = reste; S.enPause = true; sauverPosition(); }
        rendreBarre(); majSurbrillance(); majMini();
      },
      onErreur: (m) => { S.alerte = m; rendreBarre(); majMini(); },
    });
  } catch (e) { S.alerte = (e && e.message) || ""; S.ecoute = false; rendreBarre(); majMini(); }
}
// Application Android : à chaque retour au premier plan (et toutes les 1,5 s tant qu'elle est visible), on se remet
// d'accord avec le service de lecture. Utile quand la lecture est mise en pause ou reprise depuis la notification
// pendant que l'application est en arrière-plan : l'affichage suit ce que le téléphone lit vraiment.
async function synchroNatif() {
  if (!estNatif() || document.visibilityState !== "visible") return;
  const c = ctxNatif;
  if (!c) return;
  const e = await etatNatif();
  if (!e || ctxNatif !== c) return;
  if (e.lecture) {
    if (S.jeton === c.moi + 1) { S.jeton = c.moi; S.ecoute = true; S.enPause = false; rendreBarre(); majSurbrillance(); majMini(); }
    if (S.jeton === c.moi && e.index >= c.dec) {
      const v = e.index - c.dec + 1;
      if (S.courant !== v) {
        S.courant = v; S.verset = v; sauverPosition(); majMiniTitre(); majSurbrillance();
        $(`bv${v}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  } else if (e.enPause) {
    if (S.jeton === c.moi) {
      S.jeton += 1; S.ecoute = false; S.courant = null;
      if (e.reprise >= 0) { S.verset = Math.max(e.reprise - c.dec, 0) + 1; S.enPause = true; sauverPosition(); }
      rendreBarre(); majSurbrillance(); majMini();
    }
  } else if (e.termine && S.jeton === c.moi) {
    c.fin?.();
  }
}
document.addEventListener("visibilitychange", synchroNatif);
setInterval(synchroNatif, 1500);

async function lire(depuis) {
  if (!audioOk() || !S.versets.length) return;
  window.dispatchEvent(new Event("abba:voix-bible")); // les leçons lues à voix haute s'arrêtent
  const liste = S.versets;
  const livre = S.livre, chap = S.chap;
  const titre = `${nomLivre(livre)} ${chap}`;
  const details = infoV()?.nom || "Bible";
  if (estNatif()) { await lireBibleNatif(depuis, liste, livre, chap, titre, details); return; }
  // doit être lancé tout de suite, pendant le geste de l'utilisateur
  arrierePlanDemarrer({
    titre, details,
    onPause: () => pause(),
    onSuivant: () => lire(Math.min(S.courant ?? 0, liste.length - 1)),
    onPrecedent: () => lire(Math.max((S.courant ?? 1) - 2, 0)),
  });
  verrouPrendre();
  window.speechSynthesis.cancel();
  S.jeton += 1;
  const moi = S.jeton;
  const langue = langueV() === "en" ? "en" : "fr";
  S.ecoute = true; S.enPause = false; S.alerte = "";
  rendreBarre();
  majMini();
  const voixDispo = await attendreVoix();
  if (moi !== S.jeton) return;
  const voix = voixDispo.find((v) => (v.lang || "").toLowerCase().replace("_", "-").startsWith(langue));
  S.alerte = voixDispo.length > 0 && !voix ? T(`Aucune voix ${langue === "fr" ? "française" : "anglaise"} n'est installée sur cet appareil : la lecture peut être impossible ou dans une autre langue.`, `No ${langue === "fr" ? "French" : "English"} voice is installed on this device: playback may be impossible or in another language.`) : "";
  rendreBarre();
  const finDuChapitre = () => {
    if (moi !== S.jeton) return;
    const aSuivre = chap < nbChapitres(livre) || livre < 66;
    if (S.enchainer && aSuivre) { S.repriseAuto = true; suivant({ garderLecture: true }); } else arreter();
  };
  const aLire = [];
  for (let i = depuis; i < liste.length; i++) if (liste[i]) aLire.push(i);
  if (!aLire.length) { finDuChapitre(); return; }
  if (depuis === 0) { // annonce du chapitre avant le premier verset
    const ua = new SpeechSynthesisUtterance(T(`${nomLivre(livre)}, chapitre ${chap}.`, `${nomLivre(livre)}, chapter ${chap}.`));
    ua.lang = langue === "fr" ? "fr-FR" : "en-GB";
    if (voix) ua.voice = voix;
    ua.rate = S.vitesse;
    window.speechSynthesis.speak(ua);
  }
  // Tous les versets restants sont mis en file d'attente d'un coup : la voix peut continuer même si l'écran s'éteint
  aLire.forEach((i, k) => {
    const u = new SpeechSynthesisUtterance(liste[i]);
    u.lang = langue === "fr" ? "fr-FR" : "en-GB";
    if (voix) u.voice = voix;
    u.rate = S.vitesse;
    u.onstart = () => {
      if (moi !== S.jeton) return;
      S.courant = i + 1; S.verset = i + 1;
      sauverPosition();
      arrierePlanTitre(`${titre}, verset ${i + 1}`, details);
      majMiniTitre();
      majSurbrillance();
      $(`bv${i + 1}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    u.onend = () => { if (k === aLire.length - 1) finDuChapitre(); };
    u.onerror = (e) => { if (moi === S.jeton && e.error !== "interrupted" && e.error !== "canceled") arreter(); };
    window.speechSynthesis.speak(u);
  });
}

/* ---------- Lecteur flottant (même apparence que celui des leçons), visible sur tous les onglets ---------- */
const titreMini = () => `📖 ${nomLivre(S.livre)} ${S.chap}${S.courant || S.verset ? ` · v. ${S.courant || S.verset}` : ""}`;
function miniHtml() {
  return `<button type="button" class="tts-mini-t" data-bm="aller" title="${T("Revenir au texte lu", "Back to the text being read")}">${esc(titreMini())} ↗</button>
    <button class="tts-btn" data-bm="${S.ecoute ? "pause" : "reprendre"}" aria-label="${S.ecoute ? T("Pause", "Pause") : T("Reprendre", "Resume")}">${S.ecoute ? "⏸" : "▶"}</button>
    <button class="tts-btn" data-bm="stop" aria-label="${T("Arrêter", "Stop")}">⏹</button>
    <select class="tts-rate" data-bm="vitesse" aria-label="${T("Vitesse", "Speed")}">${[[0.8, T("Lent", "Slow")], [1, T("Normal", "Normal")], [1.25, T("Rapide", "Fast")]].map(([v, l]) => `<option value="${v}"${S.vitesse === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    ${"wakeLock" in navigator ? `<button class="tts-btn ${S.ecranAllume ? "on" : ""}" data-bm="ecran" aria-label="${T("Garder l'écran allumé", "Keep the screen on")}" title="${T("Garder l'écran allumé", "Keep the screen on")}">☀</button>` : ""}
    ${S.alerte ? `<span class="tts-mini-m">${esc(S.alerte)}</span>` : ""}`;
}
function miniEvent(e) {
  const b = e.target.closest("[data-bm]");
  if (!b) return;
  const a = b.dataset.bm;
  if (a === "aller") {
    if (e.type !== "click") return;
    document.querySelector('.tab[data-tab="bible"]')?.click();
    setTimeout(() => $(`bv${S.courant || S.verset || 1}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
    return;
  }
  if (a === "vitesse") {
    if (e.type !== "change") return;
    S.vitesse = Number(b.value) || 1; lsSet("abba_bible_vitesse", String(S.vitesse));
    if (S.ecoute) lire((S.courant || 1) - 1); else rendreOptions();
    return;
  }
  if (e.type !== "click") return;
  if (a === "pause") pause();
  else if (a === "reprendre") lire((S.verset || 1) - 1);
  else if (a === "stop") { arreter(); rendreBarre(); }
  else if (a === "ecran") {
    S.ecranAllume = !S.ecranAllume; lsSet("abba_bible_ecran", S.ecranAllume ? "oui" : "non");
    if (S.ecranAllume && S.ecoute) verrouPrendre(); else if (!S.ecranAllume) verrouLiberer();
    rendreOptions(); majMini();
  }
}
function majMini() {
  const visible = S.ecoute || S.enPause;
  let el = $("bibMini");
  if (!el) {
    if (!visible) return;
    el = document.createElement("div");
    el.id = "bibMini"; el.className = "tts-mini";
    el.addEventListener("click", miniEvent);
    el.addEventListener("change", miniEvent);
    document.body.appendChild(el);
  }
  el.hidden = !visible;
  if (visible) el.innerHTML = miniHtml();
}
function majMiniTitre() {
  const t = document.querySelector("#bibMini .tts-mini-t");
  if (t) t.textContent = `${titreMini()} ↗`;
}

/* ---------- Écran gardé allumé pendant la lecture audio ---------- */
async function verrouPrendre() {
  if (!("wakeLock" in navigator) || !S.ecranAllume || S.verrou) return;
  try { S.verrou = await navigator.wakeLock.request("screen"); S.verrou.addEventListener("release", () => { S.verrou = null; }); } catch { /* refusé */ }
}
function verrouLiberer() { if (S.verrou) { S.verrou.release().catch(() => {}); S.verrou = null; } }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !S.ecoute) return;
  verrouPrendre();
  // Navigateur : si le téléphone a coupé la voix (écran éteint, application quittée), la lecture reprend au verset où elle s'était arrêtée
  if (!estNatif() && synthOk() && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) lire(Math.max((S.courant || S.verset || 1) - 1, 0));
});

/* ---------- Téléchargement pour la lecture hors connexion ---------- */
async function telechargerTout() {
  const dl = S.dl;
  if (dl.phase === "encours") return;
  if (navigator.onLine === false) { dl.phase = "partiel"; rendreOptions(); return; }
  Object.assign(dl, { phase: "encours", fait: 0, total: 0, echecs: 0 });
  try { navigator.storage?.persist?.(); } catch { /* ignoré */ }
  const taches = [];
  for (const v of S.index.versions.filter((x) => !x.protegee)) for (let n = 1; n <= 66; n++) taches.push({ cle: `s:${v.id}/${n}`, url: `${BASE}/${v.id}/${nn(n)}.json` });
  for (let n = 1; n <= 66; n++) taches.push({ cle: `x2:${n}`, url: `${BASE}/xref/${nn(n)}.json` });
  dl.total = taches.length;
  rendreOptions();
  let pos = 0;
  const ouvrier = async () => {
    while (pos < taches.length) {
      const t = taches[pos++];
      try {
        if ((await lireLocal(t.cle)) === undefined) {
          const r = await fetch(t.url);
          if (!r.ok) throw new Error("absent");
          await ecrireLocal(t.cle, await r.json());
        }
      } catch { dl.echecs += 1; }
      dl.fait += 1;
      if (dl.fait % 6 === 0) rendreOptions();
    }
  };
  await Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier()]);
  dl.phase = dl.echecs ? "partiel" : "pret";
  rendreOptions();
}

/* ---------- Rendu ---------- */
function racine() { return $("bibleRoot"); }
function squelette() {
  racine().innerHTML = `
    <div class="bib-onglets">
      <button class="bib-onglet" data-bib="vue-lire">📖 ${T("Lire", "Read")}</button>
      <button class="bib-onglet" data-bib="vue-chercher">🔍 ${T("Rechercher", "Search")}</button>
      <button class="bib-onglet" data-bib="vue-plan">📅 ${T("Mes plans", "My plans")}</button>
    </div>
    <div id="bibLire">
      <div id="bibBarre" class="bib-barre"></div>
      <div id="bibTexte" class="bib-texte"></div>
      <div id="bibNav" class="bib-nav"></div>
      <p class="small bib-credit" id="bibCredit"></p>
    </div>
    <div id="bibChercher" hidden></div>
    <div id="bibPlan" hidden></div>`;
  majOnglets();
}
function majOnglets() {
  racine().querySelectorAll(".bib-onglet").forEach((b) => b.classList.toggle("active", b.dataset.bib === `vue-${S.vue === "lire" ? "lire" : S.vue === "plan" ? "plan" : "chercher"}`));
  $("bibLire").hidden = S.vue !== "lire";
  $("bibChercher").hidden = S.vue !== "chercher";
  if ($("bibPlan")) $("bibPlan").hidden = S.vue !== "plan";
}
function optionsSelect(liste, courant) {
  return liste.map(([val, lib]) => `<option value="${esc(val)}"${String(val) === String(courant) ? " selected" : ""}>${esc(lib)}</option>`).join("");
}
function rendreBarre() {
  const el = $("bibBarre");
  if (!el || !S.index) return;
  const v = infoV();
  const nb = nbChapitres(S.livre);
  const audio = audioOk();
  const versetsOpts = S.versets.map((t, i) => (t ? [i + 1, `v. ${i + 1}`] : null)).filter(Boolean);
  const bouton = !audio ? "" : (!S.ecoute
    ? `<button class="btn-primary btn-compact" data-bib="ecouter">▶ ${S.verset && S.verset > 1 ? T(`Reprendre v. ${S.verset}`, `Resume v. ${S.verset}`) : T("Écouter", "Listen")}</button>`
    : `<button class="btn-danger btn-compact" data-bib="pause">⏸ ${T("Pause", "Pause")}</button>`);
  el.innerHTML = `
    <div class="bib-grille2">
      <select data-bib="version" aria-label="${T("Version", "Version")}">${optionsSelect(S.index.versions.map((x) => [x.id, x.nom]), v?.id)}</select>
      <select data-bib="livre" aria-label="${T("Livre", "Book")}">${optionsSelect((EN() ? LIVRES_EN : LIVRES).map((n, i) => [i + 1, n]), S.livre)}</select>
    </div>
    <div class="bib-ligne">
      <select data-bib="chap" aria-label="${T("Chapitre", "Chapter")}">${optionsSelect(Array.from({ length: nb }, (_, i) => [i + 1, `${T("Chap.", "Ch.")} ${i + 1}`]), S.chap)}</select>
      <select data-bib="verset" aria-label="${T("Verset", "Verse")}"><option value="">${T("Verset…", "Verse…")}</option>${optionsSelect(versetsOpts, S.courant ?? S.verset ?? "")}</select>
      ${bouton}
      <button class="btn-secondary btn-compact" data-bib="options" aria-label="${T("Options", "Options")}">⚙️</button>
    </div>
    <div id="bibOptions" class="bib-options" ${S.options ? "" : "hidden"}></div>
    ${S.alerte ? `<p class="small bib-alerte">${esc(S.alerte)}</p>` : ""}
    ${!audio ? `<p class="small">${synthOk() ? T("La lecture audio n'est pas disponible pour cette langue.", "Audio reading is not available for this language.") : T("La lecture audio n'est pas disponible sur ce navigateur.", "Audio reading is not available on this browser.")}</p>` : ""}`;
  rendreOptions();
  const c = $("bibCredit");
  if (c && v) c.textContent = `${v.nom} — ${EN() && /domaine public/i.test(v.licence) ? "Public domain" : v.licence}. ${T("Références croisées", "Cross-references")} : OpenBible.info (CC-BY).`;
}
function rendreOptions() {
  const el = $("bibOptions");
  if (!el) return;
  el.hidden = !S.options;
  if (!S.options) { el.innerHTML = ""; return; }
  const dl = S.dl;
  const pct = dl.total ? Math.min(100, Math.round((dl.fait / dl.total) * 100)) : 0;
  const statut = dl.phase === "encours" ? T(`En cours… ${pct} %`, `In progress… ${pct} %`)
    : dl.phase === "pret" ? T("✓ Toutes les Bibles sont sur ce téléphone", "✓ All Bibles are on this phone")
    : dl.phase === "partiel" ? T("Téléchargement incomplet : réessayez avec du réseau", "Download incomplete: try again with a network connection") : "";
  el.innerHTML = `
    <label class="bib-opt">${T("Vitesse", "Speed")}
      <select data-bib="vitesse">${optionsSelect([[0.8, T("Lente", "Slow")], [1, T("Normale", "Normal")], [1.25, T("Rapide", "Fast")]], S.vitesse)}</select>
    </label>
    <label class="bib-opt"><input type="checkbox" data-bib="enchainer" ${S.enchainer ? "checked" : ""}> <span>${T("Enchaîner les chapitres automatiquement", "Continue to the next chapter automatically")}</span></label>
    ${"wakeLock" in navigator ? `<label class="bib-opt"><input type="checkbox" data-bib="ecran" ${S.ecranAllume ? "checked" : ""}> <span>${T("Garder l'écran allumé pendant l'écoute", "Keep the screen on while listening")}</span></label>` : ""}
    ${estNatif() ? `<div class="bib-opt"><button class="btn-secondary btn-compact" data-bib="batterie">🔋 ${T("Lecture écran éteint : régler la batterie", "Screen-off reading: battery settings")}</button></div>` : ""}
    <div class="bib-opt"><button class="btn-secondary btn-compact" data-bib="telecharger" ${dl.phase === "encours" ? "disabled" : ""}>⬇️ ${T("Télécharger les Bibles (lecture sans réseau, environ 16 Mo)", "Download the Bibles (read offline, about 16 MB)")}</button> <span class="small">${esc(statut)}</span></div>`;
}
function rendreTexte() {
  const el = $("bibTexte");
  if (!el) return;
  if (S.erreur) { el.innerHTML = `<p class="bib-alerte">${esc(S.erreur)}</p>`; return; }
  const cx = S.xref?.[S.chap] || {};
  el.innerHTML = `<h3>${esc(nomLivre(S.livre))} ${S.chap}</h3>` + (S.versets.length ? S.versets.map((t, i) => (!t ? "" : `
    <p class="bib-verset" id="bv${i + 1}" data-v="${i + 1}"><sup>${i + 1}</sup>${esc(t)}${cx[i + 1]?.length ? ` <button type="button" class="bib-xref" data-x="${i + 1}" aria-label="${T("Références croisées", "Cross-references")}">🔗 ${cx[i + 1].length}</button>` : ""}</p>`)).join("") : `<p class="small">${T("Chargement…", "Loading…")}</p>`);
  majSurbrillance();
}
function majSurbrillance() {
  document.querySelectorAll("#bibTexte .bib-verset").forEach((p) => {
    const n = Number(p.dataset.v);
    p.classList.toggle("actif", S.courant === n || (!S.ecoute && S.verset === n));
  });
  const sel = racine()?.querySelector('select[data-bib="verset"]');
  if (sel) sel.value = String(S.courant ?? S.verset ?? "");
}
function rendreNav() {
  const el = $("bibNav");
  if (!el) return;
  el.innerHTML = `<button class="btn-secondary btn-compact" data-bib="precedent">${T("← Précédent", "← Previous")}</button><button class="btn-primary btn-compact" data-bib="suivant">${T("Suivant →", "Next →")}</button>`;
}

/* ---------- Références croisées ---------- */
async function texteDeReference(ref, version = S.version) {
  try {
    const livre = await chargerLivre(version, ref.livre);
    const dernier = ref.chapFin && ref.chapFin > ref.chapitre ? ref.chapFin : ref.chapitre;
    const multi = ref.fin > ref.verset || dernier > ref.chapitre;
    const blocs = [];
    let total = 0;
    for (let c = ref.chapitre; c <= dernier; c++) {
      const vs = livre[c - 1] || [];
      const debut = c === ref.chapitre ? ref.verset : 1;
      const fin = c === dernier ? Math.min(ref.fin, vs.length) : vs.length;
      const lignes = [];
      for (let v = debut; v <= fin && total < 400; v++) if (vs[v - 1]) { lignes.push(multi ? `${v} ${vs[v - 1]}` : vs[v - 1]); total++; }
      if (lignes.length) blocs.push(dernier > ref.chapitre ? `${nomLivre(ref.livre)} ${c}\n${lignes.join(" ")}` : lignes.join(" "));
    }
    return blocs.join("\n\n");
  } catch { return ""; }
}
function ouvrirReferences(verset) {
  const refs = (S.xref?.[S.chap]?.[verset] || []).map((s) => ({ s, r: lireRefXref(s) })).filter((x) => x.r);
  if (!refs.length) return;
  fermerPanneau();
  const libelle = (r) => `${nomLivre(r.livre)} ${r.chapitre}:${r.verset}${r.fin > r.verset ? `–${r.fin}` : ""}`;
  const fond = document.createElement("div");
  fond.className = "bib-fond"; fond.id = "bibPanneau"; fond.setAttribute("role", "dialog"); fond.setAttribute("aria-label", T("Références croisées", "Cross-references"));
  let nb = 15;
  const textes = {};
  const dessiner = () => {
    fond.innerHTML = `<div class="bib-feuille">
      <div class="bib-feuille-tete"><strong>${T("Références croisées", "Cross-references")} · ${esc(nomLivre(S.livre))} ${S.chap}:${verset}</strong><button class="btn-secondary btn-compact" data-px="fermer">${T("Fermer ✕", "Close ✕")}</button></div>
      <div class="small">${T(`${refs.length} passage(s) liés, du plus pertinent au moins pertinent.`, `${refs.length} related passage(s), from most to least relevant.`)}</div>
      ${refs.slice(0, nb).map(({ s, r }) => `<div class="bib-ref">
        <div class="bib-ref-tete"><strong>${esc(libelle(r))}</strong><button class="btn-secondary btn-compact" data-px="aller" data-s="${esc(s)}">${T("Ouvrir →", "Open →")}</button></div>
        <div class="bib-ref-texte">${textes[s] === undefined ? "…" : (textes[s] ? esc(textes[s]) : `<span class="small">${T("Texte pas encore disponible sur ce téléphone.", "Text not yet available on this phone.")}</span>`)}</div></div>`).join("")}
      ${refs.length > nb ? `<div class="bib-centre"><button class="btn-secondary btn-compact" data-px="plus">${T(`Voir plus (${refs.length - nb} autres)`, `See more (${refs.length - nb} others)`)}</button></div>` : ""}</div>`;
    refs.slice(0, nb).forEach(({ s, r }) => {
      if (textes[s] === undefined) texteDeReference(r).then((t) => { textes[s] = t; if ($("bibPanneau")) dessiner(); });
    });
  };
  fond.addEventListener("click", (e) => {
    const b = e.target.closest("[data-px]");
    if (e.target === fond || (b && b.dataset.px === "fermer")) { fermerPanneau(); return; }
    if (!b) return;
    if (b.dataset.px === "plus") { nb += 15; dessiner(); }
    if (b.dataset.px === "aller") { const r = lireRefXref(b.dataset.s); fermerPanneau(); if (r) { S.vue = "lire"; majOnglets(); aller(r.livre, r.chapitre, r.verset); } }
  });
  document.body.appendChild(fond);
  dessiner();
  reserverBas(fond);
}
function fermerPanneau() { $("bibPanneau")?.remove(); }
// Si un lecteur flottant est affiché (Bible ou leçon), la fenêtre de versets s'arrête juste au-dessus : les deux restent visibles
function reserverBas(fond) {
  const mini = document.querySelector(".tts-mini:not([hidden])");
  const r = mini ? mini.getBoundingClientRect() : null;
  if (r && r.height > 0) { fond.style.setProperty("--bib-bas", `${Math.max(0, Math.round(window.innerHeight - r.top + 8))}px`); fond.classList.add("bib-fond-leve"); }
  else { fond.style.removeProperty("--bib-bas"); fond.classList.remove("bib-fond-leve"); }
}
window.addEventListener("resize", () => { const f = $("bibPanneau"); if (f) reserverBas(f); });

/* ---------- Recherche ---------- */
function surligner(texte, termes) {
  const carte = Array.from(texte).map((c) => plat(c));
  if (carte.some((c) => c.length !== 1)) return esc(texte);
  const plus = carte.join("");
  const bornes = [];
  termes.forEach((t) => { if (!t) return; let i = plus.indexOf(t); while (i >= 0) { bornes.push([i, i + t.length]); i = plus.indexOf(t, i + t.length); } });
  if (!bornes.length) return esc(texte);
  bornes.sort((a, b) => a[0] - b[0]);
  const fusion = [];
  bornes.forEach(([a, b]) => { const d = fusion[fusion.length - 1]; if (d && a <= d[1]) d[1] = Math.max(d[1], b); else fusion.push([a, b]); });
  let out = "", pos = 0;
  fusion.forEach(([a, b]) => { out += esc(texte.slice(pos, a)) + `<mark>${esc(texte.slice(a, b))}</mark>`; pos = b; });
  return out + esc(texte.slice(pos));
}
function rendreRecherche(complet = true) {
  const R = S.rech;
  const el = $("bibChercher");
  if (!el || !S.index) return;
  if (complet) {
    el.innerHTML = `
      <form id="bibForm" class="bib-recherche">
        <input type="search" id="bibQ" placeholder="${T("Un mot ou une expression…", "A word or a phrase…")}" value="${esc(R.q)}" autocomplete="off">
        <div class="bib-ligne">
          <select id="bibPortee" aria-label="${T("Où chercher", "Where to search")}">${optionsSelect([["tout", T("Toute la Bible", "Whole Bible")], ["at", T("Ancien Testament", "Old Testament")], ["nt", T("Nouveau Testament", "New Testament")], ["livre", T(`Le livre en cours : ${nomLivre(S.livre)}`, `Current book: ${nomLivre(S.livre)}`)]], R.portee)}</select>
          <select id="bibVersionR" aria-label="${T("Version", "Version")}">${optionsSelect(S.index.versions.map((x) => [x.id, x.nom]), S.version)}</select>
        </div>
        <label class="bib-opt"><input type="checkbox" id="bibExacte" ${R.exacte ? "checked" : ""}> <span>${T("Expression exacte (les mots dans cet ordre)", "Exact phrase (the words in this order)")}</span></label>
        <button class="btn-primary btn-compact" type="submit">${T("Chercher", "Search")}</button>
        <p class="small">${T("Sans tenir compte des accents ni des majuscules. Plusieurs mots : le verset doit les contenir tous. Les livres se téléchargent au fur et à mesure.", "Accents and capital letters are ignored. Several words: the verse must contain them all. Books are downloaded as you go.")}</p>
      </form>
      <div id="bibResultats"></div>`;
  }
  const res = $("bibResultats");
  if (!res) return;
  const pct = R.total ? Math.round((R.fait / R.total) * 100) : 0;
  const termes = R.exacte ? [plat(R.q)] : plat(R.q).split(/\s+/).filter(Boolean);
  res.innerHTML = `
    ${R.phase === "cherche" ? `<div class="small">${T(`Recherche en cours… ${pct} % (${R.fait} livre(s) sur ${R.total})`, `Searching… ${pct} % (${R.fait} book(s) of ${R.total})`)}</div><div class="bib-progres"><div style="width:${pct}%"></div></div>` : ""}
    ${R.q && R.phase !== "attente" ? `<p class="small"><strong>${R.res.length}${R.trop ? "+" : ""}</strong> ${T("verset(s) pour", "verse(s) for")} « ${esc(R.q)} »${R.trop ? T(` — affichage limité à ${MAX_RESULTATS} : précisez votre recherche.`, ` — display limited to ${MAX_RESULTATS}: refine your search.`) : ""}${R.absents > 0 && R.phase === "fini" ? T(` · ${R.absents} livre(s) non disponible(s) sur ce téléphone.`, ` · ${R.absents} book(s) not available on this phone.`) : ""}</p>` : ""}
    ${R.res.map((r) => `<button type="button" class="bib-res" data-l="${r.livre}" data-c="${r.chapitre}" data-v="${r.verset}"><div class="bib-res-ref">${esc(nomLivre(r.livre))} ${r.chapitre}:${r.verset}</div><div>${surligner(r.texte, termes)}</div></button>`).join("")}
    ${R.phase === "fini" && !R.res.length && R.q ? `<p class="small">${T("Aucun verset trouvé.", "No verse found.")}</p>` : ""}`;
}
async function chercher() {
  const R = S.rech;
  const brut = ($("bibQ")?.value || "").trim();
  if (brut.length < 2) return;
  R.q = brut;
  R.portee = $("bibPortee").value;
  R.exacte = $("bibExacte").checked;
  const version = $("bibVersionR").value;
  const cibles = R.portee === "at" ? Array.from({ length: 39 }, (_, i) => i + 1)
    : R.portee === "nt" ? Array.from({ length: 27 }, (_, i) => i + 40)
    : R.portee === "livre" ? [S.livre] : Array.from({ length: 66 }, (_, i) => i + 1);
  const termes = R.exacte ? [plat(brut)] : plat(brut).split(/\s+/).filter(Boolean);
  const moi = ++R.jeton;
  Object.assign(R, { res: [], trop: false, absents: 0, phase: "cherche", fait: 0, total: cibles.length });
  rendreRecherche(false);
  let manquants = 0;
  for (let k = 0; k < cibles.length; k++) {
    if (moi !== R.jeton) return;
    try {
      const ch = await chargerLivre(version, cibles[k]);
      ch.forEach((versets, c) => (versets || []).forEach((t, i) => {
        if (!t || R.res.length >= MAX_RESULTATS) return;
        const p = plat(t);
        if (termes.every((x) => p.includes(x))) R.res.push({ livre: cibles[k], chapitre: c + 1, verset: i + 1, texte: t, version });
      }));
    } catch { manquants += 1; }
    R.fait = k + 1; R.absents = manquants;
    if (R.res.length >= MAX_RESULTATS) { R.trop = true; break; }
    if (k % 3 === 0) rendreRecherche(false);
  }
  if (moi !== R.jeton) return;
  R.phase = "fini";
  rendreRecherche(false);
}

/* ---------- Événements ---------- */
function brancher() {
  racine().addEventListener("click", (e) => {
    const b = e.target.closest("[data-bib], .bib-xref, .bib-verset, .bib-res");
    if (!b) return;
    if (b.classList.contains("bib-xref")) { e.stopPropagation(); ouvrirReferences(Number(b.dataset.x)); return; }
    if (b.classList.contains("bib-res")) {
      S.version = $("bibVersionR")?.value || S.version;
      S.vue = "lire"; majOnglets(); rendreBarre();
      aller(Number(b.dataset.l), Number(b.dataset.c), Number(b.dataset.v));
      return;
    }
    if (b.classList.contains("bib-verset")) {
      const n = Number(b.dataset.v);
      if (S.ecoute && audioOk()) lire(n - 1); else { S.verset = n; sauverPosition(); majSurbrillance(); rendreBarre(); }
      return;
    }
    switch (b.dataset.bib) {
      case "vue-lire": S.vue = "lire"; majOnglets(); break;
      case "vue-chercher": S.vue = "chercher"; majOnglets(); rendreRecherche(true); break;
      case "vue-plan": S.vue = "plan"; majOnglets(); if (window.AbbaLecture) window.AbbaLecture.rendre($("bibPlan")); break;
      case "ecouter": lire((S.verset || 1) - 1); break;
      case "pause": pause(); break;
      case "options": S.options = !S.options; rendreOptions(); break;
      case "precedent": precedent(); break;
      case "suivant": suivant(); break;
      case "telecharger": telechargerTout(); break;
      case "batterie": try { reglagesBatterie().catch(() => {}); } catch { /* ignoré */ } break;
      default: break;
    }
  });
  racine().addEventListener("change", (e) => {
    const t = e.target;
    switch (t.dataset?.bib) {
      case "version": changerVersion(t.value); break;
      case "livre": aller(Number(t.value), 1); break;
      case "chap": aller(S.livre, Number(t.value)); break;
      case "verset": {
        const n = Number(t.value) || null;
        if (S.ecoute) { if (n) lire(n - 1); break; }
        S.verset = n; sauverPosition(); majSurbrillance(); rendreBarre();
        if (n) $(`bv${n}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        break;
      }
      case "vitesse": S.vitesse = Number(t.value) || 1; lsSet("abba_bible_vitesse", String(S.vitesse)); if (S.ecoute) lire((S.courant || 1) - 1); else majMini(); break;
      case "enchainer": S.enchainer = t.checked; lsSet("abba_bible_enchainer", t.checked ? "oui" : "non"); break;
      case "ecran": S.ecranAllume = t.checked; lsSet("abba_bible_ecran", t.checked ? "oui" : "non"); if (!t.checked) verrouLiberer(); else if (S.ecoute) verrouPrendre(); majMini(); break;
      default: break;
    }
  });
  racine().addEventListener("submit", (e) => { if (e.target.id === "bibForm") { e.preventDefault(); chercher(); } });
  // La voix est unique : si une leçon se met à parler, la Bible se tait
  window.addEventListener("abba:voix-lecon", () => { if (S.ecoute || S.enPause) arreter(); });
  window.addEventListener("pagehide", () => { if (synthOk() && S.ecoute) window.speechSynthesis.cancel(); });
}

/* ---------- Démarrage (à l'ouverture de l'onglet) ---------- */
let demarre = false;
async function ouvrirOnglet() {
  if (demarre) return;
  demarre = true;
  const root = racine();
  if (!root) return;
  root.innerHTML = `<p class="small">${T("Chargement de la Bible…", "Loading the Bible…")}</p>`;
  try {
    S.index = await chargerIndex();
  } catch {
    demarre = false;
    root.innerHTML = `<p class="bib-alerte">${T("Impossible de charger la Bible. Vérifiez votre connexion puis rouvrez cet onglet.", "The Bible could not be loaded. Check your connection, then reopen this tab.")}</p>`;
    return;
  }
  const p = lirePosition();
  const versionOk = (id) => S.index.versions.some((v) => v.id === id);
  const parDefaut = (EN() ? S.index.versions.find((v) => v.langue === "en") : S.index.versions.find((v) => v.langue !== "en"))?.id || S.index.versions[0]?.id || "lsg";
  const retenue = lsGet(EN() ? "abba_bible_ver_en" : "abba_bible_ver_fr", "");
  S.version = versionOk(retenue) ? retenue : parDefaut;
  if (p && p.l >= 1 && p.l <= 66) { S.livre = p.l; S.chap = Math.min(Math.max(p.c || 1, 1), nbChapitres(p.l)); S.verset = p.v || null; }
  livreXrefAttendu = S.livre;
  squelette();
  brancher();
  rendreBarre();
  rendreNav();
  await chargerChapitre();
  if (S.verset) $(`bv${S.verset}`)?.scrollIntoView({ block: "center" });
  S.pret = true;
}

window.addEventListener("abba:bible-ouvert", ouvrirOnglet);
window.AbbaBible = { ouvrir: ouvrirOnglet, aller: (l, c, v) => { ouvrirOnglet().then(() => aller(l, c, v)); }, nom: (l) => nomLivre(l), lire: (l, c) => ouvrirOnglet().then(() => { S.vue = "lire"; majOnglets(); aller(l, c); }), plan: () => ouvrirOnglet().then(() => { S.vue = "plan"; majOnglets(); if (window.AbbaLecture) window.AbbaLecture.rendre($("bibPlan")); }) };

/* ============================================================
   FENÊTRE DE VERSETS (déclaration, leçons) : « 📎 » ou référence cliquée.
   Chaque référence est citée en entier avec son texte, dans la version choisie.
   ============================================================ */
const ABREV = { mt: "Matthieu", mc: "Marc", lc: "Luc", jn: "Jean", ac: "Actes", rm: "Romains", rom: "Romains", ga: "Galates", gal: "Galates", ep: "Éphésiens", eph: "Éphésiens", ph: "Philippiens", php: "Philippiens", col: "Colossiens", he: "Hébreux", heb: "Hébreux", jc: "Jacques", ja: "Jacques", ap: "Apocalypse", ps: "Psaumes", pr: "Proverbes", es: "Ésaïe", esa: "Ésaïe", jr: "Jérémie", jer: "Jérémie", ez: "Ézéchiel", dn: "Daniel", gn: "Genèse", ge: "Genèse", ex: "Exode", lv: "Lévitique", lev: "Lévitique", nb: "Nombres", nom: "Nombres", dt: "Deutéronome", deut: "Deutéronome", jos: "Josué", jg: "Juges", ne: "Néhémie", est: "Esther", ec: "Ecclésiaste", ct: "Cantique des Cantiques", os: "Osée", jl: "Joël", am: "Amos", jon: "Jonas", mi: "Michée", na: "Nahum", ha: "Habacuc", so: "Sophonie", ag: "Aggée", za: "Zacharie", ml: "Malachie", tt: "Tite", phm: "Philémon", jud: "Jude" };
const normNom = (x) => plat(x).replace(/[^a-z0-9]/g, "");
function trouverLivre(nom) {
  const brut = String(nom).trim();
  const m1 = /^([123])\s*(.+)$/.exec(brut);
  // table d'alias (français et anglais) : « 1 John », « Matt », « Gal », « 1 Cor »…
  let r = m1 ? livreDe(+m1[1], normNom(m1[2])) : 0;
  if (!r) r = livreDe(0, normNom(brut));
  if (r) return r;
  let q = normNom(nom);
  if (!q) return 0;
  const m = /^([123])(.+)$/.exec(q);
  let i = LIVRES.findIndex((n) => normNom(n) === q);
  if (i < 0) i = LIVRES.findIndex((n) => normNom(n).startsWith(q));
  if (i < 0 && m) { // numéro + abréviation : « 1 Co », « 2 Tm », « 1 Jn », « 1 P »
    const NUM = { co: "Corinthiens", cor: "Corinthiens", th: "Thessaloniciens", thes: "Thessaloniciens", tm: "Timothée", tim: "Timothée", p: "Pierre", pi: "Pierre", pie: "Pierre", jn: "Jean", s: "Samuel", sa: "Samuel", sam: "Samuel", r: "Rois", ro: "Rois", ch: "Chroniques", chr: "Chroniques" };
    const nom = NUM[m[2]] || m[2];
    i = LIVRES.findIndex((n) => /^[123] /.test(n) && n[0] === m[1] && normNom(n.slice(2)).startsWith(normNom(nom)));
  }
  if (i < 0 && ABREV[q]) i = LIVRES.indexOf(ABREV[q]);
  return i + 1;
}
// « 1 Corinthiens 8:4-6 », « Psaumes 96 », « Matthieu 5–7 » → { livre, chapitre, verset, fin, chapFin }
function analyserRef(s) {
  const m = /^(.+?)\s+(\d+)(?:[:.,](\d+)(?:\s*[-–]\s*(\d+))?|\s*[-–]\s*(\d+))?$/.exec(String(s).trim());
  if (!m) return null;
  const livre = trouverLivre(m[1]);
  if (!livre) return null;
  if (m[3]) return { livre, chapitre: +m[2], verset: +m[3], fin: m[4] ? +m[4] : +m[3] };
  return { livre, chapitre: +m[2], verset: 1, fin: Infinity, chapFin: m[5] ? +m[5] : 0 };
}
// « Jean 1:12 » → « John 1:12 » en anglais (et inversement) : la référence est toujours réécrite dans la langue de l'application
function etiquette(s) {
  const r = analyserRef(s);
  if (!r) return s;
  return r.fin === Infinity ? canon(r.livre, r.chapitre, 0, 0, r.chapFin || 0) : canon(r.livre, r.chapitre, r.verset, r.fin, 0);
}
async function ouvrirVersets({ refs, texte = "", titre = "" }) {
  titre = titre || T("📎 Versets de référence", "📎 Reference verses");
  if (!refs?.length) return;
  fermerPanneau();
  let index = null;
  try { index = await chargerIndex(); } catch { /* hors connexion sans Bible téléchargée */ }
  const versions = index?.versions || [];
  const cleVersion = EN() ? "abba_version_versets_en" : "abba_version_versets";
  let version = lsGet(cleVersion, "");
  if (!versions.some((v) => v.id === version)) version = (EN() ? versions.find((v) => v.langue === "en") : versions.find((v) => v.langue !== "en"))?.id || versions[0]?.id || "lsg";
  const textes = {};
  const fond = document.createElement("div");
  fond.className = "bib-fond"; fond.id = "bibPanneau"; fond.setAttribute("role", "dialog"); fond.setAttribute("aria-label", T("Versets de référence", "Reference verses"));
  const dessiner = () => {
    fond.innerHTML = `<div class="bib-feuille">
      <div class="bib-feuille-tete"><strong>${esc(titre)}</strong><button class="btn-secondary btn-compact" data-px="fermer">${T("Fermer ✕", "Close ✕")}</button></div>
      ${texte ? `<div class="small bib-citation">${esc(texte)}</div>` : ""}
      ${versions.length > 1 ? `<select data-px="version" aria-label="${T("Version de la Bible", "Bible version")}">${versions.map((v) => `<option value="${esc(v.id)}"${v.id === version ? " selected" : ""}>${esc(v.nom)}</option>`).join("")}</select>` : ""}
      ${refs.map((s) => `<div class="bib-ref"><div class="bib-ref-tete"><strong>${esc(etiquette(s))}</strong><button class="btn-secondary btn-compact" data-px="ouvrir" data-s="${esc(s)}">${T("Ouvrir dans la Bible →", "Open in the Bible →")}</button></div><div class="bib-ref-texte">${textes[s] === undefined ? "…" : (textes[s] ? esc(textes[s]) : `<span class="small">${T("Texte pas encore disponible : ouvrez la Bible une fois avec du réseau.", "Text not yet available: open the Bible once with a network connection.")}</span>`)}</div></div>`).join("")}</div>`;
  };
  const charger = () => {
    refs.forEach((s) => {
      const r = analyserRef(s);
      if (!r) { textes[s] = ""; return; }
      texteDeReference({ ...r, fin: r.fin === Infinity ? Infinity : Math.min(r.fin, r.verset + 39) }, version).then((t) => { if (document.body.contains(fond)) { textes[s] = t; dessiner(); } });
    });
  };
  fond.addEventListener("click", (e) => {
    if (e.target === fond || e.target.closest('[data-px="fermer"]')) { fermerPanneau(); return; }
    const o = e.target.closest('[data-px="ouvrir"]');
    if (o) {
      const r = analyserRef(o.dataset.s);
      fermerPanneau();
      if (r) { document.querySelector('.tab[data-tab="bible"]')?.click(); window.AbbaBible.aller(r.livre, r.chapitre, r.verset > 1 ? r.verset : null); }
    }
  });
  fond.addEventListener("change", (e) => {
    if (e.target.dataset.px === "version") { version = e.target.value; lsSet(cleVersion, version); Object.keys(textes).forEach((k) => delete textes[k]); dessiner(); charger(); }
  });
  document.body.appendChild(fond);
  dessiner();
  reserverBas(fond);
  charger();
}
window.AbbaVersets = { ouvrir: ouvrirVersets, analyserRef };

/* ---------- Versets cliquables dans les leçons : repérés automatiquement dans le texte ---------- */
// Lecture de tous les textes : références complètes (« Jean 3:16 »), abrégées (« 1 Cor 13 »), sans nom de livre
// entre parenthèses (« (5:1) » = le dernier livre cité avant), suites (« ; », « , », « voir aussi »), chapitres entiers.
const TOUS_LES_MODULES = true;
const MODULES_VERSETS = new Set(["m1"]); // utilisé seulement si TOUS_LES_MODULES est faux
const CHAPITRES = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
const separer = (n) => { const m = /^([123]) (.+)$/.exec(n); return m ? { num: +m[1], base: m[2] } : { num: 0, base: n }; };
const ALIAS = {};
LIVRES.forEach((n) => { ALIAS[normNom(separer(n).base)] = separer(n).base; });
Object.entries({ psaume: "Psaumes", gen: "Genèse", gn: "Genèse", exo: "Exode", ex: "Exode", lev: "Lévitique", lv: "Lévitique", nb: "Nombres", nom: "Nombres", deut: "Deutéronome", dt: "Deutéronome", jos: "Josué", jug: "Juges", jg: "Juges", ru: "Ruth", sam: "Samuel", sa: "Samuel", ro: "Rois", chr: "Chroniques", ch: "Chroniques", esd: "Esdras", neh: "Néhémie", ne: "Néhémie", est: "Esther", ps: "Psaumes", psa: "Psaumes", prov: "Proverbes", pr: "Proverbes", ecc: "Ecclésiaste", ec: "Ecclésiaste", eccl: "Ecclésiaste", cant: "Cantique des Cantiques", ct: "Cantique des Cantiques", es: "Ésaïe", esa: "Ésaïe", jer: "Jérémie", jr: "Jérémie", lam: "Lamentations", lm: "Lamentations", ez: "Ézéchiel", ezech: "Ézéchiel", dan: "Daniel", dn: "Daniel", os: "Osée", jl: "Joël", am: "Amos", abd: "Abdias", jon: "Jonas", mic: "Michée", mi: "Michée", nah: "Nahum", na: "Nahum", hab: "Habacuc", ha: "Habacuc", soph: "Sophonie", so: "Sophonie", agg: "Aggée", ag: "Aggée", zac: "Zacharie", za: "Zacharie", zach: "Zacharie", mal: "Malachie", ml: "Malachie", mat: "Matthieu", mt: "Matthieu", matt: "Matthieu", mar: "Marc", mc: "Marc", lc: "Luc", jn: "Jean", act: "Actes", ac: "Actes", rom: "Romains", rm: "Romains", cor: "Corinthiens", co: "Corinthiens", gal: "Galates", ga: "Galates", eph: "Éphésiens", ep: "Éphésiens", phil: "Philippiens", php: "Philippiens", ph: "Philippiens", phi: "Philippiens", thess: "Thessaloniciens", tess: "Thessaloniciens", tit: "Tite", apo: "Apocalypse", is: "Ésaïe", isa: "Ésaïe", pro: "Proverbes", chron: "Chroniques", hebr: "Hébreux", col: "Colossiens", thes: "Thessaloniciens", th: "Thessaloniciens", tim: "Timothée", tm: "Timothée", tt: "Tite", philem: "Philémon", phm: "Philémon", heb: "Hébreux", he: "Hébreux", jac: "Jacques", jacq: "Jacques", jc: "Jacques", pi: "Pierre", pie: "Pierre", p: "Pierre", apoc: "Apocalypse", ap: "Apocalypse", jud: "Jude" }).forEach(([k, v]) => { ALIAS[k] = v; });
Object.entries({ genesis: "Genèse", exodus: "Exode", leviticus: "Lévitique", numbers: "Nombres", deuteronomy: "Deutéronome", joshua: "Josué", judges: "Juges", kings: "Rois", chronicles: "Chroniques", ezra: "Esdras", nehemiah: "Néhémie", psalms: "Psaumes", psalm: "Psaumes", proverbs: "Proverbes", ecclesiastes: "Ecclésiaste", songofsolomon: "Cantique des Cantiques", songofsongs: "Cantique des Cantiques", song: "Cantique des Cantiques", isaiah: "Ésaïe", jeremiah: "Jérémie", ezekiel: "Ézéchiel", hosea: "Osée", obadiah: "Abdias", jonah: "Jonas", micah: "Michée", habakkuk: "Habacuc", zephaniah: "Sophonie", haggai: "Aggée", zechariah: "Zacharie", malachi: "Malachie", matthew: "Matthieu", mark: "Marc", luke: "Luc", john: "Jean", acts: "Actes", romans: "Romains", corinthians: "Corinthiens", galatians: "Galates", ephesians: "Éphésiens", philippians: "Philippiens", colossians: "Colossiens", thessalonians: "Thessaloniciens", timothy: "Timothée", titus: "Tite", hebrews: "Hébreux", james: "Jacques", peter: "Pierre", revelation: "Apocalypse", revelations: "Apocalypse", exod: "Exode", num: "Nombres", josh: "Josué", judg: "Juges", kgs: "Rois", kin: "Rois", esth: "Esther", pss: "Psaumes", ss: "Cantique des Cantiques", ezek: "Ézéchiel", eze: "Ézéchiel", hos: "Osée", obad: "Abdias", zeph: "Sophonie", hag: "Aggée", zech: "Zacharie", mk: "Marc", lk: "Luc", phlm: "Philémon", jas: "Jacques", jam: "Jacques", pet: "Pierre", rev: "Apocalypse" }).forEach(([k, v]) => { ALIAS[k] = v; });
const ALIAS_FORMES = Object.keys(ALIAS).concat(LIVRES.map((n) => normNom(n))).concat(LIVRES_EN.map((n) => normNom(n))).filter((x, i, a) => a.indexOf(x) === i);
// forme à reconnaître dans le texte (sans accents, minuscules) ; les espaces des noms composés sont souples
const motif = (k) => (k === "cantiquedescantiques" ? "cantique\\s+des\\s+cantiques" : k === "songofsolomon" ? "song\\s+of\\s+solomon" : k === "songofsongs" ? "song\\s+of\\s+songs" : k);
const NOMS_RE = ALIAS_FORMES.slice().sort((a, b) => b.length - a.length).map(motif).join("|");
const REF_RE = new RegExp(`(?<![a-z0-9])(?:([123])\\s?)?(${NOMS_RE})\\.?[\\s\\u00a0]+(\\d{1,3})(?:[:.](\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?|,(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?|(?:\\s*(?:[-–]|a|au|to)\\s*(\\d{1,3}))?)(?![0-9])`, "dg");
const NUM_ORD = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, premiere: 1, "1re": 1, "1ere": 1, seconde: 2, deuxieme: 2, "2e": 2, "2eme": 2, troisieme: 3, "3e": 3, "3eme": 3 };
const BASES_MENTION = Array.from(new Set(LIVRES.map((n) => normNom(separer(n).base)).concat(LIVRES_EN.map((n) => normNom(n.replace(/^[123] /, "")))))).sort((a, b) => b.length - a.length).map(motif).join("|");
const MENTION_RE = new RegExp(`(?<![a-z0-9])(?:(premiere|seconde|deuxieme|troisieme|1re|1ere|2e|2eme|3e|3eme|first|second|third|1st|2nd|3rd)\\s+(?:epitre|lettre|epistle|letter)(?:\\s+[^\\s.;()]+){0,5}?\\s+|([123])\\s?)?(${BASES_MENTION})(?![a-z0-9-])(?!\\s+(?:le\\s+)?baptiste)(?!\\s+(?:the\\s+)?baptist)`, "dg");
const MENTION2_RE = /(?<![a-z0-9])(john|peter|jean|pierre)\s+(?:in\s+his|dans\s+sa)\s+(first|second|third|premiere|seconde|deuxieme|troisieme)\s+(?:letter|epistle|lettre|epitre)/dg;
// Livres cités dans le texte (sans chapitre), dans l'ordre : sert aux références sans nom de livre
function trouverMentions(t, p) {
  const out = [];
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(p))) {
    const [debutNom, finNom] = m.indices[3];
    if (!majuscule(t[debutNom])) continue;
    const num = m[1] ? NUM_ORD[m[1]] : m[2] ? +m[2] : 0;
    const livre = livreDe(num, p.slice(debutNom, finNom)) || livreDe(0, p.slice(debutNom, finNom));
    if (livre) out.push({ debut: m.index, nom: debutNom, fin: m.index + m[0].length, livre });
  }
  MENTION2_RE.lastIndex = 0;
  while ((m = MENTION2_RE.exec(p))) {
    const livre = livreDe(NUM_ORD[m[2]], m[1]);
    if (livre) out.push({ debut: m.index, nom: m.index, fin: m.index + m[0].length, livre });
  }
  return out;
}
const majuscule = (c) => !!c && c !== c.toLowerCase() && c === c.toUpperCase();
function livreDe(num, nomNormalise) {
  const base = ALIAS[normNom(nomNormalise)];
  if (!base) return 0;
  return LIVRES.findIndex((n, i) => separer(n).base === base && separer(n).num === (num || 0)) + 1;
}
const canon = (livre, chap, v, fin, chapFin) => {
  const B = nomLivre(livre);
  if (!v) return chapFin && chapFin > chap ? `${B} ${chap}–${chapFin}` : `${B} ${chap}`;
  return `${B} ${chap}:${v}${fin && fin > v ? `–${fin}` : ""}`;
};
const dansParentheses = (t, i) => { const a = t.lastIndexOf("(", i); return a >= 0 && t.indexOf(")", a) >= i; };

// Trouve toutes les références d'un texte. ctx.livre = dernier livre cité (partagé d'un morceau de texte à l'autre)
function reperer(t, ctx) {
  const carte = Array.from(t).map((c) => plat(c));
  if (carte.length !== t.length || carte.some((c) => c.length !== 1)) return [];
  const p = carte.join("");
  const evenements = [];
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(p))) {
    const [debutNom, finNom] = m.indices[2];
    const livre = livreDe(m[1] ? +m[1] : 0, p.slice(debutNom, finNom));
    let chap = +m[3];
    const aVerset = m[4] !== undefined || m[6] !== undefined;
    if (!livre) continue;
    const unSeulChapitre = CHAPITRES[livre - 1] === 1 && !aVerset; // « Jude 20-21 » : ce sont des versets
    if (!unSeulChapitre && (chap < 1 || chap > CHAPITRES[livre - 1])) continue;
    if (!aVerset && !unSeulChapitre && /^[\s\u00a0]+(?:fois|homme|hommes|femme|femmes|personne|personnes|an|ans|jour|jours|mois|heure|heures|minute|minutes|euro|euros|fcfa|point|points|verset|versets|chapitre|chapitres|livre|livres|times|time|men|man|women|woman|people|years|year|days|day|months|month|hours|hour|percent|verses|chapters|books)\b/.test(p.slice(m.index + m[0].length))) continue;
    if (!majuscule(t[debutNom])) continue;
    if (m[2].length <= 2 && !aVerset && !dansParentheses(p, m.index)) continue;
    let v = aVerset ? +(m[4] ?? m[6]) : 0;
    let vfin = aVerset ? +(m[5] ?? m[7] ?? v) : 0;
    let chapFin = !aVerset && m[8] ? +m[8] : 0;
    if (unSeulChapitre) { v = chap; vfin = m[8] ? +m[8] : v; chap = 1; chapFin = 0; }
    evenements.push({ type: "ref", debut: m.index, fin: m.index + m[0].length, livre, chap, v, vfin, chapFin });
  }
  trouverMentions(t, p).forEach((e) => {
    if (!evenements.some((x) => x.type === "ref" && e.nom >= x.debut && e.nom < x.fin)) evenements.push({ type: "mention", debut: e.debut, fin: e.fin, livre: e.livre });
  });
  // Références sans nom de livre : « 5:1 », « 14:1 »
  const BARE = /(\d{1,3})[:.](\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?![0-9])/y;
  for (let k = 0; k < p.length; k++) {
    if (!/\d/.test(p[k]) || (k > 0 && /[a-z0-9:.,]/.test(p[k - 1]))) continue;
    if (evenements.some((e) => e.type === "ref" && k >= e.debut && k < e.fin)) continue;
    BARE.lastIndex = k;
    const b = BARE.exec(p);
    if (b) { evenements.push({ type: "bare", debut: k, fin: k + b[0].length, chap: +b[1], v: +b[2], vfin: b[3] ? +b[3] : +b[2] }); k += b[0].length - 1; }
  }
  evenements.sort((a, b) => a.debut - b.debut || (a.type === "ref" ? -1 : 1));
  let refs = [];
  for (const e of evenements) {
    if (e.type === "mention") { ctx.livre = e.livre; ctx.chap = 0; continue; }
    if (e.type === "ref") {
      ctx.livre = e.livre; ctx.chap = e.chap;
      refs.push({ debut: e.debut, fin: e.fin, livre: e.livre, chap: e.chap, v: e.v, canon: canon(e.livre, e.chap, e.v, e.vfin, e.chapFin) });
      continue;
    }
    // sans nom de livre : accepté entre parenthèses, ou à la suite d'une autre référence (« ; 14:1 »)
    if (!ctx.livre || e.chap < 1 || e.chap > CHAPITRES[ctx.livre - 1]) continue;
    const avant = refs[refs.length - 1];
    const enSuite = avant && /^(?:\s*[;,]\s*|\s+(?:voir aussi|voir|lire|cf\.?|et|ou|see also|see|read|and|or)\s+)$/.test(p.slice(avant.fin, e.debut));
    if (!dansParentheses(p, e.debut) && !enSuite) continue;
    ctx.chap = e.chap;
    refs.push({ debut: e.debut, fin: e.fin, livre: ctx.livre, chap: e.chap, v: e.v, canon: canon(ctx.livre, e.chap, e.v, e.vfin, 0) });
  }
  // Numéros de versets seuls dans une suite : « Jean 3:16, 18 »
  const SEUL = /(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?=\s*(?:[;,.)\]]|$|\s(?:et|ou|and|or)\s))/y;
  for (let k = 0; k < refs.length; k++) {
    const r = refs[k];
    if (!r.v) continue;
    const virgule = /^\s*,\s*/.exec(p.slice(r.fin));
    if (!virgule) continue;
    const pos = r.fin + virgule[0].length;
    if (refs.some((x) => x.debut === pos)) continue;
    SEUL.lastIndex = pos;
    const s = SEUL.exec(p);
    if (!s) continue;
    const v = +s[1], vfin = s[2] ? +s[2] : v;
    refs.splice(k + 1, 0, { debut: pos, fin: pos + s[0].length, livre: r.livre, chap: r.chap, v, canon: canon(r.livre, r.chap, v, vfin, 0) });
  }
  // Suites : références séparées par « ; », « , », « voir aussi »… (une icône 📎 les regroupe)
  refs.forEach((r, k) => { r.suite = k > 0 && /^(?:\s*[;,]\s*|\s+(?:voir aussi|voir|lire|cf\.?|et|ou|see also|see|read|and|or)\s+)$/.test(p.slice(refs[k - 1].fin, r.debut)); });
  return refs;
}
function mentions(t, ctx) {
  const carte = Array.from(t).map((c) => plat(c));
  if (carte.length !== t.length || carte.some((c) => c.length !== 1)) return;
  const liste = trouverMentions(t, carte.join(""));
  liste.sort((x, y) => x.debut - y.debut);
  if (liste.length) { ctx.livre = liste[liste.length - 1].livre; ctx.chap = 0; }
}
function lier(html, moduleId, rapport) {
  if (!TOUS_LES_MODULES && !MODULES_VERSETS.has(moduleId) && !rapport) return html;
  const racine = document.createElement("div");
  racine.innerHTML = html;
  const noeuds = [];
  const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (!w.currentNode.parentElement.closest("a,button,.vref")) noeuds.push(w.currentNode);
  const ctx = { livre: 0, chap: 0 };
  noeuds.forEach((n) => {
    const t = n.nodeValue;
    const refs = /\d/.test(t) ? reperer(t, ctx) : (mentions(t, ctx), []);
    if (!refs.length) return;
    let pos = 0, sortie = "", chaine = [];
    const fermer = () => { if (chaine.length > 1) sortie += ` <button type="button" class="vref-all" data-vg="${esc(JSON.stringify(chaine))}" aria-label="Voir tous les versets" title="Voir tous les versets">📎</button>`; chaine = []; };
    refs.forEach((r, i) => {
      if (!r.suite) fermer();
      sortie += esc(t.slice(pos, r.debut)) + `<span class="vref" role="button" tabindex="0" data-vr="${esc(r.canon)}">${esc(t.slice(r.debut, r.fin))}</span>`;
      pos = r.fin; chaine.push(r.canon);
      if (rapport) rapport.refs += 1;
    });
    fermer();
    sortie += esc(t.slice(pos));
    if (rapport) rapport.groupes += 1;
    const span = document.createElement("span");
    span.innerHTML = sortie;
    n.replaceWith(...span.childNodes);
  });
  return racine.innerHTML;
}
document.addEventListener("click", (e) => {
  const one = e.target.closest(".vref");
  const all = e.target.closest(".vref-all");
  if (one) { e.preventDefault(); ouvrirVersets({ refs: [one.dataset.vr], titre: `📖 ${etiquette(one.dataset.vr)}` }); }
  else if (all) { e.preventDefault(); try { ouvrirVersets({ refs: JSON.parse(all.dataset.vg), titre: T("📎 Tous les versets", "📎 All the verses") }); } catch { /* ignoré */ } }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList?.contains("vref")) e.target.click(); });
window.AbbaVersets.lier = lier;
window.AbbaVersets.lierTexte = (t) => lier(esc(t ?? ""), "ex");

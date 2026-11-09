/* ============================================================
   RAPPELS DE L'AGENDA — notifications programmées sur le téléphone
   Fonctionne dans l'application Android « ABBA Bâtisseur » (APK) : le téléphone sonne lui-même à l'heure voulue,
   même application fermée, sans connexion, et après un redémarrage. Rien n'est envoyé à un serveur.
   Dans un navigateur ordinaire, ce fichier ne fait rien.
   Une seule échéance de rappel par tâche : à l'heure même, 15 min, 30 min ou 1 h avant.
   Les tâches qui se répètent sont programmées sur les 14 prochains jours (réactualisées à chaque ouverture de l'application).
   ============================================================ */
export const ID_MIN = 7000000, ID_MAX = 7899999, ID_TEST = 7990000;   // plage réservée à l'agenda (les rappels de prière utilisent 6001-6004)
const HORIZON_REPETEES = 14, HORIZON_UNIQUES = 60, MAX_NOTIFS = 60;
const DELAIS = [0, 15, 30, 60];

const estNatif = () => !!(typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.());
const pad = (n) => String(n).padStart(2, "0");
const jourStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseJour = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dateHeure = (jour, hhmm) => { const [y, m, d] = jour.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(y, m - 1, d, h, mi, 0, 0); };
const rappelValide = (t) => !!t && typeof t.rappel === "number" && DELAIS.includes(t.rappel) && /^\d\d:\d\d$/.test(t.time || "") && /^\d{4}-\d\d-\d\d$/.test(t.date || "");
const cleSerie = (t) => t.serie || `${t.title}|${t.time}|${t.recurrence}`;
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0; return Math.abs(h); }

const TITRES = {
  fr: { 0: "⏰ C'est l'heure", 15: "⏰ Dans 15 minutes", 30: "⏰ Dans 30 minutes", 60: "⏰ Dans 1 heure" },
  en: { 0: "⏰ It's time", 15: "⏰ In 15 minutes", 30: "⏰ In 30 minutes", 60: "⏰ In 1 hour" },
};

// Calcule la liste des notifications à programmer (fonction pure : facile à vérifier)
export function calculerRappels(tasks, now = new Date(), lang = "fr") {
  const liste = Array.isArray(tasks) ? tasks : [];
  const titres = TITRES[lang === "en" ? "en" : "fr"];
  const aVenir = liste.filter((t) => rappelValide(t) && !t.done);
  const out = [], pris = new Set();
  const ajouter = (t, jour, horizonJours) => {
    const fire = new Date(dateHeure(jour, t.time).getTime() - t.rappel * 60000);
    if (fire.getTime() <= now.getTime() + 5000) return;                                   // déjà passé
    if (fire.getTime() > now.getTime() + horizonJours * 86400000) return;                  // trop lointain
    let id = ID_MIN + (hash(`${t.id || cleSerie(t)}|${jour}`) % (ID_MAX - ID_MIN));
    while (pris.has(id)) id = id >= ID_MAX ? ID_MIN : id + 1;
    pris.add(id);
    out.push({ id, at: fire, title: titres[t.rappel], body: `${t.time} · ${t.title}` });
  };
  // Tâches qui ne se répètent pas
  aVenir.filter((t) => !t.recurrence).forEach((t) => ajouter(t, t.date, HORIZON_UNIQUES));
  // Tâches qui se répètent : une série = un rappel pour chacun des 14 prochains jours concernés
  const series = new Map();
  aVenir.filter((t) => t.recurrence === "daily" || t.recurrence === "weekly").forEach((t) => {
    const k = cleSerie(t), cur = series.get(k);
    if (!cur || t.date < cur.date) series.set(k, t);
  });
  const aujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  series.forEach((base, k) => {
    const faits = new Set(liste.filter((x) => x.done && cleSerie(x) === k).map((x) => x.date));
    const jourBase = parseJour(base.date);
    for (let i = 0; i <= HORIZON_REPETEES; i++) {
      const d = new Date(aujourdhui); d.setDate(d.getDate() + i);
      const js = jourStr(d);
      if (js < base.date) continue;
      if (base.recurrence === "weekly" && d.getDay() !== jourBase.getDay()) continue;
      if (faits.has(js)) continue;                                                        // déjà fait ce jour-là
      ajouter(base, js, HORIZON_REPETEES + 1);
    }
  });
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_NOTIFS);
}

function plugin() {
  const C = typeof window !== "undefined" ? window.Capacitor : null;
  if (!C || !estNatif()) return null;
  try { return typeof C.registerPlugin === "function" ? C.registerPlugin("LocalNotifications") : (C.Plugins && C.Plugins.LocalNotifications) || null; } catch (e) { return null; }
}

// Les opérations passent l'une après l'autre : une reprogrammation tardive n'écrase jamais une plus récente
let file = Promise.resolve();
export function reprogrammer(tasks, { demander = false, lang = "fr" } = {}) {
  const r = file.then(() => faire(tasks, demander, lang));
  file = r.catch(() => {});
  return r;
}
async function faire(tasks, demander, lang) {
  if (!estNatif()) return { etat: "navigateur" };
  const ln = plugin(); if (!ln) return { etat: "mise-a-jour" };
  try {
    const voulus = calculerRappels(tasks, new Date(), lang);
    let pending = [];
    try { pending = (await ln.getPending()).notifications || []; } catch (e) { /* ancienne version : on continue */ }
    const anciens = pending.filter((n) => n.id >= ID_MIN && n.id <= ID_MAX).map((n) => ({ id: n.id }));
    if (anciens.length) await ln.cancel({ notifications: anciens });
    if (!voulus.length) return { etat: "ok", nb: 0 };
    let perm = await ln.checkPermissions();
    if (perm.display !== "granted" && demander) perm = await ln.requestPermissions();
    if (perm.display !== "granted") return { etat: "bloque" };
    await ln.schedule({ notifications: voulus.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true }, extra: { type: "agenda" } })) });
    let exact = true;
    try { const s = await ln.checkExactNotificationSetting(); exact = s && s.exact_alarm !== "denied"; } catch (e) { /* ancienne version : inconnu */ }
    return { etat: "ok", nb: voulus.length, exact };
  } catch (e) { console.error("rappels agenda:", e); return { etat: "erreur" }; }
}

// Bouton « Tester mon rappel » : une notification dans 10 secondes
export async function tester(lang = "fr") {
  if (!estNatif()) return { etat: "navigateur" };
  const ln = plugin(); if (!ln) return { etat: "mise-a-jour" };
  try {
    let perm = await ln.checkPermissions();
    if (perm.display !== "granted") perm = await ln.requestPermissions();
    if (perm.display !== "granted") return { etat: "bloque" };
    await ln.schedule({ notifications: [{ id: ID_TEST, title: lang === "en" ? "🔔 Reminder test" : "🔔 Test de rappel", body: lang === "en" ? "If you see this message, your agenda reminders will work." : "Si tu vois ce message, les rappels de ton agenda fonctionneront.", schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true } }] });
    return { etat: "ok" };
  } catch (e) { console.error("test rappel:", e); return { etat: "erreur" }; }
}
// Ouvre le réglage Android « Alarmes et rappels » (utile seulement si l'alarme exacte n'est pas déjà accordée)
export async function autoriserAlarmes() {
  const ln = plugin(); if (!ln) return false;
  try { await ln.changeExactNotificationSetting(); return true; } catch (e) { return false; }
}

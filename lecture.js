/* =========================================================================
   LECTURE — calendrier de lecture de la Bible (onglet « Bible » > « Calendrier »)
   - Plans décrits dans content/plans/*.json (anglais : content/en/plans/*.json), listés dans index.json.
   - Un plan se suit jour après jour, sans date : on avance à son rythme, avec des jours de rattrapage.
   - L'avancement est enregistré dans formation/{uid}/lecture/{plan} : jours faits + résumé lisible par les coordinateurs.
   - Quand un jour est coché, l'événement « abba-lecture-faite » coche aussi « Lecture de la Bible » dans « Ma journée ».
   ========================================================================= */
const $ = (id) => document.getElementById(id);
const EN = () => window.I18N?.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = () => window.AbbaSync;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayNum = (str) => { const [y, m, d] = str.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const nomLivre = (l) => (window.AbbaBible && window.AbbaBible.nom ? window.AbbaBible.nom(l) : `#${l}`);

const L = { user: null, plans: [], planId: null, plan: null, prog: null, unsub: null, boite: null, chargement: false, erreur: false, intro: null, ouvert: {} };

async function chargerJSON(chemin) {
  const r = await fetch(chemin, { cache: "no-cache" });
  if (!r.ok) throw new Error(chemin);
  return r.json();
}
async function chargerPlans() {
  if (L.plans.length && L.plan && L.plan._lang === (EN() ? "en" : "fr")) { L.chargement = false; return; }
  L.chargement = true; L.erreur = false;
  const dossier = EN() ? "/ABBA-Parcours/content/en/plans/" : "/ABBA-Parcours/content/plans/";
  try {
    let idx;
    try { idx = await chargerJSON(dossier + "index.json"); } catch { idx = await chargerJSON("/ABBA-Parcours/content/plans/index.json"); }
    L.plans = idx.plans || [];
    if (!L.planId) L.planId = (L.plans.find((p) => p.defaut) || L.plans[0] || {}).id;
    const info = L.plans.find((p) => p.id === L.planId) || L.plans[0];
    let plan;
    try { plan = await chargerJSON(dossier + info.fichier); } catch { plan = await chargerJSON("/ABBA-Parcours/content/plans/" + info.fichier); }
    plan._lang = EN() ? "en" : "fr";
    L.plan = plan;
  } catch (e) { L.erreur = true; }
  L.chargement = false;
}

/* ---------- Données de l'utilisateur ---------- */
function ecouter() {
  if (L.unsub) { try { L.unsub(); } catch (e) {} L.unsub = null; }
  if (!L.user || !L.planId || !S() || !S().watchLecture) return;
  L.unsub = S().watchLecture(L.user.uid, L.planId, (doc) => { L.prog = doc || null; rendre(); });
}
const surConnexion = (u) => {
  L.user = u || null; L.prog = null;
  if (!L.user) { ecouter(); rendre(); return; }
  chargerPlans().then(() => { ecouter(); rendre(); });
};
if (S() && S().watchAuth) S().watchAuth(surConnexion);
else window.addEventListener("load", () => { if (S() && S().watchAuth) S().watchAuth(surConnexion); });

/* ---------- Calculs ---------- */
function lecturesDe(j) {
  const out = [];
  (j.lecture || []).forEach((s) => { for (let c = s.de; c <= s.a; c++) out.push({ l: s.l, c }); });
  return out;
}
function libelle(j) {
  if (j.rattrapage) return L.plan.rattrapage;
  return (j.lecture || []).map((s) => (s.de === s.a ? `${nomLivre(s.l)} ${s.de}` : `${nomLivre(s.l)} ${s.de}–${s.a}`)).join(" ; ");
}
function etat() {
  const done = (L.prog && L.prog.done) || {};
  const jours = L.plan.jours, lect = jours.filter((j) => !j.rattrapage);
  const faits = lect.filter((j) => done[j.n]);
  const prochain = lect.find((j) => !done[j.n]) || null;
  const chapitres = faits.reduce((n, j) => n + lecturesDe(j).length, 0);
  const dates = Object.values(done).filter((v) => typeof v === "string").sort();
  const start = L.prog && L.prog.start;
  let attendu = null;
  if (start) attendu = Math.min(180, Math.max(1, dayNum(today()) - dayNum(start) + 1));
  return { done, lect, faits: faits.length, prochain, chapitres, dernier: dates.length ? dates[dates.length - 1] : "", start, attendu, fini: !prochain };
}
const estRattrapage = (n) => !!(L.plan && L.plan.jours[n - 1] && L.plan.jours[n - 1].rattrapage);
function etatTemps() {
  const e = etat();
  if (!e.start) return { e, statut: "pas-commence", auj: 1, dus: [], retards: 0, avance: 0, suivant: e.prochain };
  const auj = Math.min(L.plan.jours.length, Math.max(1, dayNum(today()) - dayNum(e.start) + 1));
  const dus = e.lect.filter((j) => j.n <= auj && !e.done[j.n]);              // lectures dues (jusqu'à aujourd'hui) et pas faites
  const retards = dus.filter((j) => j.n < auj).length;                       // dont celles d'avant aujourd'hui
  const avance = e.lect.filter((j) => j.n > auj && e.done[j.n]).length;
  const suivant = e.lect.find((j) => j.n > auj && !e.done[j.n]) || null;
  const statut = e.fini ? "fini" : retards > 0 ? "retard" : dus.length > 0 ? "aujourdhui" : "ok";
  return { e, statut, auj, dus, retards, avance, suivant, rattrapageAujourdhui: estRattrapage(auj) };
}
const resumeDe = (e) => ({ jour: e.prochain ? e.prochain.n : 180, faits: e.faits, total: e.lect.length, chapitres: e.chapitres, dernier: e.dernier });

/* ---------- Écriture ---------- */
async function sauver(done, start) {
  if (!L.user) return;
  const e = (() => { const sv = L.prog; L.prog = { ...(sv || {}), done, start }; const r = etat(); L.prog = sv; return r; })();
  await S().saveLecture(L.user.uid, L.planId, { plan: L.planId, start: start || today(), done, resume: resumeDe(e) });
}
async function basculer(n) {
  const done = { ...((L.prog && L.prog.done) || {}) };
  const marquer = !done[n];
  if (marquer) done[n] = today(); else delete done[n];
  await sauver(done, (L.prog && L.prog.start) || today());
  if (marquer) { try { window.dispatchEvent(new CustomEvent("abba-lecture-faite", { detail: { jour: n } })); } catch (e) {} }
}
async function demarrer() { await sauver({ ...((L.prog && L.prog.done) || {}) }, today()); }

/* ---------- Affichage ---------- */
const puce = (l, c) => `<button type="button" class="lec-chap" data-lec="lire" data-l="${l}" data-c="${c}">${esc(nomLivre(l))} ${c}</button>`;
const puces = (j) => lecturesDe(j).map((x) => puce(x.l, x.c)).join("");

function carteProchain(e) {
  if (e.fini) return `<div class="card lec-carte"><p class="eyebrow">🎉 ${T("Plan terminé", "Plan completed")}</p><p>${esc(L.plan.fin)}</p></div>`;
  const j = e.prochain;
  let h = `<div class="card lec-carte"><p class="eyebrow">${T("Prochaine lecture", "Next reading")} · ${T("Jour", "Day")} ${j.n}</p><p class="lec-titre">${esc(libelle(j))}</p><div class="lec-puces">${puces(j)}</div>`;
  h += `<button type="button" class="btn-primary full" data-lec="fait" data-j="${j.n}">✓ ${T("J’ai lu", "I have read")}</button>`;
  const suiv = L.plan.jours[j.n]; // jour suivant (index = n)
  if (suiv && suiv.rattrapage) h += `<p class="small">${T("Le jour suivant est un jour de rattrapage.", "The next day is a catch-up day.")}</p>`;
  return h + "</div>";
}
function ligneStatut(t) {
  const s = t.statut;
  if (s === "pas-commence" || s === "fini") return "";
  let msg;
  if (s === "retard") msg = T(`En retard de ${t.retards} jour${t.retards > 1 ? "s" : ""} : rattrape tes lectures, les jours de rattrapage sont là pour ça.`, `${t.retards} day${t.retards > 1 ? "s" : ""} behind: catch up on your readings, that is what the catch-up days are for.`);
  else if (s === "aujourdhui") msg = T(`Aujourd’hui, jour ${t.auj} : ta lecture du jour t’attend.`, `Today, day ${t.auj}: your reading for the day is waiting.`);
  else msg = t.avance > 0 ? T(`À jour, avec ${t.avance} jour${t.avance > 1 ? "s" : ""} d’avance.`, `Up to date, ${t.avance} day${t.avance > 1 ? "s" : ""} ahead.`) : T("À jour : ta lecture du jour est faite.", "Up to date: today’s reading is done.");
  const cl = s === "retard" ? "rouge" : s === "aujourdhui" ? "orange" : "ok";
  return `<p class="lec-statut lec-${cl}">${esc(msg)}</p>`;
}
function editeurDebut(e) {
  if (!e.start) return "";
  return `<details class="lec-debut"><summary class="small">${T("Ma date de début", "My start date")} : ${esc(e.start)}</summary><p class="small">${T("Si tu as déjà commencé avant, corrige la date : le calendrier compte à partir de ce jour (jour 1).", "If you started earlier, correct the date: the calendar counts from this day (day 1).")}</p><input type="date" id="lecDebut" class="text-input" value="${esc(e.start)}" max="${today()}"> <button type="button" class="btn-secondary" data-lec="debut">${T("Enregistrer la date", "Save the date")}</button></details>`;
}
function phaseHtml(p, t) {
  const e = t.e, done = e.done;
  const jr = L.plan.jours.filter((j) => j.n >= p.de && j.n <= p.a);
  const chLus = jr.filter((j) => !j.rattrapage && done[j.n]).reduce((n, j) => n + lecturesDe(j).length, 0);
  const contient = e.prochain && e.prochain.n >= p.de && e.prochain.n <= p.a;
  const ouvert = L.ouvert[p.n] !== undefined ? L.ouvert[p.n] : contient;
  let h = `<details class="lec-phase" data-phase="${p.n}"${ouvert ? " open" : ""}><summary><strong>${T("Phase", "Phase")} ${p.n}</strong> · ${esc(p.titre)}<br><span class="small">${T("Jours", "Days")} ${p.de}–${p.a} · ${chLus}/${p.chapitres} ${T("chapitres", "chapters")}</span></summary>`;
  h += `<p class="small"><em>${esc(p.resume)}</em></p>`;
  h += `<details class="lec-livres"><summary class="small">${T("Les livres de cette phase", "The books in this phase")}</summary>${p.livres.map((b) => `<p class="small"><strong>${esc(nomLivre(b.l))}</strong> (${b.ch} ${T("ch.", "ch.")}) : ${esc(b.desc)}</p>`).join("")}</details>`;
  h += '<div class="lec-jours">';
  jr.forEach((j) => {
    const fait = !!done[j.n], prochain = e.prochain && e.prochain.n === j.n;
    const enRetard = !fait && !j.rattrapage && e.start && j.n < t.auj, aujourdhui = e.start && j.n === t.auj;
    h += `<div class="lec-row${fait ? " fait" : ""}${prochain ? " prochain" : ""}${j.rattrapage ? " ratt" : ""}${enRetard ? " retard" : ""}${aujourdhui ? " auj" : ""}"><button type="button" class="lec-box" data-lec="toggle" data-j="${j.n}" aria-label="${T("Jour", "Day")} ${j.n}" aria-pressed="${fait}">${fait ? "☑" : "☐"}</button><span class="lec-n">${T("Jour", "Day")} ${j.n}${aujourdhui ? `<br><span class="lec-tag">${T("aujourd’hui", "today")}</span>` : enRetard ? `<br><span class="lec-tag rouge">${T("en retard", "late")}</span>` : ""}</span><span class="lec-lect">${j.rattrapage ? `<em>${esc(L.plan.rattrapage)}</em>` : puces(j)}</span></div>`;
  });
  return h + "</div></details>";
}
function emettre() { try { window.dispatchEvent(new CustomEvent("abba-lecture-maj")); } catch (e) {} }
// Prochaine lecture, pour la carte « Lecture du jour » de l'accueil
function prochainInfo() {
  if (!L.user || !L.plan) return null;
  const t = etatTemps();
  if (t.statut === "fini") return { fini: true, statut: "fini", chapitres: t.e.chapitres };
  const vue = (j) => ({ n: j.n, segs: lecturesDe(j), libelle: libelle(j) });
  return {
    fini: false, statut: t.statut, demarre: !!t.e.start, auj: t.auj, rattrapageAujourdhui: !!t.rattrapageAujourdhui,
    du: t.dus.map(vue), retards: t.retards, avance: t.avance, suivant: t.suivant ? vue(t.suivant) : null,
  };
}
function rendre() {
  emettre();
  const box = L.boite;
  if (!box || !box.isConnected) return;
  if (L.chargement) { box.innerHTML = `<p class="small">${T("Chargement…", "Loading…")}</p>`; return; }
  if (L.erreur || !L.plan) { box.innerHTML = `<p class="bib-alerte">${T("Impossible de charger le calendrier. Vérifie ta connexion puis rouvre cet onglet.", "The calendar could not be loaded. Check your connection and reopen this tab.")}</p>`; return; }
  if (!L.user) { box.innerHTML = `<p class="small">${T("Connecte-toi pour suivre ton calendrier de lecture.", "Sign in to follow your reading calendar.")}</p>`; return; }
  const t = etatTemps(), e = t.e;
  let h = "";
  if (L.plans.length > 1) h += `<label class="field"><span>${T("Calendrier", "Calendar")}</span><select class="text-input" data-lec="plan">${L.plans.map((p) => `<option value="${esc(p.id)}"${p.id === L.planId ? " selected" : ""}>${esc(EN() ? (p.titre_en || p.titre) : p.titre)}</option>`).join("")}</select></label>`;
  h += `<div class="card"><p class="eyebrow">${esc(L.plan.titre)}</p><p class="small">${esc(L.plan.sous)}</p>`;
  const pct = Math.round((e.faits / e.lect.length) * 100);
  h += `<div class="lec-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  h += `<p class="small"><strong>${e.chapitres}</strong> / ${L.plan.chapitres} ${T("chapitres lus", "chapters read")} · ${e.faits} / ${e.lect.length} ${T("jours de lecture", "reading days")}</p>`;
  h += ligneStatut(t);
  if (!e.start) h += `<p class="small">${T("Le calendrier compte à partir du jour où tu commences : ce jour-là, c’est le jour 1.", "The calendar counts from the day you start: that day is day 1.")}</p><button type="button" class="btn-primary full" data-lec="demarrer">▶ ${T("Commencer aujourd’hui", "Start today")}</button>`;
  h += editeurDebut(e);
  h += "</div>";
  h += carteProchain(e);
  const ouvertIntro = L.intro !== null ? L.intro : !L.prog;
  h += `<details class="lec-intro card" data-intro${ouvertIntro ? " open" : ""}><summary><strong>${T("Comment utiliser ce plan", "How to use this plan")}</strong></summary><ul>${L.plan.intro.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>`;
  h += L.plan.phases.map((p) => phaseHtml(p, t)).join("");
  box.innerHTML = h;
}

/* ---------- Événements ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-lec]");
  if (!b || !L.boite || !L.boite.contains(b)) return;
  const a = b.dataset.lec;
  try {
    if (a === "lire") { if (window.AbbaBible && window.AbbaBible.lire) window.AbbaBible.lire(Number(b.dataset.l), Number(b.dataset.c)); return; }
    if (a === "fait" || a === "toggle") { await basculer(Number(b.dataset.j)); return; }
    if (a === "demarrer") { await demarrer(); return; }
    if (a === "debut") {
      const v = (document.getElementById("lecDebut") || {}).value || "";
      if (!v || v > today()) { alert(T("Choisis une date qui n’est pas dans le futur.", "Choose a date that is not in the future.")); return; }
      await sauver({ ...((L.prog && L.prog.done) || {}) }, v); return;
    }
  } catch (err) { alert(T("Impossible d’enregistrer : ", "Unable to save: ") + (err.code || err.message)); }
});
document.addEventListener("change", (ev) => {
  const s = ev.target.closest('[data-lec="plan"]');
  if (s && L.boite && L.boite.contains(s)) { L.planId = s.value; L.plan = null; L.prog = null; chargerPlans().then(() => { ecouter(); rendre(); }); }
});
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!(d instanceof HTMLElement) || !L.boite || !L.boite.contains(d)) return;
  if (d.matches("[data-phase]")) L.ouvert[d.dataset.phase] = d.open;
  if (d.matches("[data-intro]")) L.intro = d.open;
}, true);

window.AbbaLecture = {
  prochain: prochainInfo,
  demarrer: async () => { if (L.user && L.plan && !(L.prog && L.prog.start)) await demarrer(); },
  marquer: async (n) => { if (L.user && L.plan && !((L.prog && L.prog.done) || {})[n]) await basculer(n); },
  rendre: async (boite) => {
    L.boite = boite;
    L.chargement = true; rendre();
    await chargerPlans();
    if (L.user && !L.unsub) ecouter();
    rendre();
  },
};

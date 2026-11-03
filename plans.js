/* =========================================================================
   PLANS DE LECTURE — onglet « Bible » > « Mes plans » (ABBA Life, ouvert à tous)
   - Chacun crée ses plans : un modèle (Bible en 1 an, Nouveau Testament en 90 jours, Évangiles, Psaumes, Proverbes)
     ou un plan personnalisé (de tel livre à tel livre, en tant de jours), avec une date de début.
   - Les chapitres sont répartis à parts égales sur les jours du plan ; on marque chaque jour lu, on voit son retard.
   - Les plans sont rangés dans l'espace privé de la personne (users/{uid}/priv/plans), lisibles par elle seule.
   - Quand un jour est marqué lu, « Lecture biblique du jour » se coche aussi dans « Spirituel » (événement abba-lecture-faite).
   - L'ancien calendrier du Nouveau Testament (6 mois, plan ABBA) reste disponible, replié, en bas de l'onglet.
   ========================================================================= */
const EN = () => window.I18N?.lang === "en";
const T = (fr, en) => (EN() ? en : fr);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = () => window.AbbaSync;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayNum = (str) => { const [y, m, d] = str.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const nomLivre = (l) => (window.AbbaBible && window.AbbaBible.nom ? window.AbbaBible.nom(l) : `#${l}`);

const MODELES = {
  annee: { fr: "La Bible en 1 an", en: "The Bible in 1 year", livreDebut: 1, livreFin: 66, nbJours: 365 },
  nt90: { fr: "Le Nouveau Testament en 90 jours", en: "The New Testament in 90 days", livreDebut: 40, livreFin: 66, nbJours: 90 },
  evangiles: { fr: "Les Évangiles en 30 jours", en: "The Gospels in 30 days", livreDebut: 40, livreFin: 43, nbJours: 30 },
  psaumes: { fr: "Les Psaumes en 30 jours", en: "The Psalms in 30 days", livreDebut: 19, livreFin: 19, nbJours: 30 },
  proverbes: { fr: "Les Proverbes en 31 jours", en: "Proverbs in 31 days", livreDebut: 20, livreFin: 20, nbJours: 31 },
};

const P = { user: null, plans: [], chapitres: null, boite: null, unsub: null, modele: "nt90", perso: { titre: "", livreDebut: 40, livreFin: 66, nbJours: 90 }, debut: null, info: "", infoErreur: false, aSupprimer: null, ntOuvert: false, ouverts: {}, formOuvert: false };

/* ---------- Calculs (identiques à ceux de Gestion) ---------- */
const plage = (a, b) => { const l = []; for (let x = a; x <= b; x++) for (let c = 1; c <= P.chapitres[x - 1]; c++) l.push([x, c]); return l; };
function lectureDuJour(p, jour) {
  const l = plage(p.livreDebut, p.livreFin);
  return l.slice(Math.floor(((jour - 1) * l.length) / p.nbJours), Math.floor((jour * l.length) / p.nbJours));
}
function libelle(chaps) {
  if (!chaps.length) return "—";
  const parts = []; let cur = null;
  chaps.forEach(([b, c]) => { if (cur && cur.b === b && cur.fin === c - 1) cur.fin = c; else { cur = { b, debut: c, fin: c }; parts.push(cur); } });
  return parts.map((q) => `${nomLivre(q.b)} ${q.debut === q.fin ? q.debut : `${q.debut}–${q.fin}`}`).join(" ; ");
}

/* ---------- Données ---------- */
async function chargerChapitres() {
  if (P.chapitres) return;
  try { P.chapitres = (await (await fetch("/bible/index.json")).json()).chapitres; } catch { P.chapitres = null; }
}
function ecouter() {
  if (P.unsub) { try { P.unsub(); } catch (e) {} P.unsub = null; }
  if (!P.user || !S() || !S().watchPlans) return;
  P.unsub = S().watchPlans(P.user.uid, (l) => { P.plans = Array.isArray(l) ? l : []; rendre(); });
}
const sauver = (liste) => S().savePlans(P.user.uid, liste);
const surConnexion = (u) => { P.user = u || null; P.plans = []; ecouter(); rendre(); };
if (S() && S().watchAuth) S().watchAuth(surConnexion);
else window.addEventListener("load", () => { if (S() && S().watchAuth) S().watchAuth(surConnexion); });

/* ---------- Affichage ---------- */
const nomModele = (k) => T(MODELES[k].fr, MODELES[k].en);
function carte(p, auj) {
  const courant = Math.max(1, Math.min(dayNum(auj) - dayNum(p.debut) + 1, p.nbJours));
  const pasCommence = p.debut > auj;
  let prochain = 1; while (prochain <= p.nbJours && p.joursFaits.includes(prochain)) prochain++;
  const termine = prochain > p.nbJours;
  const retard = pasCommence || termine ? 0 : Math.max(0, courant - prochain);
  const jour = termine ? p.nbJours : prochain;
  const lecture = lectureDuJour(p, jour);
  const fait = p.joursFaits.includes(jour);
  const pct = Math.round((p.joursFaits.length / p.nbJours) * 100);
  let h = `<details class="card plan-carte" data-plan="${esc(p.id)}"${P.ouverts[p.id] ? " open" : ""}><summary><span class="plan-titre">${esc(p.titre)}</span>`;
  h += `<span class="plan-resume">${termine ? "🎉 " + T("Terminé", "Completed") : `${p.joursFaits.length} / ${p.nbJours} ${T("jours", "days")} · ${pct} %`}${retard > 0 ? ` · <span class="plan-retard">${retard} ${T("j. de retard", "d. behind")}</span>` : ""}</span></summary>`;
  h += `<div class="lec-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  h += `<p class="small">${p.joursFaits.length} / ${p.nbJours} ${T("jours lus", "days read")} (${pct} %)${pasCommence ? ` · ${T("commence le", "starts on")} ${esc(p.debut)}` : ""}`;
  if (retard > 0) h += ` · <span class="plan-retard">${retard} ${T("jour(s) de retard", "day(s) behind")}</span>`;
  h += `</p>`;
  if (termine) h += `<p class="plan-fini">🎉 ${T("Plan terminé. Félicitations !", "Plan completed. Congratulations!")}</p>`;
  else {
    h += `<div class="plan-jour"><p class="small">${T("Jour", "Day")} ${jour}${jour === courant && !pasCommence ? ` — ${T("aujourd'hui", "today")}` : ""}</p>`;
    h += `<p class="plan-lecture">${esc(libelle(lecture))}</p><div class="plan-actions">`;
    if (lecture[0]) h += `<button class="btn-secondary btn-compact" data-pl="lire" data-l="${lecture[0][0]}" data-c="${lecture[0][1]}">📖 ${T("Lire", "Read")}</button>`;
    h += `<button class="btn-primary btn-compact" data-pl="fait" data-id="${esc(p.id)}" data-j="${jour}">${fait ? "↩ " + T("Annuler", "Undo") : "✓ " + T("J'ai lu", "Done")}</button></div></div>`;
  }
  if (P.aSupprimer === p.id) h += `<p class="small">${T("Supprimer ce plan ?", "Delete this plan?")} <button class="link-btn" data-pl="suppr-oui" data-id="${esc(p.id)}">${T("Oui", "Yes")}</button> · <button class="link-btn" data-pl="suppr-non">${T("Non", "No")}</button></p>`;
  else h += `<button class="link-btn plan-suppr" data-pl="suppr" data-id="${esc(p.id)}">${T("Supprimer le plan", "Delete plan")}</button>`;
  return h + `</details>`;
}
function optionsLivres(sel) { return Array.from({ length: 66 }, (_, i) => `<option value="${i + 1}"${i + 1 === sel ? " selected" : ""}>${esc(nomLivre(i + 1))}</option>`).join(""); }
function formulaire() {
  let h = `<details class="card plan-form" data-form${P.formOuvert ? " open" : ""}><summary><span class="plan-titre">${T("Nouveau plan de lecture", "New reading plan")}</span></summary>`;
  h += `<label class="field"><span>${T("Modèle", "Template")}</span><select class="text-input" data-pl="modele">`;
  h += Object.keys(MODELES).map((k) => `<option value="${k}"${P.modele === k ? " selected" : ""}>${esc(nomModele(k))}</option>`).join("");
  h += `<option value="perso"${P.modele === "perso" ? " selected" : ""}>${T("Plan personnalisé…", "Custom plan…")}</option></select></label>`;
  if (P.modele === "perso") {
    h += `<label class="field"><span>${T("Titre", "Title")}</span><input class="text-input" data-pl="p-titre" maxlength="100" value="${esc(P.perso.titre)}"></label>`;
    h += `<div class="plan-deux"><label class="field"><span>${T("De", "From")}</span><select class="text-input" data-pl="p-de">${optionsLivres(P.perso.livreDebut)}</select></label>`;
    h += `<label class="field"><span>${T("À", "To")}</span><select class="text-input" data-pl="p-a">${optionsLivres(P.perso.livreFin)}</select></label></div>`;
    h += `<label class="field"><span>${T("Nombre de jours", "Number of days")}</span><input class="text-input" type="number" min="1" max="1189" data-pl="p-jours" value="${esc(P.perso.nbJours)}"></label>`;
  }
  h += `<label class="field"><span>${T("Date de début", "Start date")}</span><input class="text-input" type="date" data-pl="debut" value="${esc(P.debut || today())}"></label>`;
  h += `<button class="btn-primary" data-pl="creer">${T("Créer le plan", "Create plan")}</button>`;
  if (P.info) h += `<p class="small" style="color:${P.infoErreur ? "#b42318" : "#1a7f37"}">${esc(P.info)}</p>`;
  return h + `</details>`;
}
function rendre() {
  const box = P.boite; if (!box || !box.isConnected) return;
  if (!P.user) { box.innerHTML = `<p class="small">${T("Connecte-toi pour créer tes plans de lecture.", "Sign in to create your reading plans.")}</p>`; return; }
  if (!P.chapitres) { box.innerHTML = `<p class="bib-alerte">${T("Impossible de charger la Bible. Vérifie ta connexion puis rouvre cet onglet.", "The Bible could not be loaded. Check your connection and reopen this tab.")}</p>`; return; }
  const auj = today();
  let h = P.plans.length ? P.plans.map((p) => carte(p, auj)).join("")
    : `<p class="small">${T("Tu n'as pas encore de plan de lecture. Ouvre « Nouveau plan de lecture » ci-dessous pour en créer un.", "You don't have a reading plan yet. Open “New reading plan” below to create one.")}</p>`;
  h += formulaire();
  h += `<details class="lec-intro card" data-nt${P.ntOuvert ? " open" : ""}><summary><strong>${T("Calendrier du Nouveau Testament (plan ABBA, 6 mois)", "New Testament calendar (ABBA plan, 6 months)")}</strong></summary><div id="ntBox"></div></details>`;
  // On ne touche pas aux champs en cours de saisie : on ne redessine pas pendant qu'on écrit
  const actif = document.activeElement;
  if (actif && box.contains(actif) && actif.matches("input,select") && box.dataset.vu) return;
  box.innerHTML = h; box.dataset.vu = "1";
  if (P.ntOuvert) montrerNT();
}
function montrerNT() { const nt = P.boite && P.boite.querySelector("#ntBox"); if (nt && window.AbbaCalendrierNT) window.AbbaCalendrierNT.rendre(nt); }

/* ---------- Actions ---------- */
const nouvelId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
async function creer() {
  const base = P.modele === "perso" ? { ...P.perso, titre: (P.perso.titre || "").trim() || T("Mon plan de lecture", "My reading plan") }
    : { titre: nomModele(P.modele), ...MODELES[P.modele] };
  const de = Number(base.livreDebut), a = Number(base.livreFin);
  P.infoErreur = true;
  if (de > a) { P.info = T("Le livre de départ doit venir avant le livre de fin.", "The first book must come before the last book."); rendre(); return; }
  const total = plage(de, a).length;
  const nbJours = Math.max(1, Math.min(Number(base.nbJours) || 1, total));
  const debut = P.debut || today();
  try {
    await sauver([{ id: nouvelId(), titre: String(base.titre).slice(0, 100), debut, nbJours, livreDebut: de, livreFin: a, joursFaits: [], creeLe: Date.now() }, ...P.plans]);
    P.info = T("Plan créé. Ta lecture du jour apparaît ci-dessus.", "Plan created. Today's reading appears above."); P.infoErreur = false;
  } catch (e) { P.info = T("Création impossible : ", "Could not create: ") + (e.code || e.message); }
  P.boite && delete P.boite.dataset.vu; rendre();
}
async function basculer(id, jour) {
  const plan = P.plans.find((p) => p.id === id); if (!plan) return;
  const fait = plan.joursFaits.includes(jour);
  const liste = P.plans.map((p) => (p.id === id ? { ...p, joursFaits: fait ? p.joursFaits.filter((j) => j !== jour) : [...p.joursFaits, jour].sort((x, y) => x - y) } : p));
  await sauver(liste);
  if (!fait) { try { window.dispatchEvent(new CustomEvent("abba-lecture-faite", { detail: { jour } })); } catch (e) {} }
}

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-pl]");
  if (!b || !P.boite || !P.boite.contains(b)) return;
  const a = b.dataset.pl;
  try {
    if (a === "lire") { if (window.AbbaBible && window.AbbaBible.lire) window.AbbaBible.lire(Number(b.dataset.l), Number(b.dataset.c)); }
    else if (a === "fait") await basculer(b.dataset.id, Number(b.dataset.j));
    else if (a === "creer") await creer();
    else if (a === "suppr") { P.aSupprimer = b.dataset.id; delete P.boite.dataset.vu; rendre(); }
    else if (a === "suppr-non") { P.aSupprimer = null; delete P.boite.dataset.vu; rendre(); }
    else if (a === "suppr-oui") { await sauver(P.plans.filter((p) => p.id !== b.dataset.id)); P.aSupprimer = null; delete P.boite.dataset.vu; rendre(); }
  } catch (err) { alert(T("Impossible d'enregistrer : ", "Unable to save: ") + (err.code || err.message)); }
});
document.addEventListener("change", (ev) => {
  const s = ev.target.closest("[data-pl]");
  if (!s || !P.boite || !P.boite.contains(s)) return;
  const a = s.dataset.pl;
  if (a === "modele") { P.modele = s.value; P.info = ""; delete P.boite.dataset.vu; rendre(); }
  else if (a === "p-de") P.perso.livreDebut = Number(s.value);
  else if (a === "p-a") P.perso.livreFin = Number(s.value);
  else if (a === "debut") P.debut = s.value;
});
document.addEventListener("input", (ev) => {
  const s = ev.target.closest("[data-pl]");
  if (!s || !P.boite || !P.boite.contains(s)) return;
  if (s.dataset.pl === "p-titre") P.perso.titre = s.value;
  else if (s.dataset.pl === "p-jours") P.perso.nbJours = s.value;
});
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!(d instanceof HTMLElement) || !P.boite || !P.boite.contains(d)) return;
  if (d.matches("[data-nt]")) { P.ntOuvert = d.open; if (d.open) montrerNT(); }
  else if (d.matches("[data-plan]")) P.ouverts[d.dataset.plan] = d.open;
  else if (d.matches("[data-form]")) P.formOuvert = d.open;
}, true);

window.AbbaLecture = {
  rendre: async (boite) => {
    P.boite = boite; delete boite.dataset.vu;
    if (!P.debut) P.debut = today();
    rendre();
    await chargerChapitres();
    if (P.user && !P.unsub) ecouter();
    delete boite.dataset.vu; rendre();
  },
};

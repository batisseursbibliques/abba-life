/* ============================================================
   ABBA LIFE — Carnet du Bâtisseur
   Les données de chaque Bâtisseur sont sauvegardées dans Firebase
   (compte + Firestore) et mises en cache localement pour l'usage
   hors connexion. Voir sync.js pour la couche Firebase.
   ============================================================ */

const STORAGE_KEY = "abbalife_data_v1";

const DEFAULT_CHECKLIST = [
  { id: "sommeil", title: "Sommeil & Rythme", items: [
    { id: "s1", label: "Dormir 7–8 heures" },
    { id: "s2", label: "Coucher entre 21h30 et 22h" },
    { id: "s3", label: "Lever vers 5h30" },
    { id: "s4", label: "Pas de téléphone au lit" },
  ]},
  { id: "declaration", title: "Déclaration principale", items: [
    { id: "d1", label: "Déclaration principale — matin" },
    { id: "d2", label: "Déclaration principale — soir" },
  ]},
  { id: "priere", title: "Prière & Communion", items: [
    { id: "p1", label: "Prière du matin" },
    { id: "p2", label: "Prière de l'après-midi" },
    { id: "p3", label: "Prière du soir" },
    { id: "p4", label: "Intercéder pour quelqu'un" },
    { id: "p5", label: "Prier pour ABBA" },
  ]},
  { id: "etude", title: "Étude & Méditation", items: [
    { id: "e1", label: "Lecture biblique du jour" },
    { id: "e2", label: "Lecture d'un livre chrétien" },
    { id: "e3", label: "Méditer un passage" },
  ]},
  { id: "service", title: "Service & Générosité", items: [
    { id: "g1", label: "Encourager quelqu'un" },
    { id: "g2", label: "Faire un don" },
    { id: "g3", label: "Partager sa foi" },
  ]},
];
let SPIRITUAL_CATEGORIES = deepClone(DEFAULT_CHECKLIST);
let TOTAL_ITEMS = computeTotalItems();
function computeTotalItems() {
  return SPIRITUAL_CATEGORIES.reduce((n, c) => n + c.items.length, 0);
}
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

const EXPENSE_CATEGORIES = [
  "Dîme", "Offrandes / Missions",
  "Logement", "Nourriture", "Transport", "Santé",
  "Éducation des enfants", "Soins aux parents",
  "Aide aux pauvres / Générosité",
  "Épargne", "Loisirs / Personnel", "Autre dépense",
];
const INCOME_CATEGORIES = ["Salaire", "Commerce", "Don reçu", "Autre revenu"];

const GENEROSITY_CATS = ["Offrandes / Missions", "Aide aux pauvres / Générosité"];
const LIVING_EXCLUDE = ["Dîme", "Épargne", ...GENEROSITY_CATS];

const MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const DAYS_FR = ["dim","lun","mar","mer","jeu","ven","sam"];

/* ---------- Données ---------- */
function defaultData() {
  return {
    settings: { currency: "FCFA", tithe: 10, savings: 20, generosity: 5, living: 65 },
    spiritual: {},
    transactions: [],
  };
}
let DATA = defaultData();
let CURRENT_USER = null;
let IS_ADMIN = false;
let ADMIN_LIST = [];
let unsubUserData = null;
let unsubChecklist = null;
let unsubAdmins = null;
let suppressCloudWrite = false; // évite de renvoyer vers Firestore ce qu'on vient de recevoir de Firestore

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Lecture du cache local impossible.", e);
    return null;
  }
}
function saveLocalCache() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}
function saveData() {
  saveLocalCache();
  if (CURRENT_USER && !suppressCloudWrite) {
    window.AbbaSync.saveUserData(CURRENT_USER.uid, DATA).catch(err => console.error("Sauvegarde cloud impossible :", err));
  }
}

/* ---------- Utilitaires date ---------- */
function todayStr() { return fmtDate(new Date()); }
function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDate(s) { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); }
function addDays(dateStr, n) { const d = parseDate(dateStr); d.setDate(d.getDate() + n); return fmtDate(d); }
function fmtLong(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtNum(n) {
  return Math.round(n).toLocaleString("fr-FR");
}

/* ---------- État de navigation ---------- */
let spiritViewDate = todayStr();
let financeViewMonth = new Date().getMonth();
let financeViewYear = new Date().getFullYear();

/* ============================================================
   INITIALISATION
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  renderTopbarDate();
  setupTabs();
  setupGotoLinks();
  setupSpiritDateNav();
  setupFinanceMonthNav();
  setupTxModal();
  setupSettings();
  setupAuthScreen();
  setupCoordination();
  setupChecklistEditor();
  setupAdminManager();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Démarre l'écoute de l'état de connexion (voir sync.js)
  window.AbbaSync.watchAuth(onAuthChanged);
});

/* ============================================================
   AUTHENTIFICATION
   ============================================================ */
function setupAuthScreen() {
  document.getElementById("authTabLogin").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("authTabSignup").addEventListener("click", () => switchAuthTab("signup"));

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    try {
      await window.AbbaSync.logIn(email, password);
    } catch (err) {
      errEl.textContent = traduireErreurAuth(err);
    }
  });

  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nom = document.getElementById("signupNom").value;
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const errEl = document.getElementById("signupError");
    errEl.textContent = "";
    try {
      await window.AbbaSync.signUp(nom, email, password);
    } catch (err) {
      errEl.textContent = traduireErreurAuth(err);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await window.AbbaSync.logOut();
  });
}
function switchAuthTab(which) {
  document.getElementById("authTabLogin").classList.toggle("active", which === "login");
  document.getElementById("authTabSignup").classList.toggle("active", which === "signup");
  document.getElementById("loginForm").style.display = which === "login" ? "flex" : "none";
  document.getElementById("signupForm").style.display = which === "signup" ? "flex" : "none";
}
function traduireErreurAuth(err) {
  const code = err && err.code ? err.code : "";
  if (code.includes("email-already-in-use")) return "Cet e-mail a déjà un compte. Essaie « Se connecter ».";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "E-mail ou mot de passe incorrect.";
  if (code.includes("weak-password")) return "Mot de passe trop court (6 caractères minimum).";
  if (code.includes("invalid-email")) return "Adresse e-mail invalide.";
  if (code.includes("network-request-failed")) return "Pas de connexion internet. Réessaie plus tard.";
  return "Une erreur est survenue. Réessaie.";
}

async function onAuthChanged(user) {
  // On coupe les anciens écouteurs à chaque changement de compte
  if (unsubUserData) { unsubUserData(); unsubUserData = null; }
  if (unsubChecklist) { unsubChecklist(); unsubChecklist = null; }
  if (unsubAdmins) { unsubAdmins(); unsubAdmins = null; }

  if (!user) {
    CURRENT_USER = null;
    IS_ADMIN = false;
    ADMIN_LIST = [];
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    return;
  }

  CURRENT_USER = user;
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("accountEmailHint").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;

  // Écoute en direct la liste des coordinateurs (modifiable depuis l'app)
  unsubAdmins = window.AbbaSync.watchAdmins(async (emails) => {
    ADMIN_LIST = emails || [];
    const isBootstrap = window.AbbaSync.isAdminEmail(user.email);
    const inDynamicList = ADMIN_LIST.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
    IS_ADMIN = isBootstrap || inDynamicList;
    // Auto-amorçage : si tu es le coordinateur de secours et pas encore dans la liste, on t'y ajoute
    if (isBootstrap && !inDynamicList) {
      window.AbbaSync.ensureAdminSeed(user.email).catch(err => console.error("Amorçage admin :", err));
    }
    document.querySelectorAll(".admin-only").forEach(el => { el.style.display = IS_ADMIN ? "" : "none"; });
    renderAdminManager();
  });

  // Écoute en direct la checklist partagée
  unsubChecklist = window.AbbaSync.watchChecklist((categories) => {
    SPIRITUAL_CATEGORIES = (categories && categories.length) ? categories : deepClone(DEFAULT_CHECKLIST);
    TOTAL_ITEMS = computeTotalItems();
    renderSpiritualPanel();
    renderDashboard();
    renderHistorique();
    renderChecklistEditor();
  });
  // Si aucune checklist n'existe encore côté serveur et qu'on est admin, on l'initialise avec la valeur par défaut
  if (IS_ADMIN) {
    // laisse le premier onSnapshot arriver ; s'il est vide, on proposera "Enregistrer" pour créer le document
  }

  // Écoute en direct les données personnelles (spirituel + finance + réglages)
  let firstSnapshot = true;
  unsubUserData = window.AbbaSync.watchUserData(user.uid, async (cloudData) => {
    suppressCloudWrite = true;
    if (cloudData) {
      DATA = { ...defaultData(), ...cloudData, settings: { ...defaultData().settings, ...(cloudData.settings || {}) } };
    } else if (firstSnapshot) {
      // Nouveau compte : reprend d'éventuelles données locales existantes sur cet appareil (migration)
      const local = loadLocalCache();
      DATA = local ? { ...defaultData(), ...local, settings: { ...defaultData().settings, ...(local.settings || {}) } } : defaultData();
      suppressCloudWrite = false;
      saveData(); // pousse la première version vers le cloud
      suppressCloudWrite = true;
    }
    firstSnapshot = false;
    saveLocalCache();
    suppressCloudWrite = false;

    renderSpiritualPanel();
    renderFinancePanel();
    renderHistorique();
    renderDashboard();
    setupSettingsValues();
    pushSummary();
  });
}

/* ============================================================
   MODE CLAIR / SOMBRE
   ============================================================ */
function setupTheme() {
  const saved = localStorage.getItem("abbalife_theme");
  const preferred = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}
function applyTheme(theme) {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("abbalife_theme", theme);
}

function renderTopbarDate() {
  const el = document.getElementById("topbarDate");
  const d = new Date();
  el.textContent = `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

/* ============================================================
   NAVIGATION (onglets)
   ============================================================ */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab, .bnav-btn");
  tabs.forEach(btn => btn.addEventListener("click", () => goToTab(btn.dataset.tab)));
}
function goToTab(name) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`panel-${name}`).classList.add("active");
  document.querySelectorAll(".tab, .bnav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  if (name === "historique") renderHistorique();
  if (name === "accueil") renderDashboard();
  if (name === "coordination") renderCoordination();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}
function setupGotoLinks() {
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => goToTab(btn.dataset.goto));
  });
}

/* ============================================================
   MODULE SPIRITUEL
   ============================================================ */
function setupSpiritDateNav() {
  document.getElementById("spiritPrevDay").addEventListener("click", () => {
    spiritViewDate = addDays(spiritViewDate, -1);
    renderSpiritualPanel();
  });
  document.getElementById("spiritNextDay").addEventListener("click", () => {
    if (spiritViewDate >= todayStr()) return;
    spiritViewDate = addDays(spiritViewDate, 1);
    renderSpiritualPanel();
  });
}

function renderSpiritualPanel() {
  document.getElementById("spiritCurrentDate").textContent =
    spiritViewDate === todayStr() ? `Aujourd'hui — ${fmtLong(spiritViewDate)}` : fmtLong(spiritViewDate);

  const wrap = document.getElementById("spiritualCategories");
  wrap.innerHTML = "";
  const dayData = DATA.spiritual[spiritViewDate] || {};

  SPIRITUAL_CATEGORIES.forEach(cat => {
    const done = cat.items.filter(it => dayData[it.id]).length;
    const catEl = document.createElement("div");
    catEl.className = "category";
    catEl.innerHTML = `
      <div class="category-head">
        <span class="category-title">${cat.title}</span>
        <span class="category-frac">${done}/${cat.items.length}</span>
      </div>
    `;
    cat.items.forEach(item => {
      const checked = !!dayData[item.id];
      const row = document.createElement("label");
      row.className = "check-item";
      row.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} data-item="${item.id}"><span class="${checked ? "done" : ""}">${item.label}</span>`;
      row.querySelector("input").addEventListener("change", (e) => {
        toggleSpiritItem(spiritViewDate, item.id, e.target.checked);
        renderSpiritualPanel();
        renderDashboard();
      });
      catEl.appendChild(row);
    });
    wrap.appendChild(catEl);
  });
}

function toggleSpiritItem(dateStr, itemId, value) {
  if (!DATA.spiritual[dateStr]) DATA.spiritual[dateStr] = {};
  DATA.spiritual[dateStr][itemId] = value;
  saveData();
  pushSummary();
}

function dayPercent(dateStr) {
  const dayData = DATA.spiritual[dateStr];
  if (!dayData) return 0;
  const done = Object.values(dayData).filter(Boolean).length;
  return TOTAL_ITEMS > 0 ? Math.round((done / TOTAL_ITEMS) * 100) : 0;
}

/* ============================================================
   RÉSUMÉ POUR LES COORDINATEURS
   ============================================================ */
function pushSummary() {
  if (!CURRENT_USER) return;
  const last7 = [];
  for (let i = 6; i >= 0; i--) last7.push(dayPercent(addDays(todayStr(), -i)));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    if (dayPercent(addDays(todayStr(), -i)) >= 80) streak++; else break;
  }
  window.AbbaSync.saveSummary(CURRENT_USER.uid, {
    nom: CURRENT_USER.displayName || CURRENT_USER.email,
    email: CURRENT_USER.email,
    pctToday: dayPercent(todayStr()),
    last7,
    streak,
  }).catch(err => console.error("Résumé coordination :", err));
}

/* ============================================================
   GESTION DES COORDINATEURS (coordinateurs uniquement)
   ============================================================ */
function setupAdminManager() {
  document.getElementById("addAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("newAdminEmail");
    const errEl = document.getElementById("adminManagerError");
    errEl.textContent = "";
    const email = input.value.trim();
    if (!email) return;
    try {
      await window.AbbaSync.addAdmin(email, CURRENT_USER.email);
      input.value = "";
    } catch (err) {
      errEl.textContent = "Impossible d'ajouter ce coordinateur. Vérifie ta connexion.";
      console.error(err);
    }
  });
}
function renderAdminManager() {
  if (!IS_ADMIN) return;
  const wrap = document.getElementById("adminList");
  wrap.innerHTML = "";
  if (ADMIN_LIST.length === 0) {
    wrap.innerHTML = `<p class="empty-hint" style="display:block;">Aucun coordinateur enregistré pour l'instant.</p>`;
  }
  ADMIN_LIST.forEach(email => {
    const isSelf = CURRENT_USER && email.toLowerCase() === CURRENT_USER.email.toLowerCase();
    const row = document.createElement("div");
    row.className = "editor-item-row";
    row.innerHTML = `
      <span class="text-input" style="border:none;padding:8px 0;">${escapeAttr(email)}${isSelf ? " (toi)" : ""}</span>
      ${isSelf ? "" : `<button type="button" class="editor-del-item" title="Retirer">🗑</button>`}
    `;
    if (!isSelf) {
      row.querySelector(".editor-del-item").addEventListener("click", async () => {
        if (!confirm(`Retirer ${email} de la liste des coordinateurs ?`)) return;
        try {
          await window.AbbaSync.removeAdmin(email);
        } catch (err) {
          alert("Impossible de retirer ce coordinateur. Vérifie ta connexion.");
          console.error(err);
        }
      });
    }
    wrap.appendChild(row);
  });
}

/* ============================================================
   COORDINATION (coordinateurs uniquement)
   ============================================================ */
function setupCoordination() {
  document.getElementById("refreshCoordination").addEventListener("click", renderCoordination);
}
async function renderCoordination() {
  if (!IS_ADMIN) return;
  const body = document.getElementById("coordTableBody");
  const emptyHint = document.getElementById("coordEmptyHint");
  body.innerHTML = `<tr><td colspan="4">Chargement…</td></tr>`;
  try {
    const rows = await window.AbbaSync.loadAllSummaries();
    rows.sort((a, b) => (b.pctToday || 0) - (a.pctToday || 0));
    body.innerHTML = "";
    emptyHint.style.display = rows.length === 0 ? "block" : "none";
    rows.forEach(r => {
      const moy7 = r.last7 && r.last7.length ? Math.round(r.last7.reduce((s,v)=>s+v,0) / r.last7.length) : 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.nom || r.email || "—"}</td>
        <td>${r.pctToday || 0}%</td>
        <td>${moy7}%</td>
        <td>${r.streak || 0} j</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4">Erreur de chargement.</td></tr>`;
    console.error(err);
  }
}

/* ============================================================
   ÉDITEUR DE CHECKLIST (coordinateurs uniquement)
   ============================================================ */
let EDIT_CHECKLIST = [];
function setupChecklistEditor() {
  document.getElementById("addChecklistCategory").addEventListener("click", () => {
    EDIT_CHECKLIST.push({ id: "cat_" + Date.now(), title: "Nouvelle catégorie", items: [] });
    renderChecklistEditor();
  });
  document.getElementById("saveChecklistBtn").addEventListener("click", async () => {
    // Nettoie les catégories/éléments vides
    const clean = EDIT_CHECKLIST
      .map(c => ({ ...c, title: c.title.trim(), items: c.items.filter(it => it.label.trim() !== "") }))
      .filter(c => c.title !== "" && c.items.length > 0);
    if (clean.length === 0) { alert("Ajoute au moins une catégorie avec un élément."); return; }
    const btn = document.getElementById("saveChecklistBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveChecklist(clean);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer la checklist. Vérifie ta connexion.");
      console.error(err);
    }
  });
}
function renderChecklistEditor() {
  if (!IS_ADMIN) return;
  EDIT_CHECKLIST = deepClone(SPIRITUAL_CATEGORIES);
  const wrap = document.getElementById("checklistEditor");
  wrap.innerHTML = "";
  EDIT_CHECKLIST.forEach((cat, ci) => {
    const catEl = document.createElement("div");
    catEl.className = "editor-category";
    catEl.innerHTML = `
      <div class="editor-cat-head">
        <input type="text" class="text-input editor-cat-title" value="${escapeAttr(cat.title)}">
        <button type="button" class="btn-danger editor-del-cat" title="Supprimer la catégorie">🗑</button>
      </div>
      <div class="editor-items"></div>
      <button type="button" class="link-btn editor-add-item">+ Ajouter un élément</button>
    `;
    const itemsWrap = catEl.querySelector(".editor-items");
    cat.items.forEach((item, ii) => {
      const row = document.createElement("div");
      row.className = "editor-item-row";
      row.innerHTML = `
        <input type="text" class="text-input editor-item-label" value="${escapeAttr(item.label)}">
        <button type="button" class="editor-del-item" title="Supprimer">🗑</button>
      `;
      row.querySelector(".editor-item-label").addEventListener("input", (e) => {
        EDIT_CHECKLIST[ci].items[ii].label = e.target.value;
      });
      row.querySelector(".editor-del-item").addEventListener("click", () => {
        EDIT_CHECKLIST[ci].items.splice(ii, 1);
        renderChecklistEditorFromState(wrap);
      });
      itemsWrap.appendChild(row);
    });
    catEl.querySelector(".editor-cat-title").addEventListener("input", (e) => {
      EDIT_CHECKLIST[ci].title = e.target.value;
    });
    catEl.querySelector(".editor-del-cat").addEventListener("click", () => {
      EDIT_CHECKLIST.splice(ci, 1);
      renderChecklistEditorFromState(wrap);
    });
    catEl.querySelector(".editor-add-item").addEventListener("click", () => {
      EDIT_CHECKLIST[ci].items.push({ id: "it_" + Date.now(), label: "" });
      renderChecklistEditorFromState(wrap);
    });
    wrap.appendChild(catEl);
  });
}
function renderChecklistEditorFromState(wrap) {
  // Redessine l'éditeur à partir de l'état courant EDIT_CHECKLIST sans recharger depuis le serveur
  const saved = SPIRITUAL_CATEGORIES;
  SPIRITUAL_CATEGORIES = EDIT_CHECKLIST;
  renderChecklistEditor();
  SPIRITUAL_CATEGORIES = saved;
}
function escapeAttr(s) {
  return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

/* ============================================================
   TABLEAU DE BORD
   ============================================================ */
function renderDashboard() {
  const pct = dayPercent(todayStr());
  document.getElementById("sealPct").textContent = `${pct}%`;
  const ring = document.getElementById("sealProgressRing");
  const circumference = 2 * Math.PI * 52;
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;

  // semaine
  const strip = document.getElementById("weekStrip");
  strip.innerHTML = "";
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(todayStr(), -i);
    const p = dayPercent(ds);
    const d = parseDate(ds);
    const dot = document.createElement("div");
    dot.className = "week-day";
    let cls = "";
    if (p >= 80) cls = "full"; else if (p > 0) cls = "partial";
    dot.innerHTML = `<div class="week-day-dot ${cls}">${p > 0 ? Math.round(p/10) : ""}</div><span class="week-day-label">${DAYS_FR[d.getDay()]}</span>`;
    strip.appendChild(dot);
  }

  // finance du mois courant (mois réel, pas celui navigué)
  const now = new Date();
  const { revenus, depenses, tithePaid } = monthTotals(now.getFullYear(), now.getMonth());
  document.getElementById("dashRevenus").textContent = fmtNum(revenus) + " " + DATA.settings.currency;
  document.getElementById("dashDepenses").textContent = fmtNum(depenses) + " " + DATA.settings.currency;
  document.getElementById("dashSolde").textContent = fmtNum(revenus - depenses) + " " + DATA.settings.currency;
  const titheDue = revenus * (DATA.settings.tithe / 100);
  document.getElementById("dashTithe").textContent = `${fmtNum(tithePaid)} / ${fmtNum(titheDue)} ${DATA.settings.currency}`;
}

/* ============================================================
   MODULE FINANCE
   ============================================================ */
function monthTotals(year, month) {
  const txs = DATA.transactions.filter(t => {
    const d = parseDate(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const revenus = txs.filter(t => t.type === "revenu").reduce((s, t) => s + t.amount, 0);
  const depenses = txs.filter(t => t.type === "depense").reduce((s, t) => s + t.amount, 0);
  const tithePaid = txs.filter(t => t.type === "depense" && t.category === "Dîme").reduce((s, t) => s + t.amount, 0);
  const savingsPaid = txs.filter(t => t.type === "depense" && t.category === "Épargne").reduce((s, t) => s + t.amount, 0);
  const generosityPaid = txs.filter(t => t.type === "depense" && GENEROSITY_CATS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const livingPaid = txs.filter(t => t.type === "depense" && !LIVING_EXCLUDE.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  return { txs, revenus, depenses, tithePaid, savingsPaid, generosityPaid, livingPaid };
}

function renderFinancePanel() {
  document.getElementById("finCurrentMonth").textContent = `${MONTHS_FR[financeViewMonth]} ${financeViewYear}`;
  const { txs, revenus, depenses, tithePaid } = monthTotals(financeViewYear, financeViewMonth);
  const cur = DATA.settings.currency;

  document.getElementById("finRevenus").textContent = fmtNum(revenus) + " " + cur;
  document.getElementById("finDepenses").textContent = fmtNum(depenses) + " " + cur;
  document.getElementById("finSolde").textContent = fmtNum(revenus - depenses) + " " + cur;

  const titheDue = revenus * (DATA.settings.tithe / 100);
  document.getElementById("finTitheDue").textContent = fmtNum(titheDue) + " " + cur;
  document.getElementById("finTitheGiven").textContent = fmtNum(tithePaid) + " " + cur;
  document.getElementById("finTitheGap").textContent = fmtNum(titheDue - tithePaid) + " " + cur;

  renderBudgetBars(financeViewYear, financeViewMonth);
  renderTxTable(txs);
}

function renderBudgetBars(year, month) {
  const { revenus, tithePaid, savingsPaid, generosityPaid, livingPaid } = monthTotals(year, month);
  const s = DATA.settings;
  const buckets = [
    { label: "Dîme", pct: s.tithe, paid: tithePaid, color: "var(--gold)" },
    { label: "Épargne", pct: s.savings, paid: savingsPaid, color: "var(--navy)" },
    { label: "Générosité", pct: s.generosity, paid: generosityPaid, color: "var(--sage)" },
    { label: "Vie courante", pct: s.living, paid: livingPaid, color: "var(--brick)" },
  ];
  const wrap = document.getElementById("budgetBars");
  wrap.innerHTML = "";
  buckets.forEach(b => {
    const target = revenus * (b.pct / 100);
    const ratio = target > 0 ? Math.min(b.paid / target, 1.4) : (b.paid > 0 ? 1.4 : 0);
    const row = document.createElement("div");
    row.className = "budget-bar-row";
    row.innerHTML = `
      <span class="budget-bar-label">${b.label} (${b.pct}%)</span>
      <span class="budget-bar-track"><span class="budget-bar-fill" style="width:${Math.min(ratio*100,100)}%; background:${b.color};"></span></span>
      <span class="budget-bar-val">${fmtNum(b.paid)} / ${fmtNum(target)}</span>
    `;
    wrap.appendChild(row);
  });
}

function renderTxTable(txs) {
  const body = document.getElementById("txTableBody");
  const emptyHint = document.getElementById("txEmptyHint");
  body.innerHTML = "";
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  emptyHint.style.display = sorted.length === 0 ? "block" : "none";
  sorted.forEach(t => {
    const tr = document.createElement("tr");
    const d = parseDate(t.date);
    tr.innerHTML = `
      <td>${d.getDate()}/${d.getMonth()+1}</td>
      <td>${t.category}</td>
      <td>${t.note || ""}</td>
      <td class="right ${t.type === "revenu" ? "tx-amount-in" : "tx-amount-out"}">${t.type === "revenu" ? "+" : "−"}${fmtNum(t.amount)}</td>
      <td><button class="tx-del" data-id="${t.id}" aria-label="Supprimer">🗑</button></td>
    `;
    tr.querySelector(".tx-del").addEventListener("click", () => deleteTx(t.id));
    body.appendChild(tr);
  });
}

function deleteTx(id) {
  DATA.transactions = DATA.transactions.filter(t => t.id !== id);
  saveData();
  renderFinancePanel();
  renderDashboard();
  renderHistorique();
}

function setupFinanceMonthNav() {
  document.getElementById("finPrevMonth").addEventListener("click", () => {
    financeViewMonth--; if (financeViewMonth < 0) { financeViewMonth = 11; financeViewYear--; }
    renderFinancePanel();
  });
  document.getElementById("finNextMonth").addEventListener("click", () => {
    const now = new Date();
    if (financeViewYear === now.getFullYear() && financeViewMonth === now.getMonth()) return;
    financeViewMonth++; if (financeViewMonth > 11) { financeViewMonth = 0; financeViewYear++; }
    renderFinancePanel();
  });
}

/* ---------- Modale nouveau mouvement ---------- */
let txType = "revenu";
function setupTxModal() {
  const overlay = document.getElementById("txModalOverlay");
  document.getElementById("openTxModal").addEventListener("click", () => openTxModal());
  document.getElementById("closeTxModal").addEventListener("click", closeTxModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeTxModal(); });

  document.querySelectorAll("#txTypeSegmented .seg").forEach(btn => {
    btn.addEventListener("click", () => {
      txType = btn.dataset.type;
      document.querySelectorAll("#txTypeSegmented .seg").forEach(b => b.classList.toggle("active", b === btn));
      fillCategorySelect();
    });
  });

  document.getElementById("txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("txAmount").value);
    if (!amount || amount <= 0) return;
    const tx = {
      id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      type: txType,
      category: document.getElementById("txCategory").value,
      date: document.getElementById("txDate").value || todayStr(),
      note: document.getElementById("txNote").value.trim(),
      amount,
    };
    DATA.transactions.push(tx);
    saveData();
    const d = parseDate(tx.date);
    financeViewMonth = d.getMonth(); financeViewYear = d.getFullYear();
    renderFinancePanel();
    renderDashboard();
    renderHistorique();
    closeTxModal();
  });
}
function fillCategorySelect() {
  const sel = document.getElementById("txCategory");
  const cats = txType === "revenu" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
}
function openTxModal() {
  txType = "revenu";
  document.querySelectorAll("#txTypeSegmented .seg").forEach(b => b.classList.toggle("active", b.dataset.type === "revenu"));
  fillCategorySelect();
  document.getElementById("txForm").reset();
  document.getElementById("txDate").value = todayStr();
  fillCategorySelect();
  document.getElementById("txModalOverlay").classList.add("open");
}
function closeTxModal() {
  document.getElementById("txModalOverlay").classList.remove("open");
}

/* ============================================================
   HISTORIQUE
   ============================================================ */
function renderHistorique() {
  const grid = document.getElementById("historyCalendar");
  grid.innerHTML = "";
  const days = 35;
  for (let i = days - 1; i >= 0; i--) {
    const ds = addDays(todayStr(), -i);
    const p = dayPercent(ds);
    const d = parseDate(ds);
    const cell = document.createElement("div");
    let cls = "cal-cell";
    if (p >= 80) cls += " lvl2"; else if (p > 0) cls += " lvl1";
    cell.className = cls;
    cell.title = `${fmtLong(ds)} — ${p}%`;
    cell.textContent = d.getDate();
    grid.appendChild(cell);
  }

  const chart = document.getElementById("financeHistoryChart");
  chart.innerHTML = "";
  const now = new Date();
  let maxVal = 1;
  const months = [];
  for (let i = 5; i >= 0; i--) {
    let m = now.getMonth() - i, y = now.getFullYear();
    while (m < 0) { m += 12; y--; }
    const { revenus, depenses } = monthTotals(y, m);
    months.push({ m, y, net: revenus - depenses });
    maxVal = Math.max(maxVal, Math.abs(revenus - depenses));
  }
  months.forEach(mo => {
    const h = Math.max(4, (Math.abs(mo.net) / maxVal) * 110);
    const col = document.createElement("div");
    col.className = "bar-col";
    col.innerHTML = `<div class="bar" style="height:${h}px; background:${mo.net >= 0 ? 'var(--sage)' : 'var(--brick)'};" title="${fmtNum(mo.net)} ${DATA.settings.currency}"></div><span class="bar-label">${MONTHS_FR[mo.m].slice(0,3)}</span>`;
    chart.appendChild(col);
  });
}

/* ============================================================
   RÉGLAGES
   ============================================================ */
function setupSettings() {
  ["settingTithe","settingSavings","settingGenerosity","settingLiving"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateSettingsSum);
  });

  document.getElementById("saveSettings").addEventListener("click", () => {
    DATA.settings.currency = document.getElementById("settingCurrency").value.trim() || "FCFA";
    DATA.settings.tithe = Number(document.getElementById("settingTithe").value) || 0;
    DATA.settings.savings = Number(document.getElementById("settingSavings").value) || 0;
    DATA.settings.generosity = Number(document.getElementById("settingGenerosity").value) || 0;
    DATA.settings.living = Number(document.getElementById("settingLiving").value) || 0;
    saveData();
    renderDashboard(); renderFinancePanel();
    const btn = document.getElementById("saveSettings");
    const original = btn.textContent;
    btn.textContent = "Enregistré ✓";
    setTimeout(() => btn.textContent = original, 1400);
  });

  document.getElementById("exportData").addEventListener("click", exportData);
  document.getElementById("importData").addEventListener("change", importData);
  document.getElementById("resetData").addEventListener("click", () => {
    if (confirm("Es-tu sûr de vouloir effacer toutes tes données (spirituel + finance) ? Cette action est irréversible et sera aussi supprimée du cloud.")) {
      DATA = defaultData();
      saveData();
      setupSettingsValues();
      renderSpiritualPanel(); renderFinancePanel(); renderDashboard(); renderHistorique();
    }
  });
}
function setupSettingsValues() {
  const s = DATA.settings;
  document.getElementById("settingCurrency").value = s.currency;
  document.getElementById("settingTithe").value = s.tithe;
  document.getElementById("settingSavings").value = s.savings;
  document.getElementById("settingGenerosity").value = s.generosity;
  document.getElementById("settingLiving").value = s.living;
  updateSettingsSum();
}
function updateSettingsSum() {
  const total = ["settingTithe","settingSavings","settingGenerosity","settingLiving"]
    .reduce((s, id) => s + (Number(document.getElementById(id).value) || 0), 0);
  const el = document.getElementById("settingsSum");
  el.textContent = `Total actuel : ${total}%`;
  el.className = "settings-sum " + (total === 100 ? "ok" : "bad");
}

function exportData() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `abba-life-donnees-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== "object") throw new Error("format invalide");
      DATA = { ...defaultData(), ...parsed, settings: { ...defaultData().settings, ...(parsed.settings || {}) } };
      saveData();
      setupSettingsValues();
      renderSpiritualPanel(); renderFinancePanel(); renderDashboard(); renderHistorique();
    } catch (err) {
      alert("Ce fichier ne semble pas être un export valide d'ABBA Life.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

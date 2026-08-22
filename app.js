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

// Liste par défaut des 14 modules — les coordinateurs peuvent renommer/compléter
// depuis l'app (les titres des modules 8 à 14 sont volontairement génériques,
// à ajuster une fois le curriculum de ces modules finalisé).
const DEFAULT_MODULES = [
  { id: "m1", titre: "M1 — Disciple de Christ" },
  { id: "m2", titre: "M2 — Guérir des Blessures de l'Âme" },
  { id: "m3", titre: "M3 — Cure d'Âme Personnelle" },
  { id: "m4", titre: "M4 — Aimer" },
  { id: "m5", titre: "M5 — Bâtir le Caractère" },
  { id: "m6", titre: "M6 — Le Saint-Esprit" },
  { id: "m7", titre: "M7 — Victoire par la Prière" },
  { id: "m8", titre: "M8" },
  { id: "m9", titre: "M9" },
  { id: "m10", titre: "M10" },
  { id: "m11", titre: "M11" },
  { id: "m12", titre: "M12" },
  { id: "m13", titre: "M13" },
  { id: "m14", titre: "M14" },
];
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
    settings: { currency: "FCFA", tithe: 10, savings: 20, generosity: 5, living: 65, postes: [] },
    spiritual: {},
    transactions: [],
    agenda: [],
    dettes: [],
    journal: {},
  };
}
let DATA = defaultData();
let CURRENT_USER = null;
let CURRENT_PROFILE = {};
let IS_ADMIN = false;
let ADMIN_LIST = [];
let unsubSettings = null;
let unsubAgenda = null;
let unsubDettes = null;
let unsubModulesConfig = null;
let unsubParcours = null;
let MODULES_CONFIG = [];
let MODULES_TERMINES = [];
let unsubCurrentMonth = null;
let unsubChecklist = null;
let unsubAdmins = null;

// Chaque mois (AAAA-MM) de spirituel/bilans/finance vit dans son propre petit document
// côté serveur — ça évite qu'un seul fichier grossisse indéfiniment au fil des années.
let MONTHS_CACHE = {};   // { "2026-08": { spiritual:{}, journal:{}, transactions:[] } }
let LOADED_MONTHS = new Set();
let CURRENT_MONTH_KEY = null; // le mois en cours, toujours synchronisé en direct

function monthKeyOf(dateStr) { return (dateStr || "").slice(0, 7); }
function emptyMonthBucket() { return { spiritual: {}, journal: {}, transactions: [], reserves: {} }; }
function rebuildCombinedData() {
  DATA.spiritual = {};
  DATA.journal = {};
  DATA.transactions = [];
  Object.values(MONTHS_CACHE).forEach((m) => {
    Object.assign(DATA.spiritual, m.spiritual || {});
    Object.assign(DATA.journal, m.journal || {});
    DATA.transactions.push(...(m.transactions || []));
  });
  saveLocalCache(); // copie hors-ligne complète, pratique mais jamais utilisée pour les écritures cloud
}

// Charge un mois précis une seule fois (lecture ponctuelle) — utilisé quand on navigue
// vers un mois passé (Historique, navigation Finance/Spirituel).
async function ensureMonthLoaded(monthKey) {
  if (LOADED_MONTHS.has(monthKey) || !CURRENT_USER) return;
  LOADED_MONTHS.add(monthKey);
  try {
    const data = await window.AbbaSync.getMonthOnce(CURRENT_USER.uid, monthKey);
    MONTHS_CACHE[monthKey] = data
      ? { spiritual: data.spiritual || {}, journal: data.journal || {}, transactions: data.transactions || [], reserves: data.reserves || {} }
      : emptyMonthBucket();
    rebuildCombinedData();
  } catch (err) {
    console.error("Chargement du mois", monthKey, err);
  }
}
// Charge plusieurs mois d'un coup (utilisé par l'Historique) puis rafraîchit l'affichage une seule fois
async function ensureMonthsLoaded(monthKeys, thenRender) {
  await Promise.all(monthKeys.map(ensureMonthLoaded));
  if (thenRender) thenRender();
}

function saveMonthData(monthKey) {
  if (!MONTHS_CACHE[monthKey]) MONTHS_CACHE[monthKey] = emptyMonthBucket();
  rebuildCombinedData();
  if (CURRENT_USER) {
    window.AbbaSync.saveMonth(CURRENT_USER.uid, monthKey, MONTHS_CACHE[monthKey])
      .catch(err => console.error("Sauvegarde du mois", monthKey, err));
  }
}
function saveSettingsData() {
  saveLocalCache();
  if (CURRENT_USER) {
    window.AbbaSync.saveSettings(CURRENT_USER.uid, DATA.settings)
      .catch(err => console.error("Sauvegarde des réglages :", err));
  }
}
function saveAgendaData() {
  saveLocalCache();
  if (CURRENT_USER) {
    window.AbbaSync.saveAgenda(CURRENT_USER.uid, DATA.agenda)
      .catch(err => console.error("Sauvegarde de l'agenda :", err));
  }
}

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
  setupPostesSettings();
  setupDettes();
  setupAuthScreen();
  setupCoordination();
  setupChecklistEditor();
  setupAdminManager();
  setupAgenda();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      // Vérifie activement s'il y a une nouvelle version à chaque ouverture de l'app
      reg.update().catch(() => {});
    }).catch(() => {});
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
    const prenom = document.getElementById("signupPrenom").value.trim();
    const nomFamille = document.getElementById("signupNomFamille").value.trim();
    const telephone = document.getElementById("signupTelephone").value.trim();
    const nom = `${prenom} ${nomFamille}`.trim();
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const errEl = document.getElementById("signupError");
    errEl.textContent = "";
    try {
      await window.AbbaSync.signUp(nom, telephone, email, password);
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
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  if (unsubAgenda) { unsubAgenda(); unsubAgenda = null; }
  if (unsubDettes) { unsubDettes(); unsubDettes = null; }
  if (unsubModulesConfig) { unsubModulesConfig(); unsubModulesConfig = null; }
  if (unsubParcours) { unsubParcours(); unsubParcours = null; }
  if (unsubCurrentMonth) { unsubCurrentMonth(); unsubCurrentMonth = null; }
  if (unsubChecklist) { unsubChecklist(); unsubChecklist = null; }
  if (unsubAdmins) { unsubAdmins(); unsubAdmins = null; }

  if (!user) {
    CURRENT_USER = null;
    IS_ADMIN = false;
    ADMIN_LIST = [];
    MONTHS_CACHE = {};
    LOADED_MONTHS = new Set();
    MODULES_CONFIG = [];
    MODULES_TERMINES = [];
    document.getElementById("authScreen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    return;
  }

  CURRENT_USER = user;
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("accountEmailHint").textContent = `Connecté(e) en tant que ${user.displayName || user.email} (${user.email})`;

  // Charge le profil (nom, téléphone) une seule fois — utilisé pour le résumé envoyé aux coordinateurs
  try {
    CURRENT_PROFILE = await window.AbbaSync.getUserProfile(user.uid) || {};
  } catch (err) {
    console.error("Chargement du profil :", err);
    CURRENT_PROFILE = {};
  }

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

  // Migration transparente et unique depuis l'ancien format (un seul gros document),
  // avant de commencer à écouter les nouvelles données réparties par mois.
  try {
    await window.AbbaSync.migrateLegacyIfNeeded(user.uid);
  } catch (err) {
    console.error("Migration :", err);
  }

  // Réglages (petit document, toujours en direct)
  unsubSettings = window.AbbaSync.watchSettings(user.uid, (settings) => {
    DATA.settings = { ...defaultData().settings, ...(settings || {}) };
    saveLocalCache();
    renderDashboard();
    renderFinancePanel();
    setupSettingsValues();
  });

  // Agenda (petit document, toujours en direct)
  unsubAgenda = window.AbbaSync.watchAgenda(user.uid, (tasks) => {
    DATA.agenda = tasks || [];
    saveLocalCache();
    renderAgendaPanel();
    renderDashboard();
  });

  // Dettes (petit document, toujours en direct)
  unsubDettes = window.AbbaSync.watchDettes(user.uid, (list) => {
    DATA.dettes = list || [];
    saveLocalCache();
    renderDettesSettingsList();
    renderFinancePanel();
  });

  // Liste partagée des modules (comme la checklist)
  unsubModulesConfig = window.AbbaSync.watchModulesConfig((list) => {
    MODULES_CONFIG = (list && list.length) ? list : deepClone(DEFAULT_MODULES);
    renderModulesList();
    renderModulesEditor();
  });

  // Ma progression personnelle dans les modules
  unsubParcours = window.AbbaSync.watchParcours(user.uid, (modulesTermines) => {
    MODULES_TERMINES = modulesTermines || [];
    renderModulesList();
    pushSummary();
  });

  // Mois en cours (spirituel + bilans + finance) — toujours en direct, c'est le plus consulté
  const currentMonthKey = todayStr().slice(0, 7);
  CURRENT_MONTH_KEY = currentMonthKey;
  LOADED_MONTHS.add(currentMonthKey);
  unsubCurrentMonth = window.AbbaSync.watchMonth(user.uid, currentMonthKey, (data) => {
    MONTHS_CACHE[currentMonthKey] = data
      ? { spiritual: data.spiritual || {}, journal: data.journal || {}, transactions: data.transactions || [], reserves: data.reserves || {} }
      : (MONTHS_CACHE[currentMonthKey] || emptyMonthBucket());
    rebuildCombinedData();
    renderSpiritualPanel();
    renderFinancePanel();
    renderHistorique();
    renderDashboard();
    renderAgendaPanel();
    pushSummary();
  });

  // Charge aussi le mois précédent (utile pour la semaine à cheval sur deux mois, sans surcoût notable)
  ensureMonthLoaded(addDays(currentMonthKey + "-01", -1).slice(0, 7)).then(() => {
    rebuildCombinedData();
    renderDashboard();
    renderHistorique();
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
  if (name === "agenda") renderAgendaPanel();
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
    ensureMonthLoaded(monthKeyOf(spiritViewDate)).then(renderSpiritualPanel);
    renderSpiritualPanel();
  });
  document.getElementById("spiritNextDay").addEventListener("click", () => {
    if (spiritViewDate >= todayStr()) return;
    spiritViewDate = addDays(spiritViewDate, 1);
    ensureMonthLoaded(monthKeyOf(spiritViewDate)).then(renderSpiritualPanel);
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
  const mk = monthKeyOf(dateStr);
  if (!MONTHS_CACHE[mk]) MONTHS_CACHE[mk] = emptyMonthBucket();
  if (!MONTHS_CACHE[mk].spiritual[dateStr]) MONTHS_CACHE[mk].spiritual[dateStr] = {};
  MONTHS_CACHE[mk].spiritual[dateStr][itemId] = value;
  saveMonthData(mk);
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
    telephone: CURRENT_PROFILE.telephone || "",
    pctToday: dayPercent(todayStr()),
    modulesFaits: MODULES_TERMINES.length,
    modulesTotal: (MODULES_CONFIG && MODULES_CONFIG.length) || 0,
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
  body.innerHTML = `<tr><td colspan="5">Chargement…</td></tr>`;
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
        <td>${r.telephone || "—"}</td>
        <td>${r.pctToday || 0}%</td>
        <td>${moy7}%</td>
        <td>${r.streak || 0} j</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5">Erreur de chargement.</td></tr>`;
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
    renderChecklistEditorDom();
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
  renderChecklistEditorDom();
}
function renderChecklistEditorDom() {
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
        if (!confirm(`Supprimer "${item.label}" ?`)) return;
        EDIT_CHECKLIST[ci].items.splice(ii, 1);
        renderChecklistEditorDom();
      });
      itemsWrap.appendChild(row);
    });
    catEl.querySelector(".editor-cat-title").addEventListener("input", (e) => {
      EDIT_CHECKLIST[ci].title = e.target.value;
    });
    catEl.querySelector(".editor-del-cat").addEventListener("click", () => {
      if (!confirm(`Supprimer la catégorie "${cat.title}" et tous ses éléments ?`)) return;
      EDIT_CHECKLIST.splice(ci, 1);
      renderChecklistEditorDom();
    });
    catEl.querySelector(".editor-add-item").addEventListener("click", () => {
      EDIT_CHECKLIST[ci].items.push({ id: "it_" + Date.now(), label: "" });
      renderChecklistEditorDom();
    });
    wrap.appendChild(catEl);
  });
}
function escapeAttr(s) {
  return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

/* ============================================================
   AGENDA — bilan du jour, plan du lendemain, tâches/rendez-vous
   ============================================================ */
function setupAgenda() {
  document.getElementById("saveJournalBtn").addEventListener("click", saveJournal);

  document.getElementById("agendaAddForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("agendaTitle").value.trim();
    const date = document.getElementById("agendaDate").value;
    const time = document.getElementById("agendaTime").value;
    const recurrence = document.getElementById("agendaRecurrence").value;
    if (!title || !date) return;
    addAgendaTask(title, date, time, "manual", recurrence);
    document.getElementById("agendaAddForm").reset();
    document.getElementById("agendaDate").value = todayStr();
    renderAgendaPanel();
    renderDashboard();
  });

  // Pré-remplit la date d'ajout rapide avec aujourd'hui
  const dateInput = document.getElementById("agendaDate");
  if (dateInput) dateInput.value = todayStr();
}

function addAgendaTask(title, date, time, source, recurrence) {
  DATA.agenda.push({
    id: "ag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    title, date, time: time || "", done: false, source: source || "manual",
    recurrence: recurrence && recurrence !== "none" ? recurrence : null,
  });
  saveAgendaData();
}

function toggleAgendaTask(id, done) {
  const t = DATA.agenda.find(a => a.id === id);
  if (!t) return;
  t.done = done;
  // Si la tâche se répète et vient d'être cochée, on programme automatiquement la prochaine occurrence
  if (done && t.recurrence && !t.nextGenerated) {
    const nextDate = t.recurrence === "daily" ? addDays(t.date, 1) : addDays(t.date, 7);
    DATA.agenda.push({
      id: "ag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      title: t.title, date: nextDate, time: t.time, done: false, source: t.source,
      recurrence: t.recurrence,
    });
    t.nextGenerated = true;
  }
  saveAgendaData();
}

function deleteAgendaTask(id) {
  DATA.agenda = DATA.agenda.filter(a => a.id !== id);
  saveAgendaData();
}

function saveJournal() {
  const bilan = document.getElementById("journalBilan").value.trim();
  const planText = document.getElementById("journalPlan").value;
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const mk = monthKeyOf(today);

  if (!MONTHS_CACHE[mk]) MONTHS_CACHE[mk] = emptyMonthBucket();
  if (!MONTHS_CACHE[mk].journal[today]) MONTHS_CACHE[mk].journal[today] = {};
  MONTHS_CACHE[mk].journal[today].bilan = bilan;
  saveMonthData(mk);

  // Retire les tâches précédemment générées par le plan du même jour, pour éviter les doublons si on ré-enregistre
  DATA.agenda = DATA.agenda.filter(a => a.planSourceDate !== today);

  const lines = planText.split("\n").map(l => l.trim()).filter(l => l !== "");
  lines.forEach(line => {
    DATA.agenda.push({
      id: "ag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      title: line, date: tomorrow, time: "", done: false, source: "plan", planSourceDate: today,
    });
  });
  saveAgendaData();

  const btn = document.getElementById("saveJournalBtn");
  const original = btn.textContent;
  btn.textContent = lines.length > 0 ? `Enregistré ✓ (${lines.length} tâche${lines.length > 1 ? "s" : ""} créée${lines.length > 1 ? "s" : ""} pour demain)` : "Enregistré ✓";
  setTimeout(() => btn.textContent = original, 2200);
  renderAgendaPanel();
  renderDashboard();
}

function renderAgendaPanel() {
  // Recharge le bilan/plan du jour déjà enregistrés (si on revient sur l'onglet)
  const todayJournal = DATA.journal[todayStr()] || {};
  document.getElementById("journalBilan").value = todayJournal.bilan || "";
  const todayPlanTasks = DATA.agenda.filter(a => a.planSourceDate === todayStr());
  document.getElementById("journalPlan").value = todayPlanTasks.map(a => a.title).join("\n");

  const today = todayStr();
  const late = DATA.agenda.filter(a => !a.done && a.date < today).sort((a,b) => a.date.localeCompare(b.date));
  const todays = DATA.agenda.filter(a => a.date === today).sort((a,b) => (a.time||"99:99").localeCompare(b.time||"99:99"));
  const upcoming = DATA.agenda.filter(a => !a.done && a.date > today).sort((a,b) => a.date.localeCompare(b.date) || (a.time||"").localeCompare(b.time||""));

  renderAgendaList("agendaLate", "agendaLateEmpty", late, true);
  renderAgendaList("agendaToday", "agendaTodayEmpty", todays, false);
  renderAgendaList("agendaUpcoming", "agendaUpcomingEmpty", upcoming, false);
  renderJournalHistory();
}

function renderJournalHistory() {
  const wrap = document.getElementById("journalHistoryList");
  const emptyEl = document.getElementById("journalHistoryEmpty");
  if (!wrap) return;
  const entries = Object.entries(DATA.journal)
    .filter(([date, j]) => j && j.bilan && j.bilan.trim() !== "")
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);

  wrap.innerHTML = "";
  emptyEl.style.display = entries.length === 0 ? "block" : "none";
  entries.forEach(([date, j]) => {
    const row = document.createElement("div");
    row.className = "editor-category";
    row.innerHTML = `
      <div class="editor-cat-head" style="margin-bottom:4px;">
        <span style="font-weight:600;font-size:13px;">${date === todayStr() ? "Aujourd'hui" : fmtLong(date)}</span>
      </div>
      <p style="font-size:13.5px;line-height:1.5;margin:0;white-space:pre-wrap;">${escapeAttr(j.bilan)}</p>
    `;
    wrap.appendChild(row);
  });
}

function renderAgendaList(wrapId, emptyId, list, markLate) {
  const wrap = document.getElementById(wrapId);
  const emptyEl = document.getElementById(emptyId);
  wrap.innerHTML = "";
  emptyEl.style.display = list.length === 0 ? "block" : "none";
  list.forEach(t => {
    const row = document.createElement("div");
    row.className = "agenda-item" + (markLate ? " late" : "");
    const dateLabel = t.date === todayStr() ? "" : fmtLong(t.date) + (t.time ? " · " : "");
    const recurBadge = t.recurrence === "daily" ? " · 🔁 tous les jours" : t.recurrence === "weekly" ? " · 🔁 chaque semaine" : "";
    row.innerHTML = `
      <input type="checkbox" ${t.done ? "checked" : ""}>
      <div class="agenda-item-body">
        <div class="agenda-item-title ${t.done ? "done" : ""}">${escapeAttr(t.title)}</div>
        <div class="agenda-item-meta">${dateLabel}${t.time || ""}${recurBadge}</div>
      </div>
      <button type="button" class="agenda-del" title="Supprimer">🗑</button>
    `;
    row.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
      toggleAgendaTask(t.id, e.target.checked);
      renderAgendaPanel();
      renderDashboard();
    });
    row.querySelector(".agenda-del").addEventListener("click", () => {
      if (!confirm(`Supprimer "${t.title}" de l'agenda ?`)) return;
      deleteAgendaTask(t.id);
      renderAgendaPanel();
      renderDashboard();
    });
    wrap.appendChild(row);
  });
}

function renderReminderBanner() {
  const wrap = document.getElementById("reminderBannerWrap");
  if (!wrap) return;
  const today = todayStr();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const late = DATA.agenda.filter(a => !a.done && a.date < today);
  const dueSoon = DATA.agenda.filter(a => !a.done && a.date === today && a.time && (timeToMinutes(a.time) - nowMinutes) <= 60 && (timeToMinutes(a.time) - nowMinutes) >= -180);
  const todayNoTime = DATA.agenda.filter(a => !a.done && a.date === today && !a.time);

  wrap.innerHTML = "";
  if (late.length > 0) {
    wrap.innerHTML += `<div class="reminder-banner">⏰ ${late.length} tâche${late.length > 1 ? "s" : ""} en retard — <button class="link-btn" data-goto="agenda" style="color:inherit;">voir l'agenda →</button></div>`;
  } else if (dueSoon.length > 0) {
    const t = dueSoon[0];
    wrap.innerHTML += `<div class="reminder-banner">⏰ « ${escapeAttr(t.title)} » à ${t.time} — <button class="link-btn" data-goto="agenda" style="color:inherit;">voir l'agenda →</button></div>`;
  } else if (todayNoTime.length > 0) {
    wrap.innerHTML += `<div class="reminder-banner">📋 ${todayNoTime.length} tâche${todayNoTime.length > 1 ? "s" : ""} prévue${todayNoTime.length > 1 ? "s" : ""} aujourd'hui — <button class="link-btn" data-goto="agenda" style="color:inherit;">voir l'agenda →</button></div>`;
  }
  wrap.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => goToTab(btn.dataset.goto)));
}
function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/* ============================================================
   TABLEAU DE BORD
   ============================================================ */
function renderDashboard() {
  renderReminderBanner();
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
  renderPostesTracking(financeViewYear, financeViewMonth, revenus);
  renderDettesTracking();
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

/* ============================================================
   POSTES FIXES (Réglages) — loyer, scolarité, etc. dans "Vie courante"
   ============================================================ */
function setupPostesSettings() {
  document.getElementById("addPosteForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const nom = document.getElementById("posteNom").value.trim();
    const type = document.getElementById("posteType").value;
    const valeur = Number(document.getElementById("posteValeur").value);
    if (!nom || !valeur || valeur <= 0) return;
    if (!DATA.settings.postes) DATA.settings.postes = [];
    DATA.settings.postes.push({ id: "poste_" + Date.now(), nom, type, valeur });
    saveSettingsData();
    document.getElementById("addPosteForm").reset();
    renderPostesSettingsList();
    renderFinancePanel();
  });
}
function renderPostesSettingsList() {
  const wrap = document.getElementById("postesList");
  if (!wrap) return;
  const postes = DATA.settings.postes || [];
  wrap.innerHTML = "";
  postes.forEach(p => {
    const row = document.createElement("div");
    row.className = "poste-row";
    const valLabel = p.type === "fixe" ? `${fmtNum(p.valeur)} ${DATA.settings.currency}/mois` : `${p.valeur}% des revenus`;
    row.innerHTML = `
      <div class="poste-row-body"><strong>${escapeAttr(p.nom)}</strong> — ${valLabel}</div>
      <button type="button" class="poste-del" title="Supprimer">🗑</button>
    `;
    row.querySelector(".poste-del").addEventListener("click", () => {
      if (!confirm(`Supprimer le poste "${p.nom}" ?`)) return;
      DATA.settings.postes = DATA.settings.postes.filter(x => x.id !== p.id);
      saveSettingsData();
      renderPostesSettingsList();
      renderFinancePanel();
    });
    wrap.appendChild(row);
  });
}

/* ============================================================
   SUIVI DES POSTES (Finance) — dû ce mois-ci vs mis de côté, avec voyant
   ============================================================ */
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

function renderPostesTracking(year, month, revenus) {
  const card = document.getElementById("postesTrackingCard");
  const wrap = document.getElementById("postesTracking");
  const postes = DATA.settings.postes || [];
  if (postes.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";
  wrap.innerHTML = "";

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const bucket = MONTHS_CACHE[monthKey];
  const reserves = (bucket && bucket.reserves) || {};

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const ratio = isCurrentMonth ? now.getDate() / daysInMonth(year, month) : 1;

  postes.forEach(p => {
    const due = p.type === "fixe" ? p.valeur : revenus * (p.valeur / 100);
    const misDeCote = reserves[p.id] || 0;
    const attendu = due * ratio;

    let statut = "vert";
    if (misDeCote < attendu * 0.5) statut = "rouge";
    else if (misDeCote < attendu) statut = "orange";

    const row = document.createElement("div");
    row.className = "poste-track";
    row.innerHTML = `
      <div class="poste-track-head">
        <span class="poste-dot ${statut}"></span>
        <span class="poste-track-title">${escapeAttr(p.nom)}</span>
      </div>
      <p class="poste-track-nums">Dû ce mois-ci : ${fmtNum(due)} ${DATA.settings.currency} — Mis de côté : ${fmtNum(misDeCote)} ${DATA.settings.currency}</p>
      <div class="poste-track-form">
        <input type="number" class="text-input poste-add-input" placeholder="Montant mis de côté" min="0">
        <button type="button" class="btn-secondary poste-add-btn">Ajouter</button>
      </div>
    `;
    row.querySelector(".poste-add-btn").addEventListener("click", async () => {
      const input = row.querySelector(".poste-add-input");
      const amount = Number(input.value);
      if (!amount || amount <= 0) return;
      await ensureMonthLoaded(monthKey);
      if (!MONTHS_CACHE[monthKey]) MONTHS_CACHE[monthKey] = emptyMonthBucket();
      if (!MONTHS_CACHE[monthKey].reserves) MONTHS_CACHE[monthKey].reserves = {};
      MONTHS_CACHE[monthKey].reserves[p.id] = (MONTHS_CACHE[monthKey].reserves[p.id] || 0) + amount;
      saveMonthData(monthKey);
      renderPostesTracking(financeViewYear, financeViewMonth, revenus);
    });
    wrap.appendChild(row);
  });
}

/* ============================================================
   DETTES (Réglages : gestion — Finance : suivi et remboursement)
   ============================================================ */
function saveDettesData() {
  saveLocalCache();
  if (CURRENT_USER) {
    window.AbbaSync.saveDettes(CURRENT_USER.uid, DATA.dettes)
      .catch(err => console.error("Sauvegarde des dettes :", err));
  }
}
function setupDettes() {
  document.getElementById("addDetteForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const nom = document.getElementById("detteNom").value.trim();
    const montant = Number(document.getElementById("detteMontant").value);
    if (!nom || !montant || montant <= 0) return;
    DATA.dettes.push({ id: "dette_" + Date.now(), nom, montantInitial: montant, montantRestant: montant });
    saveDettesData();
    document.getElementById("addDetteForm").reset();
    renderDettesSettingsList();
    renderFinancePanel();
  });
}
function renderDettesSettingsList() {
  const wrap = document.getElementById("dettesList");
  if (!wrap) return;
  const dettes = DATA.dettes || [];
  wrap.innerHTML = "";
  dettes.forEach(d => {
    const row = document.createElement("div");
    row.className = "poste-row";
    row.innerHTML = `
      <div class="poste-row-body"><strong>${escapeAttr(d.nom)}</strong> — reste ${fmtNum(d.montantRestant)} / ${fmtNum(d.montantInitial)} ${DATA.settings.currency}</div>
      <button type="button" class="poste-del" title="Supprimer">🗑</button>
    `;
    row.querySelector(".poste-del").addEventListener("click", () => {
      if (!confirm(`Supprimer la dette "${d.nom}" ?`)) return;
      DATA.dettes = DATA.dettes.filter(x => x.id !== d.id);
      saveDettesData();
      renderDettesSettingsList();
      renderFinancePanel();
    });
    wrap.appendChild(row);
  });
}
function renderDettesTracking() {
  const card = document.getElementById("dettesTrackingCard");
  const wrap = document.getElementById("dettesTracking");
  const dettes = DATA.dettes || [];
  if (dettes.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";
  wrap.innerHTML = "";

  const totalRestant = dettes.reduce((s, d) => s + d.montantRestant, 0);
  document.getElementById("dettesTotalHint").textContent = `Total restant à rembourser : ${fmtNum(totalRestant)} ${DATA.settings.currency}`;

  dettes.forEach(d => {
    const pct = d.montantInitial > 0 ? Math.min(100, Math.round(((d.montantInitial - d.montantRestant) / d.montantInitial) * 100)) : 100;
    const soldee = d.montantRestant <= 0;
    const row = document.createElement("div");
    row.className = "dette-track";
    row.innerHTML = `
      <p class="dette-track-title ${soldee ? "soldee" : ""}">${escapeAttr(d.nom)}${soldee ? " — Soldée ✓" : ""}</p>
      <div class="dette-progress-track"><div class="dette-progress-fill" style="width:${pct}%;"></div></div>
      <p class="dette-track-nums">Reste ${fmtNum(d.montantRestant)} / ${fmtNum(d.montantInitial)} ${DATA.settings.currency} (${pct}% remboursé)</p>
      ${soldee ? "" : `
      <div class="dette-track-form">
        <input type="number" class="text-input dette-repay-input" placeholder="Montant remboursé" min="0">
        <button type="button" class="btn-secondary dette-repay-btn">Rembourser</button>
      </div>`}
    `;
    if (!soldee) {
      row.querySelector(".dette-repay-btn").addEventListener("click", () => {
        const input = row.querySelector(".dette-repay-input");
        const amount = Number(input.value);
        if (!amount || amount <= 0) return;
        const dette = DATA.dettes.find(x => x.id === d.id);
        if (dette) dette.montantRestant = Math.max(0, dette.montantRestant - amount);
        saveDettesData();
        renderDettesTracking();
        renderDettesSettingsList();
      });
    }
    wrap.appendChild(row);
  });
}

/* ============================================================
   MODULES DU PARCOURS BÂTISSEUR
   ============================================================ */
function saveParcoursData() {
  if (CURRENT_USER) {
    window.AbbaSync.saveParcours(CURRENT_USER.uid, MODULES_TERMINES)
      .catch(err => console.error("Sauvegarde du parcours :", err));
  }
}
function toggleModuleTermine(moduleId, done) {
  if (done && !MODULES_TERMINES.includes(moduleId)) MODULES_TERMINES.push(moduleId);
  if (!done) MODULES_TERMINES = MODULES_TERMINES.filter(id => id !== moduleId);
  saveParcoursData();
  renderModulesList();
}
function renderModulesList() {
  const card = document.getElementById("modulesCard");
  const wrap = document.getElementById("modulesList");
  if (!card || !wrap) return;
  if (!MODULES_CONFIG || MODULES_CONFIG.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";

  const total = MODULES_CONFIG.length;
  const faits = MODULES_TERMINES.length;
  document.getElementById("modulesProgressHint").textContent = `${faits}/${total} modules terminés`;

  wrap.innerHTML = "";
  MODULES_CONFIG.forEach(m => {
    const checked = MODULES_TERMINES.includes(m.id);
    const row = document.createElement("label");
    row.className = "check-item";
    row.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""}><span class="${checked ? "done" : ""}">${escapeAttr(m.titre)}</span>`;
    row.querySelector("input").addEventListener("change", (e) => toggleModuleTermine(m.id, e.target.checked));
    wrap.appendChild(row);
  });
}

/* ---------- Éditeur de la liste des modules (coordinateurs uniquement) ---------- */
let EDIT_MODULES = [];
function setupModulesEditor() {
  document.getElementById("addModuleBtn").addEventListener("click", () => {
    EDIT_MODULES.push({ id: "mod_" + Date.now(), titre: "Nouveau module" });
    renderModulesEditorDom();
  });
  document.getElementById("saveModulesBtn").addEventListener("click", async () => {
    const clean = EDIT_MODULES.map(m => ({ ...m, titre: m.titre.trim() })).filter(m => m.titre !== "");
    if (clean.length === 0) { alert("Ajoute au moins un module."); return; }
    const btn = document.getElementById("saveModulesBtn");
    const original = btn.textContent;
    try {
      await window.AbbaSync.saveModulesConfig(clean);
      btn.textContent = "Enregistré ✓";
      setTimeout(() => btn.textContent = original, 1400);
    } catch (err) {
      alert("Impossible d'enregistrer. Vérifie ta connexion.");
      console.error(err);
    }
  });
}
function renderModulesEditor() {
  if (!IS_ADMIN) return;
  EDIT_MODULES = deepClone(MODULES_CONFIG);
  renderModulesEditorDom();
}
function renderModulesEditorDom() {
  const wrap = document.getElementById("modulesEditor");
  if (!wrap) return;
  wrap.innerHTML = "";
  EDIT_MODULES.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "editor-item-row";
    row.innerHTML = `
      <input type="text" class="text-input editor-item-label" value="${escapeAttr(m.titre)}">
      <button type="button" class="editor-del-item" title="Supprimer">🗑</button>
    `;
    row.querySelector(".editor-item-label").addEventListener("input", (e) => { EDIT_MODULES[i].titre = e.target.value; });
    row.querySelector(".editor-del-item").addEventListener("click", () => {
      if (!confirm(`Supprimer le module "${m.titre}" ?`)) return;
      EDIT_MODULES.splice(i, 1);
      renderModulesEditorDom();
    });
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
  const tx = DATA.transactions.find(t => t.id === id);
  if (!confirm(`Supprimer ce mouvement (${tx ? fmtNum(tx.amount) + " " + DATA.settings.currency : "?"}) ?`)) return;
  DATA.transactions = DATA.transactions.filter(t => t.id !== id);
  if (tx) {
    const mk = monthKeyOf(tx.date);
    if (MONTHS_CACHE[mk]) {
      MONTHS_CACHE[mk].transactions = (MONTHS_CACHE[mk].transactions || []).filter(t => t.id !== id);
      saveMonthData(mk);
    }
  }
  renderFinancePanel();
  renderDashboard();
  renderHistorique();
}

function setupFinanceMonthNav() {
  document.getElementById("finPrevMonth").addEventListener("click", () => {
    financeViewMonth--; if (financeViewMonth < 0) { financeViewMonth = 11; financeViewYear--; }
    const mk = `${financeViewYear}-${String(financeViewMonth + 1).padStart(2, "0")}`;
    ensureMonthLoaded(mk).then(renderFinancePanel);
    renderFinancePanel();
  });
  document.getElementById("finNextMonth").addEventListener("click", () => {
    const now = new Date();
    if (financeViewYear === now.getFullYear() && financeViewMonth === now.getMonth()) return;
    financeViewMonth++; if (financeViewMonth > 11) { financeViewMonth = 0; financeViewYear++; }
    const mk = `${financeViewYear}-${String(financeViewMonth + 1).padStart(2, "0")}`;
    ensureMonthLoaded(mk).then(renderFinancePanel);
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

  document.getElementById("txForm").addEventListener("submit", async (e) => {
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
    const mk = monthKeyOf(tx.date);
    await ensureMonthLoaded(mk); // au cas où on ajoute une transaction pour un mois pas encore en cache
    if (!MONTHS_CACHE[mk]) MONTHS_CACHE[mk] = emptyMonthBucket();
    MONTHS_CACHE[mk].transactions.push(tx);
    saveMonthData(mk);
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
  // S'assure que les mois nécessaires (5 dernières semaines + 6 derniers mois) sont chargés,
  // puis affiche — et réaffiche automatiquement une fois le chargement terminé si besoin.
  const neededMonths = new Set();
  for (let i = 34; i >= 0; i--) neededMonths.add(monthKeyOf(addDays(todayStr(), -i)));
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    let m = now.getMonth() - i, y = now.getFullYear();
    while (m < 0) { m += 12; y--; }
    neededMonths.add(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  const missing = [...neededMonths].filter(mk => !LOADED_MONTHS.has(mk));
  if (missing.length > 0) {
    ensureMonthsLoaded(missing, renderHistorique);
  }

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
    saveSettingsData();
    renderDashboard(); renderFinancePanel();
    const btn = document.getElementById("saveSettings");
    const original = btn.textContent;
    btn.textContent = "Enregistré ✓";
    setTimeout(() => btn.textContent = original, 1400);
  });

  document.getElementById("exportData").addEventListener("click", exportData);
  document.getElementById("importData").addEventListener("change", importData);
  document.getElementById("resetData").addEventListener("click", async () => {
    if (confirm("Es-tu sûr de vouloir effacer toutes tes données (spirituel + finance + agenda) ? Cette action est irréversible et sera aussi supprimée du cloud.")) {
      DATA = defaultData();
      MONTHS_CACHE = {};
      LOADED_MONTHS = new Set();
      saveSettingsData();
      saveAgendaData();
      saveDettesData();
      if (CURRENT_USER) {
        try { await window.AbbaSync.deleteAllMonths(CURRENT_USER.uid); } catch (err) { console.error(err); }
      }
      const mk = todayStr().slice(0, 7);
      LOADED_MONTHS.add(mk);
      MONTHS_CACHE[mk] = emptyMonthBucket();
      rebuildCombinedData();
      setupSettingsValues();
      renderSpiritualPanel(); renderFinancePanel(); renderDashboard(); renderHistorique(); renderAgendaPanel();
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
  renderPostesSettingsList();
  renderDettesSettingsList();
}
function updateSettingsSum() {
  const total = ["settingTithe","settingSavings","settingGenerosity","settingLiving"]
    .reduce((s, id) => s + (Number(document.getElementById(id).value) || 0), 0);
  const el = document.getElementById("settingsSum");
  el.textContent = `Total actuel : ${total}%`;
  el.className = "settings-sum " + (total === 100 ? "ok" : "bad");
}

async function exportData() {
  const btn = document.getElementById("exportData");
  const original = btn.textContent;
  btn.textContent = "Préparation…";
  try {
    let allMonths = {};
    if (CURRENT_USER) {
      allMonths = await window.AbbaSync.loadAllMonths(CURRENT_USER.uid); // garantit un export complet, même les mois pas encore ouverts sur cet appareil
    } else {
      allMonths = MONTHS_CACHE;
    }
    const merged = { settings: DATA.settings, agenda: DATA.agenda, spiritual: {}, journal: {}, transactions: [], reserves: {} };
    Object.entries(allMonths).forEach(([mk, m]) => {
      Object.assign(merged.spiritual, m.spiritual || {});
      Object.assign(merged.journal, m.journal || {});
      merged.transactions.push(...(m.transactions || []));
      if (m.reserves && Object.keys(m.reserves).length) merged.reserves[mk] = m.reserves;
    });
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abba-life-donnees-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Impossible de préparer l'export. Vérifie ta connexion.");
    console.error(err);
  }
  btn.textContent = original;
}
async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== "object") throw new Error("format invalide");

      DATA.settings = { ...defaultData().settings, ...(parsed.settings || {}) };
      DATA.agenda = parsed.agenda || [];
      DATA.dettes = parsed.dettes || [];
      saveSettingsData();
      saveAgendaData();
      saveDettesData();

      // Répartit les données importées par mois, comme le fait la migration automatique
      const buckets = {};
      function bucket(mk) { if (!buckets[mk]) buckets[mk] = emptyMonthBucket(); return buckets[mk]; }
      Object.entries(parsed.spiritual || {}).forEach(([date, val]) => { bucket(monthKeyOf(date)).spiritual[date] = val; });
      Object.entries(parsed.journal || {}).forEach(([date, val]) => { bucket(monthKeyOf(date)).journal[date] = val; });
      (parsed.transactions || []).forEach((tx) => { bucket(monthKeyOf(tx.date) || "sans-date").transactions.push(tx); });
      Object.entries(parsed.reserves || {}).forEach(([mk, res]) => { bucket(mk).reserves = res; });

      MONTHS_CACHE = buckets;
      LOADED_MONTHS = new Set(Object.keys(buckets));
      rebuildCombinedData();
      if (CURRENT_USER) {
        await Promise.all(Object.entries(buckets).map(([mk, data]) => window.AbbaSync.saveMonth(CURRENT_USER.uid, mk, data)));
      }

      setupSettingsValues();
      renderSpiritualPanel(); renderFinancePanel(); renderDashboard(); renderHistorique(); renderAgendaPanel();
    } catch (err) {
      alert("Ce fichier ne semble pas être un export valide d'ABBA Life.");
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

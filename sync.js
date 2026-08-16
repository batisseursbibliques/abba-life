// ============================================================
// sync.js — connexion à Firebase (Auth + Firestore)
// Offre gratuite (Spark) : largement suffisante pour ABBA.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
  enableIndexedDbPersistence, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Permet à l'app de continuer à fonctionner hors connexion (le PWA reste utilisable dans le bus, au village, etc.)
try { enableIndexedDbPersistence(db); } catch (e) { /* déjà activé dans un autre onglet — sans gravité */ }

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(String(email).toLowerCase());
}

/* ---------- AUTHENTIFICATION ---------- */
async function signUp(nom, telephone, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: nom.trim() });
  await setDoc(doc(db, "users", cred.user.uid), {
    nom: nom.trim(), telephone: telephone.trim(), email: email.trim().toLowerCase(), createdAt: serverTimestamp(),
  });
  return cred.user;
}
async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}
async function logOut() { await signOut(auth); }
async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}
function watchAuth(callback) { onAuthStateChanged(auth, callback); }

/* ---------- RÉGLAGES (petit document, toujours en direct) ---------- */
function watchSettings(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "settings"), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, (err) => console.error("watchSettings:", err));
}
async function saveSettings(uid, settings) {
  await setDoc(doc(db, "users", uid, "priv", "settings"), settings);
}

/* ---------- AGENDA (petit document, toujours en direct) ---------- */
function watchAgenda(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "agenda"), (snap) => {
    callback(snap.exists() ? (snap.data().tasks || []) : []);
  }, (err) => console.error("watchAgenda:", err));
}
async function saveAgenda(uid, tasks) {
  await setDoc(doc(db, "users", uid, "priv", "agenda"), { tasks });
}

/* ---------- DETTES (petit document, toujours en direct) ---------- */
function watchDettes(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "dettes"), (snap) => {
    callback(snap.exists() ? (snap.data().list || []) : []);
  }, (err) => console.error("watchDettes:", err));
}
async function saveDettes(uid, list) {
  await setDoc(doc(db, "users", uid, "priv", "dettes"), { list });
}

/* ---------- DONNÉES MENSUELLES (spirituel + bilans + finance, un document par mois AAAA-MM) ----------
   Chaque sauvegarde ne réécrit que le mois concerné — les données ne grossissent jamais
   sans limite, même après des années d'usage quotidien. */
function watchMonth(uid, monthKey, callback) {
  return onSnapshot(doc(db, "users", uid, "months", monthKey), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, (err) => console.error("watchMonth:", err));
}
async function getMonthOnce(uid, monthKey) {
  const snap = await getDoc(doc(db, "users", uid, "months", monthKey));
  return snap.exists() ? snap.data() : null;
}
async function saveMonth(uid, monthKey, monthData) {
  await setDoc(doc(db, "users", uid, "months", monthKey), monthData);
}
async function loadAllMonths(uid) {
  const snap = await getDocs(collection(db, "users", uid, "months"));
  const result = {};
  snap.docs.forEach((d) => { result[d.id] = d.data(); });
  return result;
}
async function deleteAllMonths(uid) {
  const snap = await getDocs(collection(db, "users", uid, "months"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/* ---------- MIGRATION AUTOMATIQUE depuis l'ancien format (un seul gros document) ----------
   S'exécute une seule fois par compte, de façon transparente, à la première connexion
   après cette mise à jour. Répartit les anciennes données par mois. */
async function migrateLegacyIfNeeded(uid) {
  const migFlagRef = doc(db, "users", uid, "priv", "migrated");
  const migFlagSnap = await getDoc(migFlagRef);
  if (migFlagSnap.exists()) return; // déjà migré

  const legacyRef = doc(db, "users", uid, "priv", "main");
  const legacySnap = await getDoc(legacyRef);
  if (!legacySnap.exists()) {
    await setDoc(migFlagRef, { done: true, at: serverTimestamp() });
    return; // nouveau compte, rien à migrer
  }

  const legacy = legacySnap.data() || {};
  const monthBuckets = {}; // { "2026-08": { spiritual:{}, journal:{}, transactions:[] } }
  function bucket(monthKey) {
    if (!monthBuckets[monthKey]) monthBuckets[monthKey] = { spiritual: {}, journal: {}, transactions: [] };
    return monthBuckets[monthKey];
  }

  Object.entries(legacy.spiritual || {}).forEach(([date, val]) => {
    bucket(date.slice(0, 7)).spiritual[date] = val;
  });
  Object.entries(legacy.journal || {}).forEach(([date, val]) => {
    bucket(date.slice(0, 7)).journal[date] = val;
  });
  (legacy.transactions || []).forEach((tx) => {
    bucket((tx.date || "").slice(0, 7) || "sans-date").transactions.push(tx);
  });

  const writes = Object.entries(monthBuckets).map(([monthKey, data]) => saveMonth(uid, monthKey, data));
  if (legacy.settings) writes.push(saveSettings(uid, legacy.settings));
  if (legacy.agenda) writes.push(saveAgenda(uid, legacy.agenda));
  await Promise.all(writes);
  await setDoc(migFlagRef, { done: true, at: serverTimestamp() });
}

/* ---------- RÉSUMÉ POUR LES COORDINATEURS ---------- */
async function saveSummary(uid, summary) {
  await setDoc(doc(db, "summaries", uid), { ...summary, updatedAt: serverTimestamp() }, { merge: true });
}
async function loadAllSummaries() {
  const snap = await getDocs(collection(db, "summaries"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/* ---------- CHECKLIST SPIRITUELLE PARTAGÉE ---------- */
function watchChecklist(callback) {
  return onSnapshot(doc(db, "config", "checklist"), (snap) => {
    callback(snap.exists() ? snap.data().categories : null);
  }, (err) => console.error("watchChecklist:", err));
}
async function saveChecklist(categories) {
  await setDoc(doc(db, "config", "checklist"), { categories, updatedAt: serverTimestamp() });
}

/* ---------- COORDINATEURS (liste modifiable depuis l'app) ---------- */
function watchAdmins(callback) {
  return onSnapshot(collection(db, "admins"), (snap) => {
    callback(snap.docs.map(d => d.id));
  }, (err) => console.error("watchAdmins:", err));
}
async function addAdmin(email, addedByEmail) {
  const id = email.trim().toLowerCase();
  await setDoc(doc(db, "admins", id), { addedBy: addedByEmail, addedAt: serverTimestamp() });
}
async function removeAdmin(email) {
  const id = email.trim().toLowerCase();
  await deleteDoc(doc(db, "admins", id));
}
async function ensureAdminSeed(email) {
  const id = email.trim().toLowerCase();
  await setDoc(doc(db, "admins", id), { addedBy: "bootstrap", addedAt: serverTimestamp() }, { merge: true });
}

window.AbbaSync = {
  isAdminEmail,
  signUp, logIn, logOut, watchAuth, getUserProfile,
  watchSettings, saveSettings,
  watchAgenda, saveAgenda,
  watchDettes, saveDettes,
  watchMonth, getMonthOnce, saveMonth, loadAllMonths, deleteAllMonths,
  migrateLegacyIfNeeded,
  saveSummary, loadAllSummaries,
  watchChecklist, saveChecklist,
  watchAdmins, addAdmin, removeAdmin, ensureAdminSeed,
};

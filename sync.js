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
async function signUp(nom, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: nom.trim() });
  await setDoc(doc(db, "users", cred.user.uid), {
    nom: nom.trim(), email: email.trim().toLowerCase(), createdAt: serverTimestamp(),
  });
  return cred.user;
}
async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}
async function logOut() { await signOut(auth); }
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
   S'exécute une seule fois par compte, de façon transparente, à la première connex
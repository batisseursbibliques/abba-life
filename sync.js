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
  getFirestore, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
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

/* ---------- DONNÉES PERSONNELLES (spirituel + finance + réglages) ---------- */
function watchUserData(uid, callback) {
  return onSnapshot(doc(db, "users", uid, "priv", "main"), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, (err) => console.error("watchUserData:", err));
}
async function saveUserData(uid, data) {
  await setDoc(doc(db, "users", uid, "priv", "main"), data);
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
  signUp, logIn, logOut, watchAuth,
  watchUserData, saveUserData,
  saveSummary, loadAllSummaries,
  watchChecklist, saveChecklist,
  watchAdmins, addAdmin, removeAdmin, ensureAdminSeed,
};

// ============================================================
// firebase-config.js — à remplir une seule fois (voir GUIDE-FIREBASE.md)
// ============================================================
// 1) https://console.firebase.google.com → « Ajouter un projet » (gratuit, offre Spark, pas de carte bancaire)
// 2) Dans le projet : icône </> « Ajouter une application Web » → copie la config donnée et colle-la ci-dessous
// 3) Authentication → Sign-in method → active « E-mail/Mot de passe »
// 4) Firestore Database → Créer une base → mode production → région proche (ex: europe-west1)
// 5) Firestore → Règles → colle le contenu du fichier firestore.rules (en y mettant les mêmes e-mails qu'ici)

export const firebaseConfig = {
  apiKey: "AIzaSyDsYhgv4jHUmLY-BedopJSTwALrDoryDgw",
  authDomain: "abba-life-c6b5c.firebaseapp.com",
  projectId: "abba-life-c6b5c",
  storageBucket: "abba-life-c6b5c.firebasestorage.app",
  messagingSenderId: "1057124245132",
  appId: "1:1057124245132:web:907b910f80109c8c8925a9",
};

// Adresses e-mail des coordinateurs : accès à l'onglet "Coordination" (vue collective)
// et au droit de modifier la checklist spirituelle partagée.
// ⚠️ Cette liste DOIT être identique à celle du fichier firestore.rules.
export const ADMIN_EMAILS = [
  "apotrepaulabba@gmail.com",
];

# Mise en place — ABBA Life avec compte et synchronisation (gratuit)

Tout est gratuit (offre **Spark** de Firebase, aucune carte bancaire demandée) et largement suffisant pour ABBA à cette échelle (jusqu'à ~50 000 lectures et ~20 000 écritures par jour, gratuites).

## 1. Créer le projet Firebase (10 min, une seule fois)

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. Clique **Ajouter un projet**. Nomme-le par exemple `abba-life`. Tu peux désactiver Google Analytics (pas nécessaire).
3. Une fois le projet créé, clique l'icône **`</>`** ("Ajouter une application Web").
4. Donne-lui un surnom (ex. `abba-life-web`), ne coche pas "Firebase Hosting" (on reste sur GitHub Pages).
5. Firebase t'affiche un bloc `firebaseConfig = {...}`. **Copie-le**.

## 2. Coller la configuration dans le projet

Ouvre le fichier `firebase-config.js` et remplace les valeurs `COLLE_ICI` par celles que Firebase t'a données (apiKey, authDomain, projectId, etc.).

Dans le même fichier, mets ton adresse e-mail (et celle de tout autre coordinateur) dans `ADMIN_EMAILS`.

## 3. Activer l'authentification par e-mail

Dans la console Firebase : **Authentication → Get started → Sign-in method → E-mail/Mot de passe → Activer → Enregistrer**.

## 4. Créer la base Firestore

Dans la console Firebase : **Firestore Database → Créer une base de données**.
- Choisis une région proche (ex. `europe-west1`).
- Choisis **mode production**.

## 5. Coller les règles de sécurité

Dans **Firestore Database → Règles**, remplace tout le contenu par celui du fichier `firestore.rules` fourni ici — **en y mettant les mêmes e-mails de coordinateurs** que dans `firebase-config.js`. Clique **Publier**.

## 6. Déployer sur GitHub Pages (comme avant)

Rien ne change dans la façon de déployer : pousse tout le dossier (y compris `firebase-config.js` et `sync.js`) sur GitHub Pages comme d'habitude.

> ⚠️ Le fichier `firebase-config.js` contient des identifiants publics par nature (ils sont visibles dans le navigateur de toute façon) — ce n'est pas un secret à cacher. C'est **firestore.rules**, côté serveur, qui protège réellement les données.

## 7. Premier lancement

1. Ouvre l'app déployée. Un écran de connexion apparaît.
2. Crée ton compte avec ton adresse e-mail (celle mise dans `ADMIN_EMAILS`).
3. Si tu avais déjà des données sur cet appareil (avant la mise à jour), elles sont automatiquement reprises et envoyées dans le cloud à la première connexion.
4. Comme ton e-mail est dans la liste des coordinateurs, tu verras en plus :
   - L'onglet **Coordination** (régularité de tous les Bâtisseurs).
   - Un bloc **Checklist spirituelle** dans Réglages, pour modifier les catégories/éléments — ça se met à jour pour tout le monde en direct.
5. Pour ajouter un membre : il crée simplement son propre compte depuis l'écran de connexion, avec son e-mail à lui. Pas besoin que tu fasses quoi que ce soit côté Firebase.
6. Pour ajouter un autre coordinateur plus tard : ajoute son e-mail dans `ADMIN_EMAILS` (`firebase-config.js`) **et** dans `firestore.rules`, republie les règles, et redéploie le site.

## Ce que ça change concrètement

- **Fini les données perdues** : tout est sauvegardé automatiquement dans le cloud, dès qu'une case est cochée ou qu'un mouvement est ajouté. Nouveau téléphone → on se reconnecte avec le même e-mail → tout est là.
- **Fonctionne encore hors connexion** : l'app garde une copie locale, se resynchronise dès que la connexion revient.
- **Vue collective** : sous "Coordination", tu vois qui est régulier et qui a décroché — sans jamais voir les finances de personne (restées privées).
- **Checklist modifiable sans toucher au code** : tu changes les catégories/éléments directement dans l'app.

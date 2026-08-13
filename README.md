# ABBA Life — Carnet du Bâtisseur

Application web gratuite : suivi spirituel quotidien + gestion financière biblique, avec compte personnel et synchronisation automatique dans le cloud (Firebase, offre gratuite Spark).

Chaque Bâtisseur crée un compte (e-mail + mot de passe). Ses données sont sauvegardées automatiquement et retrouvables sur n'importe quel appareil. Les coordinateurs (voir `firebase-config.js`) ont en plus accès à une vue collective de régularité et peuvent modifier la checklist spirituelle partagée directement dans l'app.

## Avant de déployer : configuration Firebase (une seule fois)

Voir le fichier **`GUIDE-FIREBASE.md`** pour la mise en place complète (création du projet, activation de la connexion par e-mail, base Firestore, règles de sécurité). Cette étape est déjà faite pour le projet `abba-life` actuel — à refaire seulement si un nouveau projet Firebase est créé.

## Déployer gratuitement sur GitHub Pages

1. Crée un nouveau dépôt sur GitHub (ex: `abba-life`), ou ajoute ce dossier comme sous-dossier de ton dépôt existant.
2. Mets-y **tous** les fichiers du dossier, y compris `firebase-config.js` et `sync.js` (nouveaux — indispensables au fonctionnement) : `index.html`, `style.css`, `app.js`, `sync.js`, `firebase-config.js`, `manifest.json`, `sw.js`, `logo.png`, `icon-192.png`, `icon-512.png`.
3. Dans les paramètres du dépôt → **Pages** → choisis la branche `main` (dossier `/root` ou `/abba-life` selon l'organisation) → Enregistrer.
4. Le lien sera du type : `https://batisseursbibliques.github.io/abba-life/`

## Tester en local avant de déployer

Ouvrir simplement `index.html` dans un navigateur fonctionne pour l'essentiel, mais le mode hors-ligne (service worker) nécessite un vrai serveur local. Depuis ce dossier :

```
python3 -m http.server 8080
```
puis ouvrir `http://localhost:8080` dans le navigateur.

## Installer l'app sur un téléphone

Une fois en ligne, ouvrir le lien dans le navigateur du téléphone (Chrome/Safari) puis :
- Android (Chrome) : menu ⋮ → « Ajouter à l'écran d'accueil »
- iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil »

L'app s'ouvrira alors comme une vraie application, en plein écran.

## Sauvegarde des données

Les données de chaque Bâtisseur sont sauvegardées automatiquement dans Firebase (Firestore) dès qu'une case est cochée ou qu'un mouvement financier est ajouté — plus besoin de se souvenir d'exporter quoi que ce soit. Une copie reste aussi en cache local sur l'appareil pour un usage hors connexion. L'export/import JSON (**Réglages → Mes données**) reste disponible en secours.

## Coordinateurs

Les adresses e-mail des coordinateurs sont définies dans `firebase-config.js` (`ADMIN_EMAILS`) et doivent être identiques à celles du fichier `firestore.rules` publié dans la console Firebase. Un coordinateur voit en plus l'onglet **Coordination** et peut modifier la checklist spirituelle partagée depuis **Réglages**.

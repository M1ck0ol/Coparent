# CoParent — Guide de déploiement

## Ce que tu vas obtenir
Une application web privée, accessible depuis ton téléphone et celui de Charlène,
avec synchronisation en temps réel via Firebase.

---

## Étape 1 — Créer le dépôt GitHub

1. Ouvre **github.com** sur ton téléphone
2. Connecte-toi à ton compte
3. Clique sur le **+** en haut à droite → **New repository**
4. Nom du dépôt : `coparent`
5. Laisse tout par défaut et clique **Create repository**
6. Sur la page qui s'ouvre, clique sur **"uploading an existing file"**
7. Uploade **tous les fichiers** du dossier coparent (en conservant la structure)
8. Clique **Commit changes**

---

## Étape 2 — Déployer sur Vercel

1. Ouvre **vercel.com** sur ton téléphone
2. Clique **Sign up** → **Continue with GitHub**
3. Autorise Vercel à accéder à GitHub
4. Clique **Add New Project**
5. Sélectionne ton dépôt `coparent`
6. Vercel détecte automatiquement que c'est un projet Vite/React
7. Clique **Deploy** et attends 1-2 minutes
8. Vercel te donne une URL du type : `coparent-xxx.vercel.app`

---

## Étape 3 — Utiliser l'app

- Ouvre l'URL sur ton téléphone
- Mot de passe : **coparent2024**
- Partage l'URL + le mot de passe à Charlène
- Sur Chrome mobile : menu ⋮ → "Ajouter à l'écran d'accueil" pour l'installer comme une appli

---

## Changer le mot de passe

Dans le fichier `src/App.jsx`, ligne 8 :
```
const APP_PASSWORD = "coparent2024";
```
Remplace `coparent2024` par le mot de passe de ton choix, puis redéploie.

---

## Structure des fichiers

```
coparent/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── manifest.json
└── src/
    ├── main.jsx
    ├── App.jsx
    └── firebase.js
```

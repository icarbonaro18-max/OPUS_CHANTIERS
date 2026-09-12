# 2 — Déploiement et retour arrière

## Pourquoi le ZIP contient des sources et une compilation

Le client Microsoft d’authentification et le lecteur PDF sont des dépendances JavaScript officielles épinglées dans `package.json`. Le workflow GitHub les télécharge, les compile puis publie le dossier `_site`. L’environnement de création n’a pas pu accéder au registre npm : il faut donc confirmer que cette compilation aboutit dans GitHub **avant** le test d’authentification.

Il ne s’agit pas de réinstaller OneDrive ni de changer de compte. **Ne pas déposer seulement index.html et ne pas ouvrir index.html par double-clic local.**

## Procédure

1. Conserver le ZIP de la v2 et une copie de la configuration de publication existante. Exporter les dossiers v2 locaux importants, sans les effacer.
2. Pour ne pas interrompre l’application actuelle, privilégier un dépôt de recette distinct (par exemple `OPUS_CHANTIERS_RECETTE`) ; déclarer son adresse de retour `/OPUS_CHANTIERS_RECETTE/auth.html` dans Entra. Le code utilise des chemins relatifs. Le site de stockage reste OPUSCHANTIERS ; n’utiliser qu’un chantier fictif pendant les essais.
3. Décompresser ce ZIP. Déposer **toute son arborescence**, notamment `modules`, `lib`, `scripts` et **`.github/workflows/deploy.yml`**. Le dossier `.github` est parfois masqué dans l’outil de copie.
4. Renseigner `config.json`. Aucun secret ou fichier client ne doit être ajouté au dépôt public.
5. Dans le dépôt : **Settings > Pages > Source : GitHub Actions**. Ce n’est plus la publication brute de la branche.
6. Lancer le workflow « Publier OPUS CHANTIERS » depuis **Actions**, ou pousser un commit sur `main`. Vérifier que **build** puis **deploy** se terminent en vert. Le workflow exécute également les tests unitaires.
7. Ouvrir l’adresse GitHub Pages en HTTPS. L’URL de retour dans Entra doit correspondre au chemin réel.
8. Réaliser les essais de `03_RECETTE.md`. Après validation, publier sur le dépôt final avec son URI de retour déjà autorisée.

Dépendances épinglées : MSAL Browser 5.21.0, PDF.js 5.4.624, esbuild 0.25.9. Après une première compilation réussie, conserver le `package-lock.json` produit et le versionner pour figer également les dépendances transitives ; remplacer ensuite `npm install` par `npm ci` dans le workflow.

## Aperçu sans compte Microsoft

Après déploiement, ajouter `?demo=1` à l’adresse. La bande « MODE DÉMONSTRATION » reste visible. Les données sont fictives, locales et séparées des comptes professionnels. Une action en démo **ne sauvegarde rien dans Microsoft 365**.

## Mises à jour de l’application

Chaque version doit changer le numéro de cache dans `sw.js`. Les anciennes fenêtres doivent être fermées après enregistrement pour qu’une mise à jour du service worker s’active. Le service worker ne supprime que les caches de cette application ; il ne touche ni aux autres applications OPUS ni aux brouillons.

Sur une ancienne installation v2, une fois le déploiement confirmé, ouvrir la nouvelle URL avec `?version=3` une première fois, puis fermer et rouvrir les fenêtres de l’application. Ne jamais vider les données de site tant que des brouillons attendent un envoi.

## Retour arrière

Revenir au commit de la v2 et à son mode de publication antérieur restaure son interface. Les données v3 restent dans les sous-dossiers `_OPUS` de SharePoint ; la v2 locale ne sait pas les lire. Ne pas supprimer ces données. Conserver l’accès SharePoint de secours. Un retour à v2 ne rétablit pas une synchronisation automatique que la v2 ne possédait pas.

## Compilation locale pour un mainteneur

Node.js 22, npm, réseau vers le registre npm :

```sh
npm install
npm test
npm run build
```

Servir `_site` via HTTPS ou un serveur local de développement. Ajouter l’URI locale de retour dans Entra seulement si l’authentification locale est réellement testée. Aucun serveur applicatif hébergeant un mot de passe n’est nécessaire.

Source GitHub : https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

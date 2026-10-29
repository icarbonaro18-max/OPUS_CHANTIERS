# Connexion OPUS CHANTIERS — correctif 3.6.1 du 28 octobre 2026

## Constat vérifié

La capture utilisateur affiche la version 3.5.0-rendezvous, une copie de données mémorisées et l'erreur MSAL `interaction_in_progress`. Cette erreur signifie qu'une tentative interactive Microsoft est déjà marquée en cours ; elle ne prouve pas, à elle seule, la cause initiale de ce marqueur.

Lors du contrôle, https://opus-chantiers.vercel.app/app.js sert la version 3.6.0-stockage. Son SHA-256 est `e11e5aa630869fa0dc5222dc966ae12aee9f67b952519ce8defb913082556393`. Ce fichier est identique à celui du dépôt OPUS_CHANTIERS, commit `6fe1c0f3df7c2c1316ecaf71155acc377302250a`. L'installation visible dans la capture exécute donc un code antérieur à celui publié.

La page https://opus-chantiers.vercel.app/reparer.html répond correctement. Elle renouvelle uniquement le cache de l'interface et désinscrit le service worker de cette application. Elle conserve IndexedDB, les comptes et les brouillons. Elle ne constitue pas une réparation du marqueur Microsoft bloqué.

## Défauts de code et corrections

- `msal` est affecté avant la fin de `initialize()` et de `handleRedirectPromise()`. L'ancien bouton de connexion vérifie seulement l'existence de `msal` : il peut commencer une interaction alors que l'initialisation est encore en cours. Le correctif partage une seule initialisation et l'attend avant une nouvelle connexion.
- Connexion, reconnexion, calendrier privé et déconnexion ne disposent pas de verrou commun. Le correctif réserve une seule interaction Microsoft à la fois. Une action concurrente est refusée clairement, sans être différée pour s'exécuter à l'insu de l'utilisateur.
- Le nom affiché vient du cache utilisateur et peut rester présent alors que `getActiveAccount()` ne retourne plus de compte. La récupération de jeton retrouve désormais uniquement le compte correspondant exactement au `homeAccountId` du dossier ouvert. Elle ne choisit pas le premier compte disponible.
- Les erreurs `interaction_in_progress` deviennent un message compréhensible, avec une action dédiée « Relancer la connexion bloquée ».
- Cette relance est explicitement déclenchée par l'utilisateur, après fermeture de l'ancienne fenêtre Microsoft. Elle utilise `overrideInteractionInProgress` de MSAL 5.21.0 pour le popup. L'option n'est jamais appliquée automatiquement aux connexions normales. Aucun compte, jeton, brouillon ou document de chantier n'est effacé par le correctif.
- Avant connexion, relance ou déconnexion, les saisies du rapport et de l'attestation ouverte sont conservées localement. Si cette conservation échoue, l'opération de connexion n'est pas lancée.
- Si le compte choisi lors de la réparation diffère de celui du dossier, la reprise est refusée et le compte initial est rétabli quand il est disponible.
- Un bouton de mise à jour est prévu pour les versions futures. L'activation attend la fermeture des formulaires et des autres fenêtres OPUS.

## Conservation de la version actuellement publiée

Ce correctif s'applique à la version 3.6.0 récupérée dans le dépôt, et conserve ses changements de stockage, d'historique et de cache des médias. Il ne remplace pas ces fichiers par ceux du ZIP 3.5.1 de la réponse précédente. Le délai de sauvegarde et la politique de stockage de 3.6.0 restent ceux de cette base ; cette livraison traite le blocage de connexion.

La version 3.6.1 est préparée localement. Elle n'a pas été poussée dans GitHub et n'est pas déployée dans Vercel.

## Vérifications

La suite complète et la compilation sont exécutées avec `npm test`. Les nouveaux tests reproduisent : une initialisation lente suivie d'un clic de connexion ; deux reconnexions simultanées ; une déconnexion pendant le popup ; une relance après marqueur bloqué ; la perte du compte actif ; le refus d'un autre compte ; et l'arrêt de toute interaction si le brouillon ne peut pas être persisté.

Ces tests valident le comportement du code et les demandes transmises à MSAL. Ils ne constituent pas une authentification réussie avec le compte Roberto sur son navigateur. L'accès à cette session et la vérification réelle après déploiement restent nécessaires.

## Reprise immédiate de l'installation actuelle

1. Terminer/conserver les saisies en cours. Ne pas effacer les données de site.
2. Fermer les autres fenêtres et applications OPUS ainsi que toute ancienne fenêtre de connexion Microsoft.
3. Ouvrir la page `reparer.html` du site et choisir « Relancer sans effacer mes brouillons ».
4. Vérifier que la version 3.6.0 publiée est chargée, puis lancer une seule tentative de connexion. Si l'erreur demeure, le correctif de connexion reste nécessaire.

Après publication de 3.6.1, refaire la relance si l'ancienne installation est encore active, vérifier Version 3.6.1, puis utiliser « Relancer la connexion bloquée » depuis le menu de session si nécessaire. Confirmer le même compte que celui du rapport.

## Publication du correctif

Appliquer le patch sur le commit indiqué, ou reprendre les changements dans une branche à jour du dépôt. Conserver les autres évolutions éventuellement publiées entre-temps. Exécuter `npm test`, puis utiliser le déploiement Vercel habituel. Ne pas republier l'ancienne archive 3.5.1 sur la base 3.6.0.

Documentation officielle : https://learn.microsoft.com/en-us/entra/msal/javascript/browser/errors
Implémentation de l'option utilisée : `node_modules/@azure/msal-browser/src/request/PopupRequest.ts` et `controllers/StandardController.ts`, version 5.21.0 épinglée dans ce projet.

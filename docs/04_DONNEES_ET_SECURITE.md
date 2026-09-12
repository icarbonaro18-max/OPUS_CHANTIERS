# 4 — Données, sauvegardes et permissions

## Stockage

Les dossiers source restent dans la bibliothèque Documents du site OPUSCHANTIERS. L’application ne déplace un chantier que sur action explicite de classement ; elle n’efface pas les documents.

Les données modifiables sont des fichiers JSON sous `_OPUS/fiche` et `_OPUS/attestations/<identifiant>`. Les images incorporées par les formulaires sont stockées séparément sous `06_PHOTOS/Attestations`, avec références par ID. Les PDF générés vont dans `05_PDF_GENERES`.

Ne pas modifier manuellement `_OPUS`. Ne pas déplacer un seul fichier d’image référencé sans sa fiche. Les URL de téléchargement signées ne sont pas utilisées comme références pérennes ; l’ID du fichier est utilisé pour obtenir une nouvelle URL au moment de la lecture.

## Révisions concurrentes

Une sauvegarde crée un nouveau fichier de révision, elle ne remplace pas le précédent. Le nom contient l’identifiant de version et ses parents. Si deux appareils ont enregistré depuis la même version de départ, deux branches sont conservées et l’interface propose les versions à vérifier. Le bureau sélectionne une base ; la sauvegarde suivante référence les branches contrôlées.

Il n’y a pas de fusion champ par champ automatique. L’historique est une aide de récupération, pas un coffre-fort légal ou un journal d’audit immuable : un membre ayant des droits d’écriture dans SharePoint peut intervenir directement sur les fichiers par d’autres outils. Aucun hash de signature qualifiée ou horodatage tiers n’est ajouté.

La rétention et les sauvegardes Microsoft de l’entreprise restent à administrer indépendamment. Aucune purge automatique de l’historique n’est prévue dans cette version.

## Cache local

Les brouillons sont séparés par ID d’application et compte Microsoft. Ils ne sont pas protégés contre une personne ayant accès au profil du navigateur. Verrouiller les appareils et ne pas partager un profil Chrome entre utilisateurs non autorisés.

Une copie locale d’un document ouvert peut être conservée si sa taille est inférieure à 25 Mo. Les autres documents et une première ouverture exigent le réseau. La déconnexion est bloquée en présence d’envois en attente afin d’éviter un oubli ; une sauvegarde de secours est proposée.

Le service worker ne met pas en cache Microsoft Graph, les jetons ou les fichiers clients. Il ne gère que les ressources statiques de cette application. Un cache de formulaire n’est pas la preuve qu’une sauvegarde est remontée au bureau.

## Connexion

Authentification Microsoft avec MSAL, flux code et PKCE. Aucun mot de passe traité par le code OPUS et aucun secret client. Le jeton de session reste dans le contexte de l’application parente ; les formulaires incorporés reçoivent seulement les informations nécessaires au chantier.

Les messages entre application et formulaires contrôlent origine, fenêtre active et identifiant aléatoire de session. Les formulaires sont des sources existantes de confiance dans le même dépôt ; ils ne constituent pas une frontière de sécurité contre du JavaScript malveillant. Restreindre l’écriture dans le dépôt GitHub aux personnes autorisées.

Permissions Graph déléguées `User.Read` et `Sites.Selected` avec octroi `write` sur le seul site OPUSCHANTIERS. Cela ne remplace pas les droits de chaque membre du site. Tous les membres autorisés peuvent voir les chantiers de ce site ; aucun filtre d’interface n’est présenté comme un contrôle d’accès serveur.

## Sources techniques

- Téléchargement via URL préautorisée pour les applications JavaScript : https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0
- Sessions d’envoi, segments et reprise : https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
- Pagination des enfants d’un dossier : https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0
- Autorisations sélectionnées : https://learn.microsoft.com/en-us/graph/permissions-selected-overview

# OPUS CHANTIERS 3.6.2 — coordonnées client et recherche fournisseurs

Préparé le 29 octobre 2026 sur le dépôt OPUS_CHANTIERS, commit de base 6fe1c0f3df7c2c1316ecaf71155acc377302250a, qui sert encore la version 3.6.0 sur Vercel lors du contrôle. Cette livraison conserve le correctif de connexion 3.6.1 préparé précédemment. Elle n'est pas déployée automatiquement.

## Modifier les coordonnées sans faire de rapport

Un bouton « Modifier les coordonnées » est disponible sur les cartes Interventions et Visites / Devis, ainsi que dans l'aperçu du rendez-vous du calendrier lorsqu'il est lié à l'une de ces fiches.

Il ouvre une petite fiche indépendante : client / raison sociale, nom, prénom, téléphone, e-mail, adresse client, puis nom, téléphone et e-mail du contact sur place. Aucun rapport n'est ouvert et aucune photo n'est téléchargée pour cette modification. Le bureau et les chefs de chantier y ont accès, conformément au droit de modification des fiches existant. L'accès de complétion déjà disponible aux techniciens dans les rapports est conservé.

Les coordonnées de la fiche client sont partagées ; celles du contact sur place concernent seulement la visite ou l'intervention sélectionnée. Quand le contact reprend le téléphone/e-mail du client, la correction suit dans cette fiche. Un contact distinct garde ses propres coordonnées. Une correction faite explicitement dans le champ du contact ne peut pas être remplacée par la copie automatique du client.

À l'enregistrement, seules les coordonnées modifiées sont appliquées à l'état le plus récent. Le planning, les horaires réalisés, le statut, les notes, les pièces jointes et les rapports sont conservés. Une modification concurrente des mêmes coordonnées ou un changement de client sont signalés. Si la fiche client est confirmée mais que le contact ne peut pas être envoyé, les saisies restent affichées pour réessayer sans créer un doublon.

## Rechercher les fournisseurs dans la boîte mail

Dans Bons de commande, l'onglet « E-mails fournisseurs » ouvre la recherche dans la boîte Outlook opuselec@hotmail.com déjà prévue dans l'application. La connexion personnelle Outlook et l'autorisation Mail.Read restent nécessaires.

L'ancien écran avait deux limitations : il masquait les expéditeurs non reconnus dans une liste fixe et recherchait seulement dans les messages déjà chargés. La recherche appelle désormais Microsoft Graph dans la boîte aux lettres :

- Choix de fournisseur : Rexel, YESSS, Difam, CDO et les autres fournisseurs déjà présents.
- Saisie libre : nom de n'importe quel fournisseur, adresse e-mail, référence ou chantier ; recherche dans l'expéditeur, l'objet et le contenu.
- Dates de début et de fin facultatives. La limite implicite aux 90 derniers jours est supprimée.
- Recherche explicite par bouton ou Entrée ; résultats et pagination servent les réponses du serveur, sans les filtrer à nouveau sur le simple aperçu du message.
- Les fournisseurs inconnus restent visibles avec leur adresse d'expéditeur. La catégorie indicative ne masque aucun résultat.
- Ouverture du message en texte, accès aux pièces jointes selon le parcours existant, puis « Utiliser cet e-mail pour le bon ». Les pièces PDF utiles restent à ajouter dans les sources du bon après téléchargement, comme dans le parcours existant.
- Passer entre Fournisseurs, Matériel dépôt et E-mails n'efface pas le bon en cours. La simple recherche ne retire pas sa validation. L'importation d'un message reste une action distincte et explicite, avant le bouton de lecture de la commande.

La fonction reste en lecture des messages. L'application n'envoie pas de message et ne transmet pas automatiquement les résultats de recherche à l'IA. La lecture de commande utilise uniquement les sources que l'utilisateur choisit ensuite.

## Limites et vérification sur les comptes réels

La recherche de messages Microsoft Graph retourne au maximum 1 000 résultats par recherche. Pour un fournisseur ayant beaucoup de messages, restreindre les dates ou ajouter une référence. La pagination est suivie tant que Microsoft fournit une page suivante.

Les tests vérifient les demandes envoyées à Graph, les résultats fictifs, la sécurité des URLs, le rendu en texte, l'importation choisie et le maintien du bon en cours. Ils ne prouvent pas l'autorisation Mail.Read effective du compte personnel ni un accès réussi à sa boîte réelle dans cette session.

Les tests de coordonnées vérifient les corrections client/contact, la séparation des contacts, la conservation du rapport et du calendrier, les modifications concurrentes, les échecs d'envoi, la reprise et l'accès direct depuis le calendrier.

## Publication

La livraison contient un patch et les fichiers modifiés avec leurs chemins de dépôt. Appliquer ces changements à la branche actuelle en conservant toute évolution plus récente, exécuter `npm test`, puis publier avec le déploiement Vercel habituel. L'archive est un correctif, pas une application autonome. Ne pas la déposer dans un dossier de chantier.

Après publication, contrôler la version 3.6.2 et ouvrir la page de relance du site si l'ancienne interface est encore mémorisée. Terminer/conserver les saisies et fermer les autres fenêtres OPUS avant la relance. Ne pas effacer les données de site des appareils.

Recette : corriger un chiffre du téléphone depuis une carte Intervention, refaire depuis une Visite / Devis et un rendez-vous du calendrier ; contrôler le contact et le planning. Dans Bons de commande, connecter Outlook, chercher Difam puis CDO et un fournisseur libre, ouvrir un message ancien, puis utiliser un message choisi pour préparer un bon.

Référence Microsoft : https://learn.microsoft.com/en-us/graph/search-query-parameter

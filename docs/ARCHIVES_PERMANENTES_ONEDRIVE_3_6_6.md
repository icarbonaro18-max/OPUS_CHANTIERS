# OPUS CHANTIERS 3.6.6 — interventions visibles 24 h, archives OneDrive permanentes

Règle demandée par Ignazio le 29 octobre 2026 : après sa fin, une intervention reste un jour dans les listes de travail. Elle est ensuite retirée de ces listes seulement après confirmation d'une copie permanente complète dans OneDrive. La suppression de l'affichage ne doit plus entraîner la suppression des documents Microsoft 365.

Cette version conserve les correctifs de connexion, de coordonnées, d'e-mails fournisseurs, de performance et d'enregistrement précédents. Elle remplace le nettoyage OneDrive prévu en 3.6.4 : les dossiers chantier ne sont plus supprimés par la routine. Aucun fichier de production n'a été archivé, retiré des listes ou supprimé pendant la préparation de cette livraison.

## Ce qui change pour une intervention terminée

Les interventions indépendantes dans l'état Terminée ou Facturée deviennent éligibles après 24 heures complètes. Le compteur prend en compte la fin confirmée, la sauvegarde du PDF et les modifications récentes. Une correction repousse donc le retrait. Une date de fin inconnue, un rendez-vous futur ou une archive incomplète maintient l'intervention visible. Les rapports d'un chantier en cours ne sont pas retirés individuellement après 24 heures.

Avant tout retrait, le traitement constitue une archive dans la bibliothèque Microsoft 365 déjà utilisée par OPUS, accessible avec OneDrive :

`ARCHIVES_PERMANENTES_OPUS / RAPPORTS / année / numéro_identifiant / COPIE_date_identifiant`

Elle contient le PDF confirmé, les photos en fichiers séparés, les pièces d'ordre de service et rapports importés connus, ainsi qu'une fiche JSON complète contenant aussi les photos intégrées. Un manifeste relie les copies à leurs fichiers d'origine. Chaque fichier copié est relu et contrôlé avec son empreinte SHA-256 ; les versions et tailles sont ensuite vérifiées avant la réduction de l'index.

Une copie interrompue ne permet jamais de retirer la fiche. Les tentatives utilisent des sous-dossiers distincts pour éviter d'écraser les copies d'un traitement concurrent ou repris après une veille. Une copie complète existante est réutilisée lors d'un réessai. Les sources PDF, photos et pièces OneDrive d'origine ne sont pas supprimées.

Après confirmation des archives, le lot produit une seule écriture conditionnelle de la liste, avec son ETag. Une modification concurrente empêche ce remplacement et conserve les fiches actives. Les heures, équipes, identifiants, numéros, accords et informations de facturation restent dans des traces légères. L'identifiant de l'e-mail est conservé pour éviter une seconde importation, tandis que son corps détaillé quitte la liste active.

Les interventions archivées ne figurent plus dans les listes terrain ni dans les listes de rapports. Les éléments nécessaires à facturer restent disponibles au Bureau. Leur ouverture donne accès au PDF et au dossier permanent OneDrive, sans recharger toutes les photos ou rouvrir un rapport à modifier. Les rendez-vous historiques et la préparation de paie restent conservés.

## Activation au bureau, sans identité de service supplémentaire

1. Publier cette version à la racine du dépôt existant et contrôler 3.6.6-archives-onedrive sur le site.
2. Mettre à jour tous les appareils avant l'activation : la nouvelle forme des fiches archivées doit être comprise par chaque client. Conserver les saisies avant de relancer ; ne pas effacer les données du site.
3. Avec le compte administrateur, ouvrir **Stockage**, puis **Activer et archiver les interventions de plus de 24 h**.

Ce bouton emploie la connexion Microsoft courante, copie et vérifie les archives, puis active le traitement automatique sur ce PC. Il n'exige pas de nouveau secret serveur. L'activation est propre au compte et à la bibliothèque. Elle peut être suspendue depuis le même panneau.

Tant que le bureau laisse l'application ouverte et connectée, les actualisations recherchent les interventions éligibles au maximum toutes les dix minutes. Le transfert est interrompu avant la modification de l'index si un formulaire de travail s'ouvre ou si le compte change. Les copies permanentes déjà réalisées restent conservées. Une coupure, une vérification manquante ou un conflit diffère le retrait ; 24 heures est le délai minimal, pas une promesse d'effacement à la seconde.

Le traitement peut être relancé depuis Stockage. Le panneau affiche le nombre de fiches retirées et différées. Les raisons techniques sont conservées dans le journal d'exécution, sans annoncer une réussite non confirmée.

## Quand tous les appareils sont fermés

Le mode bureau ne s'exécute pas une fois le navigateur fermé. Le service quotidien Vercel existant peut prendre le relais après configuration de l'identité Microsoft disposant des droits d'écriture sur le seul site OPUS CHANTIERS. Les variables RETENTION_TENANT_ID, RETENTION_CLIENT_ID, RETENTION_CLIENT_SECRET, RETENTION_DRIVE_ID, RETENTION_SITE_HOST, RETENTION_SITE_PATH et CRON_SECRET restent celles décrites dans le guide 3.6.4.

Après la mise à jour des appareils, définir en production :

- `OPUS_RETENTION_ENABLED=true`
- `OPUS_RETENTION_POLICY=permanent-onedrive-v1`

Le nouveau marqueur empêche un ancien réglage de suppression d'activer implicitement cette nouvelle politique. Sans lui, le service répond qu'il est désactivé. Le passage prévu reste quotidien à 03:00 UTC : appareil fermé, le retrait arrive au passage suivant l'échéance des 24 heures, sous réserve des confirmations et du budget de traitement. Une exécution plus fréquente nécessite de vérifier le forfait Vercel avant d'en modifier le déclencheur.

## Chantiers et copies locales

Les chantiers gardent les délais déjà choisis : archivage après 15 jours sans modification, retrait de l'application après 30 jours dans Archives, au minimum 45 jours après la fin. Cependant leur dossier OneDrive reste désormais à son emplacement ; la routine ne l'envoie plus dans la corbeille. Les rapports associés sont aussi copiés dans les archives permanentes avant réduction de leur contenu dans les listes.

Une absence ou une modification du dossier source bloque le retrait. Un ancien plan 3.6.4 qui envisageait une suppression est suspendu et doit être vérifié ; il ne peut pas autoriser une nouvelle suppression.

Au retour en ligne, les tablettes enlèvent les copies en cache devenues inutiles. Un brouillon, une récupération de saisie ou un PDF non envoyé reste conservé, ainsi que les médias nécessaires à d'autres rapports. L'archive OneDrive et les documents d'origine ne sont pas touchés par ce nettoyage local.

Les sauvegardes externes ajoutées en 3.6.5 restent proposées pour la copie préalable à l'allègement manuel. Elles ne remplacent pas les archives permanentes : celles-ci sont toujours créées dans Microsoft 365.

## Validation et limites

Voir VALIDATION_3_6_6.json. Les tests couvrent les 24 heures exactes, les modifications et rendez-vous futurs, la copie complète et sa relecture, les pièces absentes et copies corrompues, les tentatives concurrentes, les conflits d'index, les originaux jamais supprimés, les factures et heures conservées, l'écriture du lot en une seule fois, la priorité des formulaires et l'isolation de l'activation par compte/bibliothèque.

Ces contrôles utilisent des services simulés. La publication, l'activation sur le PC et la recette Microsoft 365 réelle restent à réaliser. Vérifier avec une intervention de recette que l'archive complète est accessible dans OneDrive, que le PDF et les photos s'ouvrent, que la fiche quitte les listes après son échéance et que le Bureau conserve les données à facturer. La routine ne protège pas les fichiers contre une suppression manuelle dans OneDrive ou une politique externe administrée dans Microsoft 365.

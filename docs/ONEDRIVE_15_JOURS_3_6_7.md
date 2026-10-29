# OPUS CHANTIERS 3.6.7 — OneDrive et 15 jours de dossiers terminés

Cette version applique la dernière règle demandée par Ignazio : garder les dossiers terminés pendant 15 jours dans OPUS, puis retirer leur contenu et leurs photos des listes et caches de l’application après confirmation des archives OneDrive. Elle remplace les 24 heures des interventions de 3.6.6 et les 45 jours des chantiers des versions précédentes. Aucun dossier de production n’a été retiré pendant la préparation de cette mise à jour.

## Parcours terrain

- **Enregistrer le brouillon** : conserver une saisie incomplète sans terminer le rendez-vous. Le texte d’aide explique cette action. Une récupération locale précède l’envoi ; en cas d’échec, le message distingue la copie locale confirmée et l’envoi Microsoft à réessayer.
- **Intervention complétée — enregistrer dans OneDrive** : grand bouton vert. Le PDF et la fiche sont envoyés dans les dossiers Microsoft 365 existants avant confirmation de la fin. Pour un rapport de chantier, le libellé précise aussi l’envoi au bureau, sans clôturer silencieusement le chantier.
- **Visite complétée — enregistrer dans OneDrive** : la fin de visite envoie désormais son PDF et sa fiche. Un échec du PDF, de la fiche ou de l’index maintient le statut antérieur et la récupération de saisie.
- **Aller sur OneDrive** : action sur les interventions et visites terminées ayant un PDF, ainsi que dans la liste des comptes rendus du Bureau. Elle ouvre un lien Microsoft externe, sans télécharger toutes les photos dans l’éditeur OPUS. Selon les réglages Android/Windows, ce lien s’ouvre dans OneDrive ou dans le navigateur Microsoft. L’application ne force pas l’ouverture native. Les liens manquants sont résolus depuis l’identifiant du fichier Microsoft ; les adresses hors du site configuré sont refusées.

Les rapports sont déjà envoyés à la bibliothèque Microsoft 365 partagée, accessible par OneDrive. Il ne s’agit pas de créer un nouveau compte OneDrive personnel. Pendant les 15 jours, OPUS garde les informations nécessaires à une correction ; l’archivage final réduit les listes en retirant le corps du rapport, les photos et les pièces. Des traces légères restent nécessaires pour les numéros, la paie, la facturation, les liens OneDrive et la prévention des réimportations. Elles n’apparaissent plus dans les listes terrain ni dans les comptes rendus actifs.

## Retrait après 15 jours

Les interventions indépendantes Terminées/Facturées et les visites terminées deviennent éligibles après 15 jours complets depuis leur fin connue et leurs dernières modifications. Une correction récente repousse le retrait. Une date inconnue, un rendez-vous futur ou un PDF manquant empêche le retrait.

Les rapports et visites rattachés à un chantier suivent la clôture du chantier. Le dossier chantier devient éligible 15 jours après sa clôture connue, ou sa date d’archivage historique si la date de clôture manque. Une date inconnue déclenche un nouveau délai de 15 jours. Les dossiers encore En cours ou À contrôler sont conservés. Le contrôle prend aussi en compte les modifications des fichiers imbriqués et les rendez-vous futurs. Le passage automatique vers la rubrique Archives après 15 jours est remplacé par ce retrait vérifié ; le dossier OneDrive reste à son emplacement.

Avant retrait, les rapports sont copiés avec leur PDF, photos et pièces dans `ARCHIVES_PERMANENTES_OPUS/RAPPORTS/année/numéro_identifiant/COPIE_date_identifiant`. Les pièces de préparation des visites sont aussi copiées. Chaque copie est relue et vérifiée ; un justificatif ne devient valide qu’après confirmation des fichiers. Une modification concurrente de la liste bloque son remplacement. Une copie interrompue n’autorise aucun retrait. Les documents OneDrive d’origine et les archives permanentes ne sont jamais supprimés par ce traitement.

Les tablettes enlèvent ensuite leurs anciens caches au retour en ligne. Les brouillons, récupérations et PDF non envoyés sont conservés. Une tablette hors ligne garde ses copies jusqu’à sa reconnexion.

## Jauge réservée à Ignazio

Le bouton Stockage n’est affiché qu’aux identités Microsoft d’Ignazio déclarées dans `storageOwnerUsers`. Un autre administrateur ne voit pas ce diagnostic. Le bouton affiche l’espace utilisé ; son panneau contient une jauge avec l’espace utilisé et disponible estimé sur l’appareil courant. Cette estimation provient du quota du navigateur pour OPUS : elle ne mesure ni la mémoire vive, ni tout le disque, ni tout le stockage Microsoft. Si le navigateur ne fournit pas la mesure, le panneau indique « Non communiqué ».

Le panneau conserve les tailles des deux listes Microsoft, le nombre d’interventions/visites terminées encore dans OPUS, la copie de sécurité et l’allègement des photos. Pour les listes historiques déjà lourdes, **Sauvegarder et alléger les rapports** reste l’opération qui sépare les photos intégrées et réduit immédiatement les futurs transferts. Publier le code n’exécute pas cette opération sur vos données.

## Installation et activation

1. Extraire le ZIP et importer son contenu directement à la racine du dépôt GitHub existant, en remplaçant les fichiers de même nom. Ne pas créer de sous-dossier `fichiers` et ne pas supprimer les autres fichiers du projet.
2. Attendre la réussite du déploiement, puis contrôler la version **3.6.7-onedrive-15jours**. Mettre à jour tous les appareils avant l’activation. Conserver les saisies avant tout redémarrage ; ne pas effacer les données du site.
3. Avec le compte Ignazio, ouvrir **Stockage → Activer le retrait après 15 jours · conserver dans OneDrive**. Ce bouton traite interventions, visites et chantiers. Il indique le nombre de retraits et de dossiers différés. Le traitement reprend par lots si le budget d’exécution est atteint.

Le mode PC utilise la session Microsoft actuelle et fonctionne tant qu’OPUS reste ouvert et connecté. Les actualisations vérifient les échéances au maximum toutes les dix minutes et donnent la priorité aux formulaires ouverts. L’activation reste propre au compte et à la bibliothèque. Un traitement serveur quotidien peut fonctionner même appareils fermés après configuration des identités et variables décrites dans le guide 3.6.6 ; il n’a pas été configuré ici. Le marqueur `OPUS_RETENTION_POLICY=permanent-onedrive-v1` signifie conservation permanente : les délais actuels sont ceux du code 3.6.7.

15 jours est le délai minimal ; le retrait intervient au passage suivant, sous réserve du réseau et de la vérification OneDrive. Les anciennes fiches sans PDF confirmé restent visibles et doivent être régularisées avant retrait. Il n’y a pas de suppression automatique des archives OneDrive par OPUS.

## Validation

Voir VALIDATION_3_6_7.json. Les tests vérifient notamment les délais exacts, les originaux jamais supprimés, les pièces jointes des visites, les écritures concurrentes, les traces de paie/facturation, la reprise des saisies, l’exclusivité de la jauge et la navigation OneDrive. Il s’agit de tests automatisés avec services simulés. La publication, l’activation et une recette sur les tablettes réelles restent à effectuer. Aucun gain de performance chiffré sur le réseau réel n’est revendiqué.

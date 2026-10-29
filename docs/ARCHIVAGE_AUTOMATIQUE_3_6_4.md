# OPUS CHANTIERS 3.6.4 — 15 jours Terminés puis 30 jours Archives

DOCUMENT HISTORIQUE : la version 3.6.6 remplace la suppression des dossiers OneDrive par une conservation permanente. Consulter ARCHIVES_PERMANENTES_ONEDRIVE_3_6_6.md avant toute activation. Les anciens réglages ne déclenchent pas la nouvelle politique sans son marqueur explicite.

Choix confirmé par Ignazio le 29 octobre 2026 : suppression 30 jours après l'archivage, soit 45 jours après la fin au minimum. Cette livraison conserve toutes les corrections 3.6.1 à 3.6.3. Elle est préparée et testée ; elle n'est pas publiée et le service serveur n'a pas été activé dans cette session. Aucun dossier réel n'a été supprimé.

## Comportement

Un chantier contrôlé passe dans Terminés. Après 15 jours sans modification et sans rendez-vous futur, il est déplacé dans Archives. La date réelle du déplacement est enregistrée dans projectTracking.json. Après 30 jours complets dans Archives, et au minimum 45 jours après la fin, le serveur peut retirer le dossier et alléger les rapports explicitement liés à ce chantier.

Le traitement quotidien est prévu à 03:00 UTC. Le dépassement d'un délai n'entraîne donc pas nécessairement une suppression à la minute près. Les traitements longs ou différés sont repris au passage suivant. Un document récemment modifié, y compris dans un sous-dossier, ou un rendez-vous futur repousse le nettoyage. La page de suivi affiche l'échéance minimale connue et les conflits éventuels.

Pour les dossiers déjà archivés sans date d'archivage connue, le premier passage initialise un nouveau délai de 30 jours ; leur âge n'est pas deviné à partir du nom du dossier ou de son ancienne date de création. Un ancien chantier terminé sans date de fin reçoit de même une nouvelle date de référence.

## Contenu retiré et contenu conservé

- Le dossier du chantier est supprimé par son identifiant, après vérification qu'il appartient toujours à Archives, avec condition If-Match sur sa version. Microsoft Graph le place dans la corbeille SharePoint ; aucune purge irréversible de cette corbeille n'est lancée.
- Les photos intégrées, signatures, corps des rapports et pièces jointes des fiches explicitement liées à ce chantier sont retirés des listes générales. Une trace légère garde les identifiants, la numérotation, les équipes et les horaires nécessaires au suivi et à la paie. Les rendez-vous historiques et fiches de paie ne sont pas supprimés.
- Les visites ou interventions indépendantes sont conservées. Une ancienne visite qui ne porte que la valeur ambiguë convertedProjectId='created' n'est pas attribuée arbitrairement à un chantier.
- Une photo du dossier encore référencée par un autre rapport actif bloque sa suppression. Les photos mutualisées situées hors du dossier, les sauvegardes d'optimisation et l'historique de versions Microsoft ne sont pas purgés. L'objectif immédiat est de réduire les listes chargées et les copies locales ; aucun gain égal à la taille du dossier sur le quota Microsoft n'est garanti.
- Les tablettes apprennent la suppression à leur prochaine synchronisation. Elles retirent les copies de fiches, attestations, révisions, PDF et photos concernées. Les références utilisées par des rapports actifs ou des brouillons restent protégées. Les photos en RAM sont également libérées lorsque le nettoyage a pu s'appliquer.
- Les brouillons, récupérations de saisie et PDF non envoyés ne sont jamais supprimés par ce nettoyage. S'ils appartiennent au chantier supprimé, l'appareil conserve ces données et signale le problème pour permettre leur récupération. Une tablette hors ligne ne peut pas être déclarée synchronisée par le serveur.

Les copies déjà exportées sur le PC ou une carte SD ne sont pas modifiées.

## Reprise et modifications concurrentes

Un verrou de traitement évite les doubles exécutions simultanées. Son délai d'expiration dépasse la durée maximale d'une fonction. Avant la suppression, le serveur conserve un plan léger : empreintes des fiches, identifiants de cache et phase du traitement. Il recontrôle les descendants après l'enregistrement de ce plan. Les listes sont ensuite écrites avec leurs ETags.

Une réponse perdue, une coupure ou l'échec d'une des deux listes permettent une reprise sans supprimer deux fois le dossier. Une fiche changée entre-temps reste conservée et le nettoyage est suspendu pour contrôle au bureau. Un dossier restauré après la phase de suppression est également suspendu. Les erreurs sont enregistrées dans le suivi du chantier et affichées à l'administrateur. Réconcilier les données et restaurer le dossier si nécessaire avant de reprendre ; ne pas effacer les diagnostics pour masquer un conflit.

Les clients à jour refusent de réinjecter des photos ou du texte de rapport dans une fiche déjà purgée. Les écritures directes SharePoint ne forment toutefois pas une transaction globale entre dossiers et listes : les conflits détectés nécessitent une vérification. Le déploiement de cette version sur tous les appareils doit précéder l'activation du service.

## Publication et activation du serveur

1. Extraire OPUS_3.6.4_A_DEPOSER_RACINE.zip. Déposer son contenu directement à la racine du dépôt existant, en remplaçant les fichiers de même chemin. Aucun dossier fichiers/ ni patch à appliquer. L'archive réunit les correctifs précédents ; le dépôt conserve ses autres fichiers.
2. Publier sur Vercel et contrôler que le site sert 3.6.4-archives. Mettre à jour les appareils en conservant leurs saisies. Le déploiement GitHub Pages seul ne fournit pas les fonctions serveur nécessaires à la tâche quotidienne.
3. Configurer une identité de service Microsoft Entra disposant des droits d'écriture sur le seul site OPUS CHANTIERS. Une application dédiée avec Sites.Selected et attribution explicite du rôle write au site permet de limiter cet accès. Le compte de lecture du planning n'est pas automatiquement réutilisé ou étendu.
4. Renseigner les variables ci-dessous dans les variables serveur de production Vercel. Les secrets ne doivent jamais être mis dans config.json ou GitHub.

| Variable | Valeur attendue |
| --- | --- |
| RETENTION_TENANT_ID | Identifiant de l'annuaire professionnel |
| RETENTION_CLIENT_ID | Identifiant de l'application de service |
| RETENTION_CLIENT_SECRET | Secret de cette application, avec échéance suivie |
| RETENTION_DRIVE_ID | Identifiant de la bibliothèque Documents OPUS CHANTIERS |
| RETENTION_SITE_HOST | opuselec.sharepoint.com |
| RETENTION_SITE_PATH | /sites/OPUSCHANTIERS |
| CRON_SECRET | Secret aléatoire protégeant l'appel de la tâche quotidienne ; conserver celui des autres tâches s'il existe déjà |
| OPUS_RETENTION_ENABLED | true pour exécuter la règle ; toute autre valeur désactive le traitement |

5. Redéployer après configuration. vercel.json active Fluid Compute, fixe cette fonction à 300 secondes et ajoute le passage quotidien /api/retention-cron sans retirer les autres déclencheurs éventuels. Les autres fonctions conservent leurs durées explicites existantes.
6. Vérifier la présence du déclencheur dans Vercel Cron Jobs et le résultat du premier passage dans ses journaux. Il doit initialiser les dates inconnues. Un retour disabled:true signifie que le service n'est pas activé ; 401 indique un secret d'appel absent ou incorrect ; 503 une configuration/connexion non confirmée. Le service doit ensuite être contrôlé avec un dossier de recette dont les dates sont maîtrisées.

Les droits et variables de production n'étaient pas accessibles pour cette livraison. La seule mise à jour de l'interface ne suffit pas à activer un nettoyage quand les appareils sont éteints. Pour suspendre le service, désactiver le déclencheur Vercel et/ou définir OPUS_RETENTION_ENABLED=false, puis redéployer pour appliquer la variable.

## Validation

Voir VALIDATION_3_6_4.json. Les tests couvrent notamment les échéances exactes, la migration des archives sans date, l'archivage après 15 jours, les documents imbriqués, les rendez-vous futurs, les ETags, la reprise après suppression et échec d'index, les fiches modifiées, les fichiers restaurés, les références partagées, les horaires de paie conservés, le nettoyage local et les secrets du point d'entrée. Ils utilisent des données et services simulés. Aucune suppression de production ni recette du cron réel n'a été exécutée.

Références officielles :
- https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/permissions-selected-overview
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/fluid-compute

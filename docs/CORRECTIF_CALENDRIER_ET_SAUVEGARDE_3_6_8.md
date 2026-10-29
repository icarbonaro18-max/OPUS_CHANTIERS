# OPUS 3.6.8 — calendrier sans réécriture des rapports, sauvegarde côté Microsoft

## Constat réel du 29 octobre 2026

Le site publié est en 3.6.7. Le fichier interventions.json fait 44 011 107 octets et visits.json 17 964 199 octets. La place disponible annoncée sur l’appareil n’est pas épuisée. Le code renvoie pourtant la collection complète des interventions lors de la sauvegarde d’un rapport et, inutilement, après l’enregistrement d’un rendez-vous dans le calendrier.

Le parcours « Planifier une intervention » sauvegarde d’abord events.json, puis appelle syncEntityFromEvent, qui réécrit interventions.json ou visits.json pour recopier les dates et l’équipe. L’utilisateur peut donc rester sur « Enregistrement » alors que le rendez-vous est déjà stocké. Cette livraison retire cette deuxième écriture du parcours calendrier. Les dates et équipes affichées sont recalculées localement depuis les rendez-vous confirmés, également après rechargement et démarrage hors ligne. Les horaires réalisés, équipes vérifiées et fiches terminées restent préservés. L’annulation du calendrier rétablit les informations correspondantes sans réécrire les photos des rapports.

Les modifications de rapport et de coordonnées continuent d’utiliser les collections existantes. Cette livraison ne prétend pas remplacer tout le stockage par un fichier par rapport. L’allègement des collections reste nécessaire pour ces écritures.

## Deuxième défaut reproduit dans la session Microsoft réelle

Le bouton « Sauvegarder et alléger les rapports » a été essayé dans l’application publiée. Il s’arrête avec « The request is malformed or incorrect ». Le dossier de sauvegarde a été créé mais est resté vide. Le téléchargement des photos n’a pas été engagé ; aucun remplacement de la collection n’a été confirmé. La requête exacte rejetée n’a pas pu être isolée par les journaux disponibles ; nous ne présentons pas un diagnostic plus précis comme établi.

La copie préalable change donc de mécanisme : Microsoft copie le fichier directement dans sa bibliothèque, au lieu de faire réenvoyer toute la collection par l’application. OPUS contrôle la version du fichier source avant et après copie, attend la présence d’un fichier de bonne taille, puis relit et compare le JSON de sauvegarde à l’original lu. Une copie différente, un changement de version ou une confirmation absente bloque l’allègement. La liste allégée conserve sa protection If-Match. Les sauvegardes externes déjà disponibles restent proposées.

Les étapes d’échec de l’allègement sont désormais affichées dans le message, pour éviter de perdre l’information « lecture », « copie », « vérification » ou « séparation des photos » derrière une erreur générique.

API Microsoft utilisée : https://learn.microsoft.com/en-us/graph/api/driveitem-copy?view=graph-rest-1.0. La réponse 202 accepte un corps vide ; ce cas est traité explicitement. La confirmation reste celle du fichier copié et relu, jamais la seule réponse 202.

## Copies de sécurité réalisées pendant cette intervention

Deux copies ont été créées côté Microsoft dans la bibliothèque existante :

`_OPUS_SYSTEM/SAUVEGARDES_AVANT_OPTIMISATION/interventions_securite_20261029_1610.json`

`_OPUS_SYSTEM/SAUVEGARDES_AVANT_OPTIMISATION/visits_securite_20261029_1610.json`

Les tailles et empreintes quickXorHash des deux copies correspondent aux fichiers source observés. Les originaux de travail n’ont pas été remplacés. Il s’agit de copies de sécurité complètes des collections, pas d’une preuve que les listes ont déjà été allégées.

## Publication et recette réelle restante

1. Importer le contenu du ZIP à la racine du dépôt GitHub existant, en remplaçant les mêmes fichiers et en conservant les autres.
2. Contrôler la réussite du déploiement et la version 3.6.8-calendrier. Protéger les saisies en cours avant tout redémarrage. Ne pas recréer un rendez-vous sans vérifier qu’il n’est pas déjà au calendrier.
3. Revenir dans Stockage et lancer « Sauvegarder et alléger les rapports ». Attendre les tailles avant/après confirmées. Une opération différée ou en erreur ne constitue pas une réussite.
4. Actualiser ensuite les autres appareils avant de renvoyer les saisies conservées. Une ancienne liste ouverte peut recevoir une erreur 412 après l’allègement ; conserver la saisie et la reprendre depuis son brouillon après actualisation.
5. Vérifier sur une intervention de recette : ouverture des photos existantes, enregistrement du brouillon, enregistrement du PDF, planification et absence de doublon au calendrier.

La connexion Microsoft nécessaire à la vérification réelle a été établie dans le navigateur de cette intervention. La publication GitHub/Vercel n’a pas été effectuée ici. Le nouveau mécanisme d’allègement n’a donc pas encore été exécuté contre les données de production. La copie Microsoft a été vérifiée séparément ; la recette bout en bout du nouveau bouton reste nécessaire.

La règle de conservation OneDrive et le retrait des dossiers terminés après 15 jours de 3.6.7 sont conservés. Aucun document de chantier ou de rapport n’est supprimé dans Microsoft 365.

## Tests

587 tests automatisés passent. Un cas du véritable formulaire de planification utilise une intervention contenant environ 44 Mo de données, interdit toute sauvegarde de la collection des rapports et confirme que seul le calendrier est transmis. Il vérifie aussi la réouverture depuis des données fraîches et l’annulation du rendez-vous. Les copies asynchrones, le corps vide 202, la différence de sauvegarde et les versions concurrentes sont testés. Ces essais ne remplacent pas la recette du nouveau déploiement sur les tablettes réelles.

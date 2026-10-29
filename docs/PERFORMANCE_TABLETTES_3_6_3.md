# OPUS CHANTIERS 3.6.3 — performance tablette et publication

Document historique de la livraison 3.6.3. Le délai de suppression a depuis été confirmé : 30 jours après archivage. La livraison 3.6.4 ajoute ce traitement ; consulter ARCHIVAGE_AUTOMATIQUE_3_6_4.md pour son activation.

Préparé le 29 octobre 2026. Cette mise à jour réunit les corrections de connexion 3.6.1, les coordonnées client et la recherche fournisseurs 3.6.2, et les corrections de performance ci-dessous. Elle n'a pas été publiée par cette session.

## Pourquoi la mise à jour précédente affichait encore 3.6.0

Contrôle direct du site le 29 octobre 2026 : l'HTML affiche 3.6.0 et le fichier app.js définit 3.6.0-stockage. Le commit GitHub d2880852a7c08d03319c1d7685a8f809768bb108 ajoute les fichiers 3.6.2 sous fichiers/, sans remplacer app.js, index.html et les autres sources utilisées à la racine. Le site compile donc toujours les anciennes sources. Fermer l'application ou renouveler son cache ne peut pas installer du code qui n'est pas publié à la bonne place.

L'archive OPUS_3.6.3_A_DEPOSER_RACINE.zip contient directement app.js, index.html, lib/, commandes/, etc. Elle ne contient aucun dossier fichiers/ et ne nécessite pas d'appliquer un patch. Déposer son contenu extrait à la racine du dépôt existant, en remplaçant les fichiers de même chemin. Le dépôt conserve tous ses autres fichiers. Un fichier LIRE_DABORD.txt explique la publication et les contrôles.

## Cause concrète des chargements lourds

La lecture des métadonnées Microsoft 365 du dossier _OPUS_SYSTEM a confirmé :

| Liste | Taille en octets | Taille décimale |
| --- | ---: | ---: |
| interventions.json | 43 538 547 | 43,5 Mo |
| visits.json | 16 769 544 | 16,8 Mo |
| Total | 60 308 091 | 60,3 Mo |

Ces deux listes sont utilisées au chargement des données métier. Le cache ETag évite de retélécharger une liste inchangée pendant une session ; le démarrage sans cache et les listes modifiées restent lourds. Les tailles seules ne prouvent pas la proportion exacte de photos dans les fichiers actuels.

Après publication sur tous les appareils, utiliser sur le PC administrateur : Stockage → Sauvegarder et alléger les rapports. L'outil déjà présent en 3.6.0 sauvegarde les listes, sépare les photos intégrées et remplace les listes par leurs références. Un conflit ETag bloque le remplacement si un autre appareil a enregistré entre-temps. Relire ensuite les tailles avant/après. Cet allègement réel n'a pas été exécuté dans cette session ; aucune donnée de production n'a été modifiée.

## Corrections ajoutées

- Cache de photos en mémoire plafonné à un budget estimé de 24 Mio de chaînes, avec éviction des moins récemment utilisées. Ce budget concerne ce cache, pas toute la mémoire de l'application ni les images décodées à l'écran.
- Calculs de signatures et transferts des photos dans la même file limitée, pour éviter de lancer tous les calculs simultanément sur tablette.
- Connexion IndexedDB réutilisée ; réouverture après fermeture/changement de version et après un échec d'ouverture.
- Énumération de la file d'envoi par clés, puis lecture d'un brouillon ou PDF à la fois. Les originaux restent conservés jusqu'à l'accusé de réception distant.
- Téléchargements des listes limités à trois simultanément, avec application cohérente des listes après succès ; accès aux dossiers réutilisés brièvement et listings de fichiers toujours renouvelés.
- Les métadonnées de téléchargement déjà obtenues sont réutilisées pour les révisions, évitant une requête intermédiaire inutile.

## Carte SD et protection des brouillons

Le bouton Stockage tablette / carte SD affiche l'espace estimé de l'application, demande la protection du stockage sur action de l'utilisateur et permet de copier les envois en attente vers un dossier choisi. Une carte SD peut être choisie si le navigateur et Android la présentent dans le sélecteur. La présence du sélecteur est détectée ; son absence est signalée. Le modèle de tablette et son navigateur restent à vérifier sur le terrain.

Une SD augmente la capacité de stockage, pas la RAM. La copie ajoutée est une sauvegarde supplémentaire, pas un déplacement du stockage principal de l'application : elle ne libère pas à elle seule l'espace interne et ne supprime pas les envois originaux. Une utilisation primaire de la SD nécessiterait une autre architecture et une validation Android dédiée.

Les copies se font une fiche à la fois ; les PDF binaires sont séparés. Le manifeste final n'est écrit qu'après les fichiers confirmés. La reprise exige le même compte et conserve les brouillons déjà présents, y compris ceux créés pendant la lecture des fichiers de sauvegarde grâce à une transaction locale conditionnelle. Les caches et jetons d'authentification sont exclus. Les annulations, refus d'accès, fichiers manquants et copies incomplètes produisent un message et conservent les originaux.

## Archivage puis suppression automatique — demande à préciser

La production comporte déjà un archivage des chantiers terminés après 15 jours sans modification, lors d'une actualisation administrateur. Il vérifie aussi les sous-dossiers et bloque l'archivage en présence d'un rendez-vous futur. Ce contrôle n'est pas une tâche serveur qui tourne application fermée.

La nouvelle demande est d'effacer les dossiers devenus inutiles. Le délai reste à préciser : suppression 30 jours après la fin (15 jours Terminés puis 15 jours Archives), ou 30 jours après l'archivage (45 jours après la fin au minimum). Aucun effacement automatique supplémentaire n'est activé dans cette livraison.

L'implémentation devra retirer les contenus lourds des listes métier, traiter les fichiers et leurs références sans supprimer une photo encore utilisée ailleurs, puis nettoyer les copies locales au prochain retour en ligne. Déplacer seulement le dossier dans Archives ne retire pas les rapports des listes. Les données légères de pointage utiles au suivi doivent rester séparées du contenu des rapports. Un appareil hors ligne avec un brouillon non envoyé ne peut pas être déclaré synchronisé par le serveur ; la reprise et les dossiers supprimés devront être traités explicitement. Une exécution même application fermée nécessite une tâche serveur configurée et authentifiée.

## Validation

Compilation réussie et 521 tests automatisés réussis, zéro échec. Seize nouveaux tests couvrent les budgets mémoire, la concurrence, la base locale, la copie SD, la reprise, les erreurs, les comptes séparés et la préservation d'un brouillon créé pendant la reprise. Les copies compilées des sources modifiées ont été comparées aux fichiers sources.

Ces contrôles ne remplacent pas une mesure sur les tablettes : démarrage à froid, ouverture d'une attestation avec photos, saisie hors ligne, reprise réseau faible, envoi confirmé, changement de compte et copie/reprise depuis la SD réelle. Aucun gain chronométré sur appareil ni compatibilité universelle n'est annoncé.

Références : https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria ; https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker ; https://developer.chrome.com/docs/capabilities/web-apis/file-system-access

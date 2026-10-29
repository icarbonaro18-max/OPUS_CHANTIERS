# OPUS CHANTIERS 3.6.5 — enregistrement des interventions et visites

Préparé le 29 octobre 2026 sur les sources 3.6.4 publiées, commit GitHub 5901c2f99f0249229cb89e4be8f3167ff93c974c. Ce correctif n'a pas été publié depuis cette session.

## Constats vérifiés

La capture montre la création d'une intervention avec « Enregistrement… » sans détail de l'étape. Le site sert bien 3.6.4-archives : ce symptôme ne se réduit pas à une ancienne interface mémorisée.

Les métadonnées Microsoft 365 confirment que interventions.json pèse encore environ 43,5 Mo et visits.json environ 16,8 Mo. Le premier fichier, initialement contrôlé à 43 538 547 octets, a ensuite atteint 43 539 434 octets. Le code écrit l'ensemble de la liste à chaque ajout ou modification, même si la nouvelle fiche n'a pas de photo. L'allègement réel n'a pas été exécuté par cette session.

Le code attendait également la mise à jour du cache local et le classement de tous les chantiers après chaque écriture d'intervention ou de calendrier. Ce classement pouvait inclure un parcours des descendants des chantiers terminés pour contrôler leur archivage. La confirmation de la nouvelle fiche dépendait ainsi d'opérations sans lien avec son envoi. La création du calendrier arrivait seulement après ce retour. Sans trace réseau de la fenêtre concernée, il n'est pas possible d'attribuer les quinze minutes à une requête précise ; ces dépendances bloquantes et la taille réécrite sont en revanche vérifiées.

## Corrections

L'écriture Microsoft de la fiche reste attendue. En cas d'échec ou de conflit ETag, aucune réussite n'est annoncée. Après confirmation, la copie de consultation et le classement général s'exécutent sans bloquer l'appelant. Le calendrier et les pièces nécessaires continuent d'être enregistrés et confirmés avant le message final. Le classement explicite d'un chantier planifié ne patiente plus derrière le parcours global des archives. Les contrôles approfondis d'archivage restent déclenchés lors des actualisations, ainsi que par le service de conservation déjà prévu en 3.6.4.

Le formulaire indique l'étape réelle : conservation locale, transmission des coordonnées, des interventions, des visites ou du calendrier, puis confirmation Microsoft. Après quinze secondes, il affiche un message d'attente explicite. Il n'y a pas de simple délai artificiel qui annoncerait un échec tout en laissant une écriture distante active et un bouton de réessai susceptible de créer un doublon. Les délais et conditions de l'API Graph restent appliqués.

Avant tout envoi d'une fiche d'intervention ou de visite, les champs et l'identifiant sont conservés dans IndexedDB, dans l'espace du compte. Une erreur de cette copie bloque l'envoi pour garder la saisie visible. La copie exclut les photos des rapports existants ; elle conserve les fichiers d'ordre de service et de préparation sélectionnés, avec leurs noms. Elle est retirée seulement après les confirmations de la fiche, du calendrier et des pièces.

Après une interruption, la section Interventions ou Visites / Devis affiche « Fiches conservées sur cet appareil » avec un bouton Reprendre. Cette action relit les données réelles avant de choisir entre la fiche déjà confirmée et une création avec le même identifiant. La reprise ouvre le formulaire pour vérification ; elle n'envoie rien automatiquement. Le numéro est recalculé si une autre fiche l'a pris entre-temps. Les nouvelles fiches dont l'envoi échoue ne restent plus dans la liste comme si elles étaient confirmées. Un nouveau client déjà confirmé est réutilisé lors du réessai de la même fiche.

Les copies de création sont aussi incluses dans la sauvegarde de dossiers / SD et protégées du nettoyage de conservation. Elles sont distinctes de la file automatique des attestations et PDF ; la reprise se fait dans leur section. La sauvegarde créée par cette version protège les prochaines saisies ; elle ne peut pas récupérer rétroactivement les champs d'une fenêtre 3.6.4 encore ouverte.

## Action indispensable sur les données existantes

Cette livraison ne supprime pas à elle seule les dizaines de Mo intégrés aux anciennes listes. Après mise à jour des appareils, utiliser sur le PC administrateur **Stockage → Sauvegarder et alléger les rapports**. L'outil conserve une sauvegarde, déplace les photos intégrées vers des fichiers séparés, puis remplace conditionnellement les listes par des références. Une autre écriture intervenue entre-temps bloque le remplacement avec son ETag.

Noter les tailles avant/après et ouvrir un ancien rapport avec ses photos. Cet allègement unique est nécessaire avant de mesurer la rapidité réelle des nouveaux enregistrements. Les sauvegardes ne sont pas effacées. Aucun gain chronométré sur les appareils n'est annoncé avant cette opération et la recette réelle.

## Sauvegarde sur un autre support

Dans Stockage, le choix « Emplacement de la copie de sécurité » permet de choisir un dossier accessible au navigateur : disque externe, carte SD, dossier réseau ou dossier synchronisé. iCloud Drive peut être utilisé depuis le PC s'il est déjà installé et configuré dans Windows et présenté par le sélecteur de dossiers. L'application ne crée pas de connexion iCloud et ne reçoit pas le mot de passe Apple.

Avant l'allègement de chaque liste, la copie complète est écrite dans ce dossier, le fichier est fermé et sa taille relue. Un refus d'accès, un disque plein, une déconnexion ou une copie incomplète arrête l'opération avant de modifier la liste. Quand le dossier externe est choisi, cette opération ne crée pas en plus sa copie dans SAUVEGARDES_AVANT_OPTIMISATION sur SharePoint. Les sauvegardes SharePoint déjà présentes ne sont pas déplacées ou supprimées.

Une copie dans un dossier iCloud/Dropbox/Drive synchronisé reste d'abord une copie locale : la synchronisation distante dépend du logiciel concerné et n'est pas confirmée par OPUS. La connexion, le support et le navigateur réels doivent être vérifiés. Quand le sélecteur de dossiers n'est pas disponible, l'option externe est désactivée et la copie Microsoft 365 reste disponible.

Ce choix concerne les copies des listes interventions/visites avant leur allègement. Il ne constitue pas une exportation complète de tous les dossiers chantier et PDF. Les copies de secours n'étant pas chargées pour chaque saisie, les déplacer seuls ne résout pas les enregistrements lourds : il faut aussi alléger les listes courantes.

Référence Apple : https://support.apple.com/fr-be/guide/icloud-windows/icwddbc813bd/icloud

## Installation

Conserver d'abord par copie les champs de la fiche actuellement bloquée avant toute fermeture ou relance. Publier le contenu extrait de OPUS_3.6.5_CORRECTIF_ENREGISTREMENT.zip à la racine du dépôt existant. Cette archive met à jour la 3.6.4 déjà publiée ; elle ne contient ni dossier fichiers/ ni application autonome. Elle ne change pas les variables serveur ou le déclencheur de conservation.

Attendre Vercel Ready, contrôler 3.6.5-enregistrement dans app.js, puis renouveler l'interface dans le même navigateur/profil que l'application installée. Ne pas effacer les données du site. Utiliser reparer.html seulement après avoir conservé la saisie de l'ancienne fenêtre.

## Validation et recette

555 tests réussis, zéro échec ; compilation réussie. Les douze tests ajoutés contrôlent notamment le retour d'un enregistrement confirmé malgré un cache ou classement bloqué, les échecs Microsoft, la copie avant envoi, la reprise de l'identité, l'absence de second client au réessai, le calendrier confirmé, les visites, et les noms/octet des fichiers conservés. Les contrôles de coordonnées, planning, conflits et conservation existants passent également.

La recette réelle reste à faire : création d'une intervention avec Roberto, confirmation dans le calendrier sur l'autre appareil, modification du téléphone, création d'une visite, coupure réseau pendant l'envoi puis Reprendre, et vérification qu'une seule fiche/client a été créé. Aucun enregistrement de production n'a été lancé ou modifié par les outils de cette session.

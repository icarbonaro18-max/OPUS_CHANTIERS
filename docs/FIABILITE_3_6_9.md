# OPUS CHANTIERS — 3.6.9, fiabilité des sauvegardes

## Constat du 2 novembre 2026

La production 3.6.8 est correctement déployée. Une connexion Microsoft et l'ouverture d'un rapport ont réussi. Le blocage intermittent de connexion sur l'appareil d'Ignazio n'a pas été reproduit : il ne peut pas être déclaré résolu.

Le brouillon INT-2026-0081 est conservé sur l'appareil de l'utilisateur. Sa capture situe l'attente à la transmission de interventions.json. Aucune validation de ce brouillon n'a été réalisée depuis la session de diagnostic.

L'optimisation réelle a abouti en production, avec copies de sécurité vérifiées : interventions.json passe de 35 230 400 à 301 731 octets ; visits.json passe de 19 202 775 à 126 808 octets. Les photos sont conservées séparément dans Microsoft 365. Les listes ont été relues par l'application.

## Changements livrés

- Toute sauvegarde d'intervention ou de visite sépare les photos, y compris une ancienne collection qui n'a jamais été optimisée. Le stockage léger ne dépend plus d'un indicateur de session.
- Après une réponse réseau perdue, une relecture du fichier recherche une confirmation exacte. Aucun PUT incertain n'est répété automatiquement. Une différence, une erreur de lecture ou un refus d'accès conserve l'échec et le brouillon.
- Deux sauvegardes simultanées de la même liste dans la même session sont bloquées plutôt que de s'écraser.
- Après un refus explicite 412, une seule nouvelle tentative conditionnelle est possible pour des modifications de fiches distinctes. Une fusion à trois versions conserve les ajouts et modifications des autres appareils. Deux modifications différentes de la même fiche ou deux créations avec le même numéro sont refusées.
- La version de référence est capturée avant les opérations asynchrones sur les photos. Une actualisation ne peut pas autoriser rétroactivement une ancienne saisie.
- La fusion automatique n'est pas autorisée pour la purge/archivage ni avec une référence de données qui ne correspond pas à la version chargée. Ces opérations gardent leurs vérifications existantes.

## Limites et architecture

Cette livraison renforce le stockage existant : elle conserve des index JSON partagés légers, avec photos séparées. Elle ne constitue pas une migration vers une base de données ni vers un fichier indépendant par intervention. Un index reste réécrit, avec contrôle de version, pour publier une modification. L'isolation physique de chaque fiche nécessiterait aussi de migrer les lecteurs d'archives, paie, alertes et imports ; elle n'est pas annoncée comme réalisée ici.

Les PDF définitifs restent dans OneDrive/Microsoft 365. La rétention de 15 jours et ses exigences de copie confirmée sont inchangées. Aucun document métier n'est supprimé par cette mise à jour.

## Validation et mise en ligne

L'installation des dépendances est vérifiée depuis un dossier neuf (npm ci, 84 paquets). web-push reste fixé à 3.6.7 ; seule la version de l'application passe à 3.6.9. Les tests couvrent coupure de réponse, reprise, photos, deux appareils, conflit sur la même fiche, archivage, connexion, calendrier et conservation locale.

Déposer les fichiers de l'archive à la racine du dépôt GitHub existant, en conservant les dossiers lib/ et tests/. Attendre la réussite du déploiement Vercel avant de demander aux appareils de charger la 3.6.9. Ne pas vider leurs données locales. Reprendre ensuite INT-2026-0081 avec son identifiant existant et vérifier sa confirmation distante avant de considérer ce cas comme résolu.

Le diagnostic ne dispose pas d'un accès GitHub/Vercel en écriture. Ce code préparé ne signifie pas qu'il est publié. Aucun engagement d'absence de bugs ou de performance garantie sur tout réseau n'est établi.

# Correctif connexion et sauvegarde - 3.4.89

Préparé le 21/10/2026 à partir de la copie locale work88 / OPUS_CHANTIERS.
Cette archive n'a pas été déployée. Vérifier qu'aucune évolution plus récente du site n'est absente de cette copie avant remplacement.

## Changements
- Bouton « Enregistrer sur cet appareil » dans les rapports : conservation locale du texte et des photos, indépendamment de Microsoft.
- Une soumission bloquée par l'actualisation confirme la sauvegarde locale seulement après réussite de l'écriture.
- Reconnexion du rapport : recharge les données opérationnelles sans attendre l'inventaire des dossiers de chantier ; conserve la fenêtre sur échec.
- Un échec de l'inventaire des chantiers ne remet plus en lecture seule des données opérationnelles correctement actualisées.
- Appels Graph parallèles : mutualisation de l'acquisition du jeton en cours.
- Attente du jeton bornée à 15 s ; requête Graph à 15 s ; absence de répétition automatique d'une requête expirée ; lecture de fichier à 20 s.
- Version du cache de l'application renouvelée.

## Limites importantes
« Enregistré sur cet appareil » ne signifie pas « envoyé au bureau ».
Cette version ne comporte pas de file d'envoi automatique des rapports hors ligne.
La saisie locale reste liée au compte et à l'appareil. Ne pas effacer les données du navigateur.
Les contrôles de conflit et les autorisations Microsoft restent actifs.
Les transferts volumineux et l'ensemble d'une reconnexion comportent plusieurs requêtes : les délais ci-dessus ne sont pas une garantie de durée globale.

## Validation
21 tests ciblés réussis : cloud, session, reprise des brouillons, simulation des parcours tablette et démarrage avec cache.
Construction npm run build réussie.
Pas de test sur tablette physique, pas de déploiement, pas de mesure sur le tenant Microsoft de production.

## Installation et recette
Utiliser la procédure de déploiement existante du projet (docs/02_DEPLOIEMENT.md). Ne pas remplacer la configuration Microsoft par celle d'un autre environnement.
Avant mise à jour, terminer les envois en cours et conserver les brouillons ; ne pas effacer le stockage local.
Déployer d'abord en préproduction, puis tester avec un compte de test :
1. Ouvrir un rapport, saisir du texte et ajouter des photos.
2. Couper le réseau et cliquer « Enregistrer sur cet appareil ».
3. Fermer et rouvrir l'application avec le même compte, rétablir le réseau et reprendre le brouillon.
4. Reconnecter et enregistrer dans Microsoft ; vérifier sa réception depuis un autre appareil.
5. Mettre la tablette en veille, modifier le planning depuis un autre appareil, vérifier sa mise à jour au retour.
6. Vérifier qu'une modification concurrente provoque une réserve de conflit et ne remplace pas silencieusement les données.

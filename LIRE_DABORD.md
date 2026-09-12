# OPUS CHANTIERS 3.1.1 — correctif connexion

Ce patch évite que le nouveau module Planning / Interventions bloque le bouton Microsoft au démarrage.
Le module métier est désormais chargé après l'authentification Microsoft ; si son fichier manque ou tarde à se charger, la connexion reste possible et l'interface Chantiers classique reste accessible.

À téléverser entièrement dans le dépôt OPUS_CHANTIERS en conservant les dossiers lib/ et tests/.
Après le déploiement GitHub Actions vert, fermer tous les onglets OPUS CHANTIERS puis rouvrir l'application.

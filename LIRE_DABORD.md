# OPUS CHANTIERS 3.2.0

Cette version stabilise les fonctions métier Planning / Interventions / Visites-Devis et intègre les calendriers école des trois apprentis.

## Planning
- Vue **Semaine** sous forme de vrai calendrier du lundi au vendredi.
- Vue **Mois** sous forme de calendrier mensuel.
- Les éléments planifiés sont cliquables pour être modifiés ou supprimés.
- Lors d’un enregistrement : le bouton est bloqué pendant l’opération, affiche **✓ Enregistré**, une confirmation apparaît, puis la fenêtre se ferme automatiquement. Cela évite les doublons créés par plusieurs clics.
- Les chantiers « En cours » sont classés selon leur prochaine intervention planifiée.
- La disponibilité tient compte des salariés, véhicules, absences, prestataires externes et périodes école.

## Calendriers apprentis intégrés
- MISAT Dam Ilan : calendrier Campus des Métiers, jours centre / entreprise.
- PICARD Alban : calendrier AFPA EEB jusqu’au 26/03/2027.
- TRAORE Bourama : calendrier Eco-Campus BTS1 ELEC C/D, jours CFA / entreprise.
- Les jours école rendent automatiquement l’apprenti indisponible à la planification et sont repris dans l’export paie.

## Interventions
- Numéro chronologique INT-AAAA-0001.
- Client habituel **ou nouveau client**.
- Pour un nouveau client : Madame, Monsieur, Société, Syndic, Institutionnel ou Autre ; nom/raison sociale, prénom, adresse, téléphone, e-mail.
- Fiche terrain simplifiée et visuelle : photos en priorité, travaux réalisés, besoin de devis complémentaire Oui/Non, observation facultative, horaires réels et matériel facultatif.
- Enregistrement avec confirmation et fermeture automatique.
- Modification et suppression possibles pour les utilisateurs autorisés.
- Les interventions sont triées chronologiquement.

## Visites / Devis
- Client habituel ou nouveau client avec les mêmes coordonnées.
- Types : Visite avant devis, Dépannage / diagnostic, Étude technique, Relevé / métrés, Visite sur site.
- Date/heure de début et de fin.
- Enregistrement confirmé puis fermeture automatique.
- Modification / suppression et transformation en chantier pour l’administrateur.

## Équipe OPUS préconfigurée
- Techniciens avec véhicule : ANZINI Ruben, CARBONARO Roberto, FARRUKU Christian.
- Technicien sans véhicule : CEESAY Yaya.
- Apprentis 35 h sans véhicule : MISAT Dam Ilan, PICARD Alban, TRAORE Bourama.
- Roberto reste un technicien affectable aux chantiers et dispose aussi des droits « responsable terrain ».
- Les prestataires externes peuvent être ajoutés ponctuellement avec leurs dates de disponibilité.

## Heures / paie
- Salariés OPUS 39 h : lundi-jeudi 8 h / jour, vendredi 7 h.
- Apprentis 35 h : lundi-jeudi 8 h / jour, vendredi 3 h.
- Les jours école sont intégrés à l’export mensuel.
- Si des heures réelles sont saisies, elles sont exportées ; sinon l’événement reste identifié comme « Planifié ».

## Déploiement
Charger le contenu du patch dans le dépôt GitHub `OPUS_CHANTIERS`, conserver l’arborescence des dossiers, valider sur `main`, puis attendre que **Actes → Publier OPUS CHANTIERS** soit vert.

Après déploiement, fermer puis rouvrir l’application sur les tablettes. Si une ancienne interface reste en cache, effacer les données du site `icarbonaro18-max.github.io` dans Chrome puis rouvrir l’application.

## Contrôles réalisés
- Vérification syntaxique de `app.js`, `lib/ops.js` et `lib/ops-ui.js` : OK.
- Batterie Node : **17 tests / 17 réussis**.
- Le build complet avec téléchargement des dépendances n’a pas été exécuté localement dans cet environnement ; le workflow GitHub Actions reste responsable de `npm install`, du build et du déploiement réel.

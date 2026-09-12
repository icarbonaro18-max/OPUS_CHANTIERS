# OPUS CHANTIERS 3.1.3

Cette version ajoute la première base métier de pilotage OPUS ELEC autour de Microsoft 365.

## Nouveaux espaces
- Chantiers : classement existant, badges de quantité, tri des chantiers « En cours » par prochaine intervention.
- Interventions : numérotation chronologique INT-AAAA-0001, client/site, planning, équipe, compte rendu terrain, passage terminé.
- Visites / Devis : numérotation VIS-AAAA-0001, planification et transformation en chantier « À préparer ».
- Calendrier : vue semaine, affectation des équipes, personnel interne, apprentis, école/absences, prestataires externes.
- Bureau (administrateur uniquement dans l’interface) : à facturer, base clients, personnel et export mensuel des heures en CSV compatible Excel.

## Règles heures intégrées
- Salariés OPUS 39 h : lundi-jeudi 8 h / jour, vendredi 7 h.
- Apprentis 35 h : lundi-jeudi 8 h / jour, vendredi 3 h.
- Les périodes école des apprentis sont intégrées à l’export.
- Les heures réalisées sont utilisées quand elles sont renseignées, sinon le planning est exporté comme « Planifié ».

## Important sécurité
Le bouton « Bureau » est masqué pour les techniciens et visible aux administrateurs configurés dans config.json. Cette séparation d’interface n’est pas encore une séparation Microsoft 365 au niveau des ACL de fichiers : ne stockez pas encore de montants sensibles ou de données comptables confidentielles dans les fichiers partagés. Une zone Microsoft 365 privée « Bureau » devra être créée avant d’y stocker des données financières sensibles.

## Déploiement
Conserver le workflow GitHub Actions. Charger le contenu de cette version dans le dépôt OPUS_CHANTIERS puis attendre que « Publier OPUS CHANTIERS » soit vert.

## Équipe OPUS préconfigurée (3.1.3)
- Techniciens avec véhicule : ANZINI Ruben, CARBONARO Roberto, FARRUKU Christian.
- Technicien sans véhicule : CEESAY Yaya.
- Apprentis (35 h, sans véhicule) : MISAT Dam Ilan, PICARD Alban, TRAORE Bourama.
- Les périodes École / absences déjà enregistrées sont conservées lors de la mise à jour.


## Correctifs 3.1.3
- Les onglets Chantiers / Interventions / Visites-Devis / Calendrier restent visibles après connexion, même si la synchronisation du personnel doit être retentée.
- Sur tablette et téléphone, la grande barre latérale bleue est supprimée et remplacée par des filtres horizontaux compacts.
- Le calendrier mobile passe en liste verticale par jour pour rester lisible.

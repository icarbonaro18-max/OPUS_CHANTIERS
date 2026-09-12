# OPUS CHANTIERS 3.4.1

Cette version corrige la dictée vocale sur mobile, rend le bouton **Français propre** utile même sans serveur IA, et ajoute l'archivage automatique des rapports d'intervention en PDF dans Microsoft 365.

## Dictée vocale corrigée
- La dictée n'utilise plus le mode continu qui répétait parfois plusieurs fois le même mot sur Chrome/Samsung/iPhone.
- Une dictée s'arrête après le silence, puis le technicien peut relancer le micro si nécessaire.
- Les répétitions immédiates de mots ou petits groupes sont nettoyées avant d'être ajoutées au champ.
- Langue toujours sélectionnable : **Italiano** ou **Français**.

## Français propre
Si le service IA sécurisé OPUS est connecté, le bouton appelle ce service comme prévu.

Si le service n'est pas encore connecté, le bouton ne reste plus sans effet :
- suppression locale des répétitions évidentes ;
- nettoyage de la ponctuation ;
- quelques traductions électriques courantes italien -> français servent de mode de secours ;
- un message indique clairement qu'il s'agit d'une mise au propre locale et non de la rédaction IA complète.

La règle reste la même : aucune fonction ne doit inventer une mesure, une référence, un diagnostic ou une prestation non constatée par le technicien.

## Rapport PDF d'intervention
Une intervention terminée peut maintenant produire un **PDF autonome** directement dans l'application.

Le PDF reprend notamment :
- numéro d'intervention ;
- client et adresse ;
- équipe ;
- date et horaires réalisés ;
- points d'intervention ;
- constats ;
- actions / préconisations ;
- références / matériel ;
- photos par point ;
- photos générales ;
- résumé ;
- observations ;
- indication de devis complémentaire.

Deux boutons sont disponibles dans la fiche intervention :
- **Télécharger le PDF** ;
- **Enregistrer PDF dans OPUS**.

Lorsqu'un rapport est terminé, l'application essaie aussi d'archiver automatiquement le PDF.

## Où retrouver les interventions dans Microsoft 365
Les rapports sont classés automatiquement dans la bibliothèque partagée OPUS CHANTIERS :

`INTERVENTIONS / année / INT-AAAA-XXXX_CLIENT /`

Le dossier contient :
- `INT-AAAA-XXXX_RAPPORT_INTERVENTION.pdf`
- `intervention.json`

Le technicien reste dans OPUS CHANTIERS ; il n'a pas besoin d'aller dans OneDrive ou SharePoint pour travailler.

## Déploiement
1. Charger tout le contenu du patch dans le dépôt `OPUS_CHANTIERS` en conservant l'arborescence.
2. Valider sur `main`.
3. Attendre que GitHub Actions soit vert.
4. Fermer puis rouvrir l'application sur PC et tablette.
5. Si une ancienne version reste affichée, effacer les données du site GitHub Pages dans le navigateur.

## Important pour GitHub Actions
La 3.4.1 ajoute la dépendance `jspdf`, utilisée pour créer les rapports PDF sans impression navigateur. GitHub Actions l'installe lors du build et génère `vendor/jspdf.js`.

## Contrôles réalisés
- Syntaxe JS : OK.
- Batterie Node : **28 tests / 28 réussis**.

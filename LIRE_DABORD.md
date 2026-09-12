# OPUS CHANTIERS 3.4.0

Cette version ajoute l'assistance terrain **photo + voix + aide linguistique** aux fiches Interventions et Visites / Devis.

## Dictée vocale
- Bouton **🎙 Dicter** dans les principaux champs terrain.
- Choix rapide de la langue : **Italiano** ou **Français**.
- La dictée se place directement dans le champ actif.
- Si la reconnaissance vocale du navigateur n'est pas disponible, l'application conseille d'utiliser le micro du clavier Android.
- Aucun fichier audio n'est conservé par OPUS CHANTIERS.

## Aide à la rédaction
- Bouton **✨ Français propre** sur les observations, constats, actions et résumés.
- Bouton **🇮🇹 Italiano** pour afficher une traduction d'aide en italien.
- Les textes français restent la référence pour le dossier et le futur PDF client.
- La version brute saisie/dictée est conservée dans le champ avant validation de la proposition.

## Sécurité IA
La clé IA n'est **jamais** placée dans GitHub, dans la tablette ou dans `config.json`.

L'application est prête à appeler un **service sécurisé OPUS** via l'option `aiEndpoint`. Tant que ce service n'est pas configuré :
- la dictée fonctionne si le navigateur la supporte ;
- la correction orthographique française fonctionne ;
- les boutons IA affichent simplement que le service sécurisé doit encore être activé.

Voir `docs/05_ASSISTANT_IA.md` pour le contrat du futur service sécurisé.

## Interventions
- Plusieurs points par intervention.
- Plusieurs photos par point.
- Constat, action, référence / matériel, devis complémentaire.
- Photos générales, horaires réels, pause, résumé et observations.
- Dictée et aide linguistique dans les notes terrain.

## Visites / Devis
- Plusieurs tâches / pièces.
- Longueur, largeur, hauteur, faux plafond et hauteur de plénum.
- Plusieurs photos par tâche et photos générales.
- Dictée et aide linguistique dans la demande client, le résumé et les observations.
- Transformation en chantier toujours disponible pour l'administrateur.

## Correctifs conservés
- Planning Semaine / Mois.
- Équipe optionnelle et affectable plus tard par Roberto.
- Clients privés dans Microsoft 365.
- Planning des apprentis et indisponibilités école.
- Affichage responsive PC / tablette.

## Déploiement
1. Charger le contenu du patch dans `OPUS_CHANTIERS`.
2. Conserver l'arborescence des dossiers.
3. Valider sur `main`.
4. Attendre que GitHub Actions soit vert.
5. Fermer et rouvrir l'application sur les tablettes.

## Contrôles réalisés
- Syntaxe : `app.js`, `lib/ops.js`, `lib/ops-ui.js`, `lib/assistant.js` : **OK**.
- Batterie Node : **26 tests / 26 réussis**.

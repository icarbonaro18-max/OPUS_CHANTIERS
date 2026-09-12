# OPUS CHANTIERS 3.4.2 — activer l’IA

Cette version ajoute le service serveur /api/assistant et la rédaction du rapport
client dans la fiche Intervention. Les boutons Français propre / Italiano des
interventions et visites utilisent également ce service.
Les modules historiques autonomes ne sont pas modifiés.

## Mise en ligne

1. Conserver une sauvegarde du ZIP précédent et de vos données Microsoft.
2. Placer le contenu de ce dossier à la racine du dépôt GitHub de
   **OPUS CHANTIERS** (ne pas remplacer un autre dépôt BAES par erreur).
   Ne jamais y déposer de clé secrète. Préférer un dépôt privé : la configuration
   existante contient des informations d’équipe.
3. Dans Vercel : Ajouter un → Projet → importer ce dépôt.
   Framework : Other. La configuration vercel.json fournit npm run build et _site.
   Ne pas publier simplement le dossier _site : le dossier api doit rester dans
   les sources du projet pour que Vercel crée le serveur.
4. Ajouter les variables du projet :
   - OPENAI_API_KEY : clé créée sur https://platform.openai.com/api-keys
   - OPENAI_MODEL : gpt-5 (modifiable selon les modèles accessibles au compte)
   - OPUS_AI_ALLOWED_USERS : noms de connexion Microsoft exacts des utilisateurs
     autorisés, séparés par des virgules, ou leurs identifiants objet Microsoft.
     Utiliser le compte du gérant pour commencer. Ne pas se fier au nom affiché.
5. Activer la facturation API OpenAI si nécessaire. Configurer ses alertes et
   limites disponibles, ainsi que les protections de dépenses Vercel.
   L’abonnement ChatGPT ne configure pas la facturation de cette API.
6. Déployer. Ajouter la nouvelle URL HTTPS + /auth.html comme URI de redirection
   **SPA** dans l’application Microsoft Entra déjà utilisée par OPUS.
   Garder l’ancienne URI pour permettre un retour à l’ancienne application.
   Vérifier aussi le retour après déconnexion vers la nouvelle URL.
7. Ouvrir la nouvelle adresse et se connecter à Microsoft. Après une mise à jour,
   fermer tous les onglets et la PWA OPUS, puis rouvrir pour activer le nouveau cache.

Les dossiers /api ne fonctionnent pas sur GitHub Pages. Utiliser l’adresse Vercel
pour cette version ; /api/assistant reste sur la même origine que l’application.
La publication automatique GitHub Pages sur push a été désactivée dans ce ZIP
afin de ne pas remplacer l’ancienne application lors de la migration. Le workflow
historique reste lançable manuellement, mais n’exécute pas le serveur IA.
Ne pas désactiver les contrôles d’accès pour contourner une erreur de connexion.

## Test terrain

Dans une intervention, saisir par exemple :
« Abbiamo sostituito due prese nella cucina. Prova di funzionamento OK.
La luce del corridoio non funziona ancora, serve un preventivo. »

Cliquer « Générer le rapport complet ». Vérifier : deux prises remplacées,
essai noté OK, éclairage du couloir toujours en panne, devis à prévoir.
Aucune mesure ni conformité ne doit être ajoutée.
Relire et modifier la proposition, cocher sa validation, puis Enregistrer le
rapport. Le PDF utilise le rapport français validé et conserve les photos.
Les points et notes terrain restent dans les données internes.
Sans validation, le PDF conserve le fonctionnement précédent (notes terrain,
potentiellement italiennes) : ce n’est PAS un PDF client rédigé par l’IA.
Une modification des notes exige une nouvelle génération et validation.

La rédaction est déclenchée par un bouton : elle n’a pas lieu à chaque frappe.
Internet est nécessaire. Aucune donnée ni clé de production n’a été utilisée
pour les tests de développement. Il reste à vérifier les appels réels et les
PDF avec votre compte après déploiement.

## Protection et limites

- Le serveur vérifie le jeton auprès de Microsoft Graph et contrôle l’utilisateur
  dans une liste autorisée avant tout appel payant. Il n’est pas ouvert au public.
- Le navigateur ne contient pas de secret fournisseur et refuse un serveur IA
  d’une autre origine pour éviter d’y envoyer le jeton Microsoft.
- Les requêtes sont limitées à 60 ko ; délai serveur et longueur de sortie bornés.
  Ajouter une règle de limitation de débit Vercel sur /api/assistant avant
  utilisation élargie. Pas de quota durable par utilisateur implémenté ici.
- Les notes texte sont transmises à OpenAI ; ni photos ni audio ne le sont.
  store:false est demandé, sans promettre une absence de journaux fournisseur.
  Informer l’équipe et respecter les règles de confidentialité des clients.
- Pas d’envoi automatique au client, pas de diagnostic autonome, pas de
  certification de conformité. Une relecture humaine reste obligatoire.

Documentation de l’API utilisée :
https://developers.openai.com/api/docs/guides/text

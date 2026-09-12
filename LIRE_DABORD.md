# OPUS CHANTIERS — v3.0, Microsoft 365

**Version de connexion à activer et à réceptionner avant usage réel.**

Cette livraison contient le code de l’application centrale, les 13 formulaires existants, le connecteur Microsoft Graph, les tests unitaires et le déploiement GitHub Actions. Elle ne contient pas d’identifiant d’application Entra attribué à OPUS ELEC : la connexion Microsoft 365 doit encore être autorisée par le bureau. Aucun compte ni réglage OneDrive n’a été modifié par cette livraison.

## Le quotidien recherché

Le bureau dépose les feuilles de chantier, devis, rapports et commandes dans le dossier du chantier, depuis le PC ou l’application. Le technicien ouvre uniquement OPUS CHANTIERS, se connecte avec son compte professionnel, ouvre le chantier et ses documents puis remplit les attestations nécessaires. Les enregistrements sont envoyés directement au stockage partagé. Aucun import/export de dossier n’est demandé au technicien au quotidien.

## Organisation conservée

Site : `https://opuselec.sharepoint.com/sites/OPUSCHANTIERS`.
Bibliothèque : Documents (bibliothèque par défaut du site, configurable par son identifiant si nécessaire).

```
Documents
├── 01 - A PREPARER
│   └── 001204 - Nom du chantier
├── 02 - EN COURS
│   └── 001169 - Nom du chantier
│       ├── 01_FEUILLE_CHANTIER
│       ├── 02_RAPPORT_CONTROLE
│       ├── 03_COMMANDES
│       ├── 05_PDF_GENERES
│       ├── 06_PHOTOS
│       └── _OPUS              ← données modifiables gérées par l’application
├── 03 - A CONTROLER
├── 04 - TERMINES
└── 99 - ARCHIVES
```

L’application découvre automatiquement les **dossiers immédiatement sous chaque rubrique**. Déposer une feuille PDF seule dans « En cours » ne suffit pas pour inventer les informations du chantier : le document apparaît parmi les fichiers à classer. Chaque chantier doit avoir son propre dossier.

La fiche client/adresse/devis/contact est renseignée une seule fois au bureau. Les nouvelles attestations en héritent ; les anciennes ne sont pas corrigées silencieusement lorsque la fiche change.

## Ce qui est livré

- Liste partagée des chantiers par rubrique, recherche par nom de dossier ou numéro présent dans ce nom.
- Création de chantier et déplacement entre rubriques sans copie.
- Consultation des fichiers et commandes ; ajout de documents depuis l’application ; lecteur PDF intégré après compilation.
- 13 formulaires disponibles dans **chaque chantier**, intégrés dans le même écran : BAES, CFO, CFA, SSI, alarmes types 1/2/3/4, intervention, consignation, réserves, suivi chantier et visite avant devis.
- Sauvegarde des formulaires modifiables, photos et signatures dans les données du chantier.
- Aperçu puis enregistrement du PDF dans `05_PDF_GENERES`. « Généré » ne signifie pas « validé par le bureau ».
- Liste des envois en attente, reprise des envois échoués, historique des révisions et détection de versions concurrentes.
- Anciennes versions préservées : aucune suppression automatique des documents.
- Migration ponctuelle v1/v2 depuis un fichier `.opuschantier`, au bureau seulement.
- Mode démonstration clairement signalé, données fictives et aucune connexion Microsoft (`?demo=1`).

## Ne pas confondre livré et activé

La connexion réelle, le consentement administrateur et l’autorisation du site ne sont pas exécutés dans votre tenant. La compilation des dépendances externes est fournie par GitHub Actions ; elle n’a pas pu être exécutée dans l’environnement de création. La recette avec vos deux comptes et la tablette reste nécessaire.

**Conserver la v2 actuelle tant que la recette décrite dans `docs/03_RECETTE.md` n’est pas terminée.** Ne pas désinstaller OneDrive, réinitialiser les appareils, changer les utilisateurs ni retoucher les DNS.

## Déploiement

1. Lire `docs/01_CONNEXION_MICROSOFT.md` : inscription d’application unique, connexion professionnelle monopage, consentement et droit sur le seul site OPUS CHANTIERS.
2. Renseigner l’ID client et l’annuaire dans `config.json` (aucun secret).
3. Lire `docs/02_DEPLOIEMENT.md` : les dépendances sont compilées par GitHub Actions. Le simple remplacement de `index.html` n’est **pas** suffisant.
4. Réaliser le test bureau/tablette dans un dossier de recette, avec données fictives.

## Limites à connaître

- La lecture automatique du contenu d’une nouvelle feuille PDF ou d’un rapport Bureau Veritas/APAVE n’est pas intégrée : joindre un PDF ne crée pas automatiquement sa liste d’anomalies. La fiche commune se complète une fois ; les observations peuvent être saisies ou reprises d’un dossier v2 validé.
- Tous les chantiers accessibles au compte dans ce site sont affichés. Pas de restriction d’affectation par technicien ajoutée par cette version ; les autorisations Microsoft restent déterminantes.
- Les réglages d’accès différenciés « bureau / terrain », les validations par rôle et les rappels automatiques ne sont pas livrés.
- Une connexion est nécessaire pour une première utilisation, un nouveau téléchargement et un nouvel envoi de document. Un formulaire déjà ouvert conserve ses saisies localement si le réseau tombe. Une réouverture entièrement hors connexion n’est pas garantie tant que la session Microsoft ne peut pas être rétablie.
- « Enregistré sur la tablette » n’est pas « enregistré sur Microsoft 365 ». Ne pas effacer les données du navigateur ou changer de tablette avec des envois en attente. Le bouton de sauvegarde de secours permet d’en conserver une copie.
- Les brouillons locaux ne sont pas chiffrés par cette application. La tablette doit être verrouillée ; ne pas utiliser un profil de navigateur partagé sans précaution.
- Les formulaires historiques restent à affiner individuellement. Cette livraison ne constitue pas un audit réglementaire, un certificat d’habilitation ni une garantie de conformité de l’installation électrique.

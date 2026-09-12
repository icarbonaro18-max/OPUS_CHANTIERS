# 3 — Recette avant la première intervention réelle

## Réalisé dans l’environnement de développement

Les tests utilisent un navigateur Chromium avec un stockage et un fournisseur cloud **simulés**. Ils vérifient la logique de l’application et les vrais formulaires, pas les permissions de l’organisation Microsoft.

- Ouverture intégrée et préremplissage des 13 modules.
- Production d’un PDF de test par module à partir de leurs vrais générateurs ; contrôle automatisé des limites de page et inspection visuelle de plusieurs premières pages.
- Saisie BAES, fermeture puis réouverture sans perte du commentaire.
- Création d’une seconde attestation indépendante.
- Enregistrement d’un PDF dans le stockage simulé.
- Échec réseau simulé : maintien d’un brouillon local non déclaré envoyé.
- Reprise de l’envoi après retour du fournisseur simulé.
- Interface tablette de 800 pixels de large sans débordement horizontal du panneau central.
- Tests unitaires Node : pagination, envois par segments, absence du jeton sur les URL préautorisées, protection ETag du déplacement, branches concurrentes de révisions, répétition idempotente d’un envoi et externalisation des images.

**Non réalisé ici :** compilation npm des dépendances, authentification Microsoft native, consentement administrateur, transferts vers le site réel, cache du service worker sur la tablette réelle, validation de tous les cas longs de chaque PDF, audit réglementaire des formulaires. La navigation réseau n’était pas disponible dans l’environnement de test.

## À réaliser avec Ignazio puis Roberto

Utiliser un dossier `TEST_OPUS_À_SUPPRIMER_APRÈS_RECETTE`, contenant uniquement des documents et photos fictifs. Aucune attestation de test ne doit être remise à un client.

1. **Compilation.** Workflow GitHub Actions réussi. La page de connexion se charge sans erreur de fichier vendor manquant.
2. **Bureau.** Connexion avec le compte professionnel existant ; voir les cinq rubriques. Ne pas modifier l’identifiant d’Ignazio.
3. **Documents PC → application.** Créer le dossier de test sous « À préparer », y copier un PDF. Actualiser dans OPUS CHANTIERS : le chantier et le fichier doivent apparaître.
4. **Fiche.** Compléter client/adresse/devis/contact. Vérifier le message d’enregistrement et que le compteur d’envois est revenu à zéro.
5. **Tablette.** Connexion avec Roberto ; voir le même chantier et le PDF, sans passer par OneDrive.
6. **BAES.** Créer une attestation, vérifier l’identité héritée, ajouter un bloc et une photo, renseigner un commentaire. Fermer après confirmation cloud.
7. **Bureau.** Actualiser l’application, rouvrir l’attestation créée par Roberto et retrouver la photo et le commentaire.
8. **Retour.** Faire une correction au bureau, rouvrir après actualisation sur tablette. Ne pas simplement reprendre un formulaire resté ouvert depuis avant la correction.
9. **PDF.** Vérifier le rendu réel complet, puis enregistrer le PDF au chantier. Le fichier doit apparaître aussi dans l’Explorateur du bureau après synchronisation OneDrive.
10. **Réseau.** Avec un formulaire déjà ouvert, couper la connexion de la tablette, modifier un commentaire ; l’état doit dire « tablette / attente », pas « cloud ». Réactiver le réseau et vérifier la réception au bureau.
11. **Concurrence.** Ouvrir la même attestation sur deux appareils, modifier et enregistrer sur chacun. Vérifier que les deux versions sont conservées et que l’application demande un choix. Le choix est manuel, pas une fusion automatique de tous les champs.
12. **Sécurité.** Un compte sans accès au site ne doit pas pouvoir lire les fichiers. Aucune clé secrète ni donnée client ne figure dans le dépôt public.
13. **Mise à jour.** Fermer un formulaire après enregistrement, déployer une mise à jour, fermer/rouvrir l’application. Vérifier que les dossiers restent présents.

Après ces essais seulement, utiliser un premier vrai chantier en gardant l’accès SharePoint de secours et une copie des dossiers v2 importants.

## À regarder pour chaque modèle de PDF

Les commentaires longs, plusieurs circuits, plusieurs photos et les signatures peuvent changer la pagination. Les essais automatiques réalisés ici portent principalement sur des formulaires courts. Prévoir un essai représentatif sur BAES, intervention, CFO et consignation avant leur utilisation courante. Un PDF produit sans contrôle physique ou sans validation humaine n’est pas une preuve automatique de conformité.

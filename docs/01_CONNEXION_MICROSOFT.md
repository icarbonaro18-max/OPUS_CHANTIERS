# 1 — Autoriser OPUS CHANTIERS, sans modifier les comptes

Cette étape concerne uniquement une **nouvelle inscription d’application** dans l’annuaire OPUS ELEC. Le compte Ignazio, le compte Roberto, les licences, les DNS et les synchronisations OneDrive restent en place.

## A. Inscription de l’application

Dans Microsoft Entra, avec le compte administrateur existant :

1. **Applications > Inscriptions d’applications > Nouvelle inscription**.
2. Nom : **OPUS CHANTIERS**.
3. Type de comptes : **comptes dans cet annuaire d’organisation uniquement**.
4. URI de redirection : plateforme **Application monopage (SPA)** ; adresse exacte :
   `https://icarbonaro18-max.github.io/OPUS_CHANTIERS/auth.html`
5. Enregistrer et relever **ID d’application (client)** et **ID de l’annuaire (tenant)**.
6. Dans **Authentification**, vérifier la plateforme SPA et l’adresse exacte. Ne pas activer les anciens flux implicites. **Ne créer aucun secret client** : il ne faut jamais placer un secret dans GitHub ou dans une application web cliente.

Ces deux identifiants ne sont pas des mots de passe. Les renseigner dans `config.json` :

```json
{
  "version": "3.0.0",
  "tenant": "ID-ANNUAIRE-RELEVE-DANS-ENTRA",
  "clientId": "ID-APPLICATION-RELEVE-DANS-ENTRA",
  "siteHost": "opuselec.sharepoint.com",
  "sitePath": "/sites/OPUSCHANTIERS",
  "driveId": "",
  "scopes": ["User.Read", "Sites.Selected"],
  "pollSeconds": 45
}
```

Ne pas recopier littéralement les valeurs « ID-... ». Laisser `driveId` vide pour la bibliothèque Documents par défaut.

## B. Consentement à Microsoft Graph

Dans l’inscription de l’application : **Autorisations API > Ajouter une autorisation > Microsoft Graph > Autorisations déléguées**.

Sélectionner **User.Read** et **Sites.Selected**, puis effectuer le consentement administrateur pour l’organisation. Ne pas sélectionner les autorisations de type « Application » : l’application agit avec la personne connectée, sans identité de service autonome.

`Sites.Selected` seul ne donne encore accès à aucun site. Il faut aussi l’autorisation explicite du site ci-dessous. Ne pas ajouter `Files.ReadWrite.All` ou `Sites.ReadWrite.All` pour contourner une erreur 403.

## C. Accès explicite au site OPUS CHANTIERS

Cette opération d’administration est distincte de l’application terrain. Elle peut être effectuée par un administrateur via Microsoft Graph Explorer ou son outillage Graph habituel. L’outil d’administration doit lui-même avoir les droits de gestion nécessaires (Microsoft documente `Sites.FullControl.All` pour gérer les autorisations des sites). **Ce droit étendu ne doit pas être ajouté à l’application OPUS CHANTIERS.**

Récupérer le site avec le compte administrateur :

```http
GET https://graph.microsoft.com/v1.0/sites/opuselec.sharepoint.com:/sites/OPUSCHANTIERS
```

Copier la valeur exacte de `id` renvoyée, pas l’URL du navigateur. Puis accorder à la nouvelle application l’accès en lecture/écriture à **ce site seulement** :

```http
POST https://graph.microsoft.com/v1.0/sites/ID-DU-SITE/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "ID-APPLICATION-OPUS-CHANTIERS",
        "displayName": "OPUS CHANTIERS"
      }
    }
  ]
}
```

Vérifier avant exécution le site et l’ID client. Conserver l’identifiant de permission renvoyé pour une éventuelle révocation. En cas de difficulté, ne pas multiplier les partages ou modifier des comptes : vérifier cette autorisation précise avec l’administrateur.

Le compte Roberto doit toujours être membre du site, ce qui a déjà été vérifié. En mode délégué, les droits effectifs sont limités par ceux de l’application **et** par ceux de l’utilisateur connecté.

## D. Premier test de connexion

Une fois la compilation GitHub Actions déployée, ouvrir OPUS CHANTIERS, choisir **Connexion Microsoft 365** puis le compte professionnel existant. Le mot de passe est saisi uniquement sur l’écran Microsoft, pas dans OPUS et jamais dans cette conversation.

Confirmer : nom de l’utilisateur, site OPUS CHANTIERS, rubriques existantes et accès à un document de recette. Répéter avec Roberto sur tablette avant de confier un vrai chantier.

### Sources techniques officielles

- Applications monopages et flux code + PKCE : https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Page de retour MSAL v5 : https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge
- Permissions sélectionnées et octroi par site : https://learn.microsoft.com/en-us/graph/permissions-selected-overview
- Création d’une permission de site : https://learn.microsoft.com/en-us/graph/api/site-post-permissions?view=graph-rest-1.0

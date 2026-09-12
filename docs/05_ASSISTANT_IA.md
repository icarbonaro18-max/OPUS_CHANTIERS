# Assistant vocal et rédactionnel OPUS

## Principe
La tablette ne contient aucune clé IA. Le navigateur appelle uniquement un **service sécurisé OPUS** configuré par son URL (`aiEndpoint`). La clé éventuelle du fournisseur IA reste côté serveur.

## Fonctions prévues dans l'application
- `🎙 Dicter` : dictée vocale directement dans les champs terrain.
- Langue de dictée : **Italiano** ou **Français**.
- `✨ Français propre` : reformulation professionnelle en français, fidèle aux notes terrain.
- `🇮🇹 Italiano` : traduction d'aide en italien, sans modifier la donnée française d'origine.

## Contrat HTTP du service sécurisé
Requête :

```json
{
  "action": "rewrite_fr | translate_it",
  "text": "texte terrain",
  "context": {
    "kind": "intervention | intervention_point | visit | visit_task",
    "client": "...",
    "address": "..."
  },
  "outputLanguage": "fr | it"
}
```

Réponse :

```json
{
  "text": "texte proposé"
}
```

## Règle métier impérative
Le service doit **reformuler ou traduire uniquement**. Il ne doit jamais inventer une mesure, une quantité, une référence, un diagnostic, une prestation ou une décision qui n'existe pas dans les données terrain.

## Dictée
La dictée utilise la reconnaissance vocale du navigateur lorsqu'elle est disponible. Sur Android, si elle n'est pas disponible, le technicien peut toujours utiliser le micro du clavier.

## Vie privée
L'application conserve le texte utile. Elle ne stocke pas d'enregistrement audio de la conversation. Une future fonction d'enregistrement intégral d'un échange client devra être traitée séparément avec information et consentement appropriés.

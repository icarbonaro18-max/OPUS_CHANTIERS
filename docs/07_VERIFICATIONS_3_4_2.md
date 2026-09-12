# Vérifications 3.4.2

- 36 tests Node réussis : tests existants et 8 tests serveur/source IA.
- Compilation npm run build réussie.
- Test DOM simulé : génération avec réponse IA simulée, conservation des notes,
  export bloqué avant sauvegarde, validation, refus après changement des notes.
- Export réel jsPDF d’un rapport de test de 60 points : 3 pages A4, texte final
  extrait et trois pages rendues/inspectées. Police incorporée et pagination corrigée.
- Pas de clé OpenAI réelle utilisée, pas de données client transmises.
- Non vérifiés ici : appels OpenAI réels, authentification Microsoft en production,
  déploiement Vercel, rendu Chrome/Samsung et photos dans le nouveau PDF.
  Le navigateur automatisé n’était pas disponible ; le test DOM ne le remplace pas.

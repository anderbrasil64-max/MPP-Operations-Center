# Inventaire redige des secrets

Ce fichier ne contient et ne doit contenir aucune valeur, empreinte reutilisable,
extrait ou commande incluant un credential. Il ne remplace pas l'inventaire prive du
proprietaire ni l'audit du fournisseur.

| Categorie | Localisation connue/attendue | Etat du RC | Action manuelle |
| --- | --- | --- | --- |
| Valeurs de secours privilegiees historiques | Anciennes migrations SQL et historique Git public | Retirees du code actif prepare; historique non nettoye | Rotation obligatoire de toute valeur reutilisee, puis nettoyage Git coordonne |
| Credential personnel joueur/admin | Base Supabase | Migration vers hashes preparee; aucune valeur documentee | Verifier les precontroles, provisionner hors bande, revoquer les sessions |
| Cle Supabase publiable | Configuration navigateur | Identifiant public par conception | Ne pas la traiter comme autorisation; maintenir RPC/RLS/privileges |
| Cle `service_role` | Secrets du runtime Edge | Nom documente seulement | Verifier exposition fournisseur; rotation si doute ou trace historique |
| Secrets Cron | Secrets du runtime Edge et configuration Cron | Noms documentes seulement | Proprietaire/date/rotation a suivre hors depot |
| Discord bot, webhooks et secret operateur | Secrets du runtime Edge / fournisseur Discord | Noms documentes seulement | Rotation si exposition; tester sans vrai canal avant revocation |
| Cle publique/signature et identifiants Discord applicatifs | Configuration Edge | Certaines valeurs sont des identifiants publics, pas des autorisations | Documenter la classification hors depot et maintenir la verification de signature |
| Pepper de liaison Discord | Secret du runtime Edge | Nom documente seulement | Rotation coordonnee avec invalidation des codes en attente |
| Jetons de session | Generes a l'execution | Opaques; empreintes en base; aucune valeur suivie | Revoquer lors d'un incident, d'une rotation ou du cutover |
| `.env`, cles privees et dumps | Depot courant | Interdits; le scanner CI doit le confirmer a chaque revision | Bloquer la release si detectes et faire tourner toute valeur exposee |

## Etat de verification

- Le nettoyage de l'historique Git n'est **pas execute** par le release candidate.
- Les rotations ne sont pas considerees terminees sans preuve privee du proprietaire.
- Un scan local/CI ne prouve pas qu'un secret n'existe pas dans les artifacts, caches,
  logs du fournisseur ou anciennes copies; ces emplacements doivent etre verifies.

# Sauvegarde et restauration

## Avant toute release base

- Verifier dans Supabase le type de sauvegarde, la retention et la disponibilite PITR.
- Noter, sans credential, un point de restauration avant la pretransition, avant `01`
  et immediatement avant le cutover `06`.
- Restaurer le point le plus recent dans un environnement isole et executer les tests
  de schema/RPC. Un statut affiche dans le dashboard n'est pas un test de restauration.
- Ne jamais exporter `joueurs`, sessions, hashes, demandes Discord ou journal dans Git.
- Revoir toutes les compensations du lot avant l'execution, pas pendant l'incident.

## Strategie

- Regression frontend/Edge: redeployer un artefact connu et appliquer une compensation
  securisee si necessaire; conserver les structures additives.
- Migration `01-05`: forward recovery prefere, compensations par lot pour revoquer les
  nouveaux endpoints sans detruire les backfills/hashes.
- Cutover `06`: ne pas rouvrir les tables; restaurer les API de session securisees via
  la compensation de cutover.
- Nettoyage `07`: restauration PITR ou forward recovery seulement. Les colonnes
  supprimees ne sont pas recreees par un rollback applicatif.

## Validation d'une restauration

- FK/unicites, absence d'orphelins et comptages metier coherents.
- Sessions existantes revoquees et nouvelle authentification des trois roles.
- RLS, privileges table/colonne/sequence/fonction et refus REST directs.
- Reservations/fragments Discord et unicite anti-doublon.
- Cron maintenus en pause jusqu'a verification manuelle.
- Aucun credential ni donnee personnelle dans le rapport de restauration.

Le release candidate fournit la procedure; il ne pretend pas qu'une restauration de
base a ete executee. Cette preuve doit etre jointe a la checklist de publication.

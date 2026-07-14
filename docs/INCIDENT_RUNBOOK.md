# Runbook incident

## Triage

1. Noter heure, version, composant, impact et code d'erreur redige.
2. Classer: confidentialite, integrite, disponibilite, authentification, Pages ou spam
   Discord. Ne pas copier les payloads/donnees reelles dans chat ou issue.
3. Identifier le dernier changement frontend, migration, Edge, Cron ou secret sans
   afficher de valeur.
4. Preserver logs et point PITR avant toute correction.

## Confinement

- Credential expose: faire tourner/revoquer chez le fournisseur, revoquer les sessions,
  puis verifier que l'ancienne valeur echoue.
- Authentification abusive: conserver `auth_attempts` et `security_events`, limiter la
  surface concernee et ne pas effacer les compteurs avant analyse.
- Discord: pauser uniquement le Cron concerne; conserver reservations/fragments et
  examiner les etats incertains avant toute reprise.
- Pages: stopper le workflow, reconstruire la liste blanche, verifier les URL techniques
  et redeployer un artefact connu.
- Base: pauser les ecritures avec accord; ne jamais improviser un rollback destructif.

## Recuperation

Suivre `ROLLBACK.md`, revoquer les sessions, tester les trois roles et les refus, puis
reactiver les Cron un par un. Observer au moins deux intervalles et confirmer que les
logs restent rediges. Documenter cause, impact, rotations, correction et prevention
sans valeur sensible.

## Escalade

Une restauration PITR, un force-push, une rotation globale, une suppression de donnee
ou une modification de Cron/secret exige l'accord explicite du proprietaire.

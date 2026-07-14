# Rollback et compensations

## Principes

- Privilegier le forward recovery. Ne jamais restaurer une lecture/ecriture publique,
  une RPC a pseudo libre, un mot de passe en clair ou une valeur de secours exposee.
- Revoquer les sessions avant toute bascule, conserver les preuves et valider le point
  de restauration.
- Une compensation SQL n'est executee qu'apres dry-run/revue et accord explicite.
- Le gate PostgreSQL 17 exécute chaque compensation dans une base fraîche à sa phase
  exacte, contrôle les révocations, puis rejoue le chemin forward supporté. Un fichier
  présent mais non exécuté n'est pas une preuve de rollback.

## Avant le cutover 06

| Lot echoue | Action |
| --- | --- |
| 01 | Executer `alpha_0_13_0_01_foundation_compensation.sql`; conserver hashes et tables privees confines |
| 02 | Utiliser `alpha_0_13_0_02_identity_compensation.sql`; conserver backfills/FK, corriger en avant |
| 03 | Revoquer les endpoints session avec `alpha_0_13_0_03_sessions_compensation.sql` |
| 04 | Revoquer les passerelles applicatives avec `alpha_0_13_0_04_apis_compensation.sql` |
| 05 | Revoquer les RPC Edge avec `alpha_0_13_0_05_edge_compensation.sql`, puis laisser les Cron pauses |
| Application partielle multiple | Utiliser `alpha_0_13_0_predeploy_compensation.sql` apres revue |

Redeployer le dernier frontend/Edge compatible uniquement si l'ancienne surface est
encore disponible. Une fois les credentials historiques tournes, ne jamais les
restaurer.

Le bootstrap propriétaire de `01` génère un code à retour unique. Les compensations
conservent son hash, ne le réémettent jamais et révoquent explicitement l'accès au schéma
privé pour `PUBLIC`, `anon`, `authenticated` et `service_role`. Si le code n'a pas été
enregistré dans le gestionnaire de mots de passe, arrêter la release: restaurer le point
pré-bootstrap en environnement isolé ou préparer un forward recovery owner-only distinct
et revu. Ne jamais remettre `code_acces_hash` à `NULL` ni introduire un code fourni par
l'opérateur.

## Apres le cutover 06

- Ne pas remettre les grants/policies publics 0.12.x.
- Redeployer le frontend et les Edge 0.13 securises.
- `alpha_0_13_0_cutover_compensation.sql` peut restaurer l'execution des API de session
  tout en maintenant les tables verrouillees.
- La compensation révoque aussi les droits hérités de `PUBLIC`; son contrat vérifie les
  sept tables, leurs colonnes, toutes les séquences et les grants de fonctions.
- Rejouer les smoke tests sessions/RPC et verifier les refus REST avant reprise.

## Apres le nettoyage 07

`07` supprime des colonnes et RPC historiques. Aucun script ne peut recreer leurs
donnees. En cas de corruption:

1. stopper les ecritures avec accord;
2. restaurer le point PITR dans un environnement isole;
3. comparer schema et donnees sans exporter de credentials;
4. choisir restauration controlee ou migration de forward recovery;
5. revoquer toutes les sessions et rejouer la validation complete.

## Frontend, Pages et Edge

- Pages: redeployer un artefact `site-dist/` connu, jamais la racine du depot.
- Edge: deployer la version precedente fonction par fonction; garder le Cron concerne
  pause jusqu'au test d'authentification et d'idempotence.
- Discord: un etat `echec_incertain` exige une revue manuelle; ne jamais relancer
  aveuglement un fragment dont la reception est inconnue.

## Validation apres rollback

Verifier les trois roles, expiration/revocation, sauvegarde des presences, refus
d'usurpation/escalation, CRUD admin autorise, tables verrouillees, journalisation
redigee, liaison Discord, anti-doublon, HTTP/version/cache et absence de chemins
techniques dans Pages.

# Checklist de release Alpha 0.13.0

Une case non cochee reste bloquante; ne pas transformer un test prepare en test execute.

## Revue et environnement isole

- [ ] Inventaire redige revu; toutes les rotations requises confirmees.
- [ ] Aucun joueur actif sans hash d'acces, aucun privilegie actif sans hash admin.
- [ ] Après `01`, le propriétaire SQL a exécuté le bootstrap avec le seul identifiant
  numérique; le code généré et retourné une fois a été enregistré directement dans le
  gestionnaire de mots de passe, puis le terminal a été effacé et fermé. Aucun credential
  n'était présent dans la requête, un fichier, le SQL Editor, Git, un chat ou un journal.
- [ ] Backup/PITR confirme et restauration reellement testee en environnement isole.
- [ ] `01-07`, pretransition et compensations revues par ordre/timestamp.
- [ ] Gate PostgreSQL 17 jetable vert dans l'ordre: fixture, prerequis, bootstrap,
  `01-05`, seed synthétique, drift ACL/policies, `06`, concurrence à deux connexions,
  tests pré-nettoyage, `07`, contrat et tests post-nettoyage.
- [ ] SQL 01/02/03/04/05/06 et `security-definers.sql` verts avant `07`; SQL
  01/02/03/04/06 et contrat adapté verts après `07`.
- [ ] RPC/RLS/privilèges/concurrence et les sept compensations testés dans des bases
  fraîches distinctes, avec rejeu forward et rapport rédigé.
- [ ] Les noms Edge requis sont presents; aucune valeur dans Git/logs/chat.
- [ ] CI, Deno, Playwright, accessibilite, artefact et scans verts.
- [ ] Toutes les actions GitHub sont epinglees par SHA; aucun workflow ne reference un
  secret, une URI PostgreSQL ou un service libpq.
- [ ] `deploy-pages.yml` n'a aucun trigger `push`; seul un dispatch manuel cible
  `main`, avec phrase exacte, six attestations et protection `github-pages`.
- [ ] Tous les credentials exposes/privilegies de l'inventaire redige sont rotates;
  le scan complet des refs/objets Git est revu sans secret actif non rotate.
- [ ] Les jobs `build` et `postgresql-17` dependent du gate `readiness` avant
  `deploy`; le test SQL utilise uniquement son service local jetable.

## Deploiement approuve

- [ ] `migration list --linked` aligne.
- [ ] `db push --dry-run --linked` contient seulement le lot approuve.
- [ ] Accord explicite enregistre avant chaque phase distante.
- [ ] Aucun workflow n'execute de migration distante; les phases reelles restent
  manuelles, revues et approuvees.
- [ ] Pretransition puis migrations `01-05` appliquees dans l'ordre.
- [ ] Bootstrap initial généré côté SQL, session SuperAdmin ouverte, puis codes manquants
  provisionnés; précontrôles `06` à zéro.
- [ ] Le cutover a supprimé tout drift de grants/policies sur les sept tables, y compris
  les droits hérités de `PUBLIC`; aucun OID de RPC browser requis n'est `NULL`.
- [ ] **Huit** Edge Functions deployees et authentification negative/nominale verifiee.
- [ ] Smoke tests backend/Edge termines avant Pages; logs rediges et versions confirmees.
- [ ] Dispatch Pages lance manuellement depuis `main` avec la confirmation exacte
  `DEPLOY ALPHA 0.13.0 - Security & Reliability`, les six attestations et l'accord
  de l'environnement si configure.
- [ ] Pages publie uniquement les 21 fichiers de `site-dist/`.
- [ ] Cutover `06` applique seulement apres smoke tests frontend/Edge.
- [ ] Cron reactives un par un; maintenance quotidienne configuree et observee.
- [ ] Nettoyage `07` laisse pour une fenetre ulterieure et une approbation distincte.

## Validation production

- [ ] Joueur: connexion, presence, refresh, expiration, deconnexion, inactif/suspendu,
  usurpation refusee et Discord lie/non lie.
- [ ] Officier: session/expiration, dashboard, joueurs, competitions, journal, aujourd'hui,
  sans-reponse et actions SuperAdmin refusees.
- [ ] SuperAdmin: roles, Discord ID, suppression, archivage, credential et revocation.
- [ ] Tables/RPC historiques refusees; privileges et RLS conformes.
- [ ] Liaison Discord, anti-doublon, concurrence/echec partiel testes sans spam reel.
- [ ] HTTP 200, version/cache corrects et chemins techniques 404.
- [ ] Logs rediges observes pendant au moins deux intervalles Cron.

## Cloture

- [ ] Rapport final, risques residuels, plan rollback et point de restauration archives.
- [ ] Changelog et documentation correspondent au code deploye.
- [ ] Aucun secret ou credential dans le rapport de release.

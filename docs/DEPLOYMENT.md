# Deploiement Alpha 0.13.0

## Preconditions bloquantes

- Release candidate revu, CI complete verte, worktree propre et commit approuve.
- Scan de secrets courant et historique revu; rotations obligatoires terminees.
- Scan complet de toutes les refs et objets Git revu; aucun secret actif identifie ne
  reste sans rotation. La preuve est conservee hors du depot, sans valeur sensible.
- Backup/PITR courant verifie et restauration testee en environnement isole.
- Tests SQL/RLS/RPC/concurrence executes sur une base isolee compatible.
- Tous les joueurs actifs ont un hash de code d'acces; tous les comptes privilegies
  actifs ont un hash admin personnel. Aucun credential ne figure dans le rapport.
- Noms des variables Edge presents dans Supabase; valeurs saisies uniquement dans le
  gestionnaire de secrets.
- `migration list --linked` aligne et dry-run contenant exactement le lot approuve.
- Migrations `01-05`, huit Edge Functions et smoke tests backend/Edge termines avant
  tout dispatch Pages. L'accord de publication est distinct de l'accord migration.

## Sequence unique de mise en production

1. Geler les changements et relever le point de restauration.
2. Terminer les rotations manuelles; revoquer les sessions existantes.
3. Appliquer la migration de pretransition sans fallback, apres son propre dry-run.
4. Appliquer `01`, puis exécuter comme propriétaire SQL le bootstrap à identifiant
   numérique. Enregistrer le code retourné une fois directement dans le gestionnaire de
   mots de passe, quitter `psql`, effacer et fermer le terminal. La requête ne contient
   aucun credential.
5. Appliquer `02-05` dans l'ordre, puis exécuter les contrôles de schéma/RPC.
6. Ouvrir la première session SuperAdmin et provisionner les codes manquants; confirmer
   les précontrôles de cutover à zéro.
7. Deployer individuellement les **huit** Edge Functions versionnees, sans activer ou
   modifier les Cron. Utiliser des endpoints/mocks de test, jamais un vrai envoi.
8. Executer les smoke tests backend et Edge: authentification negative/nominale,
   contrats RPC, versions deployees et logs rediges. Ne pas poursuivre si un test
   manque ou echoue.
9. Depuis `main`, lancer manuellement `Deploy GitHub Pages`, saisir exactement
   `DEPLOY ALPHA 0.13.0 - Security & Reliability`, cocher les six attestations et
   obtenir l'approbation eventuelle de l'environnement `github-pages`. Les six
   attestations couvrent aussi la rotation des credentials inventories et la revue
   complete des refs/objets Git sans secret actif non rotate.
10. Verifier HTTP, version/cache, chemins techniques 404, CSP, sessions joueur/admin,
   lecture Officier/SuperAdmin et deconnexion/revocation.
11. Appliquer manuellement le cutover `06` seulement apres cette validation Pages,
    une nouvelle revue et une approbation specifique.
12. Tester le refus des tables/RPC historiques puis tous les parcours normaux.
13. Configurer/verifier le Cron quotidien de maintenance, puis reactiver les Cron un
    par un. Observer au moins deux intervalles avec logs rediges et sans vrai doublon.
14. Laisser `07` hors de ce deploiement. L'appliquer plus tard, apres une fenetre
    d'observation, un nouveau backup et une approbation specifique.

## Edge Functions a deployer

1. `discord-link-code`
2. `discord-link-admin`
3. `discord-link-interactions`
4. `discord-register-commands`
5. `auto-statut-competitions`
6. `rappel-presences-discord`
7. `discord-presences-staff`
8. `maintenance-securite`

Pour chacune: verifier le bundle local, l'authentification attendue, les noms de
variables, une requete non autorisee, une requete nominale simulee et des logs sans
valeur sensible. Le deploiement des fonctions et la creation/modification des Cron
restent des actions separees et approuvees.

## GitHub Pages

Le job `build` execute la campagne statique et navigateur, construit `site-dist/`,
valide son manifeste, puis l'upload. Le job `deploy` ne consomme que cet artefact.
Un push sur `main` ne publie jamais Pages. Seul un `workflow_dispatch` ciblant `main`
est admis; le job `readiness` exige la phrase exacte de la release et atteste
separement migrations `01-05`, huit Edge Functions, smoke tests backend/Edge, accord
explicite, rotation des credentials inventories et scan complet de l'historique Git.
`build` et `postgresql-17` dependent de ce gate; la protection de
l'environnement `github-pages` reste compatible et peut ajouter une approbation.

Apres publication, verifier notamment que les URL `supabase/`, `.github/`, `docs/`,
`scripts/` et un exemple `*.sql` ne sont pas servis.

## Criteres d'arret

Stopper la sequence et suivre `ROLLBACK.md` si: migration inattendue, precontrole non
nul, contrat RPC/Edge divergent, fuite dans les logs, refus d'autorisation absent,
session non revocable, Pages contenant un chemin interdit ou resultat Discord
incertain non confine.

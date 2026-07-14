# Plan de tests Alpha 0.13.0

## Regle de preuve

Un fichier de test ou un test statique ne vaut pas execution sur une base. Chaque
rapport doit indiquer commande, environnement, date et resultat. Les tests SQL/RLS,
concurrence et restauration sont **a executer sur une base isolee**; le RC ne pretend
pas qu'ils l'ont deja ete.

## Campagne locale sans base

```powershell
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
git diff --check
```

Couverture attendue:

- syntaxe, lint, version/cache et validation YAML;
- scan de l'arbre courant, logs sensibles, sinks XSS et persistence interdite;
- contrats statiques migrations, `search_path`, grants/revokes et signatures RPC/Edge;
- unitaires UI/dialogue/focus, session-store, domaines et redaction logger;
- Edge simule: auth/CORS, corps 400/413, mentions, snapshots, retries, timeout, deadline;
- build/manifeste des 20 fichiers Pages et refus des chemins techniques;
- Playwright desktop/mobile servi depuis `site-dist/`: joueur, Officier, SuperAdmin,
  refus, expiration, clavier, modales, responsive, CSP et axe serious/critical.

Les mocks doivent refuser tout appel inattendu; aucun webhook ou projet distant reel.
Le scan de l'historique complet est une operation separee decrite dans
`GIT_HISTORY_CLEANUP.md`; le scanner npm courant ne doit pas etre presente comme une
preuve sur tous les objets Git.

## Campagne base isolee

Appliquer le schema/migrations sur une restauration anonymisee ou une stack locale:

- precontroles et ordre pretransition, `01-05`, `06`, puis `07` separement;
- scripts `supabase/tests/database/01_security_contracts.sql`,
  `02_session_identity.sql`, `03_discord_concurrency.sql`;
- ouverture/restauration/expiration/revocation joueur et admin;
- mauvais credential, verrouillage, compte inconnu/inactif/suspendu, messages generiques;
- usurpation d'un autre `joueur_id`, escalation Officier vers SuperAdmin et champs
  Discord reserves;
- CRUD joueurs/competitions/dates, presences atomiques et journalisation;
- RLS et privileges comme `anon`, `authenticated`, `service_role` selon contrat;
- appels directs tables/RPC historiques refuses apres `06`;
- deux transactions concurrentes de presence et deux claims Discord concurrents;
- snapshot/fragment partiel, timeout incertain, retry/backoff et finalisation complete;
- compensation de chaque lot et restauration backup/PITR.

Utiliser uniquement des fixtures fictives. Ne jamais executer ces cas destructifs en
production.

## Smoke tests production apres approbation

- HTTP, version/cache, CSP, dependance Supabase auto-hebergee, favicon et chemins techniques 404.
- Parcours des trois roles, session/deconnexion/revocation et refus d'autorisation.
- Lecture/ecriture metier minimale controlee avec comptes de test approuves.
- Edge/Cron verifies un par un avec mocks ou canal de test; aucun rappel reel non prevu.
- Logs rediges observes durant deux intervalles Cron et statut de maintenance quotidien.

## Matrice de sortie

| Domaine | Preuve requise avant GO |
| --- | --- |
| Frontend/Pages | `npm test`, Playwright desktop/mobile, manifeste exact |
| SQL/RPC/RLS | Execution base isolee et rapport de privileges |
| Discord/Cron | Tests simules + concurrence base isolee |
| Sauvegarde | Restauration isolee verifiee |
| Secrets | Rotations manuelles confirmees, aucun secret dans rapport |
| Production | Smoke tests post-deploiement approuve |

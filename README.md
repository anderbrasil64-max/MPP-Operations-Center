# MPP Operations Center

Application statique de gestion des joueurs, presences, competitions et automatisations
Discord. Le navigateur est servi par GitHub Pages; PostgreSQL, RPC, Edge Functions et
Cron sont executes par Supabase.

Version candidate locale: **Alpha 0.13.0 - Security & Reliability**.

> Cette branche est un release candidate. Les migrations `01-07` ne sont pas reputees
> appliquees et les tests SQL/RLS sur base isolee ne sont pas reputes executes tant que
> la checklist de release ne les a pas explicitement valides.

## Architecture en bref

- `index.html`, `style.css`, `app.js`: shell statique et orchestration des parcours.
- `js/`: configuration publique, stockage de session, UI accessible et domaines.
- `supabase.js`: adaptateur navigateur unique vers RPC et Edge Functions; apres le
  cutover `06`, aucun acces direct aux tables n'est requis par le navigateur.
- `supabase/migrations/`: pretransition et migrations compatibles `01-05`.
- `supabase/postdeploy-migrations/`: cutover `06` et nettoyage irreversible `07`,
  deliberement exclus d'un `db push` initial.
- `supabase/rollback/`: compensations par lot et compensations de cutover.
- `supabase/functions/`: huit Edge Functions versionnees et helpers partages.
- `supabase/tests/`, `tests/`: contrats SQL, unitaires, securite, Edge, navigateur et
  accessibilite. Les tests SQL necessitent une base isolee.
- `scripts/`: controles deterministes et construction Pages en liste blanche.

## Sessions courtes

- Joueur: pseudo + code d'acces, jeton opaque dont seul le hash est en base, duree
  absolue de 12 h et inactivite de 2 h. Le jeton est limite a l'onglet via
  `sessionStorage`; seul le pseudo peut etre memorise separement sur choix explicite.
- Officier/SuperAdmin: elevation depuis une session joueur active, credential presente
  une seule fois, jeton admin en memoire JavaScript seulement, duree absolue de 2 h et
  expiration apres 15 min d'inactivite.
- Chaque RPC revalide le compte actif, la version d'authentification et, pour les
  operations admin, le role. Fermer ou revoquer une session invalide le jeton serveur.

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Verification locale

Reference CI: Node.js 24; le paquet refuse les versions inferieures a 20.

```powershell
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

`npm test` n'applique aucune migration et ne doit jamais modifier les donnees de
production. Les tests navigateur utilisent des reponses Supabase simulees.

## GitHub Pages

```powershell
npm.cmd run build
npm.cmd run test:artifact
```

Le workflow charge uniquement `site-dist/`. Son manifeste exact de 20 fichiers est
controle avant upload; migrations, fonctions serveur, docs, tests et scripts ne sont
jamais publies.

## Supabase

Toute operation distante demande un accord explicite. Lecture et dry-run autorises:

```powershell
npx.cmd supabase@latest migration list --linked
npx.cmd supabase@latest db push --dry-run --linked
```

Ne pas lancer le push reel depuis un worktree non revu. Suivre
[docs/MIGRATIONS.md](docs/MIGRATIONS.md),
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) et
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

L'exploitation quotidienne et les incidents sont couverts par
[docs/OPERATIONS.md](docs/OPERATIONS.md) et
[docs/INCIDENT_RUNBOOK.md](docs/INCIDENT_RUNBOOK.md).

Les incidents de securite se signalent en prive selon [SECURITY.md](SECURITY.md).

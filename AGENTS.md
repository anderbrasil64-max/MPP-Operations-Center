# MPP Operations Center - Regles permanentes des agents

Ce fichier s'applique a tout le depot. Il privilegie la securite, les changements
reversibles et une exploitation compréhensible par une petite equipe.

## Interdictions absolues

- Ne jamais placer de mot de passe, jeton, webhook, cle privee, cle `service_role`,
  secret Cron ou identifiant de base dans Git, les logs, les commandes, les fixtures,
  les captures ou les rapports.
- La cle Supabase publiable peut etre livree au navigateur; elle ne constitue jamais
  une autorisation. Toute autorisation est verifiee cote serveur.
- Ne jamais stocker un mot de passe dans `localStorage`, `sessionStorage`, un cookie,
  IndexedDB, le DOM ou un fichier. Ne jamais journaliser un jeton de session, un
  en-tete `Authorization`, des parametres RPC complets ou un objet utilisateur complet.
- Ne jamais injecter une donnee navigateur, joueur, Discord, Supabase ou RPC dans du
  HTML ou du JavaScript construit. Utiliser `textContent`, les API DOM et
  `addEventListener`; interdire `eval`, `new Function` et les handlers inline.

## Controle des changements

- Sans accord explicite du proprietaire: aucun commit, push, PR, deploiement Pages ou
  Edge, changement de Cron/secret, migration, `migration repair` ou reecriture Git.
- Avant toute migration distante: verifier l'historique, lancer
  `npx.cmd supabase@latest db push --dry-run --linked`, comparer la liste exacte au lot
  approuve, puis s'arreter si elle differe. Ne jamais ajouter `--yes` en production.
- Respecter l'ordre documente dans `docs/MIGRATIONS.md`: preconditions et rotation,
  migrations `01` a `05`, Edge et frontend compatibles, cutover `06`, observation,
  puis nettoyage irreversible `07` dans une fenetre distincte.
- Une migration doit etre transactionnelle quand possible, avoir des precontroles,
  des tests, un ordre de deploiement et une compensation. Une compensation ne doit
  jamais restaurer une surface publique ou un credential en clair.
- Ne pas ecraser, restaurer ou reinitialiser le travail local d'un autre utilisateur
  ou worktree. Adapter les changements au code present.

## Contrats applicatifs

- Les ecritures joueur utilisent l'identite issue d'une session serveur, jamais un
  pseudo fourni comme preuve. Les actions admin revalident session, statut et role.
- Le code d'acces joueur n'est presente qu'a l'ouverture de session. Le jeton joueur
  opaque est limite a l'onglet (`sessionStorage`); le jeton admin reste uniquement en
  memoire JavaScript. Aucun credential admin n'est conserve apres elevation.
- Une RPC `SECURITY DEFINER` n'est admise que si necessaire: objets qualifies,
  `search_path` controle, parametres bornes, `REVOKE ... FROM PUBLIC`, droits minimaux,
  reponse sans donnee sensible et tests positifs/negatifs.
- Les roles `anon` et `authenticated` ne recoivent aucun droit de table inutile. RLS
  et privileges SQL sont deux controles distincts et tous deux doivent etre testes.
- Les Edge Functions utilisent les secrets du runtime, des corps bornes, CORS adapte
  au type d'appel, logs rediges, idempotence et `service_role` seulement si requis.
- Les huit fonctions versionnees et leur authentification sont inventoriees dans
  `docs/EDGE_CI.md`. Aucun test ne doit envoyer un vrai message Discord.
- GitHub Pages publie exclusivement l'artefact `site-dist/` en liste blanche. La
  racine du depot, `supabase/`, les migrations, tests, scripts et docs sont interdits.

## Version et verification

- Toute modification runtime met a jour la version visible et le cache-busting de
  chaque fichier charge modifie. Documentation seule: pas de changement de version.
- Utiliser Node.js 24 comme reference CI. Sous PowerShell, utiliser `npm.cmd` et
  `npx.cmd`.
- Avant proposition de publication: `git diff --check`, syntaxe, lint, tests unitaires,
  controles SQL statiques, scan de secrets/logs, build et manifeste Pages, tests Edge,
  Playwright desktop/mobile, clavier et accessibilite.
- Les tests SQL/RLS/RPC/concurrence doivent tourner sur une base isolee restauree d'un
  schema representatif. Ne jamais substituer des ecritures de production.
- Apres un deploiement approuve: verifier HTTP, version/cache, chemins techniques 404,
  trois roles, sessions/revocation, Edge/Cron et logs rediges.

## Rapport final obligatoire

Lister les fichiers, migrations et ordre, compensations, tests resultat par resultat,
tests non executes avec raison, dry-run, deploiement/rollback, rotations manuelles,
risques residuels et verdict `GO`, `GO SOUS CONDITIONS` ou `NO-GO`. Confirmer
explicitement commit, push, migration, deploiement et modification de secrets.

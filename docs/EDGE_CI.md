# Edge Functions et CI

## Inventaire versionne: huit fonctions

Toutes sont configurees avec `verify_jwt = false`; cela ne constitue jamais une
autorisation. Chaque fonction applique le mecanisme specifique ci-dessous.

| Fonction | Appelant | Authentification applicative |
| --- | --- | --- |
| `rappel-presences-discord` | Cron Supabase | secret Cron dedie, comparaison constante |
| `discord-presences-staff` | Cron Supabase | secret Cron dedie, comparaison constante |
| `auto-statut-competitions` | Cron Supabase | secret Cron dedie, comparaison constante |
| `maintenance-securite` | Cron Supabase | secret Cron dedie, comparaison constante |
| `discord-link-code` | Navigateur | origine autorisee + session joueur validee par RPC |
| `discord-link-admin` | Navigateur | origine autorisee + session admin validee par RPC |
| `discord-link-interactions` | Discord | signature Ed25519 + fenetre temporelle de cinq minutes |
| `discord-register-commands` | Operateur restreint | secret operateur dedie, comparaison constante |

Les noms de variables sont dans `ENVIRONMENT_VARIABLES.md`; aucune valeur n'est
versionnee. Le `service_role` n'est utilise que dans le runtime Edge.
Le code de liaison est derive par HMAC-SHA-256 avec une cle de 32 octets UTF-8
minimum. L'identifiant d'operation, la session, la cle et le code en clair ne sont
ni journalises ni persistants; seul le hash necessaire au rapprochement est stocke.

## Contrat de livraison Discord du RC

1. La cle metier quotidienne `(type, competition, date)` est reservee atomiquement
   avec un `execution_id` et un lease borne. L'heure programmee reste une metadonnee
   modifiable et ne peut pas provoquer un second envoi le meme jour.
2. Le premier traitement fige une liste ordonnee de fragments en base. Le contenu
   immutable, son empreinte et le nombre de fragments constituent le snapshot.
3. Chaque fragment est reserve, envoye au plus selon son etat, puis enregistre avec un
   resultat non sensible. Un fragment deja envoye n'est pas rejoue.
4. La finalisation `envoye` est refusee tant que tous les fragments attendus ne sont pas
   confirmes. Un timeout reseau devient incertain et exige une revue, pas un retry
   aveugle.
5. Les transitions `busy`, backoff, echec permanent et revue manuelle bornent les runs
   concurrents et le spam.

Les signatures TypeScript et SQL doivent etre comparees automatiquement avant toute
publication. Cette documentation decrit le contrat cible; elle ne remplace ni le test
statique ni le test de concurrence sur base isolee.

Seuls les identifiants Discord valides explicitement associes a un fragment peuvent
etre places dans `allowed_mentions.users`; `parse` reste vide. Les messages staff n'ont
aucune mention. Noms et textes metier neutralisent les syntaxes de mention/formatage.

Les reponses Discord 400/401/403/404 sont terminales. Le 429 respecte `Retry-After`
dans un budget borne et peut etre retente. Une reponse 5xx ne fait l'objet que d'une
seule tentative HTTP: son resultat est incertain et aucun retry aveugle n'est lance.
Les erreurs reseau/timeouts sont egalement classees incertaines. Les runs Cron ont
une deadline et refusent les executions trop tardives.

## Gates CI

- Dependances npm, runtime Deno et GitHub Actions epingles.
- Syntaxe, lint, scans secrets/logs, contrats migrations/RPC et tests unitaires.
- Deno `fmt --check`, `lint` et `check` sur les huit fonctions et `_shared`.
- Tests Edge sans reseau reel: auth, CORS, tailles de corps, erreurs, mentions,
  snapshots, retries/deadlines et matrice `verify_jwt`.
- Build et validation de l'artefact exact `site-dist/`.
- Playwright desktop/mobile sert `site-dist/`, avec mocks Supabase/Discord.
- Le dispatch manuel du workflow Pages est refuse hors `main`.

Les tests de concurrence RPC et de transition d'etat requierent une base isolee; leur
existence dans `supabase/tests/` ne prouve pas leur execution.

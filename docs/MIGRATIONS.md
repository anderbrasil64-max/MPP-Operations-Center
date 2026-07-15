# Procedure de migrations Alpha 0.13.0

## Principes

- La production n'est jamais un environnement de test de migration.
- Toute execution distante exige backup/PITR verifie, restauration repetee en
  environnement isole, revue du SQL, dry-run lie et accord explicite.
- `01-05` sont additifs/compatibles. `06` ferme l'ancienne surface apres deploiement
  compatible. `07` supprime les colonnes/RPC historiques et est irreversible par
  simple script.
- Les migrations `06` et `07` restent dans `supabase/postdeploy-migrations/`; elles ne
  doivent pas apparaitre dans le premier `db push`.
- Le gate automatise repete toute la chaine jusqu'a `07` uniquement sur une base
  PostgreSQL 17 jetable et locale. Il ne fusionne pas les fenetres `06` et `07` de la
  release reelle et ne possede aucun chemin vers une base distante.

## Ordre obligatoire

| Phase | Fichier | Objectif | Condition avant execution | Compensation |
| --- | --- | --- | --- | --- |
| Prerequis | `20260714010811_alpha_0_12_8_1_remove_privileged_password_fallbacks.sql` | Retirer les valeurs de secours des RPC historiques pendant la transition | Rotation terminee; aucun compte privilegie actif sans credential personnel | Forward fix uniquement; ne jamais restaurer une valeur exposee |
| 01 | `20260714090000_alpha_0_13_0_01_security_foundation.sql` | `app_private`, hashes, sessions, tentatives, evenements, defaults de privileges | `pgcrypto` installe; schema representatif sauvegarde | `alpha_0_13_0_01_foundation_compensation.sql` confine et conserve les donnees additives |
| 02 | `20260714091000_alpha_0_13_0_02_identity_integrity_expand.sql` | `joueur_id`, identite date, backfills, FK, unicites et triggers transitoires | Aucun doublon/orphelin bloquant, notamment pseudo/Discord/date | `alpha_0_13_0_02_identity_compensation.sql`: forward recovery, contraintes conservees |
| 03 | `20260714092000_alpha_0_13_0_03_short_lived_sessions.sql` | Ouverture/restauration/fermeture/rotation de sessions et rate limiting | 01-02 valides | `alpha_0_13_0_03_sessions_compensation.sql` revoque les nouvelles API de session |
| 04 | `20260714093000_alpha_0_13_0_04_session_application_apis.sql` | Passerelles `api_joueur_site` et `api_admin_site` transactionnelles | 03 valide; contrats JSON frontend revus | `alpha_0_13_0_04_apis_compensation.sql` revoque les passerelles |
| 05 | `20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql` | Reservations/fragments Discord, liaison, auto-statut et maintenance | Contrats Edge/RPC identiques et tests concurrence isoles | `alpha_0_13_0_05_edge_compensation.sql` revoque les RPC `service_role` |
| 06 | `20260714100000_alpha_0_13_0_06_privileges_and_rls_cutover.sql` | Revoquer tables/sequences/RPC historiques et policies publiques | Frontend + huit Edge Functions 0.13 en production et smoke tests verts | `alpha_0_13_0_cutover_compensation.sql`, sans restaurer les tables publiques |
| 07 | `20260714101000_alpha_0_13_0_07_legacy_cleanup.sql` | Supprimer RPC et colonnes credentials/cles metier historiques | Observation stable; zero session admin active; backup restaure et teste | Pas de rollback SQL complet: restauration PITR isolee ou forward recovery |

`alpha_0_13_0_predeploy_compensation.sql` sert uniquement apres application partielle
de `01-05`: il desactive les nouveaux endpoints sans supprimer les ajouts de donnees.

## Bootstrap propriétaire après 01

Le premier code d'accès 0.13 ne peut pas dépendre d'une session qui n'existe pas
encore. Immédiatement après `01`, avant toute ouverture de session, le propriétaire SQL
doit provisionner **un seul SuperAdmin actif existant** via
`app_private.initialiser_code_acces_joueur(bigint)`. La fonction génère elle-même
192 bits aléatoires avec `pgcrypto`, retourne le code hexadécimal en clair une seule
fois, puis ne conserve que son hash. Elle refuse avec le même message tout autre rôle,
tout compte inactif, tout identifiant invalide, tout hash déjà présent et tous les rôles
API, y compris `service_role`.

Procédure exacte avec `psql` 17 interactif connecté comme propriétaire de la fonction:

```text
\set ON_ERROR_STOP on
\set ECHO none
\pset pager off
select id, pseudo, statut, roles, (code_acces_hash is not null) as code_configure
from public.joueurs
where lower(btrim(statut))='actif'
  and exists (
    select 1 from regexp_split_to_table(coalesce(roles,''), ',') as r(role_value)
    where lower(btrim(r.role_value))='superadmin'
  )
order by id;
select app_private.initialiser_code_acces_joueur(12345::bigint);
\q
```

Remplacer uniquement `12345` par l'identifiant numérique choisi. La requête ne contient
aucun credential: le code est généré dans PostgreSQL et apparaît uniquement dans le
résultat. L'enregistrer immédiatement et directement dans le gestionnaire de mots de
passe, quitter `psql`, exécuter `Clear-Host`, puis fermer le terminal afin d'effacer son
historique visuel. Ne jamais rediriger ou copier ce résultat dans un fichier, le SQL
Editor, Git, un chat ou un journal. Une seconde exécution est refusée. Si le résultat
unique est perdu, arrêter la release et restaurer le point pré-bootstrap en environnement
isolé ou préparer un forward recovery owner-only séparément revu; ne jamais remettre le
hash à `NULL` à la main.

Le compte cible doit déjà posséder son credential administratif personnel; `01` en a
migré le hash sans réutiliser cette valeur comme code joueur.

Après ce bootstrap, utiliser la session SuperAdmin 0.13 pour attribuer les autres codes.
Avant `06`, les deux précontrôles suivants doivent être à zéro:

- joueur actif sans hash de code d'accès;
- compte privilégié actif sans hash administratif.

## Verification CLI

```powershell
npx.cmd supabase@latest migration list --linked
npx.cmd supabase@latest db push --dry-run --linked
```

Le dry-run doit afficher uniquement le lot approuve. S'il inclut `06`, `07`, une
migration inconnue ou un historique divergent, s'arreter. Aucun `repair` pendant une
release.

## Gate automatise PostgreSQL 17

`npm run test:database` refuse toute execution sans
`MPP_ALLOW_EPHEMERAL_DATABASE=1`, toute URI `DATABASE_URL`, tout service libpq, tout
hote non-loopback et toute base administrative autre que `postgres`. Il cree une base
au nom aleatoire, execute les controles, la supprime avec force puis retire uniquement
les roles de test qu'il a lui-meme crees.

L'ordre du runner est bloquant et teste par `tests/unit/database-runner.test.mjs`:

1. Creer un role de deploiement jetable, proprietaire uniquement de sa base de test,
   sans superdroits, `CREATEDB`, `CREATEROLE`, `BYPASSRLS` ni appartenance a
   `supabase_admin`; executer `01-05` puis `06` sous ce role et verifier les ACL des
   objets existants et futurs. Les privileges par defaut des migrations s'appliquent
   implicitement au role courant, jamais a un proprietaire externe nomme. Le droit
   global `EXECUTE` de `PUBLIC` est retire avant les restrictions par schema, car un
   retrait limite a un schema ne peut pas annuler ce droit global PostgreSQL.
2. Charger la fixture representative 0.12.8, le prerequis 0.12.8.1 puis `01-05`.
3. Exécuter le contrat owner-only du bootstrap juste après `01`.
4. Générer en mémoire des hashes synthétiques non suivis par Git pour les précontrôles.
5. Injecter sur les sept tables un drift volontaire de grants et policies aux noms
   arbitraires, puis appliquer le cutover `06`.
6. Exécuter une course réelle de réservation Discord avec deux processus `psql`.
7. Exécuter avant nettoyage les tests SQL `01_security_contracts`,
   `02_session_identity`, `03_discord_concurrency`, `04_admin_authorization`,
   `05_release_state_retention` et `06_admin_idempotency`, puis
   `tests/sql/security-definers.sql`.
8. Appliquer le nettoyage `07`.
9. Vérifier le contrat adapté de phase 7: fonctions et colonnes legacy absentes, puis
   rejouer les cinq tests fonctionnels compatibles post-nettoyage.
10. Dans sept bases fraîches supplémentaires, exécuter chaque compensation `01` à `05`,
   la compensation prédeploy et la compensation cutover à leur phase exacte; vérifier
   les révocations, puis rejouer le chemin forward supporté.

`05_release_state_retention.sql` et `tests/sql/security-definers.sql` restent
volontairement pre-nettoyage: le premier exige la phase 6 et le second exige
`app_private.initialiser_code_acces_joueur`, que `07` doit supprimer. Le contrat adapte
post-nettoyage exige cette suppression au lieu de recreer artificiellement la fonction.

Le workflow Pages execute ce runner dans son propre service `postgres:17`; le job
`deploy` depend explicitement de `postgresql-17` et du build. Aucune migration distante,
aucun secret PostgreSQL et aucune donnee reelle ne sont utilises par ce gate.

## Tests manuels obligatoires sur base isolee

- Appliquer le lot depuis un schema production-like et verifier les precontroles.
- Tester les trois roles, expirations/revocations, usurpation, escalation, concurrence
  presences/Discord, RLS, privileges tables/colonnes/sequences/fonctions.
- Répéter les migrations déclarées idempotentes et chaque compensation appropriée;
  le gate CI doit fournir la preuve des sept scénarios isolés et de leur rejeu forward.
- Restaurer le backup dans l'environnement isole et verifier son exploitabilite.

La presence de ces fichiers de test ne constitue pas une preuve d'execution. Le
rapport de release doit enregistrer environnement, date et resultat sans donnee reelle.

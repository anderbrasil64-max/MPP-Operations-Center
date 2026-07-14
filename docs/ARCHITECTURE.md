# Architecture Alpha 0.13.0

## Vue d'ensemble

```text
Navigateur / GitHub Pages (site-dist, fichiers statiques)
  |-- ouverture/restauration de session joueur (credential presente une fois)
  |-- elevation de session admin (credential admin presente une fois)
  |-- api_joueur_site / api_admin_site (jeton opaque)
  `-- Edge Functions de liaison Discord (jeton opaque)

Supabase PostgreSQL
  |-- public: RPC d'entree et tables metier verrouillees au cutover
  |-- app_private: hashes, sessions, tentatives, evenements, fragments Discord
  |-- transactions/FK/unicites/journalisation
  `-- service_role: RPC reservees aux Edge Functions

Supabase Cron
  `-- Edge Function authentifiee par secret dedie
       |-- reservation atomique / snapshot de message
       |-- webhook ou API Discord
       `-- resultat/finalisation en base
```

## Frontend statique

- `index.html`: shell, CSP, chargement differe et versions de cache.
- `app.js`: navigation et orchestration des parcours.
- `supabase.js`: transport unique vers RPC et Edge Functions; pas de decision
  d'autorisation locale.
- `js/config.js`: configuration publique et version, jamais un secret prive.
- `js/session-store.js`: jeton joueur limite a l'onglet et jeton admin en memoire.
- `js/dialog.js`, `js/ui.js`: construction DOM sure, focus et dialogues accessibles.
- `js/joueurs.js`, `js/presences.js`, `js/competitions.js`, `js/discord.js`,
  `js/journal.js`: regles de presentation et utilitaires de domaine.
- `js/logger.js`: evenements minimaux et rediges.

Le navigateur charge la cle Supabase publiable, qui est un identifiant public. Les
permissions reposent exclusivement sur les sessions serveur, RPC, privileges SQL et
RLS. Apres la migration `06`, aucun droit direct de table n'est necessaire.

## Sessions

### Joueur

1. Le navigateur envoie pseudo et code d'acces a `ouvrir_session_joueur_site`.
2. La base applique une reponse generique, limitation des tentatives, compte actif et
   verification bcrypt.
3. Un jeton aleatoire opaque est retourne; seule son empreinte SHA-256 est stockee.
4. Le navigateur conserve le jeton dans `sessionStorage`, donc dans l'onglet courant.
5. Duree serveur: 12 h absolues, 2 h d'inactivite. Les appels et restaurations
   revalident compte, `auth_version` et expirations.

Le pseudo peut etre memorise separement dans `localStorage` sur choix utilisateur. Il
n'est ni une session ni une preuve d'identite.

### Officier / SuperAdmin

1. Une session joueur active est obligatoire.
2. `ouvrir_session_admin_site` recoit le credential admin uniquement lors de
   l'elevation et verifie le role actif cote serveur.
3. Le jeton admin reste uniquement dans une variable JavaScript; aucun stockage
   persistant ou DOM.
4. Duree serveur: 2 h absolues, 15 min d'inactivite. L'UI avertit avant expiration et
   supprime l'etat admin a l'expiration, au refus serveur ou a la deconnexion.

Une rotation de credential incremente la version d'authentification et revoque les
sessions concernees. Une session ne contient jamais le credential lui-meme.

## API et donnees

- `api_joueur_site`: profil minimal, competitions autorisees, presences du joueur et
  sauvegarde derivee du `joueur_id` de session.
- `api_admin_site`: lectures et mutations Officier/SuperAdmin; chaque action verifie
  statut et role serveur. Les mutations portent un identifiant d'operation UUID,
  sont rejouables sans double effet apres un timeout et conservent atomiquement leur
  resultat prive. Les champs reserves SuperAdmin ne sont pas exposes a un Officier.
- `app_private.admin_operations`: ne conserve ni jeton ni payload, seulement la
  liaison acteur/session/action, une empreinte salee, le resultat non sensible et une
  echeance de sept jours. La maintenance securite doit purger les lignes expirees.
- Le navigateur retente une mutation une seule fois avec le meme UUID. Si les deux
  appels expirent, il ne relance pas l'action et demande de rafraichir puis verifier
  l'etat metier avant toute nouvelle tentative.
- `app_private`: schema non expose contenant sessions, tentatives, evenements et
  fragments de livraison. `PUBLIC`, `anon` et `authenticated` n'y ont pas acces.
- Les anciennes RPC a pseudo/mot de passe sont revoquees au cutover et supprimees lors
  du nettoyage `07`.

## Edge Functions et Discord

Huit fonctions sont versionnees: quatre fonctions Cron, trois parcours de liaison/
interaction et une fonction operateur de commandes. Leur matrice d'authentification
est dans `EDGE_CI.md`.

Les rappels utilisent une cle metier unique, une reservation avec lease, des fragments
figes et une finalisation explicite. Un resultat reseau incertain n'est pas rejoue
aveuglement. Les mentions sont limitees a une liste d'identifiants validee; les noms
et textes metier sont neutralises avant envoi.

## Publication

`scripts/build-site.mjs` copie une liste blanche dans `site-dist/`. Le validateur exige
exactement 20 fichiers runtime et refuse notamment `supabase/`, `.github/`, SQL,
TypeScript serveur, tests, scripts, docs, sauvegardes, `.env` et cles privees. Le
workflow Pages charge `site-dist/`, jamais la racine du depot.

## Frontieres de confiance

- Non fiables: navigateur, pseudo, roles affiches, noms, Discord, payload JSON, messages
  RPC et en-tetes non authentifies.
- Authentifies applicativement: jetons opaques de session, secrets Cron, signature
  Discord ou secret operateur selon la fonction.
- Privilegie: `service_role`, uniquement dans le runtime Edge.
- Les logs, erreurs UI et documents ne contiennent aucun credential, jeton ou donnee
  personnelle reelle.

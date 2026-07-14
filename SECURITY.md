# Politique de securite

## Signalement

Ne pas ouvrir d'issue publique contenant des donnees joueur, identifiants Discord,
payloads d'exploitation ou informations d'authentification. Contacter le proprietaire
en prive avec la version, un scenario minimal et des donnees fictives ou redigees.

## Modele de confiance

- La cle Supabase publiable identifie l'application, pas un utilisateur.
- Un pseudo, un role affiche ou un parametre JSON navigateur n'est jamais une preuve
  d'identite ou d'autorisation.
- Les API joueur et admin derivent l'identite d'un jeton opaque court; la base conserve
  son empreinte, verifie expiration, inactivite, statut et version d'authentification.
- Les credentials sont stockes sous forme de hash bcrypt via `pgcrypto`; aucune valeur
  de secours n'est admise dans le code actif.
- Les RPC privilegiees et Edge RPC revoquent `PUBLIC` et accordent uniquement les roles
  necessaires. RLS ne remplace pas les privileges de table/colonne.

## Secrets et logs

- Aucun `.env`, mot de passe de base, cle privee, cle `service_role`, token Discord,
  webhook, secret Cron, pepper ou access token dans Git, chat, captures ou fixtures.
- Les noms des variables peuvent etre documentes; leurs valeurs restent dans le
  gestionnaire du fournisseur.
- Le navigateur ne persiste aucun credential admin. Le jeton admin reste en memoire;
  le jeton joueur est limite a l'onglet. Les logs excluent jetons, en-tetes, parametres
  RPC et objets utilisateur complets.
- Toute valeur historiquement publiee est presumee compromise jusqu'a rotation, meme
  apres une reecriture Git.

## Regles de developpement

- Pas d'ecriture directe des tables depuis le navigateur apres le cutover.
- `SECURITY DEFINER` uniquement avec justification, objets qualifies, `search_path`
  vide/controle, entrees bornees et tests d'autorisation negatifs.
- Donnees non fiables rendues par API DOM et `textContent`; pas de HTML/JavaScript
  construit, `eval`, `new Function` ou handler inline.
- Edge: authentification applicative explicite, origine bornee pour le navigateur,
  corps limite, logs rediges, timeout, idempotence et reprise controlee.
- Migration production: backup/PITR verifie, dry-run, accord explicite, test isole,
  smoke tests et compensation documentee.

## Reponse a incident

1. Preserver les preuves et consigner uniquement des codes/messages rediges.
2. Avec accord, contenir le composant concerne: session, fonction, Cron ou Pages.
3. Revoquer les sessions et faire tourner toute categorie de secret exposee.
4. Deployer le plus petit correctif securise, puis verifier les trois roles.
5. Reecrire l'historique Git uniquement apres rotation, sauvegarde et coordination.

Voir [docs/INCIDENT_RUNBOOK.md](docs/INCIDENT_RUNBOOK.md),
[docs/SECRET_ROTATION.md](docs/SECRET_ROTATION.md) et
[docs/GIT_HISTORY_CLEANUP.md](docs/GIT_HISTORY_CLEANUP.md).

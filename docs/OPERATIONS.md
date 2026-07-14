# Exploitation quotidienne

## Composants a surveiller

- GitHub Pages: dernier workflow, version/cache, manifeste `site-dist/` et HTTP.
- Sessions: taux de refus/verrouillage, expirations et volume d'evenements rediges.
- Base: erreurs RPC, integrite FK/unicite, croissance des tables privees et backups.
- Quatre fonctions Cron: rappel joueurs, resume staff, auto-statut et maintenance.
- Quatre fonctions Discord interactives/operateur: liaison code, liaison admin,
  interactions et enregistrement de commandes.

Les horaires Cron effectifs vivent dans Supabase et doivent etre inventories hors du
code. Une modification d'horaire, secret ou activation demande un accord explicite.

## Controle courant

- Quotidien: succes du Cron de maintenance, erreurs Edge redigees, rappels en etat
  permanent/incertain et disponibilite du site.
- Hebdomadaire: croissance sessions/tentatives/evenements/demandes, backups et alertes
  fournisseur, sans exporter de donnees personnelles.
- A chaque release: dry-run migrations, artifact Pages, huit fonctions, trois roles,
  refus directs et deux intervalles Cron observes. Un push `main` ne deploie pas
  Pages: le dispatch manuel n'est autorise qu'apres migrations `01-05`, fonctions Edge
  et smoke tests backend valides, rotation des credentials inventories et revue du
  scan complet des refs/objets Git, avec attestations et accord explicites.
- Apres rotation: ancienne valeur rejetee, fonctions dependantes nominales, sessions et
  codes en attente revoques si necessaire.

## Etats Discord a traiter

- `envoye` / aucun destinataire: terminal, aucune reprise.
- `busy` / backoff: laisser le lease ou le delai expirer.
- echec permanent: corriger la configuration avant reexecution approuvee.
- echec incertain / revue manuelle: verifier chez Discord avant toute reprise pour
  eviter un doublon.

## Diagnostic sans fuite

Conserver uniquement heure, fonction, code d'evenement, duree, statut HTTP et ID
technique non sensible si indispensable. Ne jamais copier contenu de message, objet
joueur, parametres RPC, jeton, header, webhook ou secret. Suivre
`INCIDENT_RUNBOOK.md` des qu'un impact utilisateur ou securite est confirme.

## Maintenance programmee

- Annoncer la fenetre et geler les changements concurrents.
- Verifier backup/restauration, checklist, dry-run et rollback.
- Pauser uniquement les Cron affectes.
- Reactiver un composant a la fois et observer avant le suivant.
- Clore avec un compte rendu redige et les risques residuels.

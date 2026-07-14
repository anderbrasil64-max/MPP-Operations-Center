# Changelog

## Alpha 0.13.0 - Security & Reliability (release candidate)

> Etat: prepare localement. Ce journal ne signifie ni migration appliquee, ni Edge
> Function deployee, ni test SQL/RLS execute sur une base isolee.

### Securite

- Prepare le remplacement des credentials en clair par des hashes bcrypt, sans mot de
  passe privilegie de secours, avec limitation des tentatives et evenements rediges.
- Ajoute des sessions opaques courtes: joueur lie a `joueur_id`, admin en memoire
  uniquement, expiration absolue/inactivite et revocation serveur.
- Remplace l'API navigateur par deux passerelles RPC sessionnelles; les decisions de
  role, statut et identite sont prises en base.
- Prepare le cutover qui retire les lectures/ecritures de tables, sequences et RPC
  historiques aux roles navigateur tout en conservant les API minimales.
- Supprime les sinks HTML et handlers inline identifies, ajoute CSP, dependance
  navigateur epinglee, auto-hebergee et logs rediges.

### Integrite et fiabilite

- Ajoute identifiants joueur/date, backfills, FK composites, unicites, controles de
  statut et synchronisation transitoire des anciens champs.
- Prepare des reservations Discord atomiques avec lease, fragments figes, empreinte,
  etats `en_cours/envoye/echec/incertain`, retries bornes et revue manuelle.
- Versionne les huit Edge Functions connues avec helpers communs de CORS,
  authentification, corps bornes, deadlines et logs securises.
- Prepare la maintenance de retention des sessions, tentatives, evenements et demandes
  Discord expirees; aucun Cron distant n'est cree ou modifie par le RC.

### Qualite et exploitation

- Modularise progressivement le frontend sans framework, ajoute dialogues accessibles,
  focus/clavier, responsive, metadonnees gestionnaire de mots de passe et favicon.
- Ajoute outillage npm epingle, tests statiques/unitaires/Edge/Playwright/accessibilite,
  contrats SQL, CI Deno et controles de securite.
- GitHub Pages construit un artefact exact de 20 fichiers en liste blanche, jamais la
  racine du depot.
- Ajoute documentation d'architecture, migrations `01-07`, compensations, deploiement,
  rollback, tests, exploitation, sauvegarde et rotation/nettoyage historique.

### Conditions de publication

- Rotation manuelle de toute categorie historiquement exposee.
- Credential personnel configure pour chaque compte privilegie actif et code d'acces
  configure pour chaque joueur actif.
- Migrations et compensations repetees sur une base isolee, y compris RPC/RLS,
  concurrence Discord et restauration.
- Publication dans l'ordre documente, cutover `06` apres frontend/Edge compatibles,
  puis nettoyage irreversible `07` dans une fenetre separee.

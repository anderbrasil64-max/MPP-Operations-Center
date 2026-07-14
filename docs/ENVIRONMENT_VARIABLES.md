# Inventaire des variables d'environnement

Noms uniquement. Les valeurs vivent dans le gestionnaire de secrets Supabase, ne sont
jamais copiees dans Git/chat/logs et doivent etre gerees selon `SECRET_ROTATION.md`.

## Runtime partage

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Jobs planifies

- `CRON_SECRET_RAPPEL_PRESENCES`
- `CRON_SECRET_PRESENCES_STAFF`
- `CRON_SECRET_AUTO_STATUT_COMPETITIONS`
- `CRON_SECRET_MAINTENANCE_SECURITE`
- `DISCORD_WEBHOOK_RAPPEL_PRESENCES`
- `DISCORD_WEBHOOK_STAFF`

## Liaison Discord et commandes

- `DISCORD_LINK_CODE_PEPPER`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_BOT_TOKEN`
- `DISCORD_REGISTER_COMMANDS_SECRET`

## Controle d'exploitation

- Verifier presence et proprietaire de chaque variable sans afficher sa valeur.
- Maintenir une date de rotation externe au depot.
- Tester une nouvelle valeur sur un environnement non productif, deployer la fonction
  concernee, puis revoquer l'ancienne.
- Aucune fonction ne doit utiliser une valeur de secours si la variable manque.
- `DISCORD_LINK_CODE_PEPPER` doit contenir au moins 32 octets UTF-8 d'entropie
  aleatoire. Une valeur absente ou trop courte bloque generiquement la generation
  de code sans etre journalisee.
- Aucun `.env` navigateur n'est accepte. La configuration publique de `js/config.js`
  ne contient que des valeurs livrables au client.

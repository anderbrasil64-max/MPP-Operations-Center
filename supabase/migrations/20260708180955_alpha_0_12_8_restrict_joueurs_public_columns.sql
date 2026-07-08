revoke all privileges on table public.joueurs from anon;
revoke all privileges on table public.joueurs from authenticated;

grant select (
  id,
  pseudo,
  roles,
  statut,
  discord_id,
  discord_username,
  discord_lie_a,
  derniere_connexion
) on table public.joueurs to anon;

grant select (
  id,
  pseudo,
  roles,
  statut,
  discord_id,
  discord_username,
  discord_lie_a,
  derniere_connexion
) on table public.joueurs to authenticated;

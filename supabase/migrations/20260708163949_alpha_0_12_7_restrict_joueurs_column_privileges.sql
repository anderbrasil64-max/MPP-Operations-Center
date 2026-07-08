revoke all privileges on table public.joueurs from anon;
revoke all privileges on table public.joueurs from authenticated;

revoke select (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from anon;

revoke select (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from authenticated;

revoke insert (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from anon;

revoke insert (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from authenticated;

revoke update (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from anon;

revoke update (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from authenticated;

revoke references (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from anon;

revoke references (
  id,
  pseudo,
  roles,
  statut,
  mot_de_passe,
  mot_de_passe_modifie,
  date_ajout,
  derniere_connexion,
  derniere_modification,
  discord_id,
  discord_username,
  discord_lie_a
) on table public.joueurs from authenticated;

grant select (
  id,
  pseudo,
  roles,
  statut,
  discord_id,
  discord_username,
  discord_lie_a,
  date_ajout,
  derniere_connexion,
  derniere_modification
) on table public.joueurs to anon;

grant select (
  id,
  pseudo,
  roles,
  statut,
  discord_id,
  discord_username,
  discord_lie_a,
  date_ajout,
  derniere_connexion,
  derniere_modification
) on table public.joueurs to authenticated;

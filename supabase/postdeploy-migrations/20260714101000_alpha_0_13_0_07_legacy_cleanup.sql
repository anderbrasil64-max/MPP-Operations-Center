begin;

do $$
begin
  perform 1
  from app_private.release_state
  where release_name = 'alpha_0_13_0'
    and phase in (6, 7)
  for update;
  if not found then
    raise exception 'Migration order violation: legacy cleanup requires completed cutover phase 06.';
  end if;
end;
$$;

lock table public.joueurs, app_private.sessions in share row exclusive mode;

do $$
begin
  if exists(
    select 1 from app_private.sessions
    where niveau='admin'
      and revoque_a is null
      and expire_a>now()
      and inactivite_expire_a>now()
  ) then
    raise exception 'Cleanup blocked: revoke active admin sessions during the maintenance window first.';
  end if;
  if exists(
    select 1 from public.joueurs
    where lower(btrim(coalesce(statut,'')))='actif'
      and (app_private.role_present(roles,'Officier') or app_private.role_present(roles,'SuperAdmin'))
      and (
        mot_de_passe_hash is null
        or octet_length(mot_de_passe_hash)<>60
        or mot_de_passe_hash!~'^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
      )
  ) then
    raise exception 'Cleanup blocked: privileged credential hash is missing or malformed.';
  end if;
  if not exists(
    select 1 from public.joueurs
    where lower(btrim(coalesce(statut,'')))='actif'
      and app_private.role_present(roles,'SuperAdmin')
  ) then
    raise exception 'Cleanup blocked: at least one active SuperAdmin must be preserved.';
  end if;
end;
$$;

drop function if exists public.enregistrer_connexion_joueur_site(text);
drop function if exists public.sauvegarder_presences_site(bigint,text,jsonb);
drop function if exists public.creer_competition_complete_site(text,text,jsonb);
drop function if exists public.modifier_competition_complete_site(text,text,jsonb);
drop function if exists public.ajouter_date_competition_site(text,text,bigint,date,text);
drop function if exists public.supprimer_date_competition_site(text,text,bigint);
drop function if exists public.supprimer_competition_site(text,text,bigint);
drop function if exists public.verifier_mot_de_passe_site(text,text);
drop function if exists public.changer_mot_de_passe_site(text,text,text);
drop function if exists public.ajouter_joueur_site(text,text,text,text,text,text);
drop function if exists public.modifier_joueur_site(text,text,bigint,text,text,text,text);
drop function if exists public.supprimer_joueur_site(bigint,text,text);
drop function if exists public.modifier_statut_competition_site(text,text,bigint,text);
drop function if exists app_private.initialiser_code_acces_joueur(bigint);
drop function if exists app_private.initialiser_code_acces_joueur(bigint,text);

-- Etape irreversible: une sauvegarde restauree en environnement isole est
-- exigee avant execution. Le bloc dynamique rend seulement le rejeu technique
-- possible apres suppression de la colonne; il ne recree aucune donnee.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='joueurs' and column_name='mot_de_passe'
  ) then
    execute 'update public.joueurs set mot_de_passe=null where mot_de_passe is not null';
  end if;
end;
$$;
alter table public.joueurs drop column if exists mot_de_passe;
alter table public.joueurs drop column if exists mot_de_passe_modifie;

drop index if exists public.idx_joueurs_discord_id;
alter table public.joueurs drop constraint if exists joueurs_pseudo_key;
drop index if exists public.idx_joueurs_pseudo;
drop index if exists public.idx_dates_competition_competition_date;
drop index if exists public.idx_dates_competition_competition_id;

alter table public.presences drop constraint if exists presences_competition_id_pseudo_date_competition_key;
drop index if exists public.idx_presences_competition_pseudo_date;
drop index if exists public.idx_presences_competition_pseudo;
drop index if exists public.idx_presences_pseudo;

delete from app_private.auth_attempts where derniere_tentative_a < now()-interval '30 days';
delete from app_private.sessions where coalesce(revoque_a,expire_a) < now()-interval '30 days';
delete from app_private.security_events where cree_a < now()-interval '365 days';

update app_private.release_state
set phase = 7,
    phase_name = 'legacy_cleanup',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (6, 7);

commit;

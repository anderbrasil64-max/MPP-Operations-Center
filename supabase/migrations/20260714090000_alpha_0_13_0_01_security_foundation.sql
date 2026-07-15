begin;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pgcrypto'
  ) then
    raise exception 'Precondition failed: pgcrypto must be installed before Alpha 0.13.0.';
  end if;
end;
$$;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table if not exists app_private.release_state (
  release_name text primary key,
  phase smallint not null check (phase between 0 and 7),
  phase_name text not null,
  updated_at timestamptz not null default now()
);

insert into app_private.release_state (release_name, phase, phase_name)
values ('alpha_0_13_0', 0, 'foundation_pending')
on conflict (release_name) do nothing;

do $$
begin
  if not exists (
    select 1
    from app_private.release_state
    where release_name = 'alpha_0_13_0'
      and phase in (0, 1)
  ) then
    raise exception 'Migration order violation: security foundation must be phase 01.';
  end if;
end;
$$;

-- Les privileges par defaut s'appliquent au role de deploiement courant. Les
-- objets deja presents restent securises par les REVOKE explicites ci-dessous
-- et par le cutover de privileges dedie.
-- PostgreSQL accorde EXECUTE a PUBLIC globalement par defaut; le retrait global
-- est donc necessaire avant les restrictions propres a chaque schema.
alter default privileges
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

alter table public.joueurs
  add column if not exists mot_de_passe_hash text,
  add column if not exists code_acces_hash text,
  add column if not exists auth_version integer not null default 1,
  add column if not exists credential_modifie_a timestamptz;

do $$
begin
  if exists (
    select 1
    from public.joueurs
    where nullif(btrim(coalesce(mot_de_passe, '')), '') is not null
      and octet_length(mot_de_passe) > 256
  ) then
    raise exception 'Precondition failed: an existing credential exceeds the supported length.';
  end if;
end;
$$;

create or replace function app_private.credential_hash(p_secret text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select extensions.crypt(
    encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex'),
    extensions.gen_salt('bf', 12)
  );
$$;

update public.joueurs
set
  mot_de_passe_hash = app_private.credential_hash(mot_de_passe),
  credential_modifie_a = coalesce(credential_modifie_a, now())
where mot_de_passe_hash is null
  and nullif(btrim(coalesce(mot_de_passe, '')), '') is not null;

-- Le credential administratif historique ne doit jamais devenir implicitement
-- le code d'acces joueur. Les codes joueurs sont enrolés séparément avant le
-- cutover; la migration 06 bloque tant qu'un compte actif n'est pas prêt.

alter table public.joueurs
  drop constraint if exists joueurs_auth_version_positive,
  add constraint joueurs_auth_version_positive check (auth_version > 0),
  drop constraint if exists joueurs_password_hash_format,
  add constraint joueurs_password_hash_format check (
    mot_de_passe_hash is null or (
      octet_length(mot_de_passe_hash) = 60
      and mot_de_passe_hash ~ '^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
    )
  ),
  drop constraint if exists joueurs_access_hash_format,
  add constraint joueurs_access_hash_format check (
    code_acces_hash is null or (
      octet_length(code_acces_hash) = 60
      and code_acces_hash ~ '^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
    )
  );

create table if not exists app_private.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null unique,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  niveau text not null check (niveau in ('joueur', 'admin')),
  auth_version integer not null,
  cree_a timestamptz not null default now(),
  derniere_activite_a timestamptz not null default now(),
  expire_a timestamptz not null,
  inactivite_expire_a timestamptz not null,
  revoque_a timestamptz,
  raison_revocation text
);

create index if not exists sessions_joueur_active_idx
  on app_private.sessions (joueur_id, niveau, expire_a)
  where revoque_a is null;

create index if not exists sessions_expiration_idx
  on app_private.sessions (expire_a, inactivite_expire_a)
  where revoque_a is null;

create index if not exists sessions_retention_idx
  on app_private.sessions ((coalesce(revoque_a, expire_a)));

create table if not exists app_private.auth_attempts (
  categorie text not null,
  identifiant_hash bytea not null,
  fenetre_debut timestamptz not null default now(),
  echecs integer not null default 0 check (echecs >= 0),
  verrouille_jusqua timestamptz,
  derniere_tentative_a timestamptz not null default now(),
  primary key (categorie, identifiant_hash)
);

create index if not exists auth_attempts_cleanup_idx
  on app_private.auth_attempts (derniere_tentative_a);

create table if not exists app_private.security_events (
  id bigint generated by default as identity primary key,
  cree_a timestamptz not null default now(),
  joueur_id bigint references public.joueurs(id) on delete set null,
  categorie text not null,
  resultat text not null check (resultat in ('succes', 'refus', 'verrouillage', 'revocation')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists security_events_date_idx
  on app_private.security_events (cree_a desc);

create index if not exists security_events_joueur_idx
  on app_private.security_events (joueur_id)
  where joueur_id is not null;

create or replace function app_private.verrou_auth_joueur(p_joueur_id bigint)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_joueur_id is null then
    raise exception 'A player identifier is required for the authentication lock.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mpp-session-user:' || p_joueur_id::text, 0)
  );
end;
$$;

revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all sequences in schema app_private from public, anon, authenticated;
revoke all on function app_private.credential_hash(text) from public, anon, authenticated;
revoke all on function app_private.verrou_auth_joueur(bigint) from public, anon, authenticated;
alter default privileges in schema app_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema app_private
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app_private
  revoke execute on functions from public, anon, authenticated;

-- Bootstrap temporaire du premier accès 0.13. Seul le propriétaire SQL de la
-- fonction peut l'exécuter, uniquement pour un SuperAdmin actif existant dont
-- le code n'est pas encore configuré. Aucun rôle API n'y a accès.
drop function if exists app_private.initialiser_code_acces_joueur(bigint,text);

create or replace function app_private.initialiser_code_acces_joueur(
  p_joueur_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_owner name;
  v_code_acces text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner)
  into strict v_function_owner
  from pg_catalog.pg_proc p
  where p.oid = 'app_private.initialiser_code_acces_joueur(bigint)'::pg_catalog.regprocedure;

  if session_user <> v_function_owner then
    raise exception 'Bootstrap refused.';
  end if;

  if p_joueur_id is null then
    raise exception 'Bootstrap refused.';
  end if;

  perform app_private.verrou_auth_joueur(p_joueur_id);
  v_code_acces := pg_catalog.encode(extensions.gen_random_bytes(24),'hex');

  update public.joueurs
  set code_acces_hash=app_private.credential_hash(v_code_acces),
      auth_version=coalesce(auth_version,0)+1,
      credential_modifie_a=now(),
      derniere_modification=now()
  where id=p_joueur_id
    and code_acces_hash is null
    and lower(btrim(coalesce(statut,'')))='actif'
    and exists (
      select 1
      from pg_catalog.regexp_split_to_table(coalesce(roles,''), ',') as r(role_value)
      where lower(btrim(r.role_value))='superadmin'
    );

  if not found then
    raise exception 'Bootstrap refused.';
  end if;

  insert into app_private.security_events(joueur_id,categorie,resultat,details)
  values(p_joueur_id,'provisionnement_code_joueur','succes','{}'::jsonb);

  return v_code_acces;
end;
$$;

revoke all on function app_private.initialiser_code_acces_joueur(bigint)
from public, anon, authenticated, service_role;

comment on schema app_private is 'Private security objects for MPP Operations Center. Never exposed through PostgREST.';
comment on table app_private.release_state is 'Monotonic deployment phase for Alpha 0.13.0; compensations may move it back explicitly.';
comment on table app_private.sessions is 'Opaque browser sessions; only SHA-256 token hashes are stored.';
comment on table app_private.auth_attempts is 'Credential attempt counters. Contains hashes only.';

update app_private.release_state
set phase = 1,
    phase_name = 'security_foundation',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (0, 1);

commit;

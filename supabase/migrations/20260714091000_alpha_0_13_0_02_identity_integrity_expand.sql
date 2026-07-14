begin;

do $$
begin
  if not exists (
    select 1
    from app_private.release_state
    where release_name = 'alpha_0_13_0'
      and phase in (1, 2)
  ) then
    raise exception 'Migration order violation: identity integrity requires phase 01.';
  end if;
end;
$$;

lock table
  public.joueurs,
  public.dates_competition,
  public.presences,
  public.rappels_presence_discord,
  public.discord_link_requests
in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.joueurs
    group by lower(btrim(pseudo))
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: duplicate player display names must be resolved first.';
  end if;

  if exists (
    select 1
    from public.joueurs
    where nullif(btrim(coalesce(discord_id,'')),'') is not null
    group by btrim(discord_id)
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: duplicate Discord identities must be resolved first.';
  end if;

  if exists (
    select 1
    from public.dates_competition
    group by competition_id, date_competition
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: duplicate competition dates must be resolved first.';
  end if;

  if exists (select 1 from public.dates_competition where competition_id is null)
     or exists (select 1 from public.presences where competition_id is null) then
    raise exception 'Precondition failed: competition identifiers must be populated.';
  end if;

  if exists (
    select 1
    from public.dates_competition d
    left join public.competitions c on c.id = d.competition_id
    where c.id is null
  ) then
    raise exception 'Precondition failed: orphan competition dates must be resolved first.';
  end if;

  if exists (
    select 1
    from public.presences p
    left join public.joueurs j on lower(btrim(j.pseudo)) = lower(btrim(p.pseudo))
    left join public.dates_competition d
      on d.competition_id = p.competition_id
     and d.date_competition = p.date_competition
    where j.id is null or d.id is null
  ) then
    raise exception 'Precondition failed: orphan attendance rows must be resolved first.';
  end if;

  if exists (
    select 1
    from public.rappels_presence_discord r
    left join public.dates_competition d
      on d.competition_id = r.competition_id
     and d.date_competition = r.date_competition
    where d.id is null
  ) then
    raise exception 'Precondition failed: orphan reminder rows must be resolved first.';
  end if;

  if exists (
    select 1
    from public.discord_link_requests
    where nullif(btrim(coalesce(code_hash, '')), '') is not null
    group by btrim(code_hash)
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: duplicate Discord link code hashes must be resolved first.';
  end if;

  if exists (
    select 1
    from public.discord_link_requests
    where statut = 'en_attente_validation'
      and nullif(btrim(coalesce(discord_id, '')), '') is not null
    group by btrim(discord_id)
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: duplicate pending Discord identities must be resolved first.';
  end if;
end;
$$;

create unique index if not exists joueurs_pseudo_normalise_unique
  on public.joueurs (lower(btrim(pseudo)));

create unique index if not exists joueurs_discord_id_unique
  on public.joueurs (btrim(discord_id))
  where nullif(btrim(coalesce(discord_id,'')),'') is not null;

create unique index if not exists dates_competition_competition_date_unique
  on public.dates_competition (competition_id, date_competition);

create unique index if not exists dates_competition_identity_unique
  on public.dates_competition (id, competition_id, date_competition);

create unique index if not exists discord_link_requests_code_hash_unique
  on public.discord_link_requests (btrim(code_hash))
  where nullif(btrim(coalesce(code_hash, '')), '') is not null;

create unique index if not exists discord_link_requests_pending_discord_unique
  on public.discord_link_requests (btrim(discord_id))
  where statut = 'en_attente_validation'
    and nullif(btrim(coalesce(discord_id, '')), '') is not null;

create index if not exists discord_link_requests_joueur_idx
  on public.discord_link_requests (joueur_id)
  where joueur_id is not null;

create index if not exists discord_link_requests_pending_expiry_idx
  on public.discord_link_requests (expires_at)
  where statut in ('code_genere', 'en_attente_validation');

create index if not exists discord_link_requests_retention_idx
  on public.discord_link_requests (created_at)
  where statut not in ('code_genere', 'en_attente_validation');

alter table public.dates_competition
  alter column competition_id set not null,
  drop constraint if exists dates_competition_competition_id_fkey,
  add constraint dates_competition_competition_id_fkey foreign key (competition_id)
    references public.competitions(id) on delete cascade not valid;

alter table public.dates_competition
  validate constraint dates_competition_competition_id_fkey;

alter table public.presences
  add column if not exists joueur_id bigint,
  add column if not exists date_competition_id bigint;

update public.presences p
set
  joueur_id = j.id,
  date_competition_id = d.id
from public.joueurs j,
     public.dates_competition d
where p.joueur_id is null
  and p.date_competition_id is null
  and lower(btrim(j.pseudo)) = lower(btrim(p.pseudo))
  and d.competition_id = p.competition_id
  and d.date_competition = p.date_competition;

do $$
begin
  if exists (
    select 1 from public.presences where joueur_id is null or date_competition_id is null
  ) then
    raise exception 'Backfill failed: attendance identity columns contain null values.';
  end if;

  if exists (
    select 1
    from public.presences
    group by date_competition_id, joueur_id
    having count(*) > 1
  ) then
    raise exception 'Backfill failed: duplicate attendance identities detected.';
  end if;
end;
$$;

alter table public.presences
  alter column competition_id set not null,
  alter column joueur_id set not null,
  alter column date_competition_id set not null,
  drop constraint if exists presences_joueur_id_fkey,
  add constraint presences_joueur_id_fkey foreign key (joueur_id)
    references public.joueurs(id) on delete cascade not valid,
  drop constraint if exists presences_date_competition_id_fkey,
  add constraint presences_date_competition_id_fkey foreign key (date_competition_id)
    references public.dates_competition(id) on delete cascade not valid,
  drop constraint if exists presences_date_identity_fkey,
  add constraint presences_date_identity_fkey foreign key (
    date_competition_id, competition_id, date_competition
  ) references public.dates_competition(id, competition_id, date_competition)
    on update cascade on delete cascade not valid,
  drop constraint if exists presences_statut_check,
  add constraint presences_statut_check check (
    statut in ('Présent', 'Absent', 'Remplaçant', 'Non renseigné')
  ) not valid;

alter table public.presences validate constraint presences_joueur_id_fkey;
alter table public.presences validate constraint presences_date_competition_id_fkey;
alter table public.presences validate constraint presences_date_identity_fkey;
alter table public.presences validate constraint presences_statut_check;

create unique index if not exists presences_date_joueur_unique
  on public.presences (date_competition_id, joueur_id);

create index if not exists presences_joueur_competition_idx
  on public.presences (joueur_id, competition_id, date_competition);

alter table public.rappels_presence_discord
  add column if not exists date_competition_id bigint;

update public.rappels_presence_discord r
set date_competition_id = d.id
from public.dates_competition d
where r.date_competition_id is null
  and d.competition_id = r.competition_id
  and d.date_competition = r.date_competition;

alter table public.rappels_presence_discord
  alter column date_competition_id set not null,
  drop constraint if exists rappels_presence_discord_competition_id_fkey,
  add constraint rappels_presence_discord_competition_id_fkey foreign key (competition_id)
    references public.competitions(id) on delete cascade not valid,
  drop constraint if exists rappels_presence_discord_date_competition_id_fkey,
  add constraint rappels_presence_discord_date_competition_id_fkey foreign key (date_competition_id)
    references public.dates_competition(id) on delete cascade not valid,
  drop constraint if exists rappels_presence_discord_date_identity_fkey,
  add constraint rappels_presence_discord_date_identity_fkey foreign key (
    date_competition_id, competition_id, date_competition
  ) references public.dates_competition(id, competition_id, date_competition)
    on update cascade on delete cascade not valid;

alter table public.rappels_presence_discord validate constraint rappels_presence_discord_competition_id_fkey;
alter table public.rappels_presence_discord validate constraint rappels_presence_discord_date_competition_id_fkey;
alter table public.rappels_presence_discord validate constraint rappels_presence_discord_date_identity_fkey;

create index if not exists rappels_presence_discord_competition_idx
  on public.rappels_presence_discord (competition_id);

create index if not exists rappels_presence_discord_date_idx
  on public.rappels_presence_discord (date_competition_id);

alter table public.discord_link_requests
  drop constraint if exists discord_link_requests_joueur_id_fkey,
  add constraint discord_link_requests_joueur_id_fkey foreign key (joueur_id)
    references public.joueurs(id) on delete cascade not valid;

alter table public.discord_link_requests
  validate constraint discord_link_requests_joueur_id_fkey;

create or replace function app_private.synchroniser_presence_identite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_joueur public.joueurs%rowtype;
  v_date public.dates_competition%rowtype;
begin
  if new.joueur_id is not null then
    select * into v_joueur from public.joueurs where id = new.joueur_id;
  else
    select * into v_joueur
    from public.joueurs
    where lower(btrim(pseudo)) = lower(btrim(new.pseudo))
    limit 1;
  end if;

  if v_joueur.id is null then
    raise exception 'Invalid attendance player.';
  end if;

  if new.date_competition_id is not null then
    select * into v_date from public.dates_competition where id = new.date_competition_id;
  else
    select * into v_date
    from public.dates_competition
    where competition_id = new.competition_id
      and date_competition = new.date_competition
    limit 1;
  end if;

  if v_date.id is null then
    raise exception 'Invalid attendance competition date.';
  end if;

  new.joueur_id := v_joueur.id;
  new.pseudo := v_joueur.pseudo;
  new.date_competition_id := v_date.id;
  new.competition_id := v_date.competition_id;
  new.date_competition := v_date.date_competition;
  return new;
end;
$$;

drop trigger if exists presences_sync_identity on public.presences;
create trigger presences_sync_identity
before insert or update of joueur_id, pseudo, date_competition_id, competition_id, date_competition
on public.presences
for each row execute function app_private.synchroniser_presence_identite();

create or replace function app_private.synchroniser_pseudo_joueur()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.pseudo is distinct from old.pseudo then
    update public.presences
    set pseudo = new.pseudo
    where joueur_id = new.id;

    update public.discord_link_requests
    set pseudo = new.pseudo
    where joueur_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists joueurs_sync_pseudo on public.joueurs;
create trigger joueurs_sync_pseudo
after update of pseudo on public.joueurs
for each row execute function app_private.synchroniser_pseudo_joueur();

create or replace function app_private.synchroniser_rappel_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_date public.dates_competition%rowtype;
begin
  if new.date_competition_id is not null then
    select * into v_date from public.dates_competition where id = new.date_competition_id;
  else
    select * into v_date
    from public.dates_competition
    where competition_id = new.competition_id
      and date_competition = new.date_competition
    limit 1;
  end if;

  if v_date.id is null then
    raise exception 'Invalid reminder competition date.';
  end if;

  new.date_competition_id := v_date.id;
  new.competition_id := v_date.competition_id;
  new.date_competition := v_date.date_competition;
  return new;
end;
$$;

drop trigger if exists rappels_sync_date on public.rappels_presence_discord;
create trigger rappels_sync_date
before insert or update of date_competition_id, competition_id, date_competition
on public.rappels_presence_discord
for each row execute function app_private.synchroniser_rappel_date();

revoke all on function app_private.synchroniser_presence_identite() from public, anon, authenticated;
revoke all on function app_private.synchroniser_pseudo_joueur() from public, anon, authenticated;
revoke all on function app_private.synchroniser_rappel_date() from public, anon, authenticated;

update app_private.release_state
set phase = 2,
    phase_name = 'identity_integrity',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (1, 2);

commit;

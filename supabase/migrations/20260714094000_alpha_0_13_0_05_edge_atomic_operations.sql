begin;

do $$
begin
  if not exists (
    select 1
    from app_private.release_state
    where release_name = 'alpha_0_13_0'
      and phase in (4, 5)
  ) then
    raise exception 'Migration order violation: Edge atomic operations require phase 04.';
  end if;
end;
$$;

lock table public.rappels_presence_discord in share row exclusive mode;

drop table if exists pg_temp.mpp_rappels_normalises;
create temporary table mpp_rappels_normalises on commit drop as
with source as (
  select
    r.*,
    case
      when lower(btrim(r.type_rappel)) in ('presence_sans_reponse', 'sans_reponse_17h')
        then 'sans_reponse_17h'
      else btrim(r.type_rappel)
    end as type_normalise,
    case r.statut
      when 'envoye' then 0
      when 'echec_incertain' then 1
      when 'en_cours' then 2
      when 'aucun_joueur' then 3
      when 'echec_permanent' then 4
      else 5
    end as rang_prudence
  from public.rappels_presence_discord r
), groupes as (
  select
    s.type_normalise,
    s.competition_id,
    s.date_competition,
    (array_agg(
      s.id
      order by
        (lower(btrim(s.type_rappel)) = 'sans_reponse_17h') desc,
        s.rang_prudence,
        s.updated_at desc nulls last,
        s.id
    ))[1] as id_conserve,
    case
      when count(*) = 1 then (array_agg(s.statut order by s.id))[1]
      when bool_or(s.statut = 'envoye') then 'envoye'
      when bool_or(
        s.statut in ('echec_incertain', 'en_cours')
        or coalesce(s.nb_messages, 0) > 0
      ) then 'echec_incertain'
      when bool_or(s.statut = 'aucun_joueur') then 'aucun_joueur'
      when bool_or(s.statut = 'echec_permanent') then 'echec_permanent'
      else 'echec'
    end as statut_fusionne,
    min(s.envoye_a) as envoye_a_fusionne,
    max(coalesce(s.nb_joueurs, 0)) as nb_joueurs_fusionne,
    max(coalesce(s.nb_mentions, 0)) as nb_mentions_fusionne,
    max(coalesce(s.nb_sans_discord, 0)) as nb_sans_discord_fusionne,
    max(coalesce(s.nb_messages, 0)) as nb_messages_fusionne,
    (array_agg(
      nullif(btrim(s.erreur), '')
      order by s.updated_at desc nulls last, s.id
    ) filter (where nullif(btrim(s.erreur), '') is not null))[1] as erreur_fusionnee,
    max(s.updated_at) as updated_at_fusionne
  from source s
  group by s.type_normalise, s.competition_id, s.date_competition
)
select * from groupes;

delete from public.rappels_presence_discord r
using pg_temp.mpp_rappels_normalises n
where r.competition_id = n.competition_id
  and r.date_competition = n.date_competition
  and case
    when lower(btrim(r.type_rappel)) in ('presence_sans_reponse', 'sans_reponse_17h')
      then 'sans_reponse_17h'
    else btrim(r.type_rappel)
  end = n.type_normalise
  and r.id <> n.id_conserve;

update public.rappels_presence_discord r
set type_rappel = n.type_normalise,
    statut = n.statut_fusionne,
    envoye_a = n.envoye_a_fusionne,
    nb_joueurs = n.nb_joueurs_fusionne,
    nb_mentions = n.nb_mentions_fusionne,
    nb_sans_discord = n.nb_sans_discord_fusionne,
    nb_messages = n.nb_messages_fusionne,
    erreur = case
      when n.statut_fusionne in ('envoye', 'aucun_joueur') then null
      else n.erreur_fusionnee
    end,
    updated_at = n.updated_at_fusionne
from pg_temp.mpp_rappels_normalises n
where r.id = n.id_conserve;

do $$
begin
  if exists (
    select 1
    from public.rappels_presence_discord
    group by type_rappel, competition_id, date_competition
    having count(*) > 1
  ) then
    raise exception 'Precondition failed: duplicate daily reminders must be resolved first.';
  end if;
  if exists (
    select 1 from public.rappels_presence_discord
    where heure_programmee is null
       or nullif(btrim(coalesce(type_rappel, '')), '') is null
       or statut not in ('envoye','aucun_joueur','echec','echec_incertain','echec_permanent','en_cours')
  ) then
    raise exception 'Precondition failed: reminder schedule or status is invalid.';
  end if;
end;
$$;

drop index if exists public.idx_rappels_presence_discord_unique;
drop index if exists public.rappels_presence_discord_unique_programme;

create unique index if not exists rappels_presence_discord_unique_jour
  on public.rappels_presence_discord (type_rappel, competition_id, date_competition);

alter table public.rappels_presence_discord
  alter column envoye_a drop not null,
  alter column envoye_a drop default,
  alter column heure_programmee set not null,
  add column if not exists execution_id uuid,
  add column if not exists reserve_a timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists prochaine_tentative_a timestamptz,
  add column if not exists tentatives integer not null default 0,
  add column if not exists snapshot_hash text,
  add column if not exists fragment_count integer not null default 0,
  add column if not exists snapshot_metadata jsonb not null default '{}'::jsonb,
  add column if not exists snapshot_cree_a timestamptz,
  add column if not exists heure_programmee_initiale time,
  add column if not exists discord_message_ids jsonb not null default '[]'::jsonb;

update public.rappels_presence_discord
set heure_programmee_initiale = heure_programmee
where heure_programmee_initiale is null;

alter table public.rappels_presence_discord
  alter column heure_programmee_initiale set not null;

alter table public.rappels_presence_discord
  drop constraint if exists rappels_presence_discord_tentatives_positive,
  add constraint rappels_presence_discord_tentatives_positive check (tentatives >= 0),
  drop constraint if exists rappels_presence_discord_fragment_count_check,
  add constraint rappels_presence_discord_fragment_count_check check (fragment_count between 0 and 50),
  drop constraint if exists rappels_presence_discord_snapshot_hash_check,
  add constraint rappels_presence_discord_snapshot_hash_check check (
    snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists rappels_presence_discord_snapshot_metadata_check,
  add constraint rappels_presence_discord_snapshot_metadata_check check (
    jsonb_typeof(snapshot_metadata) = 'object'
  ),
  drop constraint if exists rappels_presence_discord_statut_check,
  add constraint rappels_presence_discord_statut_check check (
    statut in ('envoye','aucun_joueur','echec','echec_incertain','echec_permanent','en_cours')
  );

create table if not exists app_private.rappel_fragments (
  rappel_id bigint not null,
  sequence integer not null check (sequence >= 0),
  execution_id uuid not null,
  statut text not null default 'a_envoyer' check (statut in ('a_envoyer','en_cours','envoye','echec')),
  contenu text not null,
  contenu_hash bytea not null,
  mentions_autorisees jsonb not null default '[]'::jsonb,
  discord_message_id text,
  erreur_code text,
  updated_at timestamptz not null default now(),
  primary key (rappel_id, sequence)
);

alter table app_private.rappel_fragments
  add column if not exists mentions_autorisees jsonb not null default '[]'::jsonb,
  drop constraint if exists rappel_fragments_rappel_id_fkey,
  add constraint rappel_fragments_rappel_id_fkey foreign key (rappel_id)
    references public.rappels_presence_discord(id) on delete cascade not valid;

alter table app_private.rappel_fragments
  validate constraint rappel_fragments_rappel_id_fkey;

create index if not exists rappels_presence_discord_retention_idx
  on public.rappels_presence_discord (updated_at)
  where statut <> 'en_cours';

create index if not exists rappels_presence_discord_lease_idx
  on public.rappels_presence_discord (lease_expires_at)
  where statut = 'en_cours';

create index if not exists rappels_presence_discord_retry_idx
  on public.rappels_presence_discord (prochaine_tentative_a)
  where statut = 'echec';

revoke all on table app_private.rappel_fragments from public, anon, authenticated;

create or replace function app_private.discord_snapshot_hash(p_fragments jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  with fragments as (
    select f.value, f.ordinalite
    from jsonb_array_elements(coalesce(p_fragments, '[]'::jsonb))
      with ordinality as f(value, ordinalite)
  ), canonical as (
    select
      f.ordinalite,
      '[' || (f.ordinalite - 1)::text || ',' ||
      to_jsonb(f.value->>'contenu')::text || ',' ||
      (
        select '[' || coalesce(string_agg(to_jsonb(m.id)::text, ',' order by m.ordinalite), '') || ']'
        from jsonb_array_elements_text(f.value->'mentionsAutorisees')
          with ordinality as m(id, ordinalite)
      ) || ']' as fragment
    from fragments f
  )
  select encode(
    extensions.digest(
      '[' || coalesce(string_agg(c.fragment, ',' order by c.ordinalite), '') || ']',
      'sha256'
    ),
    'hex'
  )
  from canonical c;
$$;

create or replace function app_private.discord_snapshot_metadata(p_fragments jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'fragmentCount', count(*),
    'totalOctets', coalesce(sum(octet_length(f.value->>'contenu')), 0),
    'mentionCount', coalesce(sum(jsonb_array_length(f.value->'mentionsAutorisees')), 0)
  )
  from jsonb_array_elements(coalesce(p_fragments, '[]'::jsonb)) as f(value);
$$;

create or replace function public.charger_donnees_rappels_discord_site(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with date_valide as (
    select p_date as date_demande
    where p_date is not null
      and p_date between date '2000-01-01' and date '2100-12-31'
  ),
  dates_du_jour as materialized (
    select d.id, d.competition_id, d.date_competition
    from public.dates_competition d
    join date_valide v on v.date_demande = d.date_competition
    where d.competition_id is not null
  ),
  competitions_du_jour as materialized (
    select
      c.id,
      c.nom,
      c.roles_autorises,
      c.rappel_presence_active,
      c.heure_rappel_presence,
      c.notification_presence_active,
      c.heure_notification_presence
    from public.competitions c
    where exists (
      select 1 from dates_du_jour d where d.competition_id = c.id
    )
  ),
  joueurs_eligibles as materialized (
    select j.id, j.pseudo, j.roles, j.discord_id
    from public.joueurs j
    where lower(btrim(coalesce(j.statut, ''))) = 'actif'
      and exists (
        select 1
        from competitions_du_jour c
        where app_private.competition_autorisee(j.roles, c.roles_autorises)
      )
  ),
  presences_du_jour as materialized (
    select p.competition_id, p.joueur_id, p.statut
    from public.presences p
    join date_valide v on v.date_demande = p.date_competition
    where p.joueur_id is not null
      and exists (
        select 1 from competitions_du_jour c where c.id = p.competition_id
      )
  )
  select case
    when p_date is null
      or p_date < date '2000-01-01'
      or p_date > date '2100-12-31'
      then jsonb_build_object('succes', false, 'message', 'Date invalide.')
    else jsonb_build_object(
      'succes', true,
      'date', p_date,
      'dates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'competition_id', d.competition_id,
          'date_competition', d.date_competition
        ) order by d.id)
        from dates_du_jour d
      ), '[]'::jsonb),
      'competitions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'nom', c.nom,
          'roles_autorises', c.roles_autorises,
          'rappel_presence_active', c.rappel_presence_active,
          'heure_rappel_presence', c.heure_rappel_presence,
          'notification_presence_active', c.notification_presence_active,
          'heure_notification_presence', c.heure_notification_presence
        ) order by c.id)
        from competitions_du_jour c
      ), '[]'::jsonb),
      'joueurs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', j.id,
          'pseudo', j.pseudo,
          'roles', j.roles,
          'discord_id', j.discord_id
        ) order by j.id)
        from joueurs_eligibles j
      ), '[]'::jsonb),
      'presences', coalesce((
        select jsonb_agg(jsonb_build_object(
          'competition_id', p.competition_id,
          'joueur_id', p.joueur_id,
          'statut', p.statut
        ) order by p.competition_id, p.joueur_id)
        from presences_du_jour p
      ), '[]'::jsonb)
    )
  end;
$$;

drop function if exists public.reserver_envoi_discord_site(text,bigint,date,time,integer);
drop function if exists public.figer_fragments_discord_site(bigint,uuid,jsonb);
drop function if exists public.reserver_fragment_discord_site(bigint,uuid,integer);
drop function if exists public.enregistrer_fragment_discord_site(bigint,uuid,integer,text,text,text);
drop function if exists public.finaliser_envoi_discord_site(bigint,uuid,text,integer,integer,integer,integer,jsonb,text);

create or replace function public.reserver_envoi_discord_site(
  p_type_rappel text,
  p_competition_id bigint,
  p_date_competition date,
  p_heure_programmee time,
  p_fragments jsonb,
  p_snapshot_hash text,
  p_fragment_count integer,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date_id bigint;
  v_rappel public.rappels_presence_discord%rowtype;
  v_execution_id uuid := extensions.gen_random_uuid();
  v_lease interval := make_interval(secs => least(greatest(coalesce(p_lease_seconds,120),30),600));
  v_fragments jsonb;
  v_snapshot_hash_calcule text;
  v_snapshot_metadata jsonb;
begin
  if nullif(btrim(coalesce(p_type_rappel,'')),'') is null
     or char_length(btrim(coalesce(p_type_rappel,'')))>80
     or p_competition_id is null
     or p_date_competition is null
     or p_heure_programmee is null then
    return jsonb_build_object('succes',false,'etat','invalid','message','Programme de rappel invalide.');
  end if;
  if jsonb_typeof(coalesce(p_fragments,'null'::jsonb))<>'array'
     or p_fragment_count is null
     or p_fragment_count<0
     or p_fragment_count>50
     or jsonb_array_length(p_fragments)<>p_fragment_count
     or coalesce(lower(p_snapshot_hash),'')!~'^[0-9a-f]{64}$' then
    return jsonb_build_object('succes',false,'etat','invalid','message','Snapshot Discord invalide.');
  end if;
  if exists(
    select 1
    from jsonb_array_elements(p_fragments) with ordinality as f(value,ordinalite)
    where jsonb_typeof(f.value)<>'object'
       or coalesce(f.value->>'sequence','')<>(f.ordinalite-1)::text
       or jsonb_typeof(f.value->'contenu')<>'string'
       or length(coalesce(f.value->>'contenu',''))=0
       or octet_length(coalesce(f.value->>'contenu',''))>1900
       or jsonb_typeof(f.value->'mentionsAutorisees')<>'array'
       or jsonb_array_length(
         case when jsonb_typeof(f.value->'mentionsAutorisees')='array'
           then f.value->'mentionsAutorisees' else '[]'::jsonb end
       )>100
       or exists(
         select 1 from jsonb_array_elements_text(
           case when jsonb_typeof(f.value->'mentionsAutorisees')='array'
             then f.value->'mentionsAutorisees' else '[]'::jsonb end
         ) m(id)
         where m.id!~'^[0-9]{17,20}$'
       )
       or exists(
         select 1
         from jsonb_array_elements_text(
           case when jsonb_typeof(f.value->'mentionsAutorisees')='array'
             then f.value->'mentionsAutorisees' else '[]'::jsonb end
         ) m(id)
         group by m.id
         having count(*)>1
       )
       or exists(
         select 1
         from regexp_matches(
           coalesce(f.value->>'contenu',''),
           '<@!?([0-9]{17,20})>',
           'g'
         ) as mention(captures)
         where not (
           case when jsonb_typeof(f.value->'mentionsAutorisees')='array'
             then f.value->'mentionsAutorisees' else '[]'::jsonb end
           ? (mention.captures)[1]
         )
       )
       or (f.value->>'contenu')~*'@(everyone|here)|<(@&|#)[0-9]+>'
  ) then
    return jsonb_build_object('succes',false,'etat','invalid','message','Fragment Discord invalide.');
  end if;

  v_snapshot_hash_calcule := app_private.discord_snapshot_hash(p_fragments);
  if v_snapshot_hash_calcule is distinct from lower(p_snapshot_hash) then
    return jsonb_build_object('succes',false,'etat','invalid','message','Empreinte du snapshot Discord invalide.');
  end if;
  v_snapshot_metadata := app_private.discord_snapshot_metadata(p_fragments);

  select id into v_date_id
  from public.dates_competition
  where competition_id=p_competition_id and date_competition=p_date_competition;
  if not found then return jsonb_build_object('succes',false,'etat','invalid','message','Date de compétition invalide.'); end if;

  insert into public.rappels_presence_discord(
    type_rappel,competition_id,date_competition_id,date_competition,heure_programmee,envoye_a,
    statut,execution_id,reserve_a,lease_expires_at,tentatives,snapshot_hash,fragment_count,
    snapshot_metadata,snapshot_cree_a,heure_programmee_initiale,updated_at
  ) values(
    btrim(p_type_rappel),p_competition_id,v_date_id,p_date_competition,p_heure_programmee,null,
    'en_cours',v_execution_id,now(),now()+v_lease,1,v_snapshot_hash_calcule,p_fragment_count,
    v_snapshot_metadata,now(),p_heure_programmee,now()
  )
  on conflict (type_rappel,competition_id,date_competition) do nothing
  returning * into v_rappel;

  if found then
    insert into app_private.rappel_fragments(
      rappel_id,sequence,execution_id,statut,contenu,contenu_hash,mentions_autorisees,updated_at
    )
    select
      v_rappel.id,
      (f.value->>'sequence')::integer,
      v_execution_id,
      'a_envoyer',
      f.value->>'contenu',
      extensions.digest(f.value->>'contenu','sha256'),
      f.value->'mentionsAutorisees',
      now()
    from jsonb_array_elements(p_fragments) f(value);
    return jsonb_build_object(
      'succes',true,'etat','claimed','rappelId',v_rappel.id,
      'executionId',v_execution_id,'tentative',1,
      'fragments',p_fragments,'snapshotHash',v_snapshot_hash_calcule,
      'fragmentCount',p_fragment_count,'snapshotMetadata',v_snapshot_metadata
    );
  end if;

  select * into v_rappel
  from public.rappels_presence_discord
  where type_rappel=btrim(p_type_rappel)
    and competition_id=p_competition_id
    and date_competition=p_date_competition
  for update;

  if v_rappel.heure_programmee is distinct from p_heure_programmee then
    update public.rappels_presence_discord
    set heure_programmee=p_heure_programmee
    where id=v_rappel.id
    returning * into v_rappel;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',f.sequence,
    'contenu',f.contenu,
    'mentionsAutorisees',f.mentions_autorisees
  ) order by f.sequence),'[]'::jsonb)
  into v_fragments
  from app_private.rappel_fragments f
  where f.rappel_id=v_rappel.id;

  if v_rappel.snapshot_hash is null
     or v_rappel.snapshot_cree_a is null
     or v_rappel.fragment_count<>jsonb_array_length(v_fragments)
     or app_private.discord_snapshot_hash(v_fragments)<>v_rappel.snapshot_hash
     or app_private.discord_snapshot_metadata(v_fragments)<>v_rappel.snapshot_metadata
     or exists(
       select 1 from app_private.rappel_fragments f
       where f.rappel_id=v_rappel.id
         and f.contenu_hash<>extensions.digest(f.contenu,'sha256')
     ) then
    update public.rappels_presence_discord
    set statut='echec_incertain',lease_expires_at=null,updated_at=now()
    where id=v_rappel.id;
    return jsonb_build_object('succes',true,'etat','manual_review','rappelId',v_rappel.id);
  end if;

  if v_rappel.statut in ('envoye','aucun_joueur') then
    return jsonb_build_object('succes',true,'etat','already_sent','rappelId',v_rappel.id);
  end if;
  if v_rappel.statut in ('echec_incertain','echec_permanent') then
    return jsonb_build_object('succes',true,'etat','manual_review','rappelId',v_rappel.id);
  end if;
  if v_rappel.statut='en_cours' and v_rappel.lease_expires_at>now() then
    return jsonb_build_object('succes',true,'etat','busy','rappelId',v_rappel.id);
  end if;
  if v_rappel.statut='echec' and v_rappel.prochaine_tentative_a>now() then
    return jsonb_build_object('succes',true,'etat','backoff','rappelId',v_rappel.id,'prochaineTentativeA',v_rappel.prochaine_tentative_a);
  end if;
  if v_rappel.tentatives>=5 then
    update public.rappels_presence_discord
    set statut='echec_permanent',lease_expires_at=null,updated_at=now()
    where id=v_rappel.id;
    return jsonb_build_object('succes',true,'etat','manual_review','rappelId',v_rappel.id);
  end if;
  if v_rappel.statut='en_cours' and exists(
    select 1 from app_private.rappel_fragments f
    where f.rappel_id=v_rappel.id and f.statut='en_cours'
  ) then
    update public.rappels_presence_discord
    set statut='echec_incertain',lease_expires_at=null,updated_at=now()
    where id=v_rappel.id;
    return jsonb_build_object('succes',true,'etat','manual_review','rappelId',v_rappel.id);
  end if;

  update public.rappels_presence_discord
  set statut='en_cours',execution_id=v_execution_id,reserve_a=now(),lease_expires_at=now()+v_lease,
      prochaine_tentative_a=null,tentatives=tentatives+1,erreur=null,updated_at=now()
  where id=v_rappel.id
  returning * into v_rappel;

  return jsonb_build_object(
    'succes',true,'etat','retry_claimed','rappelId',v_rappel.id,
    'executionId',v_execution_id,'tentative',v_rappel.tentatives,
    'fragments',v_fragments,'snapshotHash',v_rappel.snapshot_hash,
    'fragmentCount',v_rappel.fragment_count,
    'snapshotMetadata',v_rappel.snapshot_metadata
  );
end;
$$;

create or replace function public.enregistrer_fragment_discord_site(
  p_rappel_id bigint,
  p_execution_id uuid,
  p_sequence integer,
  p_snapshot_hash text,
  p_fragment_count integer,
  p_statut text,
  p_discord_message_id text default null,
  p_erreur_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rappel public.rappels_presence_discord%rowtype;
begin
  if p_statut not in ('envoye','echec') then return jsonb_build_object('succes',false,'message','Statut fragment invalide.'); end if;
  if p_statut='envoye' and coalesce(p_discord_message_id,'')!~'^[0-9]{17,20}$' then
    return jsonb_build_object('succes',false,'message','Identifiant de message Discord invalide.');
  end if;

  select * into v_rappel
  from public.rappels_presence_discord
  where id=p_rappel_id and execution_id=p_execution_id and statut='en_cours'
    and lease_expires_at>now()
    and snapshot_hash=lower(p_snapshot_hash) and fragment_count=p_fragment_count
  for update;
  if not found then
    return jsonb_build_object('succes',false,'message','Réservation expirée.');
  end if;
  update app_private.rappel_fragments
  set statut=p_statut,
      discord_message_id=nullif(p_discord_message_id,''),
      erreur_code=left(nullif(p_erreur_code,''),80),
      updated_at=now()
  where rappel_id=p_rappel_id
    and sequence=p_sequence
    and execution_id=p_execution_id
    and statut='en_cours';
  if not found then
    return jsonb_build_object('succes',false,'message','Fragment non réservé.');
  end if;
  return jsonb_build_object('succes',true);
end;
$$;

create or replace function public.reserver_fragment_discord_site(
  p_rappel_id bigint,
  p_execution_id uuid,
  p_sequence integer,
  p_snapshot_hash text,
  p_fragment_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rappel public.rappels_presence_discord%rowtype;
  v_fragment app_private.rappel_fragments%rowtype;
  v_etat text;
begin
  if p_sequence is null or p_sequence < 0 or p_sequence >= coalesce(p_fragment_count, 0) then
    return jsonb_build_object('succes',false,'etat','invalid','message','Fragment invalide.');
  end if;

  select * into v_rappel
  from public.rappels_presence_discord
  where id=p_rappel_id
    and execution_id=p_execution_id
    and statut='en_cours'
    and lease_expires_at>now()
    and snapshot_hash=lower(p_snapshot_hash)
    and fragment_count=p_fragment_count
  for update;
  if not found then
    return jsonb_build_object('succes',false,'etat','expired','message','Réservation expirée.');
  end if;

  select * into v_fragment
  from app_private.rappel_fragments
  where rappel_id=p_rappel_id and sequence=p_sequence
  for update;

  if found and v_fragment.statut='envoye' then
    return jsonb_build_object('succes',true,'etat','already_sent','contenu',v_fragment.contenu);
  end if;
  if found and v_fragment.statut='en_cours' and v_fragment.execution_id=p_execution_id then
    return jsonb_build_object('succes',true,'etat','busy','contenu',v_fragment.contenu);
  end if;
  if found and v_fragment.statut='en_cours' and v_fragment.execution_id<>p_execution_id then
    return jsonb_build_object('succes',true,'etat','manual_review');
  end if;
  if found then
    v_etat := case when v_fragment.statut='a_envoyer' then 'claimed' else 'retry_claimed' end;
    update app_private.rappel_fragments
    set execution_id=p_execution_id,statut='en_cours',discord_message_id=null,
        erreur_code=null,updated_at=now()
    where rappel_id=p_rappel_id and sequence=p_sequence;
    return jsonb_build_object('succes',true,'etat',v_etat,'contenu',v_fragment.contenu);
  end if;

  return jsonb_build_object('succes',false,'etat','invalid','message','Fragment non figé.');
end;
$$;

create or replace function public.finaliser_envoi_discord_site(
  p_rappel_id bigint,
  p_execution_id uuid,
  p_statut text,
  p_snapshot_hash text,
  p_fragment_count integer,
  p_nb_joueurs integer default 0,
  p_nb_mentions integer default 0,
  p_nb_sans_discord integer default 0,
  p_nb_messages integer default 0,
  p_details jsonb default '{}'::jsonb,
  p_erreur_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rappel public.rappels_presence_discord%rowtype;
  v_fragments_attendus integer := 0;
  v_fragments_envoyes integer := 0;
  v_fragments jsonb;
begin
  if p_statut not in ('envoye','aucun_joueur','echec','echec_incertain','echec_permanent') then return jsonb_build_object('succes',false,'message','Statut final invalide.'); end if;
  if jsonb_typeof(coalesce(p_details, 'null'::jsonb))<>'object'
     or octet_length(coalesce(p_details, '{}'::jsonb)::text)>16384 then
    return jsonb_build_object('succes',false,'message','Métadonnées de finalisation invalides.');
  end if;

  select * into v_rappel
  from public.rappels_presence_discord
  where id=p_rappel_id and execution_id=p_execution_id and statut='en_cours'
    and snapshot_hash=lower(p_snapshot_hash) and fragment_count=p_fragment_count
  for update;
  if not found then
    return jsonb_build_object('succes',false,'etat','expired','message','Réservation expirée.');
  end if;

  select count(*), count(*) filter(where f.statut='envoye')
  into v_fragments_attendus, v_fragments_envoyes
  from app_private.rappel_fragments f
  where f.rappel_id=p_rappel_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',f.sequence,
    'contenu',f.contenu,
    'mentionsAutorisees',f.mentions_autorisees
  ) order by f.sequence), '[]'::jsonb)
  into v_fragments
  from app_private.rappel_fragments f
  where f.rappel_id=p_rappel_id;

  if app_private.discord_snapshot_hash(v_fragments)<>v_rappel.snapshot_hash
     or app_private.discord_snapshot_metadata(v_fragments)<>v_rappel.snapshot_metadata then
    update public.rappels_presence_discord
    set statut='echec_incertain',lease_expires_at=null,updated_at=now()
    where id=v_rappel.id;
    return jsonb_build_object('succes',true,'etat','manual_review','rappelId',v_rappel.id);
  end if;
  if v_fragments_attendus<>p_fragment_count then
    return jsonb_build_object('succes',false,'etat','incomplete','message','Snapshot incomplet.');
  end if;

  if p_statut='envoye' and (
    v_fragments_attendus=0
    or v_fragments_envoyes<>v_fragments_attendus
    or greatest(coalesce(p_nb_messages,0),0)<>v_fragments_attendus
  ) then
    return jsonb_build_object('succes',false,'etat','incomplete','message','Des fragments restent incomplets.');
  end if;
  if p_statut='aucun_joueur' and v_fragments_attendus<>0 then
    return jsonb_build_object('succes',false,'etat','incomplete','message','Le rappel contient déjà des fragments.');
  end if;

  update public.rappels_presence_discord
  set statut=p_statut,
      envoye_a=case when p_statut='envoye' then now() else envoye_a end,
      nb_joueurs=greatest(coalesce(p_nb_joueurs,0),0),
      nb_mentions=greatest(coalesce(p_nb_mentions,0),0),
      nb_sans_discord=greatest(coalesce(p_nb_sans_discord,0),0),
      nb_messages=greatest(coalesce(p_nb_messages,0),0),
      details=coalesce(p_details,'{}'::jsonb),
      erreur=case when p_statut in ('echec','echec_incertain','echec_permanent') then left(coalesce(p_erreur_code,'ECHEC_ENVOI'),80) else null end,
      lease_expires_at=null,
      prochaine_tentative_a=case
        when p_statut='echec' then now()+make_interval(
          secs=>least(3600,60*power(2,least(tentatives,5))::integer)
        )
        else null
      end,
      updated_at=now(),
      discord_message_ids=coalesce((
        select jsonb_agg(f.discord_message_id order by f.sequence)
        from app_private.rappel_fragments f
        where f.rappel_id=p_rappel_id and f.statut='envoye' and f.discord_message_id is not null
      ),'[]'::jsonb)
  where id=p_rappel_id and execution_id=p_execution_id and statut='en_cours'
  returning * into v_rappel;
  if not found then return jsonb_build_object('succes',false,'message','Réservation expirée.'); end if;
  return jsonb_build_object(
    'succes',true,'etat',p_statut,'rappelId',v_rappel.id,
    'snapshotHash',v_rappel.snapshot_hash,'fragmentCount',v_rappel.fragment_count,
    'snapshotMetadata',v_rappel.snapshot_metadata
  );
end;
$$;

create or replace function public.edge_creer_code_liaison_site(
  p_session_token text,
  p_code_hash text,
  p_expire_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx record;
  v_existante public.discord_link_requests%rowtype;
  v_id uuid;
  v_expire_a timestamptz;
begin
  select * into v_ctx from app_private.contexte_session(p_session_token,'joueur');
  if not found then return jsonb_build_object('succes',false,'code','SESSION_EXPIREE','message','Session expirée.'); end if;
  if coalesce(p_code_hash,'') !~ '^[0-9a-f]{64}$' or p_expire_at<=now() or p_expire_at>now()+interval '30 minutes' then return jsonb_build_object('succes',false,'message','Demande invalide.'); end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mpp-discord-link-code:' || v_ctx.joueur_id::text, 0)
  );

  select * into v_existante
  from public.discord_link_requests
  where joueur_id=v_ctx.joueur_id
    and code_hash=p_code_hash
    and statut in ('code_genere','en_attente_validation')
    and expires_at>now()
  order by created_at desc
  limit 1
  for update;
  if found then
    return jsonb_build_object(
      'succes',true,
      'requestId',v_existante.id,
      'expireA',v_existante.expires_at,
      'rejoue',true
    );
  end if;

  if exists(
    select 1
    from public.discord_link_requests
    where joueur_id=v_ctx.joueur_id
      and code_hash=p_code_hash
  ) then
    return jsonb_build_object(
      'succes',false,
      'code','OPERATION_EXPIREE',
      'message','Ce code a expiré. Générez-en un nouveau.'
    );
  end if;

  if exists(
    select 1
    from public.discord_link_requests
    where joueur_id=v_ctx.joueur_id
      and code_hash is distinct from p_code_hash
      and created_at>now()-interval '60 seconds'
  ) then
    return jsonb_build_object('succes',false,'message','Veuillez patienter avant de générer un nouveau code.');
  end if;
  update public.discord_link_requests
  set statut='expiree'
  where joueur_id=v_ctx.joueur_id
    and statut in ('code_genere','en_attente_validation');
  insert into public.discord_link_requests(joueur_id,pseudo,code_hash,statut,expires_at,created_at)
  values(v_ctx.joueur_id,v_ctx.pseudo,p_code_hash,'code_genere',p_expire_at,now())
  returning id,expires_at into v_id,v_expire_a;
  return jsonb_build_object(
    'succes',true,
    'requestId',v_id,
    'expireA',v_expire_a,
    'rejoue',false
  );
exception
  when unique_violation then
    return jsonb_build_object('succes',false,'message','Code temporairement indisponible.');
end;
$$;

create or replace function public.edge_lister_demandes_liaison_site(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ctx record;
begin
  select * into v_ctx from app_private.contexte_session(p_session_token,'admin');
  if not found or not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Accès refusé.'); end if;
  return jsonb_build_object('succes',true,'demandes',coalesce((
    select jsonb_agg(jsonb_build_object('id',r.id,'pseudo',r.pseudo,'discordUsername',r.discord_username,'statut',r.statut,'createdAt',r.created_at,'expiresAt',r.expires_at) order by r.created_at desc)
    from public.discord_link_requests r where r.statut='en_attente_validation' and r.expires_at>now()
  ),'[]'::jsonb));
end;
$$;

create or replace function public.edge_traiter_demande_liaison_site(
  p_session_token text,
  p_request_id uuid,
  p_action text,
  p_raison text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ctx record; v_req public.discord_link_requests%rowtype;
begin
  select * into v_ctx from app_private.contexte_session(p_session_token,'admin');
  if not found or not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Accès refusé.'); end if;
  select * into v_req from public.discord_link_requests where id=p_request_id for update;
  if not found or v_req.statut<>'en_attente_validation' or v_req.expires_at<=now() then return jsonb_build_object('succes',false,'message','Demande indisponible.'); end if;
  if lower(p_action)='valider' then
    if nullif(btrim(coalesce(v_req.discord_id,'')),'') is null then return jsonb_build_object('succes',false,'message','Compte Discord manquant.'); end if;
    update public.joueurs set discord_id=v_req.discord_id,discord_username=v_req.discord_username,discord_lie_a=now(),derniere_modification=now() where id=v_req.joueur_id;
    update public.discord_link_requests set statut='validee',validated_at=now(),validated_by=v_ctx.pseudo where id=v_req.id;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Liaison Discord validée','Demande de liaison validée.');
    return jsonb_build_object('succes',true,'message','Liaison Discord validée.');
  elsif lower(p_action)='refuser' then
    update public.discord_link_requests set statut='refusee',refused_at=now(),refused_by=v_ctx.pseudo,reason=left(btrim(coalesce(p_raison,'')),500) where id=v_req.id;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Liaison Discord refusée','Demande de liaison refusée.');
    return jsonb_build_object('succes',true,'message','Demande refusée.');
  end if;
  return jsonb_build_object('succes',false,'message','Action invalide.');
exception
  when unique_violation then
    return jsonb_build_object('succes',false,'message','Ce compte Discord est déjà lié.');
end;
$$;

create or replace function public.edge_enregistrer_identite_discord_site(
  p_code_hash text,
  p_discord_id text,
  p_discord_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_req public.discord_link_requests%rowtype;
begin
  if p_discord_id !~ '^\d{17,20}$' or coalesce(p_code_hash,'') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('succes',false,'message','Demande invalide.'); end if;
  perform pg_advisory_xact_lock(hashtextextended('mpp-discord-link:' || p_discord_id, 0));
  if app_private.auth_verrouillee('discord_link', p_discord_id) then
    return jsonb_build_object('succes',false,'message','Code invalide ou expiré.');
  end if;
  if exists(
    select 1
    from public.discord_link_requests
    where discord_id=p_discord_id
      and statut='en_attente_validation'
      and expires_at>now()
      and code_hash<>p_code_hash
  ) then
    return jsonb_build_object('succes',false,'message','Une demande est déjà en attente pour ce compte Discord.');
  end if;
  select * into v_req from public.discord_link_requests where code_hash=p_code_hash for update;
  if not found or v_req.statut<>'code_genere' or v_req.expires_at<=now() then
    perform app_private.auth_echec('discord_link', p_discord_id);
    return jsonb_build_object('succes',false,'message','Code invalide ou expiré.');
  end if;
  perform app_private.auth_succes('discord_link', p_discord_id);
  update public.discord_link_requests
  set discord_id=p_discord_id,
      discord_username=left(btrim(coalesce(p_discord_username,'')),100),
      used_at=now(),
      statut='en_attente_validation'
  where id=v_req.id and statut='code_genere';
  return jsonb_build_object('succes',true,'message','Identité Discord enregistrée.');
end;
$$;

create or replace function app_private.heure_depuis_texte(p_heure text)
returns time
language sql
immutable
security invoker
set search_path = ''
as $$ select nullif(left(btrim(coalesce(p_heure,'')),5),'')::time $$;

create or replace function public.traiter_auto_statut_competitions_site(p_date date,p_heure time)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_comp record; v_ouverture time; v_fermeture time; v_cible text; v_modifiees integer:=0; v_analysees integer:=0;
begin
  for v_comp in select distinct c.* from public.competitions c join public.dates_competition d on d.competition_id=c.id where d.date_competition=p_date and c.fermeture_auto_active=true and c.heure_ouverture is not null and c.heure_fermeture is not null and c.statut in ('Ouverte','Fermée') loop
    v_analysees:=v_analysees+1;
    v_ouverture:=app_private.heure_depuis_texte(v_comp.heure_ouverture); v_fermeture:=app_private.heure_depuis_texte(v_comp.heure_fermeture);
    if v_ouverture is null or v_fermeture is null then continue; end if;
    v_cible:=case when v_ouverture<=v_fermeture then case when p_heure>=v_ouverture and p_heure<v_fermeture then 'Ouverte' else 'Fermée' end else case when p_heure>=v_ouverture or p_heure<v_fermeture then 'Ouverte' else 'Fermée' end end;
    if v_cible<>v_comp.statut then
      update public.competitions set statut=v_cible,dernier_traitement_auto=p_date where id=v_comp.id and statut=v_comp.statut;
      if found then insert into public.journal_activite(utilisateur,action,details) values('Système automatique','Statut compétition automatique','Compétition : '||v_comp.nom||E'\nAncien statut : '||v_comp.statut||E'\nNouveau statut : '||v_cible||E'\nDate : '||p_date||E'\nHeure : '||p_heure); v_modifiees:=v_modifiees+1; end if;
    end if;
  end loop;
  return jsonb_build_object('succes',true,'competitionsAnalysees',v_analysees,'competitionsModifiees',v_modifiees);
end;
$$;

create or replace function public.nettoyer_donnees_securite_site()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tentatives integer := 0;
  v_sessions integer := 0;
  v_evenements integer := 0;
  v_demandes_expirees integer := 0;
  v_demandes_purgees integer := 0;
  v_rappels_purges integer := 0;
begin
  delete from app_private.auth_attempts
  where derniere_tentative_a < now() - interval '30 days';
  get diagnostics v_tentatives = row_count;

  delete from app_private.sessions
  where coalesce(revoque_a, expire_a) < now() - interval '30 days';
  get diagnostics v_sessions = row_count;

  delete from app_private.security_events
  where cree_a < now() - interval '365 days';
  get diagnostics v_evenements = row_count;

  if pg_catalog.to_regclass('app_private.admin_operations') is not null then
    execute 'delete from app_private.admin_operations where expire_a < now()';
  end if;

  update public.discord_link_requests
  set statut = 'expiree'
  where statut in ('code_genere', 'en_attente_validation')
    and expires_at <= now();
  get diagnostics v_demandes_expirees = row_count;

  delete from public.discord_link_requests
  where statut not in ('code_genere', 'en_attente_validation')
    and created_at < now() - interval '365 days';
  get diagnostics v_demandes_purgees = row_count;

  delete from public.rappels_presence_discord
  where statut <> 'en_cours'
    and updated_at < now() - interval '365 days';
  get diagnostics v_rappels_purges = row_count;

  return jsonb_build_object(
    'succes', true,
    'tentativesSupprimees', v_tentatives,
    'sessionsSupprimees', v_sessions,
    'evenementsSupprimes', v_evenements,
    'demandesExpirees', v_demandes_expirees,
    'demandesSupprimees', v_demandes_purgees,
    'rappelsSupprimes', v_rappels_purges
  );
end;
$$;

revoke all on function public.charger_donnees_rappels_discord_site(date) from public, anon, authenticated;
revoke all on function public.reserver_envoi_discord_site(text,bigint,date,time,jsonb,text,integer,integer) from public, anon, authenticated;
revoke all on function public.reserver_fragment_discord_site(bigint,uuid,integer,text,integer) from public, anon, authenticated;
revoke all on function public.enregistrer_fragment_discord_site(bigint,uuid,integer,text,integer,text,text,text) from public, anon, authenticated;
revoke all on function public.finaliser_envoi_discord_site(bigint,uuid,text,text,integer,integer,integer,integer,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.edge_creer_code_liaison_site(text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.edge_lister_demandes_liaison_site(text) from public, anon, authenticated;
revoke all on function public.edge_traiter_demande_liaison_site(text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.edge_enregistrer_identite_discord_site(text,text,text) from public, anon, authenticated;
revoke all on function public.traiter_auto_statut_competitions_site(date,time) from public, anon, authenticated;
revoke all on function public.nettoyer_donnees_securite_site() from public, anon, authenticated;
revoke all on function app_private.discord_snapshot_hash(jsonb) from public, anon, authenticated;
revoke all on function app_private.discord_snapshot_metadata(jsonb) from public, anon, authenticated;

grant execute on function public.charger_donnees_rappels_discord_site(date) to service_role;
grant execute on function public.reserver_envoi_discord_site(text,bigint,date,time,jsonb,text,integer,integer) to service_role;
grant execute on function public.reserver_fragment_discord_site(bigint,uuid,integer,text,integer) to service_role;
grant execute on function public.enregistrer_fragment_discord_site(bigint,uuid,integer,text,integer,text,text,text) to service_role;
grant execute on function public.finaliser_envoi_discord_site(bigint,uuid,text,text,integer,integer,integer,integer,integer,jsonb,text) to service_role;
grant execute on function public.edge_creer_code_liaison_site(text,text,timestamptz) to service_role;
grant execute on function public.edge_lister_demandes_liaison_site(text) to service_role;
grant execute on function public.edge_traiter_demande_liaison_site(text,uuid,text,text) to service_role;
grant execute on function public.edge_enregistrer_identite_discord_site(text,text,text) to service_role;
grant execute on function public.traiter_auto_statut_competitions_site(date,time) to service_role;
grant execute on function public.nettoyer_donnees_securite_site() to service_role;

revoke all on function app_private.heure_depuis_texte(text) from public, anon, authenticated;

update app_private.release_state
set phase = 5,
    phase_name = 'edge_atomic_operations',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (4, 5);

commit;

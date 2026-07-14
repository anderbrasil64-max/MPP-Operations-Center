begin;

do $$
declare
  v_suffix text := substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16);
  v_phase smallint;
  v_phase_name text;
  v_phase_initiale smallint;
  v_phase_name_initiale text;
  v_joueur_id bigint;
  v_auth_version integer;
  v_competition_id bigint;
  v_date_id bigint;
  v_date date;
  v_old_session_hash bytea := extensions.digest('retention-old-session-' || clock_timestamp()::text, 'sha256');
  v_active_session_hash bytea := extensions.digest('retention-active-session-' || clock_timestamp()::text, 'sha256');
  v_recent_revoked_session_hash bytea := extensions.digest('retention-revoked-session-' || clock_timestamp()::text, 'sha256');
  v_expired_request uuid;
  v_old_completed_request uuid;
  v_recent_completed_request uuid;
  v_old_pending_request uuid;
  v_result jsonb;
begin
  select phase, phase_name into strict v_phase, v_phase_name
  from app_private.release_state
  where release_name = 'alpha_0_13_0';
  if v_phase <> 6 or v_phase_name <> 'privileges_rls_cutover' then
    raise exception 'Unexpected release state after the isolated cutover: % / %.', v_phase, v_phase_name;
  end if;
  v_phase_initiale := v_phase;
  v_phase_name_initiale := v_phase_name;

  select id, auth_version into strict v_joueur_id, v_auth_version
  from public.joueurs
  where pseudo = 'Fixture SuperAdmin';

  select c.id, d.id, d.date_competition
  into strict v_competition_id, v_date_id, v_date
  from public.competitions c
  join public.dates_competition d on d.competition_id = c.id
  where c.nom = 'Fixture Competition';

  insert into app_private.auth_attempts(
    categorie, identifiant_hash, derniere_tentative_a
  ) values
    (
      'retention-old-' || v_suffix,
      extensions.digest('retention-old-' || v_suffix, 'sha256'),
      now() - interval '31 days'
    ),
    (
      'retention-recent-' || v_suffix,
      extensions.digest('retention-recent-' || v_suffix, 'sha256'),
      now() - interval '29 days'
    );

  insert into app_private.sessions(
    token_hash, joueur_id, niveau, auth_version, cree_a, derniere_activite_a,
    expire_a, inactivite_expire_a, revoque_a, raison_revocation
  ) values
    (
      v_old_session_hash, v_joueur_id, 'joueur', v_auth_version,
      now() - interval '60 days', now() - interval '40 days',
      now() - interval '31 days', now() - interval '31 days', null, null
    ),
    (
      v_active_session_hash, v_joueur_id, 'joueur', v_auth_version,
      now(), now(), now() + interval '1 day', now() + interval '30 minutes', null, null
    ),
    (
      v_recent_revoked_session_hash, v_joueur_id, 'joueur', v_auth_version,
      now() - interval '60 days', now() - interval '40 days',
      now() - interval '31 days', now() - interval '31 days', now(), 'test_retention'
    );

  insert into app_private.security_events(
    cree_a, joueur_id, categorie, resultat
  ) values
    (now() - interval '366 days', v_joueur_id, 'retention-old-' || v_suffix, 'refus'),
    (now() - interval '364 days', v_joueur_id, 'retention-recent-' || v_suffix, 'refus');

  insert into public.discord_link_requests(
    joueur_id, pseudo, statut, expires_at, created_at, updated_at
  ) values (
    v_joueur_id,
    'retention-expired-' || v_suffix,
    'code_genere',
    now() - interval '1 minute',
    now() - interval '1 day',
    now() - interval '1 day'
  ) returning id into v_expired_request;

  insert into public.discord_link_requests(
    joueur_id, pseudo, statut, expires_at, validated_at, validated_by,
    created_at, updated_at
  ) values (
    v_joueur_id,
    'retention-old-completed-' || v_suffix,
    'validee',
    now() - interval '400 days',
    now() - interval '400 days',
    'Fixture',
    now() - interval '366 days',
    now() - interval '366 days'
  ) returning id into v_old_completed_request;

  insert into public.discord_link_requests(
    joueur_id, pseudo, statut, expires_at, refused_at, refused_by,
    created_at, updated_at
  ) values (
    v_joueur_id,
    'retention-recent-completed-' || v_suffix,
    'refusee',
    now() - interval '1 day',
    now(),
    'Fixture',
    now() - interval '364 days',
    now()
  ) returning id into v_recent_completed_request;

  insert into public.discord_link_requests(
    joueur_id, pseudo, statut, expires_at, created_at, updated_at
  ) values (
    v_joueur_id,
    'retention-old-pending-' || v_suffix,
    'en_attente_validation',
    now() + interval '1 day',
    now() - interval '366 days',
    now() - interval '366 days'
  ) returning id into v_old_pending_request;

  insert into public.rappels_presence_discord(
    type_rappel, competition_id, date_competition_id, date_competition,
    heure_programmee, heure_programmee_initiale, statut, envoye_a, updated_at
  ) values
    (
      'retention_old_' || v_suffix,
      v_competition_id,
      v_date_id,
      v_date,
      time '17:00',
      time '17:00',
      'envoye',
      now() - interval '366 days',
      now() - interval '366 days'
    ),
    (
      'retention_recent_' || v_suffix,
      v_competition_id,
      v_date_id,
      v_date,
      time '17:01',
      time '17:01',
      'envoye',
      now(),
      now() - interval '364 days'
    ),
    (
      'retention_inflight_' || v_suffix,
      v_competition_id,
      v_date_id,
      v_date,
      time '17:02',
      time '17:02',
      'en_cours',
      null,
      now() - interval '366 days'
    );

  v_result := public.nettoyer_donnees_securite_site();
  if not coalesce((v_result->>'succes')::boolean, false)
     or (v_result->>'tentativesSupprimees')::integer <> 1
     or (v_result->>'sessionsSupprimees')::integer <> 1
     or (v_result->>'evenementsSupprimes')::integer <> 1
     or (v_result->>'demandesExpirees')::integer <> 1
     or (v_result->>'demandesSupprimees')::integer <> 1
     or (v_result->>'rappelsSupprimes')::integer <> 1 then
    raise exception 'Unexpected retention counters: %.', v_result;
  end if;

  if exists (
    select 1 from app_private.auth_attempts
    where categorie = 'retention-old-' || v_suffix
  ) or not exists (
    select 1 from app_private.auth_attempts
    where categorie = 'retention-recent-' || v_suffix
  ) then
    raise exception 'Authentication-attempt retention crossed its 30-day boundary.';
  end if;

  if exists (
    select 1 from app_private.sessions where token_hash = v_old_session_hash
  ) or not exists (
    select 1 from app_private.sessions where token_hash = v_active_session_hash
  ) or not exists (
    select 1 from app_private.sessions where token_hash = v_recent_revoked_session_hash
  ) then
    raise exception 'Session retention removed a live or recently revoked session.';
  end if;

  if exists (
    select 1 from app_private.security_events
    where categorie = 'retention-old-' || v_suffix
  ) or not exists (
    select 1 from app_private.security_events
    where categorie = 'retention-recent-' || v_suffix
  ) then
    raise exception 'Security-event retention crossed its 365-day boundary.';
  end if;

  if (select statut from public.discord_link_requests where id = v_expired_request) is distinct from 'expiree'
     or exists (select 1 from public.discord_link_requests where id = v_old_completed_request)
     or not exists (select 1 from public.discord_link_requests where id = v_recent_completed_request)
     or (select statut from public.discord_link_requests where id = v_old_pending_request)
        is distinct from 'en_attente_validation' then
    raise exception 'Discord-link retention did not preserve pending or recent requests.';
  end if;

  if exists (
    select 1 from public.rappels_presence_discord
    where type_rappel = 'retention_old_' || v_suffix
  ) or not exists (
    select 1 from public.rappels_presence_discord
    where type_rappel = 'retention_recent_' || v_suffix
  ) or not exists (
    select 1 from public.rappels_presence_discord
    where type_rappel = 'retention_inflight_' || v_suffix
      and statut = 'en_cours'
  ) then
    raise exception 'Reminder retention removed a recent or in-flight delivery.';
  end if;

  select phase, phase_name into strict v_phase, v_phase_name
  from app_private.release_state
  where release_name = 'alpha_0_13_0';
  if v_phase is distinct from v_phase_initiale
     or v_phase_name is distinct from v_phase_name_initiale then
    raise exception 'Retention changed the release state.';
  end if;
end;
$$;

rollback;

begin;

do $$
declare
  v_competition bigint;
  v_date date := current_date + 30;
  v_first jsonb;
  v_second jsonb;
  v_retry jsonb;
  v_snapshot jsonb;
  v_snapshot_invalide jsonb;
  v_transition_count integer;
  v_transition_statut text;
  v_transition_messages integer;
  v_fragments jsonb := jsonb_build_array(
    jsonb_build_object('sequence',0,'contenu','fragment test 1','mentionsAutorisees','[]'::jsonb),
    jsonb_build_object('sequence',1,'contenu','fragment test 2','mentionsAutorisees','[]'::jsonb)
  );
  v_snapshot_hash text;
  v_fragment jsonb;
  v_fragment_same jsonb;
  v_fragment_retry jsonb;
  v_finalisation jsonb;
  v_crash_recovery jsonb;
begin
  v_snapshot_hash := app_private.discord_snapshot_hash(v_fragments);

  if exists (
    select 1 from public.rappels_presence_discord
    where type_rappel = 'presence_sans_reponse'
  ) then
    raise exception 'Legacy player reminder type was not normalized.';
  end if;
  select count(*), max(r.statut), max(r.nb_messages)
  into v_transition_count, v_transition_statut, v_transition_messages
  from public.rappels_presence_discord r
  join public.competitions c on c.id = r.competition_id
  where c.nom = 'Fixture Competition'
    and r.date_competition = date '2030-01-15'
    and r.type_rappel = 'sans_reponse_17h';
  if v_transition_count <> 1
     or v_transition_statut <> 'envoye'
     or v_transition_messages <> 1 then
    raise exception 'Legacy/canonical player reminder merge can trigger another send.';
  end if;
  if not exists (
    select 1
    from public.rappels_presence_discord r
    join public.competitions c on c.id = r.competition_id
    where c.nom = 'Fixture Competition'
      and r.date_competition = date '2030-01-15'
      and r.type_rappel = 'presence_staff'
  ) then
    raise exception 'Staff reminder type was changed during normalization.';
  end if;

  insert into public.competitions(nom, statut, cree_par, roles_autorises)
  values('test-discord-reservation', 'Ouverte', 'test', 'Soldat') returning id into v_competition;
  insert into public.dates_competition(competition_id, date_competition, horaires)
  values(v_competition, v_date, '21:00');

  v_snapshot := public.charger_donnees_rappels_discord_site(v_date);
  if v_snapshot->>'succes' <> 'true'
     or jsonb_typeof(v_snapshot->'dates') <> 'array'
     or jsonb_typeof(v_snapshot->'competitions') <> 'array'
     or jsonb_typeof(v_snapshot->'joueurs') <> 'array'
     or jsonb_typeof(v_snapshot->'presences') <> 'array' then
    raise exception 'Discord source snapshot is invalid.';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(v_snapshot->'competitions') c(value)
    where (c.value->>'id')::bigint = v_competition
  ) then
    raise exception 'Discord source snapshot omitted the competition.';
  end if;
  if has_function_privilege('anon', 'public.charger_donnees_rappels_discord_site(date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.charger_donnees_rappels_discord_site(date)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.charger_donnees_rappels_discord_site(date)', 'EXECUTE') then
    raise exception 'Discord source snapshot grants are invalid.';
  end if;
  v_snapshot_invalide := public.charger_donnees_rappels_discord_site(null);
  if coalesce((v_snapshot_invalide->>'succes')::boolean, true) then
    raise exception 'Discord source snapshot accepted an invalid date.';
  end if;

  v_first := public.reserver_envoi_discord_site('test_reservation', v_competition, v_date, '17:00'::time, v_fragments, v_snapshot_hash, 2, 180);
  v_second := public.reserver_envoi_discord_site('test_reservation', v_competition, v_date, '17:00'::time, v_fragments, v_snapshot_hash, 2, 180);
  if v_first->>'etat' <> 'claimed' then raise exception 'First reservation not claimed.'; end if;
  if v_second->>'etat' <> 'busy' then raise exception 'Duplicate reservation not blocked.'; end if;

  v_fragment := public.reserver_fragment_discord_site(
    (v_first->>'rappelId')::bigint,
    (v_first->>'executionId')::uuid,
    0,
    v_snapshot_hash,
    2
  );
  if v_fragment->>'etat' <> 'claimed' then raise exception 'Fragment not claimed before send.'; end if;

  v_fragment_same := public.reserver_fragment_discord_site(
    (v_first->>'rappelId')::bigint,
    (v_first->>'executionId')::uuid,
    0,
    v_snapshot_hash,
    2
  );
  if v_fragment_same->>'etat' <> 'busy' then raise exception 'Same execution reclaimed an in-flight fragment.'; end if;

  perform public.enregistrer_fragment_discord_site(
    (v_first->>'rappelId')::bigint,
    (v_first->>'executionId')::uuid,
    0,
    v_snapshot_hash,
    2,
    'envoye',
    '123456789012345678',
    null
  );

  v_finalisation := public.finaliser_envoi_discord_site(
    (v_first->>'rappelId')::bigint,
    (v_first->>'executionId')::uuid,
    'envoye',v_snapshot_hash,2,0,0,0,1,'{}'::jsonb,null
  );
  if v_finalisation->>'etat' <> 'incomplete' then raise exception 'Partial reminder was finalized as sent.'; end if;

  update public.rappels_presence_discord
  set lease_expires_at = now() - interval '1 second'
  where id = (v_first->>'rappelId')::bigint;
  v_retry := public.reserver_envoi_discord_site('test_reservation', v_competition, v_date, '17:00'::time, v_fragments, v_snapshot_hash, 2, 180);
  if v_retry->>'etat' <> 'retry_claimed' then raise exception 'Expired reminder not reclaimed.'; end if;

  v_fragment_retry := public.reserver_fragment_discord_site(
    (v_retry->>'rappelId')::bigint,
    (v_retry->>'executionId')::uuid,
    1,
    v_snapshot_hash,
    2
  );
  if v_fragment_retry->>'etat' <> 'claimed' then raise exception 'Unsent frozen fragment was not safely claimed.'; end if;

  update public.rappels_presence_discord
  set lease_expires_at = now() - interval '1 second'
  where id = (v_retry->>'rappelId')::bigint;
  v_crash_recovery := public.reserver_envoi_discord_site(
    'test_reservation',
    v_competition,
    v_date,
    '17:00'::time,
    v_fragments,
    v_snapshot_hash,
    2,
    180
  );
  if v_crash_recovery->>'etat' <> 'manual_review' then
    raise exception 'An expired in-flight Discord fragment was retried blindly.';
  end if;
end;
$$;

rollback;

begin;

do $$
declare
  v_suffix text := substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12);
  v_code_a text := encode(extensions.gen_random_bytes(16), 'hex');
  v_code_a_nouveau text := encode(extensions.gen_random_bytes(16), 'hex');
  v_code_b text := encode(extensions.gen_random_bytes(16), 'hex');
  v_admin_secret text := encode(extensions.gen_random_bytes(16), 'hex');
  v_player_a bigint;
  v_player_b bigint;
  v_competition bigint;
  v_date_id bigint;
  v_session jsonb;
  v_token text;
  v_result jsonb;
begin
  insert into public.joueurs(pseudo, roles, statut, code_acces_hash, mot_de_passe_hash)
  values
    ('test-a-' || v_suffix, 'Soldat', 'Actif', app_private.credential_hash(v_code_a), null),
    ('test-b-' || v_suffix, 'Officier', 'Actif', app_private.credential_hash(v_code_b), app_private.credential_hash(v_admin_secret));

  select id into v_player_a from public.joueurs where pseudo = 'test-a-' || v_suffix;
  select id into v_player_b from public.joueurs where pseudo = 'test-b-' || v_suffix;
  insert into public.competitions(nom, statut, cree_par, roles_autorises)
  values('test-' || v_suffix, 'Ouverte', 'test', 'Soldat,Officier') returning id into v_competition;
  insert into public.dates_competition(competition_id, date_competition, horaires)
  values(v_competition, current_date + 1, '21:00') returning id into v_date_id;

  v_session := public.ouvrir_session_joueur_site('test-a-' || v_suffix, v_code_a);
  if not coalesce((v_session->>'succes')::boolean, false) then raise exception 'Player session creation failed.'; end if;
  v_token := v_session->>'sessionToken';
  v_result := public.api_joueur_site(v_token, 'sauvegarder_presences', jsonb_build_object(
    'idCompetition', v_competition,
    'presences', jsonb_build_array(jsonb_build_object('dateCompetition', (current_date + 1)::text, 'statut', 'Présent'))
  ));
  if not coalesce((v_result->>'succes')::boolean, false) then raise exception 'Attendance save failed.'; end if;
  if (select count(*) from public.presences where date_competition_id = v_date_id and joueur_id = v_player_a) <> 1 then
    raise exception 'Session identity was not used for attendance.';
  end if;
  if exists(select 1 from public.presences where date_competition_id = v_date_id and joueur_id = v_player_b) then
    raise exception 'Attendance impersonation detected.';
  end if;

  v_result := public.api_joueur_site(v_token, 'changer_code_acces', jsonb_build_object(
    'codeActuel', v_code_a,
    'nouveauCode', v_code_a_nouveau
  ));
  if not coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'Access-code rotation failed.';
  end if;

  v_result := public.api_joueur_site(v_token, 'profil', '{}'::jsonb);
  if v_result->>'code' <> 'SESSION_EXPIREE' then
    raise exception 'Access-code rotation did not revoke the current session.';
  end if;

  v_result := public.ouvrir_session_joueur_site('test-a-' || v_suffix, v_code_a);
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'The previous access code remained usable after rotation.';
  end if;

  v_session := public.ouvrir_session_joueur_site('test-a-' || v_suffix, v_code_a_nouveau);
  if not coalesce((v_session->>'succes')::boolean, false) then
    raise exception 'The rotated access code did not open a session.';
  end if;
  v_token := v_session->>'sessionToken';

  update app_private.sessions set inactivite_expire_a = now() - interval '1 second'
  where token_hash = extensions.digest(v_token, 'sha256');
  v_result := public.api_joueur_site(v_token, 'profil', '{}'::jsonb);
  if v_result->>'code' <> 'SESSION_EXPIREE' then raise exception 'Expired session accepted.'; end if;

  v_session := public.ouvrir_session_joueur_site('test-b-' || v_suffix, v_code_b);
  v_result := public.ouvrir_session_admin_site(v_session->>'sessionToken', v_admin_secret);
  if not coalesce((v_result->>'succes')::boolean, false) then raise exception 'Officer session creation failed.'; end if;
  v_result := public.api_admin_site(
    v_result->>'sessionToken',
    'modifier_statut_competition',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idCompetition', v_competition,
      'statut', 'Archivée'
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then raise exception 'Officer archived a competition.'; end if;
end;
$$;

rollback;

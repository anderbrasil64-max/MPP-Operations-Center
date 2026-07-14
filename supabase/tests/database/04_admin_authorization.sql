begin;

do $$
declare
  v_suffix text := substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16);
  v_code_officier text := encode(extensions.gen_random_bytes(16), 'hex');
  v_code_superadmin text := encode(extensions.gen_random_bytes(16), 'hex');
  v_code_cible text := encode(extensions.gen_random_bytes(16), 'hex');
  v_code_heritage text := encode(extensions.gen_random_bytes(16), 'hex');
  v_credential_officier text := encode(extensions.gen_random_bytes(16), 'hex');
  v_credential_superadmin text := encode(extensions.gen_random_bytes(16), 'hex');
  v_credential_heritage text := encode(extensions.gen_random_bytes(16), 'hex');
  v_credential_nouveau text := encode(extensions.gen_random_bytes(16), 'hex');
  v_discord_id text := '9' || translate(
    substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 16),
    'abcdef',
    '123456'
  );
  v_officier_id bigint;
  v_superadmin_id bigint;
  v_cible_id bigint;
  v_heritage_id bigint;
  v_competition_filtre bigint;
  v_hash_heritage text;
  v_session_joueur_officier jsonb;
  v_session_joueur_superadmin jsonb;
  v_session_admin_officier jsonb;
  v_session_admin_superadmin jsonb;
  v_result jsonb;
  v_ligne jsonb;
begin
  insert into public.joueurs(
    pseudo, roles, statut, code_acces_hash, mot_de_passe_hash
  ) values
    (
      'test-officier-' || v_suffix,
      'Officier',
      'Actif',
      app_private.credential_hash(v_code_officier),
      app_private.credential_hash(v_credential_officier)
    ),
    (
      'test-superadmin-' || v_suffix,
      'SuperAdmin',
      'Actif',
      app_private.credential_hash(v_code_superadmin),
      app_private.credential_hash(v_credential_superadmin)
    ),
    (
      'test-cible-' || v_suffix,
      'Soldat',
      'Actif',
      app_private.credential_hash(v_code_cible),
      null
    ),
    (
      'test-heritage-' || v_suffix,
      'Soldat',
      'Actif',
      app_private.credential_hash(v_code_heritage),
      app_private.credential_hash(v_credential_heritage)
    );

  select id into v_officier_id
  from public.joueurs where pseudo = 'test-officier-' || v_suffix;
  select id into v_superadmin_id
  from public.joueurs where pseudo = 'test-superadmin-' || v_suffix;
  select id into v_cible_id
  from public.joueurs where pseudo = 'test-cible-' || v_suffix;
  select id, mot_de_passe_hash into v_heritage_id, v_hash_heritage
  from public.joueurs where pseudo = 'test-heritage-' || v_suffix;

  insert into public.competitions(
    nom, statut, cree_par, roles_autorises, description
  ) values (
    'test-filtre-' || v_suffix,
    'Ouverte',
    'test',
    'Soldat,SuperAdmin',
    'Filtre prive a preserver'
  ) returning id into v_competition_filtre;

  v_session_joueur_officier := public.ouvrir_session_joueur_site(
    'test-officier-' || v_suffix,
    v_code_officier
  );
  v_session_joueur_superadmin := public.ouvrir_session_joueur_site(
    'test-superadmin-' || v_suffix,
    v_code_superadmin
  );
  v_session_admin_officier := public.ouvrir_session_admin_site(
    v_session_joueur_officier->>'sessionToken',
    v_credential_officier
  );
  v_session_admin_superadmin := public.ouvrir_session_admin_site(
    v_session_joueur_superadmin->>'sessionToken',
    v_credential_superadmin
  );
  if not coalesce((v_session_admin_officier->>'succes')::boolean, false)
     or not coalesce((v_session_admin_superadmin->>'succes')::boolean, false) then
    raise exception 'Administrative session setup failed.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'dashboard',
    '{}'::jsonb
  );
  if not coalesce((v_result->>'succes')::boolean, false)
     or jsonb_typeof(v_result->'joueurs') is distinct from 'object'
     or jsonb_typeof(v_result->'competitions') is distinct from 'object'
     or jsonb_typeof(v_result->'competitionsListe') is distinct from 'array' then
    raise exception 'The officer dashboard JSON contract is incomplete.';
  end if;
  if not ((v_result->'joueurs') ?& array[
    'total', 'actifs', 'inactifs', 'suspendus', 'connectes7Jours',
    'connectes30Jours', 'inactifs30Jours', 'jamaisConnectes'
  ]) then
    raise exception 'The officer dashboard player counters are incomplete.';
  end if;
  if (v_result#>>'{joueurs,total}')::integer <>
       (select count(*)::integer from public.joueurs)
     or jsonb_array_length(v_result->'competitionsListe') <>
       (select count(*)::integer from public.competitions)
     or not exists (
       select 1
       from jsonb_array_elements(v_result->'competitionsListe') as c(value)
       where (c.value->>'id')::bigint = v_competition_filtre
         and c.value->>'roles_autorises' = 'Soldat,SuperAdmin'
     ) then
    raise exception 'The officer dashboard aggregates do not match the fixture.';
  end if;

  v_result := public.api_joueur_site(
    v_session_joueur_officier->>'sessionToken',
    'competitions',
    '{}'::jsonb
  );
  if not coalesce((v_result->>'succes')::boolean, false)
     or exists (
       select 1
       from jsonb_array_elements(v_result->'competitions') as c(value)
       where (c.value->>'id')::bigint = v_competition_filtre
     ) then
    raise exception 'A competition outside the officer player-role filter was exposed.';
  end if;

  v_result := public.api_joueur_site(
    v_session_joueur_superadmin->>'sessionToken',
    'competitions',
    '{}'::jsonb
  );
  if not coalesce((v_result->>'succes')::boolean, false)
     or not exists (
       select 1
       from jsonb_array_elements(v_result->'competitions') as c(value)
       where (c.value->>'id')::bigint = v_competition_filtre
     ) then
    raise exception 'A competition matching the SuperAdmin player-role filter was hidden.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_competition',
    jsonb_build_object('operationId', extensions.gen_random_uuid(), 'config', jsonb_build_object(
      'idCompetition', v_competition_filtre,
      'nom', 'test-filtre-' || v_suffix,
      'statut', 'Ouverte',
      'rolesAutorises', 'Soldat',
      'description', 'Filtre retire par un Officier'
    ))
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer removed a hidden SuperAdmin competition filter.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_competition',
    jsonb_build_object('operationId', extensions.gen_random_uuid(), 'config', jsonb_build_object(
      'idCompetition', v_competition_filtre,
      'nom', 'test-filtre-' || v_suffix,
      'statut', 'Ouverte',
      'rolesAutorises', 'Soldat,SuperAdmin',
      'description', 'Filtre prive preserve'
    ))
  );
  if not coalesce((v_result->>'succes')::boolean, false)
     or not app_private.role_present(
       (select roles_autorises from public.competitions where id = v_competition_filtre),
       'SuperAdmin'
     ) then
    raise exception 'An officer could not preserve a hidden SuperAdmin competition filter.';
  end if;

  v_result := public.api_admin_site(
    v_session_joueur_officier->>'sessionToken',
    'joueurs',
    '{}'::jsonb
  );
  if v_result->>'code' <> 'SESSION_EXPIREE' then
    raise exception 'A player session was accepted by the administrative API.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'ajouter_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'pseudo', 'test-refus-' || v_suffix,
      'roles', 'SuperAdmin',
      'statut', 'Actif',
      'codeAcces', encode(extensions.gen_random_bytes(16), 'hex'),
      'motDePasseAdminInitial', encode(extensions.gen_random_bytes(16), 'hex')
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer created a SuperAdmin account.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idJoueur', v_heritage_id,
      'pseudo', 'test-heritage-' || v_suffix,
      'roles', 'Officier',
      'statut', 'Actif'
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer promoted a player to Officer using an inherited hash.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idJoueur', v_heritage_id,
      'pseudo', 'test-heritage-' || v_suffix,
      'roles', 'SuperAdmin',
      'statut', 'Actif'
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer promoted a player to SuperAdmin using an inherited hash.';
  end if;
  if (select roles from public.joueurs where id = v_heritage_id) is distinct from 'Soldat'
     or (select mot_de_passe_hash from public.joueurs where id = v_heritage_id) is distinct from v_hash_heritage then
    raise exception 'A refused administrative promotion did not preserve the player record.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idJoueur', v_cible_id,
      'pseudo', 'test-cible-' || v_suffix,
      'roles', 'Soldat',
      'statut', 'Actif',
      'discordId', v_discord_id
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer changed a Discord identity.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_superadmin->>'sessionToken',
    'modifier_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idJoueur', v_cible_id,
      'pseudo', 'test-cible-' || v_suffix,
      'roles', 'Soldat',
      'statut', 'Actif',
      'discordId', v_discord_id
    )
  );
  if not coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'A SuperAdmin could not change a valid Discord identity.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idJoueur', v_cible_id,
      'pseudo', 'test-cible-' || v_suffix,
      'roles', 'Soldat',
      'statut', 'Actif'
    )
  );
  if not coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer could not edit a player while preserving hidden Discord data.';
  end if;
  if (select discord_id from public.joueurs where id = v_cible_id) is distinct from v_discord_id
     or (select discord_lie_a from public.joueurs where id = v_cible_id) is null then
    raise exception 'An officer edit cleared hidden Discord identity data.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'joueurs',
    '{}'::jsonb
  );
  select value into v_ligne
  from jsonb_array_elements(v_result->'joueurs')
  where (value->>'id')::bigint = v_cible_id;
  if v_ligne->>'discordId' is not null then
    raise exception 'A Discord technical identifier leaked to an officer.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_superadmin->>'sessionToken',
    'joueurs',
    '{}'::jsonb
  );
  select value into v_ligne
  from jsonb_array_elements(v_result->'joueurs')
  where (value->>'id')::bigint = v_cible_id;
  if v_ligne->>'discordId' is distinct from v_discord_id then
    raise exception 'A SuperAdmin did not receive the required Discord identifier.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_superadmin->>'sessionToken',
    'ajouter_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'pseudo', 'test-nouvel-officier-' || v_suffix,
      'roles', 'Officier',
      'statut', 'Actif',
      'codeAcces', encode(extensions.gen_random_bytes(16), 'hex')
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'A privileged account was created without an administrative credential.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_superadmin->>'sessionToken',
    'ajouter_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'pseudo', 'test-nouvel-officier-' || v_suffix,
      'roles', 'Officier',
      'statut', 'Actif',
      'codeAcces', encode(extensions.gen_random_bytes(16), 'hex'),
      'motDePasseAdminInitial', encode(extensions.gen_random_bytes(16), 'hex')
    )
  );
  if not coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'A SuperAdmin could not provision a complete privileged account.';
  end if;

  v_result := public.api_admin_site(
    v_session_admin_officier->>'sessionToken',
    'modifier_joueur',
    jsonb_build_object(
      'operationId', extensions.gen_random_uuid(),
      'idJoueur', v_officier_id,
      'pseudo', 'test-officier-' || v_suffix,
      'roles', 'Soldat',
      'statut', 'Inactif'
    )
  );
  if coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'An officer disabled their own administrative access.';
  end if;

  v_result := public.changer_credential_session_site(
    v_session_admin_superadmin->>'sessionToken',
    v_credential_nouveau
  );
  if not coalesce((v_result->>'succes')::boolean, false) then
    raise exception 'Administrative credential rotation failed.';
  end if;
  v_result := public.api_admin_site(
    v_session_admin_superadmin->>'sessionToken',
    'joueurs',
    '{}'::jsonb
  );
  if v_result->>'code' <> 'SESSION_EXPIREE' then
    raise exception 'Credential rotation did not revoke existing sessions.';
  end if;
end;
$$;

rollback;

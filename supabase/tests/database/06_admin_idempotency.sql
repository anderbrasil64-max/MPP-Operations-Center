begin;

do $admin_idempotency$
declare
  v_suffix text := pg_catalog.substr(pg_catalog.encode(extensions.gen_random_bytes(8), 'hex'), 1, 16);
  v_code_a text := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  v_code_b text := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  v_credential_a text := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  v_credential_b text := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  v_joueur_a jsonb;
  v_joueur_b jsonb;
  v_admin_a jsonb;
  v_admin_a_bis jsonb;
  v_admin_b jsonb;
  v_competition_id bigint;
  v_date date := current_date + 30;
  v_operation_id uuid := extensions.gen_random_uuid();
  v_payload jsonb;
  v_premier_resultat jsonb;
  v_rejeu_resultat jsonb;
  v_resultat jsonb;
begin
  insert into public.joueurs(pseudo, roles, statut, code_acces_hash, mot_de_passe_hash)
  values
    (
      'test-idempotence-a-' || v_suffix,
      'Officier',
      'Actif',
      app_private.credential_hash(v_code_a),
      app_private.credential_hash(v_credential_a)
    ),
    (
      'test-idempotence-b-' || v_suffix,
      'Officier',
      'Actif',
      app_private.credential_hash(v_code_b),
      app_private.credential_hash(v_credential_b)
    );

  insert into public.competitions(nom, statut, cree_par, roles_autorises)
  values ('test-idempotence-' || v_suffix, 'Ouverte', 'test', 'Officier')
  returning id into v_competition_id;

  v_joueur_a := public.ouvrir_session_joueur_site('test-idempotence-a-' || v_suffix, v_code_a);
  v_joueur_b := public.ouvrir_session_joueur_site('test-idempotence-b-' || v_suffix, v_code_b);
  v_admin_a := public.ouvrir_session_admin_site(v_joueur_a->>'sessionToken', v_credential_a);
  v_admin_a_bis := public.ouvrir_session_admin_site(v_joueur_a->>'sessionToken', v_credential_a);
  v_admin_b := public.ouvrir_session_admin_site(v_joueur_b->>'sessionToken', v_credential_b);
  if not coalesce((v_admin_a->>'succes')::boolean, false)
     or not coalesce((v_admin_a_bis->>'succes')::boolean, false)
     or not coalesce((v_admin_b->>'succes')::boolean, false) then
    raise exception 'Administrative session setup failed.';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'operationId', v_operation_id,
    'idCompetition', v_competition_id,
    'dateCompetition', v_date,
    'horaires', '21:00'
  );

  v_premier_resultat := public.api_admin_site(
    v_admin_a->>'sessionToken',
    'ajouter_date',
    v_payload
  );
  v_rejeu_resultat := public.api_admin_site(
    v_admin_a->>'sessionToken',
    'ajouter_date',
    v_payload
  );

  if not coalesce((v_premier_resultat->>'succes')::boolean, false)
     or v_rejeu_resultat is distinct from v_premier_resultat then
    raise exception 'An identical operation replay did not return its stored result.';
  end if;
  if (select pg_catalog.count(*) from public.dates_competition d
      where d.competition_id = v_competition_id and d.date_competition = v_date) <> 1 then
    raise exception 'An identical operation replay duplicated its business effect.';
  end if;
  if (select pg_catalog.count(*) from public.journal_activite j
      where j.action = 'Date ajoutée' and j.details like 'Compétition : test-idempotence-' || v_suffix || '%') <> 1 then
    raise exception 'An identical operation replay duplicated its activity journal.';
  end if;

  v_resultat := public.api_admin_site(
    v_admin_a->>'sessionToken',
    'ajouter_date',
    v_payload || pg_catalog.jsonb_build_object('horaires', '22:00')
  );
  if v_resultat->>'code' <> 'OPERATION_INVALIDE' then
    raise exception 'An operation identifier was reused with a different payload.';
  end if;

  v_resultat := public.api_admin_site(
    v_admin_a->>'sessionToken',
    'supprimer_competition',
    pg_catalog.jsonb_build_object(
      'operationId', v_operation_id,
      'idCompetition', v_competition_id
    )
  );
  if v_resultat->>'code' <> 'OPERATION_INVALIDE' then
    raise exception 'An operation identifier was reused with a different action.';
  end if;

  v_resultat := public.api_admin_site(
    v_admin_b->>'sessionToken',
    'ajouter_date',
    v_payload
  );
  if v_resultat->>'code' <> 'OPERATION_INVALIDE' then
    raise exception 'An operation identifier was reused by a different actor.';
  end if;

  v_resultat := public.api_admin_site(
    v_admin_a_bis->>'sessionToken',
    'ajouter_date',
    v_payload
  );
  if v_resultat->>'code' <> 'OPERATION_INVALIDE' then
    raise exception 'An operation identifier was reused from a different session.';
  end if;

  if not exists (
    select 1
    from app_private.admin_operations o
    where o.operation_id = v_operation_id
      and o.resultat = v_premier_resultat
      and o.termine_a is not null
      and o.request_digest is not null
  ) then
    raise exception 'The completed idempotent operation was not stored atomically.';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'app_private'
      and c.table_name = 'admin_operations'
      and c.column_name ~ '(payload|password|mot_de_passe|token|secret|credential)'
  ) then
    raise exception 'The idempotency table contains a forbidden raw credential column.';
  end if;
end;
$admin_idempotency$;

rollback;

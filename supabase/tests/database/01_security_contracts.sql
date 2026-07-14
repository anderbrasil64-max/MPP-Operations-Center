begin;

do $$
declare
  v_name text;
  v_phase smallint;
  v_index_definition text;
  v_browser_function oid;
  v_browser_functions oid[] := array[
    pg_catalog.to_regprocedure('public.ouvrir_session_joueur_site(text,text)')::oid,
    pg_catalog.to_regprocedure('public.ouvrir_session_admin_site(text,text)')::oid,
    pg_catalog.to_regprocedure('public.restaurer_session_site(text)')::oid,
    pg_catalog.to_regprocedure('public.fermer_session_site(text)')::oid,
    pg_catalog.to_regprocedure('public.changer_credential_session_site(text,text)')::oid,
    pg_catalog.to_regprocedure('public.api_joueur_site(text,text,jsonb)')::oid,
    pg_catalog.to_regprocedure('public.api_admin_site(text,text,jsonb)')::oid
  ];
begin
  select phase into strict v_phase
  from app_private.release_state
  where release_name='alpha_0_13_0';
  if v_phase<5 or v_phase>7 then
    raise exception 'Unexpected Alpha 0.13.0 release phase: %.', v_phase;
  end if;

  foreach v_name in array array[
    'ouvrir_session_joueur_site', 'ouvrir_session_admin_site', 'restaurer_session_site',
    'fermer_session_site', 'changer_credential_session_site', 'api_joueur_site', 'api_admin_site'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name and p.prosecdef
        and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%'
    ) then
      raise exception 'Security contract missing for function %', v_name;
    end if;
  end loop;

  if v_phase>=6 then
    if pg_catalog.cardinality(v_browser_functions)<>7
       or pg_catalog.array_position(v_browser_functions,null::oid) is not null then
      raise exception 'A required browser RPC signature is missing after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral pg_catalog.aclexplode(
        case when pg_catalog.cardinality(c.relacl)>0 then c.relacl else null::pg_catalog.aclitem[] end
      ) acl
      left join pg_catalog.pg_roles r on r.oid=acl.grantee
      where n.nspname='public'
        and c.relname=any(array[
          'competitions','dates_competition','discord_link_requests',
          'journal_activite','joueurs','presences','rappels_presence_discord'
        ])
        and (acl.grantee=0 or r.rolname in ('anon','authenticated'))
    ) or exists (
      select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid=a.attrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral pg_catalog.aclexplode(
        case when pg_catalog.cardinality(a.attacl)>0 then a.attacl else null::pg_catalog.aclitem[] end
      ) acl
      left join pg_catalog.pg_roles r on r.oid=acl.grantee
      where n.nspname='public'
        and c.relname=any(array[
          'competitions','dates_competition','discord_link_requests',
          'journal_activite','joueurs','presences','rappels_presence_discord'
        ])
        and a.attnum>0 and not a.attisdropped
        and (acl.grantee=0 or r.rolname in ('anon','authenticated'))
    ) then
      raise exception 'A direct API table or column privilege remains after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.unnest(array[
        'competitions','dates_competition','discord_link_requests',
        'journal_activite','joueurs','presences','rappels_presence_discord'
      ]::text[]) as business_table(table_name)
      cross join pg_catalog.unnest(array[
        'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
      ]::text[]) as table_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        'anon',
        pg_catalog.to_regclass(pg_catalog.format('public.%I',business_table.table_name)),
        table_privilege.privilege_name
      ) or pg_catalog.has_table_privilege(
        'authenticated',
        pg_catalog.to_regclass(pg_catalog.format('public.%I',business_table.table_name)),
        table_privilege.privilege_name
      )
    ) then
      raise exception 'An inherited API table privilege remains after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid=p.polrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname=any(array[
          'competitions','dates_competition','discord_link_requests',
          'journal_activite','joueurs','presences','rappels_presence_discord'
        ])
        and (
          0::oid=any(p.polroles)
          or exists (
            select 1
            from pg_catalog.unnest(p.polroles) as policy_role(role_oid)
            join pg_catalog.pg_roles r on r.oid=policy_role.role_oid
            where r.rolname in ('anon','authenticated')
               or pg_catalog.pg_has_role('anon',r.oid,'MEMBER')
               or pg_catalog.pg_has_role('authenticated',r.oid,'MEMBER')
          )
        )
    ) then
      raise exception 'An API-facing policy remains after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral pg_catalog.aclexplode(
        case when pg_catalog.cardinality(c.relacl)>0 then c.relacl else null::pg_catalog.aclitem[] end
      ) acl
      left join pg_catalog.pg_roles r on r.oid=acl.grantee
      where n.nspname='public' and c.relkind='S'
        and (acl.grantee=0 or r.rolname in ('anon','authenticated'))
    ) then
      raise exception 'A direct API sequence privilege remains after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='S'
        and (
          pg_catalog.has_sequence_privilege('anon',c.oid,'USAGE')
          or pg_catalog.has_sequence_privilege('anon',c.oid,'SELECT')
          or pg_catalog.has_sequence_privilege('anon',c.oid,'UPDATE')
          or pg_catalog.has_sequence_privilege('authenticated',c.oid,'USAGE')
          or pg_catalog.has_sequence_privilege('authenticated',c.oid,'SELECT')
          or pg_catalog.has_sequence_privilege('authenticated',c.oid,'UPDATE')
        )
    ) then
      raise exception 'An inherited API sequence privilege remains after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      cross join lateral pg_catalog.aclexplode(
        case
          when p.proacl is null then pg_catalog.acldefault('f',p.proowner)
          when pg_catalog.cardinality(p.proacl)>0 then p.proacl
          else null::pg_catalog.aclitem[]
        end
      ) acl
      where n.nspname='public'
        and acl.privilege_type='EXECUTE'
        and acl.grantee=0
    ) then
      raise exception 'A PUBLIC function grant remains after cutover.';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and not (p.oid=any(v_browser_functions))
        and (
          pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
          or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        )
    ) then
      raise exception 'An unexpected API function grant remains after cutover.';
    end if;

    foreach v_browser_function in array v_browser_functions loop
      if not pg_catalog.has_function_privilege('anon',v_browser_function,'EXECUTE')
         or not pg_catalog.has_function_privilege('authenticated',v_browser_function,'EXECUTE') then
        raise exception 'A required browser RPC grant is missing after cutover.';
      end if;
    end loop;
  end if;
  end if;

  if not has_function_privilege('anon', 'public.ouvrir_session_joueur_site(text,text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.api_joueur_site(text,text,jsonb)', 'EXECUTE') then
    raise exception 'Required session API execution privileges are missing.';
  end if;

  if has_schema_privilege('anon', 'app_private', 'USAGE')
     or has_schema_privilege('authenticated', 'app_private', 'USAGE') then
    raise exception 'Private schema usage leaked to an API role.';
  end if;

  if has_function_privilege('anon', 'app_private.discord_snapshot_hash(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'app_private.verrou_auth_joueur(bigint)', 'EXECUTE') then
    raise exception 'A private security helper is executable by an API role.';
  end if;

  select pg_get_indexdef(to_regclass('public.rappels_presence_discord_unique_jour'))
  into v_index_definition;
  if v_index_definition is null or v_index_definition ilike '%heure_programmee%' then
    raise exception 'The Discord deduplication key is missing or still depends on the schedule hour.';
  end if;

  if to_regclass('public.rappels_presence_discord_retention_idx') is null
     or to_regclass('app_private.sessions_retention_idx') is null
     or to_regclass('public.discord_link_requests_retention_idx') is null then
    raise exception 'A retention index is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid='app_private.rappel_fragments'::regclass
      and conname='rappel_fragments_rappel_id_fkey'
      and contype='f'
      and convalidated
  ) then
    raise exception 'Reminder fragments do not have a validated parent FK.';
  end if;
end;
$$;

rollback;

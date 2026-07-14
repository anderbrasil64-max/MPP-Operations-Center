begin;

do $$
begin
  perform 1
  from app_private.release_state
  where release_name = 'alpha_0_13_0'
    and phase in (5, 6)
  for update;
  if not found then
    raise exception 'Migration order violation: cutover requires phase 05.';
  end if;
end;
$$;

lock table public.joueurs in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.joueurs
    where lower(btrim(coalesce(statut,'')))='actif'
      and (
        code_acces_hash is null
        or octet_length(code_acces_hash)<>60
        or code_acces_hash!~'^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
      )
  ) then
    raise exception 'Cutover blocked: every active player needs a valid 60-byte access credential hash.';
  end if;

  if exists (
    select 1
    from public.joueurs
    where lower(btrim(coalesce(statut,'')))='actif'
      and (
        app_private.role_present(roles,'Officier')
        or app_private.role_present(roles,'SuperAdmin')
      )
      and (
        mot_de_passe_hash is null
        or octet_length(mot_de_passe_hash)<>60
        or mot_de_passe_hash!~'^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
      )
  ) then
    raise exception 'Cutover blocked: every active privileged account needs a valid 60-byte administrative credential hash.';
  end if;

  if not exists (
    select 1
    from public.joueurs
    where lower(btrim(coalesce(statut,'')))='actif'
      and app_private.role_present(roles,'SuperAdmin')
  ) then
    raise exception 'Cutover blocked: at least one active SuperAdmin must be preserved.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in (
        'competitions','dates_competition','discord_link_requests',
        'journal_activite','joueurs','presences','rappels_presence_discord'
      )
      and c.relkind in ('r','p')
      and not c.relrowsecurity
  ) then
    raise exception 'Cutover blocked: RLS must be enabled on every exposed business table.';
  end if;
end;
$$;

do $cutover_revoke$
declare
  v_table text;
  v_policy record;
  v_proc record;
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
  if pg_catalog.cardinality(v_browser_functions)<>7
     or pg_catalog.array_position(v_browser_functions,null::oid) is not null then
    raise exception 'Cutover blocked: a required browser RPC signature is missing.';
  end if;

  foreach v_table in array array[
    'competitions','dates_competition','discord_link_requests',
    'journal_activite','joueurs','presences','rappels_presence_discord'
  ] loop
    execute pg_catalog.format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      v_table
    );
  end loop;

  revoke all privileges on all sequences in schema public from public, anon, authenticated;
  revoke execute on all functions in schema public from public;

  -- Supprimer toute policy visant un rôle API, quel que soit son nom. Les rôles
  -- internes et service_role n'ont pas besoin de policy car ils ne passent pas
  -- par la surface publique de tables.
  for v_policy in
    select c.relname, p.polname
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
  loop
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      v_policy.polname,
      v_policy.relname
    );
  end loop;

  -- L'exécution browser reste limitée aux sept RPC de session/application 0.13.
  -- Tout ancien endpoint ou grant parasite est révoqué sans dépendre de son nom.
  for v_proc in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and not (p.oid=any(v_browser_functions))
  loop
    execute pg_catalog.format(
      'revoke execute on function %s from anon, authenticated',
      v_proc.oid::pg_catalog.regprocedure
    );
  end loop;
end;
$cutover_revoke$;

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname='supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from public, anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from public, anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated';
  end if;
end;
$$;

do $cutover_postconditions$
declare
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
  if pg_catalog.cardinality(v_browser_functions)<>7
     or pg_catalog.array_position(v_browser_functions,null::oid) is not null then
    raise exception 'Cutover blocked: a required browser RPC signature is missing.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,'{}'::pg_catalog.aclitem[])) acl
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
    cross join lateral pg_catalog.aclexplode(coalesce(a.attacl,'{}'::pg_catalog.aclitem[])) acl
    left join pg_catalog.pg_roles r on r.oid=acl.grantee
    where n.nspname='public'
      and c.relname=any(array[
        'competitions','dates_competition','discord_link_requests',
        'journal_activite','joueurs','presences','rappels_presence_discord'
      ])
      and a.attnum>0 and not a.attisdropped
      and (acl.grantee=0 or r.rolname in ('anon','authenticated'))
  ) then
    raise exception 'Cutover blocked: a direct API table or column privilege remains.';
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
    raise exception 'Cutover blocked: an inherited API table privilege remains.';
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
    raise exception 'Cutover blocked: an API-facing table policy remains.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,'{}'::pg_catalog.aclitem[])) acl
    left join pg_catalog.pg_roles r on r.oid=acl.grantee
    where n.nspname='public' and c.relkind='S'
      and (acl.grantee=0 or r.rolname in ('anon','authenticated'))
  ) then
    raise exception 'Cutover blocked: a direct API sequence privilege remains.';
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
    raise exception 'Cutover blocked: an inherited API sequence privilege remains.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(
      p.proacl,
      pg_catalog.acldefault('f',p.proowner)
    )) acl
    left join pg_catalog.pg_roles r on r.oid=acl.grantee
    where n.nspname='public'
      and acl.privilege_type='EXECUTE'
      and acl.grantee=0
  ) then
    raise exception 'Cutover blocked: a PUBLIC function grant remains.';
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
    raise exception 'Cutover blocked: an unexpected API function grant remains.';
  end if;

  foreach v_browser_function in array v_browser_functions loop
    if not pg_catalog.has_function_privilege('anon',v_browser_function,'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated',v_browser_function,'EXECUTE') then
      raise exception 'Cutover blocked: a required browser RPC grant is missing.';
    end if;
  end loop;
end;
$cutover_postconditions$;

update app_private.release_state
set phase = 6,
    phase_name = 'privileges_rls_cutover',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (5, 6);

commit;

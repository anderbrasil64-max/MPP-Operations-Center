begin;

create temporary table expected_security_definers (
  signature text primary key,
  audience text not null check (audience in ('browser', 'private', 'service'))
) on commit drop;

insert into expected_security_definers (signature, audience) values
  ('app_private.initialiser_code_acces_joueur(bigint)', 'private'),
  ('app_private.auth_verrouillee(text,text)', 'private'),
  ('app_private.auth_echec(text,text)', 'private'),
  ('app_private.auth_succes(text,text)', 'private'),
  ('app_private.creer_session(bigint,text)', 'private'),
  ('app_private.contexte_session(text,text)', 'private'),
  ('public.ouvrir_session_joueur_site(text,text)', 'browser'),
  ('public.ouvrir_session_admin_site(text,text)', 'browser'),
  ('public.restaurer_session_site(text)', 'browser'),
  ('public.fermer_session_site(text)', 'browser'),
  ('public.changer_credential_session_site(text,text)', 'browser'),
  ('public.api_joueur_site(text,text,jsonb)', 'browser'),
  ('public.api_admin_site(text,text,jsonb)', 'browser'),
  ('public.charger_donnees_rappels_discord_site(date)', 'service'),
  ('public.reserver_envoi_discord_site(text,bigint,date,time,jsonb,text,integer,integer)', 'service'),
  ('public.reserver_fragment_discord_site(bigint,uuid,integer,text,integer)', 'service'),
  ('public.enregistrer_fragment_discord_site(bigint,uuid,integer,text,integer,text,text,text)', 'service'),
  ('public.finaliser_envoi_discord_site(bigint,uuid,text,text,integer,integer,integer,integer,integer,jsonb,text)', 'service'),
  ('public.edge_creer_code_liaison_site(text,text,timestamptz)', 'service'),
  ('public.edge_lister_demandes_liaison_site(text)', 'service'),
  ('public.edge_traiter_demande_liaison_site(text,uuid,text,text)', 'service'),
  ('public.edge_enregistrer_identite_discord_site(text,text,text)', 'service'),
  ('public.traiter_auto_statut_competitions_site(date,time)', 'service'),
  ('public.nettoyer_donnees_securite_site()', 'service');

do $security_contracts$
declare
  v_expected record;
  v_oid oid;
  v_proc record;
begin
  for v_expected in select * from expected_security_definers order by signature loop
    v_oid := pg_catalog.to_regprocedure(v_expected.signature)::oid;
    if v_oid is null then
      raise exception 'Missing privileged function signature: %', v_expected.signature;
    end if;

    select p.prosecdef, coalesce(p.proconfig, array[]::text[]) as proconfig
    into strict v_proc
    from pg_catalog.pg_proc p
    where p.oid = v_oid;

    if not v_proc.prosecdef then
      raise exception 'Function is not SECURITY DEFINER: %', v_expected.signature;
    end if;
    if not v_proc.proconfig @> array['search_path=""']::text[] then
      raise exception 'Empty search_path missing: %', v_expected.signature;
    end if;
    if exists (
      select 1
      from pg_catalog.pg_proc acl_proc
      cross join lateral pg_catalog.aclexplode(
        case
          when acl_proc.proacl is null then pg_catalog.acldefault('f',acl_proc.proowner)
          when pg_catalog.cardinality(acl_proc.proacl)>0 then acl_proc.proacl
          else null::pg_catalog.aclitem[]
        end
      ) acl
      where acl_proc.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC can execute function: %', v_expected.signature;
    end if;

    if v_expected.audience = 'browser' then
      if not pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
         or not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
        raise exception 'Browser grants missing: %', v_expected.signature;
      end if;
    elsif v_expected.audience = 'service' then
      if not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
        raise exception 'Service grants invalid: %', v_expected.signature;
      end if;
    else
      if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
        raise exception 'Private function is executable by an API role: %', v_expected.signature;
      end if;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and (n.nspname || '.' || p.proname) in (
        select regexp_replace(signature, '\(.*$', '')
        from expected_security_definers
      )
      and not exists (
        select 1 from expected_security_definers e
        where pg_catalog.to_regprocedure(e.signature)::oid = p.oid
      )
  ) then
    raise exception 'Unexpected SECURITY DEFINER overload detected.';
  end if;
end;
$security_contracts$;

rollback;

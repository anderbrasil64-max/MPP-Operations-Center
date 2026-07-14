begin;

do $owner_bootstrap_contract$
declare
  v_target_id bigint;
  v_officer_id bigint;
  v_inactive_id bigint;
  v_existing_id bigint;
  v_code text;
  v_existing_code text := encode(extensions.gen_random_bytes(32),'hex');
  v_hash text;
  v_auth_version_before integer;
  v_auth_version_after integer;
begin
  select id, auth_version into strict v_target_id, v_auth_version_before
  from public.joueurs
  where lower(btrim(statut))='actif'
    and exists (
      select 1
      from pg_catalog.regexp_split_to_table(coalesce(roles,''), ',') as r(role_value)
      where lower(btrim(r.role_value))='superadmin'
    )
    and code_acces_hash is null
  order by id
  limit 1;

  insert into public.joueurs(pseudo,roles,statut)
  values('Bootstrap Officer ' || extensions.gen_random_uuid()::text,'Officier','Actif')
  returning id into v_officer_id;

  insert into public.joueurs(pseudo,roles,statut)
  values('Bootstrap Inactive ' || extensions.gen_random_uuid()::text,'SuperAdmin','Inactif')
  returning id into v_inactive_id;

  insert into public.joueurs(pseudo,roles,statut,code_acces_hash)
  values(
    'Bootstrap Existing ' || extensions.gen_random_uuid()::text,
    'SuperAdmin',
    'Actif',
    app_private.credential_hash(v_existing_code)
  )
  returning id into v_existing_id;

  v_code := app_private.initialiser_code_acces_joueur(v_target_id);

  if octet_length(v_code)<32 or v_code!~'^[0-9a-f]+$' then
    raise exception 'Owner bootstrap did not return a strong hexadecimal access code.';
  end if;

  select code_acces_hash, auth_version into strict v_hash, v_auth_version_after
  from public.joueurs
  where id=v_target_id;

  if v_hash is null
     or extensions.crypt(
       encode(extensions.digest(v_code,'sha256'),'hex'),
       v_hash
     )<>v_hash then
    raise exception 'Owner bootstrap did not configure the requested access hash.';
  end if;

  if v_auth_version_after<>v_auth_version_before+1 then
    raise exception 'Owner bootstrap did not increment the authentication version.';
  end if;

  if not exists (
    select 1
    from app_private.security_events
    where joueur_id=v_target_id
      and categorie='provisionnement_code_joueur'
      and resultat='succes'
      and details='{}'::jsonb
  ) then
    raise exception 'Owner bootstrap audit event is missing or contains unexpected details.';
  end if;

  begin
    perform app_private.initialiser_code_acces_joueur(v_target_id);
    raise exception 'Owner bootstrap returned a second access code.';
  exception
    when others then
      if sqlerrm<>'Bootstrap refused.' then raise; end if;
  end;

  begin
    perform app_private.initialiser_code_acces_joueur(v_officer_id);
    raise exception 'Owner bootstrap accepted a non-SuperAdmin target.';
  exception
    when others then
      if sqlerrm<>'Bootstrap refused.' then raise; end if;
  end;

  begin
    perform app_private.initialiser_code_acces_joueur(v_inactive_id);
    raise exception 'Owner bootstrap accepted an inactive target.';
  exception
    when others then
      if sqlerrm<>'Bootstrap refused.' then raise; end if;
  end;

  begin
    perform app_private.initialiser_code_acces_joueur(v_existing_id);
    raise exception 'Owner bootstrap accepted a target with an existing hash.';
  exception
    when others then
      if sqlerrm<>'Bootstrap refused.' then raise; end if;
  end;

  begin
    perform app_private.initialiser_code_acces_joueur(null);
    raise exception 'Owner bootstrap accepted a null target.';
  exception
    when others then
      if sqlerrm<>'Bootstrap refused.' then raise; end if;
  end;

  if pg_catalog.has_function_privilege(
       'anon','app_private.initialiser_code_acces_joueur(bigint)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','app_private.initialiser_code_acces_joueur(bigint)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role','app_private.initialiser_code_acces_joueur(bigint)','EXECUTE'
     ) then
    raise exception 'Owner bootstrap is executable by an API role.';
  end if;
end;
$owner_bootstrap_contract$;

rollback;

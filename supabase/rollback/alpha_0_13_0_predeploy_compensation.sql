begin;

-- Safe compensation: disable whichever new endpoints already exist. Static
-- allowlists plus to_regprocedure() make the script safe after a partial apply.
do $$
declare
  v_signature text;
  v_phase smallint;
begin
  if to_regclass('app_private.release_state') is not null then
    select phase into v_phase
    from app_private.release_state
    where release_name='alpha_0_13_0'
    for update;
    if v_phase>=6 then
      raise exception 'Predeploy compensation is forbidden after cutover.';
    end if;
  end if;

  foreach v_signature in array array[
    'public.ouvrir_session_joueur_site(text,text)',
    'public.ouvrir_session_admin_site(text,text)',
    'public.restaurer_session_site(text)',
    'public.fermer_session_site(text)',
    'public.changer_credential_session_site(text,text)',
    'public.api_joueur_site(text,text,jsonb)',
    'public.api_admin_site(text,text,jsonb)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke execute on function %s from anon, authenticated', v_signature);
    end if;
  end loop;

  foreach v_signature in array array[
    'public.charger_donnees_rappels_discord_site(date)',
    'public.reserver_envoi_discord_site(text,bigint,date,time without time zone,jsonb,text,integer,integer)',
    'public.reserver_fragment_discord_site(bigint,uuid,integer,text,integer)',
    'public.enregistrer_fragment_discord_site(bigint,uuid,integer,text,integer,text,text,text)',
    'public.finaliser_envoi_discord_site(bigint,uuid,text,text,integer,integer,integer,integer,integer,jsonb,text)',
    'public.edge_creer_code_liaison_site(text,text,timestamp with time zone)',
    'public.edge_lister_demandes_liaison_site(text)',
    'public.edge_traiter_demande_liaison_site(text,uuid,text,text)',
    'public.edge_enregistrer_identite_discord_site(text,text,text)',
    'public.traiter_auto_statut_competitions_site(date,time without time zone)',
    'public.nettoyer_donnees_securite_site()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke execute on function %s from service_role', v_signature);
    end if;
  end loop;

  if to_regclass('app_private.sessions') is not null then
    update app_private.sessions
    set revoque_a=coalesce(revoque_a,now()),raison_revocation='rollback_predeploy'
    where revoque_a is null;
  end if;

  if to_regclass('public.rappels_presence_discord') is not null
     and exists (
       select 1
       from pg_catalog.pg_attribute
       where attrelid=to_regclass('public.rappels_presence_discord')
         and attname='lease_expires_at'
         and not attisdropped
     ) then
    execute $sql$
      update public.rappels_presence_discord
      set statut='echec_incertain',
          lease_expires_at=null,
          erreur='ROLLBACK_PREDEPLOY',
          updated_at=now()
      where statut='en_cours'
    $sql$;
  end if;

  if to_regclass('app_private.release_state') is not null then
    update app_private.release_state
    set phase=least(phase,2),
        phase_name='predeploy_compensated',
        updated_at=now()
    where release_name='alpha_0_13_0';
  end if;
end;
$$;

commit;

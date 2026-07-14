begin;

-- Compensation conservant le modele 0.13: seules les RPC opaques sont
-- rouvertes. Les tables et sequences restent inaccessibles aux roles API.
do $$
declare
  v_signature text;
  v_table text;
  v_phase smallint;
begin
  if to_regclass('app_private.release_state') is not null then
    select phase into v_phase
    from app_private.release_state
    where release_name='alpha_0_13_0'
    for update;
    if v_phase>=7 then
      raise exception 'Cutover compensation is forbidden after irreversible legacy cleanup.';
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
      execute format(
        'grant execute on function %s to anon, authenticated',
        v_signature
      );
    end if;
  end loop;

  foreach v_table in array array[
    'joueurs','presences','competitions','dates_competition',
    'journal_activite','discord_link_requests','rappels_presence_discord'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'revoke all on table public.%I from public, anon, authenticated',
        v_table
      );
    end if;
  end loop;

  revoke all privileges on all sequences in schema public from public, anon, authenticated;

  if to_regclass('app_private.release_state') is not null then
    update app_private.release_state
    set phase=least(phase,5),
        phase_name='cutover_compensated',
        updated_at=now()
    where release_name='alpha_0_13_0';
  end if;
end;
$$;

commit;

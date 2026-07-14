begin;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.ouvrir_session_joueur_site(text,text)',
    'public.ouvrir_session_admin_site(text,text)',
    'public.restaurer_session_site(text)',
    'public.fermer_session_site(text)',
    'public.changer_credential_session_site(text,text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke execute on function %s from anon, authenticated',
        v_signature
      );
    end if;
  end loop;

  if to_regclass('app_private.sessions') is not null then
    execute $sql$
      update app_private.sessions
      set revoque_a=coalesce(revoque_a,now()),
          raison_revocation='rollback_sessions'
      where revoque_a is null
    $sql$;
  end if;

  if to_regclass('app_private.release_state') is not null then
    execute $sql$
      update app_private.release_state
      set phase=least(phase,2),
          phase_name='sessions_compensated',
          updated_at=now()
      where release_name='alpha_0_13_0'
    $sql$;
  end if;
end;
$$;

commit;

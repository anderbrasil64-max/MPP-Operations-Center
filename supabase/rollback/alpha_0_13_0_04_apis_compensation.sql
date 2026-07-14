begin;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.api_joueur_site(text,text,jsonb)',
    'public.api_admin_site(text,text,jsonb)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke execute on function %s from anon, authenticated',
        v_signature
      );
    end if;
  end loop;

  if to_regclass('app_private.release_state') is not null then
    execute $sql$
      update app_private.release_state
      set phase=least(phase,3),
          phase_name='apis_compensated',
          updated_at=now()
      where release_name='alpha_0_13_0'
    $sql$;
  end if;
end;
$$;

commit;

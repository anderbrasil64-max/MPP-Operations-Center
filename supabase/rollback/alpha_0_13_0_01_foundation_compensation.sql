begin;

-- La fondation reste additive. Cette compensation confine les objets prives et
-- replace seulement l'orchestrateur a la derniere phase rejouable.
do $$
begin
  if to_regnamespace('app_private') is not null then
    execute 'revoke all on schema app_private from public, anon, authenticated, service_role';
    execute 'revoke all on all tables in schema app_private from public, anon, authenticated, service_role';
    execute 'revoke all on all sequences in schema app_private from public, anon, authenticated, service_role';
    execute 'revoke execute on all functions in schema app_private from public, anon, authenticated, service_role';
  end if;

  if to_regclass('app_private.release_state') is not null then
    update app_private.release_state
    set phase=least(phase,1),
        phase_name='foundation_compensated',
        updated_at=now()
    where release_name='alpha_0_13_0';
  end if;
end;
$$;

commit;

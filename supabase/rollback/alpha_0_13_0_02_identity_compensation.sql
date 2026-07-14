begin;

-- Forward recovery volontaire: conserver les colonnes, backfills, unicites et
-- FK evite de recreer des orphelins. La phase 02 peut ensuite etre rejouee.
do $$
begin
  if to_regclass('app_private.release_state') is not null then
    update app_private.release_state
    set phase=least(phase,1),
        phase_name='identity_compensated',
        updated_at=now()
    where release_name='alpha_0_13_0';
  end if;
end;
$$;

commit;

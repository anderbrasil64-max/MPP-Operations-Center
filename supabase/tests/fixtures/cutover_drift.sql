begin;

-- Drift volontaire, exclusivement dans la base PostgreSQL jetable du runner.
-- Le cutover 06 doit supprimer ces grants et policies sans connaitre leurs noms.
do $cutover_drift$
declare
  v_table text;
  v_column text;
begin
  foreach v_table in array array[
    'competitions','dates_competition','discord_link_requests',
    'journal_activite','joueurs','presences','rappels_presence_discord'
  ] loop
    execute pg_catalog.format(
      'grant all privileges on table public.%I to public, anon, authenticated',
      v_table
    );

    select a.attname
    into strict v_column
    from pg_catalog.pg_attribute a
    where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('public.%I',v_table))
      and a.attnum>0 and not a.attisdropped
    order by a.attnum
    limit 1;

    execute pg_catalog.format(
      'grant select (%1$I), insert (%1$I), update (%1$I), references (%1$I) '
      'on table public.%2$I to public, anon, authenticated',
      v_column,
      v_table
    );

    execute pg_catalog.format(
      'create policy %I on public.%I for all to public using (true) with check (true)',
      'drift_public_' || v_table,
      v_table
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      'drift_anon_' || v_table,
      v_table
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'drift_authenticated_' || v_table,
      v_table
    );
  end loop;
end;
$cutover_drift$;

grant all privileges on all sequences in schema public to public, anon, authenticated;
grant execute on function public.api_admin_site(text,text,jsonb) to public;
grant execute on function public.charger_donnees_rappels_discord_site(date) to anon, authenticated;

commit;

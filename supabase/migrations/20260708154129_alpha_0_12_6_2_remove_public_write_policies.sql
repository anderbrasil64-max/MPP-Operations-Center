drop policy if exists "Public update joueurs" on public.joueurs;

drop policy if exists "Public insert presences" on public.presences;
drop policy if exists "Public update presences" on public.presences;

drop policy if exists "Public insert competitions" on public.competitions;
drop policy if exists "Public insert competitions anon" on public.competitions;
drop policy if exists "Public update competitions" on public.competitions;

drop policy if exists "Public insert dates_competition" on public.dates_competition;
drop policy if exists "Public delete dates_competition" on public.dates_competition;

drop policy if exists "Public insert journal_activite" on public.journal_activite;

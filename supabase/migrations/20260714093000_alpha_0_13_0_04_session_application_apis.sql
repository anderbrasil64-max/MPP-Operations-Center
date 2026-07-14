begin;

do $$
begin
  if not exists (
    select 1
    from app_private.release_state
    where release_name = 'alpha_0_13_0'
      and phase in (3, 4)
  ) then
    raise exception 'Migration order violation: session APIs require phase 03.';
  end if;
end;
$$;

create table if not exists app_private.admin_operations (
  operation_id uuid primary key,
  joueur_id bigint not null references public.joueurs(id) on delete cascade,
  session_id uuid not null,
  action text not null check (action in (
    'modifier_statut_competition', 'creer_competition', 'modifier_competition',
    'ajouter_date', 'supprimer_date', 'supprimer_competition',
    'ajouter_joueur', 'modifier_joueur', 'supprimer_joueur'
  )),
  request_digest bytea not null,
  resultat jsonb,
  cree_a timestamptz not null default now(),
  termine_a timestamptz,
  expire_a timestamptz not null default (now() + interval '7 days'),
  constraint admin_operations_completion_check check (
    (resultat is null and termine_a is null)
    or (resultat is not null and termine_a is not null)
  )
);

create index if not exists admin_operations_expire_a_idx
  on app_private.admin_operations(expire_a);

alter table app_private.admin_operations enable row level security;
alter table app_private.admin_operations force row level security;
revoke all on table app_private.admin_operations from public, anon, authenticated, service_role;

create or replace function public.api_joueur_site(
  p_session_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_id_competition bigint;
  v_competition public.competitions%rowtype;
  v_presence jsonb;
  v_date_id bigint;
  v_date date;
  v_statut text;
  v_horaires text;
  v_horaires_date text;
  v_dates_vues bigint[] := array[]::bigint[];
  v_code_actuel text;
  v_nouveau_code text;
  v_existante public.presences%rowtype;
  v_joueur public.joueurs%rowtype;
  v_ajouts integer := 0;
  v_modifications integer := 0;
  v_suppressions integer := 0;
  v_horaires_modifies integer := 0;
  v_credential_valide boolean;
  v_erreur_sqlstate text;
  v_erreur_schema text;
  v_erreur_table text;
  v_erreur_contrainte text;
begin
  select * into v_ctx from app_private.contexte_session(p_session_token, 'joueur');
  if not found then
    return jsonb_build_object('succes', false, 'code', 'SESSION_EXPIREE', 'message', 'Session expirée. Reconnectez-vous.');
  end if;

  if v_action = 'profil' then
    return jsonb_build_object(
      'succes', true,
      'joueur', (
        select jsonb_build_object(
          'id', j.id,
          'pseudo', j.pseudo,
          'roles', j.roles,
          'statut', j.statut,
          'discordLie', nullif(btrim(coalesce(j.discord_id, '')), '') is not null
        )
        from public.joueurs j where j.id = v_ctx.joueur_id
      )
    );
  end if;

  if v_action = 'competitions' then
    return jsonb_build_object(
      'succes', true,
      'competitions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'nom', c.nom,
          'statut', c.statut,
          'roles_autorises', c.roles_autorises,
          'description', c.description
        ) order by c.id desc)
        from public.competitions c
        where (c.statut <> 'Archivée' or v_ctx.est_officier)
          and app_private.competition_autorisee(v_ctx.roles, c.roles_autorises)
      ), '[]'::jsonb)
    );
  end if;

  if v_action = 'dates_competition' then
    v_id_competition := nullif(p_payload->>'idCompetition', '')::bigint;
    select * into v_competition
    from public.competitions
    where id = v_id_competition
      and (statut <> 'Archivée' or v_ctx.est_officier)
      and app_private.competition_autorisee(v_ctx.roles, roles_autorises);
    if not found then
      return jsonb_build_object('succes', false, 'message', 'Compétition indisponible.');
    end if;
    return jsonb_build_object(
      'succes', true,
      'dates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'competition_id', d.competition_id,
          'date_competition', d.date_competition,
          'horaires', d.horaires
        ) order by d.date_competition, d.id)
        from public.dates_competition d
        where d.competition_id = v_id_competition
      ), '[]'::jsonb)
    );
  end if;

  if v_action = 'competition_complete' then
    v_id_competition := nullif(p_payload->>'idCompetition', '')::bigint;
    select * into v_competition from public.competitions where id = v_id_competition for share;
    if not found
       or (v_competition.statut = 'Archivée' and not v_ctx.est_officier)
       or not app_private.competition_autorisee(v_ctx.roles, v_competition.roles_autorises) then
      return jsonb_build_object('succes', false, 'message', 'Compétition indisponible.');
    end if;

    return jsonb_build_object(
      'succes', true,
      'competition', jsonb_build_object(
        'id', v_competition.id,
        'nom', v_competition.nom,
        'statut', v_competition.statut,
        'roles_autorises', v_competition.roles_autorises,
        'description', v_competition.description
      ),
      'dates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'competition_id', d.competition_id,
          'date_competition', d.date_competition,
          'horaires', d.horaires
        ) order by d.date_competition, d.id)
        from public.dates_competition d
        where d.competition_id = v_id_competition
      ), '[]'::jsonb),
      'presences', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'competition_id', p.competition_id,
          'pseudo', p.pseudo,
          'date_competition', p.date_competition,
          'statut', p.statut,
          'horaires_disponibles', p.horaires_disponibles,
          'derniere_modification', p.derniere_modification
        ) order by p.date_competition, p.id)
        from public.presences p
        where p.competition_id = v_id_competition
          and p.joueur_id = v_ctx.joueur_id
      ), '[]'::jsonb)
    );
  end if;

  if v_action = 'sauvegarder_presences' then
    v_id_competition := nullif(p_payload->>'idCompetition', '')::bigint;
    select * into v_competition
    from public.competitions
    where id = v_id_competition
    for share;
    if not found
       or v_competition.statut <> 'Ouverte'
       or not app_private.competition_autorisee(v_ctx.roles, v_competition.roles_autorises) then
      return jsonb_build_object('succes', false, 'message', 'Cette compétition n’accepte pas de saisie.');
    end if;

    if jsonb_typeof(coalesce(p_payload->'presences', '[]'::jsonb)) <> 'array' then
      return jsonb_build_object('succes', false, 'message', 'Données de présence invalides.');
    end if;
    if jsonb_array_length(coalesce(p_payload->'presences', '[]'::jsonb)) > 366 then
      return jsonb_build_object('succes', false, 'message', 'Trop de lignes de présence.');
    end if;

    -- Valider tout le lot avant la première écriture pour conserver l'atomicité.
    for v_presence in select value from jsonb_array_elements(coalesce(p_payload->'presences', '[]'::jsonb)) loop
      if jsonb_typeof(v_presence) <> 'object' then
        return jsonb_build_object('succes', false, 'message', 'Données de présence invalides.');
      end if;
      select d.id, d.date_competition, coalesce(d.horaires, '')
      into v_date_id, v_date, v_horaires_date
      from public.dates_competition d
      where d.competition_id = v_id_competition
        and d.date_competition = case
          when coalesce(v_presence->>'dateCompetition', v_presence->>'date_competition', '') ~ '^\d{2}/\d{2}/\d{4}$'
            then to_date(coalesce(v_presence->>'dateCompetition', v_presence->>'date_competition'), 'DD/MM/YYYY')
          else coalesce(v_presence->>'dateCompetition', v_presence->>'date_competition')::date
        end
      for share;
      if not found then
        return jsonb_build_object('succes', false, 'message', 'Une date de présence est invalide.');
      end if;
      if v_date_id = any(v_dates_vues) then
        return jsonb_build_object('succes', false, 'message', 'Une date de présence est répétée.');
      end if;
      v_dates_vues := array_append(v_dates_vues, v_date_id);

      v_statut := case lower(btrim(coalesce(v_presence->>'statut', '')))
        when 'présent' then 'Présent'
        when 'present' then 'Présent'
        when 'absent' then 'Absent'
        when 'remplaçant' then 'Remplaçant'
        when 'remplacant' then 'Remplaçant'
        when 'non renseigné' then 'Non renseigné'
        when 'non renseigne' then 'Non renseigné'
        else null
      end;
      if v_statut is null then
        return jsonb_build_object('succes', false, 'message', 'Un statut de présence est invalide.');
      end if;

      v_horaires := left(btrim(coalesce(v_presence->>'horairesDisponibles', v_presence->>'horaires_disponibles', '')), 500);
      if v_statut in ('Absent', 'Non renseigné') then
        v_horaires := '';
      elsif v_horaires <> '' and exists (
        select 1
        from regexp_split_to_table(v_horaires, '\s*,\s*') as h(horaire)
        where btrim(h.horaire) !~ '^([01]\d|2[0-3]):[0-5]\d$'
           or not exists (
             select 1
             from regexp_split_to_table(v_horaires_date, '\s*,\s*') as d(horaire)
             where btrim(d.horaire) = btrim(h.horaire)
           )
      ) then
        return jsonb_build_object('succes', false, 'message', 'Un horaire de présence est invalide.');
      end if;
    end loop;

    for v_presence in select value from jsonb_array_elements(coalesce(p_payload->'presences', '[]'::jsonb)) loop
      select d.id, d.date_competition into v_date_id, v_date
      from public.dates_competition d
      where d.competition_id = v_id_competition
        and d.date_competition = case
          when coalesce(v_presence->>'dateCompetition', v_presence->>'date_competition', '') ~ '^\d{2}/\d{2}/\d{4}$'
            then to_date(coalesce(v_presence->>'dateCompetition', v_presence->>'date_competition'), 'DD/MM/YYYY')
          else coalesce(v_presence->>'dateCompetition', v_presence->>'date_competition')::date
        end;

      if not found then
        return jsonb_build_object('succes', false, 'message', 'Une date de présence est invalide.');
      end if;

      v_statut := case lower(btrim(coalesce(v_presence->>'statut', '')))
        when 'présent' then 'Présent'
        when 'present' then 'Présent'
        when 'absent' then 'Absent'
        when 'remplaçant' then 'Remplaçant'
        when 'remplacant' then 'Remplaçant'
        when 'non renseigné' then 'Non renseigné'
        when 'non renseigne' then 'Non renseigné'
        else null
      end;
      if v_statut is null then
        return jsonb_build_object('succes', false, 'message', 'Un statut de présence est invalide.');
      end if;

      v_horaires := left(btrim(coalesce(v_presence->>'horairesDisponibles', v_presence->>'horaires_disponibles', '')), 500);
      if v_statut in ('Absent', 'Non renseigné') then v_horaires := ''; end if;
      select * into v_existante
      from public.presences
      where date_competition_id = v_date_id and joueur_id = v_ctx.joueur_id;

      if not found and v_statut <> 'Non renseigné' then
        v_ajouts := v_ajouts + 1;
      elsif found then
        if coalesce(v_existante.statut, 'Non renseigné') <> v_statut then
          if v_statut = 'Non renseigné' then v_suppressions := v_suppressions + 1;
          elsif coalesce(v_existante.statut, 'Non renseigné') = 'Non renseigné' then v_ajouts := v_ajouts + 1;
          else v_modifications := v_modifications + 1;
          end if;
        elsif coalesce(v_existante.horaires_disponibles, '') <> v_horaires then
          v_horaires_modifies := v_horaires_modifies + 1;
        end if;
      end if;

      insert into public.presences (
        competition_id, joueur_id, pseudo, date_competition_id, date_competition,
        statut, horaires_disponibles, derniere_modification
      ) values (
        v_id_competition, v_ctx.joueur_id, v_ctx.pseudo, v_date_id, v_date,
        v_statut, v_horaires, now()
      )
      on conflict (date_competition_id, joueur_id) do update
      set statut = excluded.statut,
          horaires_disponibles = excluded.horaires_disponibles,
          derniere_modification = excluded.derniere_modification,
          pseudo = excluded.pseudo;
    end loop;

    update public.joueurs set derniere_modification = now() where id = v_ctx.joueur_id;
    if v_ajouts + v_modifications + v_suppressions + v_horaires_modifies > 0 then
      insert into public.journal_activite (utilisateur, action, details)
      values (
        v_ctx.pseudo,
        'Présences mises à jour',
        'Compétition : ' || v_competition.nom || E'\nAjouts : ' || v_ajouts ||
        E'\nModifications : ' || v_modifications || E'\nSuppressions : ' || v_suppressions ||
        E'\nHoraires modifiés : ' || v_horaires_modifies
      );
    end if;

    return jsonb_build_object(
      'succes', true,
      'message', 'Présences sauvegardées.',
      'ajouts', v_ajouts,
      'modifications', v_modifications,
      'suppressions', v_suppressions,
      'horairesModifies', v_horaires_modifies
    );
  end if;

  if v_action = 'changer_code_acces' then
    v_code_actuel := coalesce(p_payload->>'codeActuel', '');
    v_nouveau_code := coalesce(p_payload->>'nouveauCode', '');
    perform app_private.verrou_auth_joueur(v_ctx.joueur_id);
    select * into v_joueur from public.joueurs where id = v_ctx.joueur_id for update;
    v_credential_valide := app_private.credential_valide(v_code_actuel, v_joueur.code_acces_hash);
    if app_private.auth_verrouillee('changer_code', v_ctx.joueur_id::text) then
      return jsonb_build_object('succes', false, 'message', 'Modification impossible.');
    end if;
    if not v_credential_valide then
      perform app_private.auth_echec('changer_code', v_ctx.joueur_id::text);
      return jsonb_build_object('succes', false, 'message', 'Modification impossible.');
    end if;
    if length(v_nouveau_code) < 10 or octet_length(v_nouveau_code) > 256 then
      return jsonb_build_object('succes', false, 'message', 'Le nouveau code doit contenir au moins 10 caractères.');
    end if;
    perform app_private.auth_succes('changer_code', v_ctx.joueur_id::text);
    update public.joueurs
    set code_acces_hash = app_private.credential_hash(v_nouveau_code),
        auth_version = auth_version + 1,
        credential_modifie_a = now(),
        derniere_modification = now()
    where id = v_ctx.joueur_id;
    update app_private.sessions
    set revoque_a = coalesce(revoque_a, now()), raison_revocation = 'code_acces_modifie'
    where joueur_id = v_ctx.joueur_id and revoque_a is null;
    insert into app_private.security_events(joueur_id, categorie, resultat)
    values(v_ctx.joueur_id, 'credential_joueur', 'revocation');
    return jsonb_build_object('succes', true, 'message', 'Code d’accès modifié. Reconnectez-vous.');
  end if;

  return jsonb_build_object('succes', false, 'message', 'Action non autorisée.');
exception
  when others then
    get stacked diagnostics
      v_erreur_sqlstate = returned_sqlstate,
      v_erreur_schema = schema_name,
      v_erreur_table = table_name,
      v_erreur_contrainte = constraint_name;
    raise warning 'api_joueur_site failure: sqlstate=%, schema=%, table=%, constraint=%',
      v_erreur_sqlstate,
      nullif(v_erreur_schema, ''),
      nullif(v_erreur_table, ''),
      nullif(v_erreur_contrainte, '');
    return jsonb_build_object('succes', false, 'message', 'Action joueur indisponible.');
end;
$$;

create or replace function app_private.executer_api_admin_site(
  p_session_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ctx record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_id bigint;
  v_comp public.competitions%rowtype;
  v_date public.dates_competition%rowtype;
  v_joueur public.joueurs%rowtype;
  v_nom text;
  v_roles text;
  v_statut text;
  v_description text;
  v_discord_id text;
  v_code_acces text;
  v_mot_de_passe_admin_initial text;
  v_roles_privileges boolean;
  v_roles_privileges_avant boolean;
  v_config jsonb;
  v_dates jsonb;
  v_date_json jsonb;
  v_date_value date;
  v_nb integer := 0;
  v_auto boolean;
  v_notification boolean;
  v_rappel boolean;
  v_heure_ouverture time;
  v_heure_fermeture time;
  v_heure_notification time;
  v_heure_rappel time;
  v_dashboard jsonb;
begin
  if v_action in (
    'modifier_statut_competition','creer_competition','modifier_competition',
    'ajouter_date','supprimer_date','supprimer_competition',
    'ajouter_joueur','modifier_joueur','supprimer_joueur'
  ) then
    perform pg_advisory_xact_lock(hashtextextended('mpp-admin-write-global',0));
  end if;

  select * into v_ctx from app_private.contexte_session(p_session_token, 'admin');
  if not found then
    return jsonb_build_object('succes', false, 'code', 'SESSION_EXPIREE', 'message', 'Session officier expirée.');
  end if;

  if v_action in ('dashboard', 'tableau_de_bord') then
    select jsonb_build_object(
      'succes', true,
      'joueurs', jsonb_build_object(
        'total', count(*),
        'actifs', count(*) filter (where lower(btrim(coalesce(j.statut, ''))) = 'actif'),
        'inactifs', count(*) filter (where lower(btrim(coalesce(j.statut, ''))) = 'inactif'),
        'suspendus', count(*) filter (where lower(btrim(coalesce(j.statut, ''))) = 'suspendu'),
        'connectes7Jours', count(*) filter (
          where j.derniere_connexion >= now() - interval '7 days'
        ),
        'connectes30Jours', count(*) filter (
          where j.derniere_connexion >= now() - interval '30 days'
        ),
        'inactifs30Jours', count(*) filter (
          where j.derniere_connexion is not null
            and j.derniere_connexion < now() - interval '30 days'
        ),
        'jamaisConnectes', count(*) filter (where j.derniere_connexion is null)
      ),
      'competitions', (
        select jsonb_build_object(
          'ouvertes', count(*) filter (where lower(btrim(coalesce(c.statut, ''))) = 'ouverte'),
          'brouillon', count(*) filter (where lower(btrim(coalesce(c.statut, ''))) = 'brouillon'),
          'fermees', count(*) filter (where lower(btrim(coalesce(c.statut, ''))) in ('fermée', 'fermee')),
          'archivees', count(*) filter (where lower(btrim(coalesce(c.statut, ''))) in ('archivée', 'archivee'))
        )
        from public.competitions c
      ),
      'competitionsListe', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id,
          'nom', c.nom,
          'statut', c.statut,
          'date_creation', c.date_creation,
          'cree_par', c.cree_par,
          'roles_autorises', c.roles_autorises,
          'description', c.description,
          'fermeture_auto_active', c.fermeture_auto_active,
          'heure_ouverture', c.heure_ouverture,
          'heure_fermeture', c.heure_fermeture,
          'dernier_traitement_auto', c.dernier_traitement_auto,
          'notification_presence_active', c.notification_presence_active,
          'heure_notification_presence', c.heure_notification_presence,
          'rappel_presence_active', c.rappel_presence_active,
          'heure_rappel_presence', c.heure_rappel_presence
        ) order by c.id desc), '[]'::jsonb)
        from public.competitions c
      )
    ) into v_dashboard
    from public.joueurs j;
    return v_dashboard;
  end if;

  if v_action = 'joueurs' then
    return jsonb_build_object('succes', true, 'joueurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', j.id,
          'pseudo', j.pseudo,
          'roles', j.roles,
          'statut', j.statut,
          'discordId', case when v_ctx.est_superadmin then j.discord_id else null end,
          'discordUsername', j.discord_username,
          'discordLieA', j.discord_lie_a,
          'discordLie', nullif(btrim(coalesce(j.discord_id, '')), '') is not null,
          'dateAjout', j.date_ajout,
          'derniereConnexion', j.derniere_connexion,
          'derniereModification', j.derniere_modification,
          'codeAccesConfigure', j.code_acces_hash is not null,
          'credentialAdminConfigure', j.mot_de_passe_hash is not null
        ) order by lower(j.pseudo)
      ) from public.joueurs j
    ), '[]'::jsonb));
  end if;

  if v_action = 'competitions' then
    return jsonb_build_object('succes', true, 'competitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'nom',c.nom,'statut',c.statut,'date_creation',c.date_creation,
        'cree_par',c.cree_par,'roles_autorises',c.roles_autorises,'description',c.description,
        'fermeture_auto_active',c.fermeture_auto_active,'heure_ouverture',c.heure_ouverture,
        'heure_fermeture',c.heure_fermeture,'dernier_traitement_auto',c.dernier_traitement_auto,
        'notification_presence_active',c.notification_presence_active,
        'heure_notification_presence',c.heure_notification_presence,
        'rappel_presence_active',c.rappel_presence_active,
        'heure_rappel_presence',c.heure_rappel_presence
      ) order by c.id desc) from public.competitions c
    ), '[]'::jsonb));
  end if;

  if v_action = 'dates_competition' then
    v_id := nullif(p_payload->>'idCompetition', '')::bigint;
    return jsonb_build_object('succes', true, 'dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'competition_id',d.competition_id,
        'date_competition',d.date_competition,'horaires',d.horaires
      ) order by d.date_competition, d.id)
      from public.dates_competition d where d.competition_id = v_id
    ), '[]'::jsonb));
  end if;

  if v_action = 'tableau_presences' or v_action = 'sans_reponse' then
    v_id := nullif(p_payload->>'idCompetition', '')::bigint;
    select * into v_comp
    from public.competitions
    where id = v_id
    for share;
    if not found then
      return jsonb_build_object('succes', false, 'message', 'Compétition introuvable.');
    end if;
    return jsonb_build_object(
      'succes', true,
      'joueurs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',j.id,'pseudo',j.pseudo,'roles',j.roles,'statut',j.statut
        ) order by lower(j.pseudo))
        from public.joueurs j
        where app_private.competition_autorisee(j.roles, v_comp.roles_autorises)
      ), '[]'::jsonb),
      'dates', coalesce((select jsonb_agg(jsonb_build_object(
        'id',d.id,'competition_id',d.competition_id,'date_competition',d.date_competition,'horaires',d.horaires
      ) order by d.date_competition,d.id) from public.dates_competition d where d.competition_id=v_id), '[]'::jsonb),
      'presences', coalesce((select jsonb_agg(jsonb_build_object(
        'id',p.id,'competition_id',p.competition_id,'joueur_id',p.joueur_id,
        'pseudo',p.pseudo,'date_competition_id',p.date_competition_id,
        'date_competition',p.date_competition,'statut',p.statut,
        'horaires_disponibles',p.horaires_disponibles,'derniere_modification',p.derniere_modification
      ) order by p.date_competition,p.id)
        from public.presences p
        join public.joueurs j on j.id = p.joueur_id
        where p.competition_id=v_id
          and app_private.competition_autorisee(j.roles, v_comp.roles_autorises)
      ), '[]'::jsonb)
    );
  end if;

  if v_action = 'aujourdhui' then
    v_date_value := coalesce(nullif(p_payload->>'date', '')::date, (now() at time zone 'Europe/Paris')::date);
    return jsonb_build_object(
      'succes', true,
      'dates', coalesce((select jsonb_agg(jsonb_build_object(
        'id',d.id,'competition_id',d.competition_id,'date_competition',d.date_competition,'horaires',d.horaires
      ) order by d.competition_id,d.id) from public.dates_competition d where d.date_competition=v_date_value), '[]'::jsonb),
      'competitions', coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'nom',c.nom,'statut',c.statut,'roles_autorises',c.roles_autorises,
        'description',c.description,'rappel_presence_active',c.rappel_presence_active,
        'heure_rappel_presence',c.heure_rappel_presence
      ) order by c.id) from public.competitions c where exists (select 1 from public.dates_competition d where d.competition_id=c.id and d.date_competition=v_date_value)), '[]'::jsonb),
      'joueurs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',j.id,'pseudo',j.pseudo,'roles',j.roles,'statut',j.statut,
          'discordUsername',j.discord_username,
          'discordLie',nullif(btrim(coalesce(j.discord_id,'')),'') is not null
        ) order by lower(j.pseudo))
        from public.joueurs j
        where exists (
          select 1
          from public.dates_competition d
          join public.competitions c on c.id = d.competition_id
          where d.date_competition = v_date_value
            and app_private.competition_autorisee(j.roles, c.roles_autorises)
        )
      ), '[]'::jsonb),
      'presences', coalesce((select jsonb_agg(jsonb_build_object(
        'id',p.id,'competition_id',p.competition_id,'joueur_id',p.joueur_id,
        'pseudo',p.pseudo,'date_competition_id',p.date_competition_id,
        'date_competition',p.date_competition,'statut',p.statut,
        'horaires_disponibles',p.horaires_disponibles,'derniere_modification',p.derniere_modification
      ) order by p.id)
        from public.presences p
        join public.joueurs j on j.id = p.joueur_id
        join public.competitions c on c.id = p.competition_id
        where p.date_competition=v_date_value
          and app_private.competition_autorisee(j.roles, c.roles_autorises)
      ), '[]'::jsonb),
      'rappels', coalesce((select jsonb_agg(jsonb_build_object(
        'type_rappel',r.type_rappel,'competition_id',r.competition_id,
        'date_competition',r.date_competition,'heure_programmee',r.heure_programmee,
        'statut',r.statut,'envoye_a',r.envoye_a,'erreur',r.erreur,
        'nb_joueurs',r.nb_joueurs,'nb_mentions',r.nb_mentions,
        'nb_sans_discord',r.nb_sans_discord,'nb_messages',r.nb_messages,
        'updated_at',r.updated_at
      ) order by r.updated_at desc) from public.rappels_presence_discord r where r.date_competition=v_date_value), '[]'::jsonb)
    );
  end if;

  if v_action = 'journal' then
    return jsonb_build_object('succes', true, 'journal', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_heure',x.date_heure,'utilisateur',x.utilisateur,
        'action',x.action,'details',x.details
      ) order by x.date_heure desc)
      from (
        select j.date_heure, j.utilisateur, j.action, j.details
        from public.journal_activite j
        order by j.date_heure desc
        limit least(greatest(coalesce(nullif(p_payload->>'limite','')::integer, 50), 1), 200)
      ) x
    ), '[]'::jsonb));
  end if;

  if v_action = 'modifier_statut_competition' then
    v_id := nullif(p_payload->>'idCompetition', '')::bigint;
    v_statut := btrim(coalesce(p_payload->>'statut', ''));
    if v_statut not in ('Brouillon','Ouverte','Fermée','Archivée') then
      return jsonb_build_object('succes', false, 'message', 'Statut invalide.');
    end if;
    select * into v_comp from public.competitions where id=v_id for update;
    if not found then return jsonb_build_object('succes',false,'message','Compétition introuvable.'); end if;
    if (v_statut = 'Archivée' or v_comp.statut = 'Archivée') and not v_ctx.est_superadmin then
      return jsonb_build_object('succes', false, 'message', 'Action réservée au SuperAdmin.');
    end if;
    if v_comp.statut = v_statut then return jsonb_build_object('succes',true,'message','Statut inchangé.'); end if;
    update public.competitions set statut=v_statut where id=v_id returning * into v_comp;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Statut compétition modifié','Compétition : '||v_comp.nom||E'\nStatut : '||v_statut);
    return jsonb_build_object('succes',true,'message','Statut modifié.');
  end if;

  if v_action in ('creer_competition','modifier_competition') then
    v_config := coalesce(p_payload->'config', '{}'::jsonb);
    v_id := nullif(v_config->>'idCompetition','')::bigint;
    v_nom := left(btrim(coalesce(v_config->>'nom','')),120);
    v_statut := btrim(coalesce(v_config->>'statut','Brouillon'));
    v_roles := left(btrim(coalesce(v_config->>'rolesAutorises','')),250);
    v_description := left(btrim(coalesce(v_config->>'description','')),2000);
    v_auto := lower(coalesce(v_config->>'fermetureAutoActive','false')) in ('true','1','yes','oui');
    v_notification := lower(coalesce(v_config->>'notificationPresenceActive','false')) in ('true','1','yes','oui');
    v_rappel := lower(coalesce(v_config->>'rappelPresenceActive','false')) in ('true','1','yes','oui');
    v_heure_ouverture := nullif(btrim(coalesce(v_config->>'heureOuvertureAuto','')),'')::time;
    v_heure_fermeture := nullif(btrim(coalesce(v_config->>'heureFermetureAuto','')),'')::time;
    v_heure_notification := nullif(btrim(coalesce(v_config->>'heureNotificationPresence','')),'')::time;
    v_heure_rappel := nullif(btrim(coalesce(v_config->>'heureRappelPresence','')),'')::time;
    if v_nom='' or not app_private.roles_valides(v_roles) or v_statut not in ('Brouillon','Ouverte','Fermée','Archivée') then return jsonb_build_object('succes',false,'message','Configuration de compétition invalide.'); end if;
    if v_statut='Archivée' and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
    if v_auto and (v_heure_ouverture is null or v_heure_fermeture is null) then return jsonb_build_object('succes',false,'message','Horaires automatiques incomplets.'); end if;
    if v_notification and v_heure_notification is null then return jsonb_build_object('succes',false,'message','Heure de notification requise.'); end if;
    if v_rappel and v_heure_rappel is null then return jsonb_build_object('succes',false,'message','Heure de rappel requise.'); end if;

    if v_action='creer_competition' then
      if not v_ctx.est_superadmin and app_private.role_present(v_roles, 'SuperAdmin') then
        return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.');
      end if;
      v_dates := coalesce(v_config->'dates','[]'::jsonb);
      if jsonb_typeof(v_dates)<>'array' or jsonb_array_length(v_dates)=0 then return jsonb_build_object('succes',false,'message','Au moins une date est requise.'); end if;
      if jsonb_array_length(v_dates)>366 then return jsonb_build_object('succes',false,'message','Trop de dates de compétition.'); end if;
      insert into public.competitions(nom,statut,cree_par,roles_autorises,description,fermeture_auto_active,heure_ouverture,heure_fermeture,notification_presence_active,heure_notification_presence,rappel_presence_active,heure_rappel_presence)
      values(v_nom,v_statut,v_ctx.pseudo,v_roles,v_description,v_auto,case when v_auto then v_heure_ouverture end,case when v_auto then v_heure_fermeture end,v_notification,case when v_notification then v_heure_notification end,v_rappel,case when v_rappel then v_heure_rappel end)
      returning * into v_comp;
      for v_date_json in select value from jsonb_array_elements(v_dates) loop
        v_date_value := trim(both '"' from v_date_json::text)::date;
        insert into public.dates_competition(competition_id,date_competition,horaires)
        values(v_comp.id,v_date_value,left(btrim(coalesce(v_config->>'horaires','')),500));
        v_nb:=v_nb+1;
      end loop;
      insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Compétition créée','Compétition : '||v_comp.nom||E'\nDates : '||v_nb);
      return jsonb_build_object('succes',true,'message','Compétition créée.','idCompetition',v_comp.id,'nbDates',v_nb);
    else
      select * into v_comp from public.competitions where id=v_id for update;
      if not found then return jsonb_build_object('succes',false,'message','Compétition introuvable.'); end if;
      if v_comp.statut='Archivée' and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
      if not v_ctx.est_superadmin
         and app_private.role_present(v_roles, 'SuperAdmin') is distinct from
             app_private.role_present(v_comp.roles_autorises, 'SuperAdmin') then
        return jsonb_build_object('succes',false,'message','Le filtre SuperAdmin doit être conservé.');
      end if;
      update public.competitions set nom=v_nom,statut=v_statut,roles_autorises=v_roles,description=v_description,fermeture_auto_active=v_auto,heure_ouverture=case when v_auto then v_heure_ouverture end,heure_fermeture=case when v_auto then v_heure_fermeture end,notification_presence_active=v_notification,heure_notification_presence=case when v_notification then v_heure_notification end,rappel_presence_active=v_rappel,heure_rappel_presence=case when v_rappel then v_heure_rappel end where id=v_id returning * into v_comp;
      insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Compétition modifiée','Compétition : '||v_comp.nom||E'\nStatut : '||v_statut);
      return jsonb_build_object('succes',true,'message','Compétition modifiée.');
    end if;
  end if;

  if v_action='ajouter_date' then
    v_id:=nullif(p_payload->>'idCompetition','')::bigint;
    v_date_value:=nullif(p_payload->>'dateCompetition','')::date;
    select * into v_comp from public.competitions where id=v_id for update;
    if not found then return jsonb_build_object('succes',false,'message','Compétition introuvable.'); end if;
    if v_comp.statut='Archivée' and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
    insert into public.dates_competition(competition_id,date_competition,horaires) values(v_id,v_date_value,left(btrim(coalesce(p_payload->>'horaires','')),500)) returning * into v_date;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Date ajoutée','Compétition : '||v_comp.nom||E'\nDate : '||to_char(v_date_value,'DD/MM/YYYY'));
    return jsonb_build_object('succes',true,'message','Date ajoutée.','idDate',v_date.id);
  end if;

  if v_action='supprimer_date' then
    v_id:=nullif(p_payload->>'idDate','')::bigint;
    select d.* into v_date from public.dates_competition d where d.id=v_id;
    if not found then return jsonb_build_object('succes',false,'message','Date introuvable.'); end if;
    select * into v_comp from public.competitions where id=v_date.competition_id for update;
    if not found then return jsonb_build_object('succes',false,'message','Compétition introuvable.'); end if;
    select d.* into v_date
    from public.dates_competition d
    where d.id=v_id and d.competition_id=v_comp.id
    for update;
    if not found then return jsonb_build_object('succes',false,'message','Date introuvable.'); end if;
    if v_comp.statut='Archivée' and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
    delete from public.dates_competition where id=v_id;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Date supprimée','Date de compétition supprimée.');
    return jsonb_build_object('succes',true,'message','Date supprimée.');
  end if;

  if v_action='supprimer_competition' then
    if not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
    v_id:=nullif(p_payload->>'idCompetition','')::bigint;
    delete from public.competitions where id=v_id returning * into v_comp;
    if not found then return jsonb_build_object('succes',false,'message','Compétition introuvable.'); end if;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Compétition supprimée','Compétition : '||v_comp.nom);
    return jsonb_build_object('succes',true,'message','Compétition supprimée définitivement.');
  end if;

  if v_action in ('ajouter_joueur','modifier_joueur') then
    v_id:=nullif(p_payload->>'idJoueur','')::bigint;
    v_nom:=left(btrim(coalesce(p_payload->>'pseudo','')),80);
    v_roles:=left(btrim(coalesce(p_payload->>'roles','')),250);
    v_statut:=btrim(coalesce(p_payload->>'statut','Actif'));
    v_discord_id:=nullif(btrim(coalesce(p_payload->>'discordId','')),'');
    v_code_acces:=coalesce(p_payload->>'codeAcces','');
    v_mot_de_passe_admin_initial:=coalesce(p_payload->>'motDePasseAdminInitial','');
    v_roles_privileges:=app_private.role_present(v_roles,'Officier') or app_private.role_present(v_roles,'SuperAdmin');
    if v_nom='' or not app_private.roles_valides(v_roles) or v_statut not in ('Actif','Inactif','Suspendu') then return jsonb_build_object('succes',false,'message','Données joueur invalides.'); end if;
    if app_private.role_present(v_roles,'SuperAdmin') and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
    if v_discord_id is not null and (not v_ctx.est_superadmin or v_discord_id !~ '^[0-9]{17,20}$') then return jsonb_build_object('succes',false,'message','Modification Discord non autorisée.'); end if;
    if v_mot_de_passe_admin_initial<>'' and (not v_ctx.est_superadmin or not v_roles_privileges) then return jsonb_build_object('succes',false,'message','Initialisation administrative non autorisée.'); end if;
    if v_mot_de_passe_admin_initial<>'' and (length(v_mot_de_passe_admin_initial)<12 or octet_length(v_mot_de_passe_admin_initial)>256) then return jsonb_build_object('succes',false,'message','Le credential administratif initial doit contenir entre 12 et 256 octets.'); end if;

    if v_action='ajouter_joueur' then
      if app_private.role_present(v_roles,'SuperAdmin') then perform pg_advisory_xact_lock(hashtextextended('mpp-superadmin-roster',0)); end if;
      if length(v_code_acces)<10 or octet_length(v_code_acces)>256 then return jsonb_build_object('succes',false,'message','Le code d’accès doit contenir entre 10 et 256 octets.'); end if;
      if v_roles_privileges and (not v_ctx.est_superadmin or v_mot_de_passe_admin_initial='') then return jsonb_build_object('succes',false,'message','Un credential administratif initial est requis pour ce rôle.'); end if;
      insert into public.joueurs(pseudo,roles,statut,discord_id,discord_lie_a,code_acces_hash,mot_de_passe_hash,credential_modifie_a,date_ajout,derniere_modification)
      values(
        v_nom,v_roles,v_statut,case when v_ctx.est_superadmin then v_discord_id end,
        case when v_ctx.est_superadmin and v_discord_id is not null then now() end,
        app_private.credential_hash(v_code_acces),
        case when v_roles_privileges then app_private.credential_hash(v_mot_de_passe_admin_initial) end,
        case when v_roles_privileges then now() end,now(),now()
      ) returning * into v_joueur;
      insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Joueur ajouté','Joueur : '||v_joueur.pseudo);
      return jsonb_build_object('succes',true,'message','Joueur ajouté.','idJoueur',v_joueur.id);
    else
      perform app_private.verrou_auth_joueur(v_id);
      select * into v_joueur from public.joueurs where id=v_id for update;
      if not found then return jsonb_build_object('succes',false,'message','Joueur introuvable.'); end if;
      v_roles_privileges_avant:=app_private.role_present(v_joueur.roles,'Officier') or app_private.role_present(v_joueur.roles,'SuperAdmin');
      if app_private.role_present(v_joueur.roles,'SuperAdmin') or app_private.role_present(v_roles,'SuperAdmin') then perform pg_advisory_xact_lock(hashtextextended('mpp-superadmin-roster',0)); end if;
      if app_private.role_present(v_joueur.roles,'SuperAdmin') and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
      if not v_ctx.est_superadmin and (
        (v_roles_privileges and not v_roles_privileges_avant)
        or (
          v_roles_privileges
          and lower(btrim(v_statut))='actif'
          and lower(btrim(coalesce(v_joueur.statut,'')))<>'actif'
        )
      ) then return jsonb_build_object('succes',false,'message','Seul un SuperAdmin peut accorder ou réactiver un accès officier.'); end if;
      if v_code_acces<>'' and not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Réinitialisation du code réservée au SuperAdmin.'); end if;
      if v_code_acces<>'' and (length(v_code_acces)<10 or octet_length(v_code_acces)>256) then return jsonb_build_object('succes',false,'message','Le code d’accès doit contenir entre 10 et 256 octets.'); end if;
      if v_roles_privileges and v_joueur.mot_de_passe_hash is null and v_mot_de_passe_admin_initial='' then return jsonb_build_object('succes',false,'message','Un credential administratif initial est requis pour ce rôle.'); end if;
      if v_id=v_ctx.joueur_id and v_mot_de_passe_admin_initial<>'' then return jsonb_build_object('succes',false,'message','Utilisez l’action personnelle de changement de mot de passe.'); end if;
      if v_id=v_ctx.joueur_id and (v_statut<>'Actif' or not (app_private.role_present(v_roles,'Officier') or app_private.role_present(v_roles,'SuperAdmin'))) then return jsonb_build_object('succes',false,'message','Vous ne pouvez pas désactiver votre propre accès officier.'); end if;
      if lower(btrim(v_joueur.statut))='actif' and app_private.role_present(v_joueur.roles,'SuperAdmin') and (not app_private.role_present(v_roles,'SuperAdmin') or lower(btrim(v_statut))<>'actif') and (select count(*) from public.joueurs j where lower(btrim(j.statut))='actif' and app_private.role_present(j.roles,'SuperAdmin'))<=1 then return jsonb_build_object('succes',false,'message','Le dernier SuperAdmin actif doit être conservé.'); end if;
      update public.joueurs set
        pseudo=v_nom,
        roles=v_roles,
        statut=v_statut,
        discord_username=case
          when v_ctx.est_superadmin and v_discord_id is distinct from discord_id then null
          else discord_username
        end,
        discord_lie_a=case
          when v_ctx.est_superadmin and v_discord_id is distinct from discord_id
            then case when v_discord_id is null then null else now() end
          else discord_lie_a
        end,
        discord_id=case when v_ctx.est_superadmin then v_discord_id else discord_id end,
        code_acces_hash=case when v_code_acces='' then code_acces_hash else app_private.credential_hash(v_code_acces) end,
        mot_de_passe_hash=case
          when not v_roles_privileges then null
          when v_mot_de_passe_admin_initial<>'' then app_private.credential_hash(v_mot_de_passe_admin_initial)
          else mot_de_passe_hash
        end,
        auth_version=case
          when v_code_acces<>'' or v_mot_de_passe_admin_initial<>'' or v_roles_privileges is distinct from v_roles_privileges_avant then auth_version+1
          else auth_version
        end,
        credential_modifie_a=case when v_mot_de_passe_admin_initial<>'' then now() else credential_modifie_a end,
        derniere_modification=now()
      where id=v_id returning * into v_joueur;
      if v_code_acces<>'' or v_mot_de_passe_admin_initial<>'' or v_roles_privileges is distinct from v_roles_privileges_avant then
        update app_private.sessions
        set revoque_a=coalesce(revoque_a,now()),raison_revocation='identite_modifiee'
        where joueur_id=v_id and revoque_a is null;
      end if;
      insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Joueur modifié','Joueur : '||v_joueur.pseudo);
      return jsonb_build_object('succes',true,'message','Joueur modifié.');
    end if;
  end if;

  if v_action='supprimer_joueur' then
    if not v_ctx.est_superadmin then return jsonb_build_object('succes',false,'message','Action réservée au SuperAdmin.'); end if;
    v_id:=nullif(p_payload->>'idJoueur','')::bigint;
    if v_id=v_ctx.joueur_id then return jsonb_build_object('succes',false,'message','Vous ne pouvez pas supprimer votre propre compte.'); end if;
    perform app_private.verrou_auth_joueur(v_id);
    select * into v_joueur from public.joueurs where id=v_id for update;
    if not found then return jsonb_build_object('succes',false,'message','Joueur introuvable.'); end if;
    if app_private.role_present(v_joueur.roles,'SuperAdmin') then perform pg_advisory_xact_lock(hashtextextended('mpp-superadmin-roster',0)); end if;
    if lower(btrim(v_joueur.statut))='actif' and app_private.role_present(v_joueur.roles,'SuperAdmin') and (select count(*) from public.joueurs j where lower(btrim(j.statut))='actif' and app_private.role_present(j.roles,'SuperAdmin'))<=1 then return jsonb_build_object('succes',false,'message','Le dernier SuperAdmin actif doit être conservé.'); end if;
    delete from public.joueurs where id=v_id returning * into v_joueur;
    if not found then return jsonb_build_object('succes',false,'message','Joueur introuvable.'); end if;
    insert into public.journal_activite(utilisateur,action,details) values(v_ctx.pseudo,'Joueur supprimé','Joueur supprimé et données associées nettoyées.');
    return jsonb_build_object('succes',true,'message','Joueur supprimé.');
  end if;

  return jsonb_build_object('succes', false, 'message', 'Action non autorisée.');
exception
  when unique_violation then
    return jsonb_build_object('succes', false, 'message', 'Une donnée identique existe déjà.');
  when others then
    return jsonb_build_object('succes', false, 'message', 'Action officier indisponible.');
end;
$$;

create or replace function public.api_admin_site(
  p_session_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx record;
  v_action text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_metier jsonb;
  v_operation_texte text;
  v_operation_id uuid;
  v_digest bytea;
  v_existante app_private.admin_operations%rowtype;
  v_resultat jsonb;
  v_mutation boolean := v_action in (
    'modifier_statut_competition', 'creer_competition', 'modifier_competition',
    'ajouter_date', 'supprimer_date', 'supprimer_competition',
    'ajouter_joueur', 'modifier_joueur', 'supprimer_joueur'
  );
begin
  if pg_catalog.jsonb_typeof(v_payload) <> 'object' then
    return pg_catalog.jsonb_build_object(
      'succes', false,
      'code', 'REQUETE_INVALIDE',
      'message', 'Action officier indisponible.'
    );
  end if;

  if not v_mutation then
    return app_private.executer_api_admin_site(p_session_token, v_action, v_payload);
  end if;

  select * into v_ctx
  from app_private.contexte_session(p_session_token, 'admin');
  if not found then
    return pg_catalog.jsonb_build_object(
      'succes', false,
      'code', 'SESSION_EXPIREE',
      'message', 'Session officier expirée.'
    );
  end if;

  v_operation_texte := nullif(pg_catalog.btrim(v_payload->>'operationId'), '');
  if v_operation_texte is null
     or v_operation_texte !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return pg_catalog.jsonb_build_object(
      'succes', false,
      'code', 'OPERATION_REQUISE',
      'message', 'Cette action doit être relancée depuis l’interface.'
    );
  end if;

  v_operation_id := v_operation_texte::uuid;
  v_payload_metier := v_payload - 'operationId';
  v_digest := extensions.digest(
    pg_catalog.convert_to(
      v_operation_id::text || ':' || v_ctx.session_id::text || ':' || v_action || ':' || v_payload_metier::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mpp-admin-operation:' || v_operation_id::text, 0)
  );

  select * into v_existante
  from app_private.admin_operations
  where operation_id = v_operation_id
  for update;

  if found then
    if v_existante.joueur_id <> v_ctx.joueur_id
       or v_existante.session_id <> v_ctx.session_id
       or v_existante.action <> v_action
       or v_existante.request_digest <> v_digest then
      return pg_catalog.jsonb_build_object(
        'succes', false,
        'code', 'OPERATION_INVALIDE',
        'message', 'Cette action ne peut pas être rejouée.'
      );
    end if;

    if v_existante.resultat is not null and v_existante.termine_a is not null then
      return v_existante.resultat;
    end if;

    return pg_catalog.jsonb_build_object(
      'succes', false,
      'code', 'RESULTAT_INDETERMINE',
      'message', 'Le résultat de cette action doit être vérifié avant toute nouvelle tentative.'
    );
  end if;

  insert into app_private.admin_operations(
    operation_id,
    joueur_id,
    session_id,
    action,
    request_digest
  ) values (
    v_operation_id,
    v_ctx.joueur_id,
    v_ctx.session_id,
    v_action,
    v_digest
  );

  v_resultat := app_private.executer_api_admin_site(
    p_session_token,
    v_action,
    v_payload_metier
  );
  if v_resultat is null then
    v_resultat := pg_catalog.jsonb_build_object(
      'succes', false,
      'message', 'Action officier indisponible.'
    );
  end if;

  update app_private.admin_operations
  set resultat = v_resultat,
      termine_a = now()
  where operation_id = v_operation_id;

  return v_resultat;
exception
  when others then
    return pg_catalog.jsonb_build_object(
      'succes', false,
      'message', 'Action officier indisponible.'
    );
end;
$$;

revoke all on function public.api_joueur_site(text, text, jsonb) from public;
revoke all on function app_private.executer_api_admin_site(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.api_admin_site(text, text, jsonb) from public;
grant execute on function public.api_joueur_site(text, text, jsonb) to anon, authenticated;
grant execute on function public.api_admin_site(text, text, jsonb) to anon, authenticated;

update app_private.release_state
set phase = 4,
    phase_name = 'session_application_apis',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (3, 4);

commit;

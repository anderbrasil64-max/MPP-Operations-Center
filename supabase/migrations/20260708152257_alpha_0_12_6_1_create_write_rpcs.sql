create or replace function public.enregistrer_connexion_joueur_site(
  p_pseudo text
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_joueur record;
begin
  select j.id, j.pseudo, j.statut
  into v_joueur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_pseudo, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Joueur introuvable.');
  end if;

  if lower(trim(coalesce(v_joueur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce joueur n''est pas actif.');
  end if;

  update public.joueurs
  set derniere_connexion = now()
  where id = v_joueur.id;

  return jsonb_build_object(
    'succes', true,
    'message', 'Connexion enregistrée.',
    'derniereConnexion', now()
  );
end;
$$;

revoke all on function public.enregistrer_connexion_joueur_site(text) from public;
grant execute on function public.enregistrer_connexion_joueur_site(text) to anon;
grant execute on function public.enregistrer_connexion_joueur_site(text) to authenticated;

create or replace function public.sauvegarder_presences_site(
  p_competition_id bigint,
  p_pseudo text,
  p_presences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_pseudo text := trim(coalesce(p_pseudo, ''));
  v_joueur record;
  v_competition record;
  v_presence jsonb;
  v_date_text text;
  v_date date;
  v_statut_brut text;
  v_statut text;
  v_horaires text;
  v_existante record;
  v_ancien_statut text;
  v_anciens_horaires text;
  v_ancien_renseigne boolean;
  v_nouveau_renseigne boolean;
  v_ajouts integer := 0;
  v_modifications integer := 0;
  v_suppressions integer := 0;
  v_horaires_modifies integer := 0;
  v_details text[] := array[]::text[];
  v_detail text;
begin
  if p_competition_id is null then
    return jsonb_build_object('succes', false, 'message', 'Compétition invalide.');
  end if;

  if v_pseudo = '' then
    return jsonb_build_object('succes', false, 'message', 'Joueur invalide.');
  end if;

  select j.id, j.pseudo, j.statut
  into v_joueur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(v_pseudo)
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Joueur introuvable.');
  end if;

  if lower(trim(coalesce(v_joueur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce joueur n''est pas actif.');
  end if;

  select c.id, c.nom
  into v_competition
  from public.competitions c
  where c.id = p_competition_id
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Compétition introuvable.');
  end if;

  for v_presence in
    select value
    from jsonb_array_elements(coalesce(p_presences, '[]'::jsonb))
  loop
    v_date_text := trim(coalesce(
      v_presence->>'dateCompetition',
      v_presence->>'date_competition',
      ''
    ));

    if v_date_text = '' then
      continue;
    end if;

    if v_date_text ~ '^\d{2}/\d{2}/\d{4}$' then
      v_date := to_date(v_date_text, 'DD/MM/YYYY');
    else
      v_date := v_date_text::date;
    end if;

    v_statut_brut := trim(coalesce(v_presence->>'statut', 'Non renseigné'));
    v_statut := case
      when lower(v_statut_brut) in ('présent', 'present') then 'Présent'
      when lower(v_statut_brut) = 'absent' then 'Absent'
      when lower(v_statut_brut) in ('remplaçant', 'remplacant') then 'Remplaçant'
      else 'Non renseigné'
    end;

    v_horaires := trim(coalesce(
      v_presence->>'horairesDisponibles',
      v_presence->>'horaires_disponibles',
      ''
    ));

    select p.id, p.statut, p.horaires_disponibles
    into v_existante
    from public.presences p
    where p.competition_id = p_competition_id
      and lower(trim(p.pseudo)) = lower(v_pseudo)
      and p.date_competition = v_date
    limit 1;

    if found then
      v_ancien_statut := case
        when lower(trim(coalesce(v_existante.statut, ''))) in ('présent', 'present') then 'Présent'
        when lower(trim(coalesce(v_existante.statut, ''))) = 'absent' then 'Absent'
        when lower(trim(coalesce(v_existante.statut, ''))) in ('remplaçant', 'remplacant') then 'Remplaçant'
        else 'Non renseigné'
      end;
      v_anciens_horaires := trim(coalesce(v_existante.horaires_disponibles, ''));
    else
      v_ancien_statut := 'Non renseigné';
      v_anciens_horaires := '';
    end if;

    v_ancien_renseigne := v_ancien_statut in ('Présent', 'Absent', 'Remplaçant');
    v_nouveau_renseigne := v_statut in ('Présent', 'Absent', 'Remplaçant');
    v_detail := null;

    if not v_ancien_renseigne and v_nouveau_renseigne then
      v_ajouts := v_ajouts + 1;
      v_detail := '- ' || to_char(v_date, 'DD/MM/YYYY') || ' : ' || v_ancien_statut || ' → ' || v_statut || ' — ' ||
        case
          when v_statut = 'Présent' then 'Présence ajoutée'
          when v_statut = 'Absent' then 'Absence renseignée'
          when v_statut = 'Remplaçant' then 'Remplacement proposé'
          else 'Réponse ajoutée'
        end;
    elsif v_ancien_renseigne and not v_nouveau_renseigne then
      v_suppressions := v_suppressions + 1;
      v_detail := '- ' || to_char(v_date, 'DD/MM/YYYY') || ' : ' || v_ancien_statut || ' → ' || v_statut || ' — Réponse supprimée';
    elsif v_ancien_renseigne and v_nouveau_renseigne and v_ancien_statut <> v_statut then
      v_modifications := v_modifications + 1;
      v_detail := '- ' || to_char(v_date, 'DD/MM/YYYY') || ' : ' || v_ancien_statut || ' → ' || v_statut || ' — ' ||
        case
          when v_ancien_statut = 'Présent' and v_statut = 'Absent' then 'Désistement'
          when v_ancien_statut = 'Absent' and v_statut = 'Présent' then 'Disponibilité ajoutée'
          when v_ancien_statut = 'Présent' and v_statut = 'Remplaçant' then 'Passage en remplaçant'
          when v_ancien_statut = 'Remplaçant' and v_statut = 'Présent' then 'Passage en présent'
          when v_ancien_statut = 'Absent' and v_statut = 'Remplaçant' then 'Passage en remplaçant'
          when v_ancien_statut = 'Remplaçant' and v_statut = 'Absent' then 'Retrait de disponibilité'
          else 'Réponse modifiée'
        end;
    elsif v_ancien_renseigne and v_nouveau_renseigne and coalesce(v_anciens_horaires, '') <> coalesce(v_horaires, '') then
      v_horaires_modifies := v_horaires_modifies + 1;
      v_detail := '- ' || to_char(v_date, 'DD/MM/YYYY') || ' : horaires modifiés — ' ||
        coalesce(nullif(v_anciens_horaires, ''), 'Aucun horaire') || ' → ' ||
        coalesce(nullif(v_horaires, ''), 'Aucun horaire');
    end if;

    if v_detail is not null then
      v_details := array_append(v_details, v_detail);
    end if;

    insert into public.presences (
      competition_id,
      pseudo,
      date_competition,
      statut,
      horaires_disponibles,
      derniere_modification
    )
    values (
      p_competition_id,
      v_pseudo,
      v_date,
      v_statut,
      v_horaires,
      now()
    )
    on conflict (competition_id, pseudo, date_competition)
    do update set
      statut = excluded.statut,
      horaires_disponibles = excluded.horaires_disponibles,
      derniere_modification = excluded.derniere_modification;
  end loop;

  update public.joueurs
  set derniere_modification = now()
  where id = v_joueur.id;

  if array_length(v_details, 1) is not null then
    insert into public.journal_activite (utilisateur, action, details)
    values (
      v_pseudo,
      'Présences mises à jour',
      'Compétition : ' || coalesce(v_competition.nom, 'Compétition inconnue') ||
      E'\nJoueur : ' || v_pseudo ||
      E'\n\nAjouts : ' || v_ajouts ||
      E'\nModifications : ' || v_modifications ||
      E'\nSuppressions : ' || v_suppressions ||
      E'\nHoraires modifiés : ' || v_horaires_modifies ||
      E'\n\nDétail :\n' || array_to_string(v_details, E'\n')
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
exception
  when others then
    return jsonb_build_object(
      'succes', false,
      'message', 'Sauvegarde des présences impossible.'
    );
end;
$$;

revoke all on function public.sauvegarder_presences_site(bigint, text, jsonb) from public;
grant execute on function public.sauvegarder_presences_site(bigint, text, jsonb) to anon;
grant execute on function public.sauvegarder_presences_site(bigint, text, jsonb) to authenticated;

create or replace function public.creer_competition_complete_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_superadmin boolean := false;
  v_officier boolean := false;
  v_mot_de_passe_attendu text;
  v_nom text := trim(coalesce(p_config->>'nom', ''));
  v_statut text := trim(coalesce(p_config->>'statut', 'Brouillon'));
  v_roles text := trim(coalesce(p_config->>'rolesAutorises', ''));
  v_description text := trim(coalesce(p_config->>'description', ''));
  v_horaires text := trim(coalesce(p_config->>'horaires', ''));
  v_fermeture_auto boolean := lower(coalesce(p_config->>'fermetureAutoActive', 'false')) in ('true', '1', 'oui', 'yes');
  v_notification_active boolean := lower(coalesce(p_config->>'notificationPresenceActive', 'false')) in ('true', '1', 'oui', 'yes');
  v_rappel_active boolean := lower(coalesce(p_config->>'rappelPresenceActive', 'false')) in ('true', '1', 'oui', 'yes');
  v_heure_ouverture time := nullif(trim(coalesce(p_config->>'heureOuvertureAuto', '')), '')::time;
  v_heure_fermeture time := nullif(trim(coalesce(p_config->>'heureFermetureAuto', '')), '')::time;
  v_heure_notification time := nullif(trim(coalesce(p_config->>'heureNotificationPresence', '')), '')::time;
  v_heure_rappel time := nullif(trim(coalesce(p_config->>'heureRappelPresence', '')), '')::time;
  v_competition_id bigint;
  v_date_text text;
  v_date date;
  v_nb_dates integer := 0;
begin
  select j.pseudo, j.roles, j.statut, j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Utilisateur introuvable.');
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce compte n''est pas actif.');
  end if;

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'superadmin'
  ) into v_superadmin;
  v_superadmin := v_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object('succes', false, 'message', 'Mot de passe incorrect.');
  end if;

  if v_nom = '' then
    return jsonb_build_object('succes', false, 'message', 'Merci de saisir un nom de compétition.');
  end if;

  if v_roles = '' then
    return jsonb_build_object('succes', false, 'message', 'Merci de sélectionner au moins un rôle autorisé.');
  end if;

  if v_horaires = '' then
    return jsonb_build_object('succes', false, 'message', 'Merci de saisir au moins un horaire.');
  end if;

  if jsonb_typeof(coalesce(p_config->'dates', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_config->'dates', '[]'::jsonb)) = 0 then
    return jsonb_build_object('succes', false, 'message', 'Aucune date à créer.');
  end if;

  if v_statut not in ('Brouillon', 'Ouverte', 'Fermée', 'Archivée') then
    return jsonb_build_object('succes', false, 'message', 'Statut de compétition invalide.');
  end if;

  if v_statut = 'Archivée' and not v_superadmin then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : seul un SuperAdmin peut archiver une compétition.');
  end if;

  if v_fermeture_auto and (v_heure_ouverture is null or v_heure_fermeture is null) then
    return jsonb_build_object('succes', false, 'message', 'Merci de renseigner les horaires de fermeture automatique.');
  end if;

  if v_notification_active and v_heure_notification is null then
    return jsonb_build_object('succes', false, 'message', 'Merci de renseigner une heure de notification.');
  end if;

  if v_rappel_active and v_heure_rappel is null then
    return jsonb_build_object('succes', false, 'message', 'Merci de renseigner une heure de rappel Discord des présences.');
  end if;

  insert into public.competitions (
    nom,
    statut,
    cree_par,
    roles_autorises,
    description,
    fermeture_auto_active,
    heure_ouverture,
    heure_fermeture,
    notification_presence_active,
    heure_notification_presence,
    rappel_presence_active,
    heure_rappel_presence
  )
  values (
    v_nom,
    v_statut,
    coalesce(nullif(trim(p_utilisateur), ''), 'Inconnu'),
    v_roles,
    v_description,
    v_fermeture_auto,
    case when v_fermeture_auto then v_heure_ouverture else null end,
    case when v_fermeture_auto then v_heure_fermeture else null end,
    v_notification_active,
    case when v_notification_active then v_heure_notification else null end,
    v_rappel_active,
    case when v_rappel_active then v_heure_rappel else null end
  )
  returning id into v_competition_id;

  for v_date_text in
    select jsonb_array_elements_text(coalesce(p_config->'dates', '[]'::jsonb))
  loop
    v_date := v_date_text::date;

    insert into public.dates_competition (
      competition_id,
      date_competition,
      horaires
    )
    values (
      v_competition_id,
      v_date,
      v_horaires
    );

    v_nb_dates := v_nb_dates + 1;
  end loop;

  insert into public.journal_activite (utilisateur, action, details)
  values (
    coalesce(nullif(trim(p_utilisateur), ''), 'Inconnu'),
    'Compétition créée',
    'Compétition : ' || v_nom ||
    E'\nDates : ' || v_nb_dates ||
    E'\nFermeture auto : ' || case when v_fermeture_auto then 'Oui' else 'Non' end ||
    E'\nNotification présences : ' || case when v_notification_active then 'Oui' else 'Non' end ||
    E'\nRappel sans réponse : ' || case when v_rappel_active then 'Oui à ' || to_char(v_heure_rappel, 'HH24:MI') else 'Non' end
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Compétition créée.',
    'idCompetition', v_competition_id,
    'nbDates', v_nb_dates
  );
exception
  when others then
    return jsonb_build_object('succes', false, 'message', 'Création de la compétition impossible.');
end;
$$;

revoke all on function public.creer_competition_complete_site(text, text, jsonb) from public;
grant execute on function public.creer_competition_complete_site(text, text, jsonb) to anon;
grant execute on function public.creer_competition_complete_site(text, text, jsonb) to authenticated;

create or replace function public.modifier_competition_complete_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_competition record;
  v_superadmin boolean := false;
  v_officier boolean := false;
  v_mot_de_passe_attendu text;
  v_id_competition bigint := nullif(trim(coalesce(p_config->>'idCompetition', '')), '')::bigint;
  v_nom text := trim(coalesce(p_config->>'nom', ''));
  v_statut text := trim(coalesce(p_config->>'statut', 'Brouillon'));
  v_roles text := trim(coalesce(p_config->>'rolesAutorises', ''));
  v_description text := trim(coalesce(p_config->>'description', ''));
  v_fermeture_auto boolean := lower(coalesce(p_config->>'fermetureAutoActive', 'false')) in ('true', '1', 'oui', 'yes');
  v_notification_active boolean := lower(coalesce(p_config->>'notificationPresenceActive', 'false')) in ('true', '1', 'oui', 'yes');
  v_rappel_active boolean := lower(coalesce(p_config->>'rappelPresenceActive', 'false')) in ('true', '1', 'oui', 'yes');
  v_heure_ouverture time := nullif(trim(coalesce(p_config->>'heureOuvertureAuto', '')), '')::time;
  v_heure_fermeture time := nullif(trim(coalesce(p_config->>'heureFermetureAuto', '')), '')::time;
  v_heure_notification time := nullif(trim(coalesce(p_config->>'heureNotificationPresence', '')), '')::time;
  v_heure_rappel time := nullif(trim(coalesce(p_config->>'heureRappelPresence', '')), '')::time;
begin
  select j.pseudo, j.roles, j.statut, j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Utilisateur introuvable.');
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce compte n''est pas actif.');
  end if;

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'superadmin'
  ) into v_superadmin;
  v_superadmin := v_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object('succes', false, 'message', 'Mot de passe incorrect.');
  end if;

  if v_id_competition is null then
    return jsonb_build_object('succes', false, 'message', 'Compétition invalide.');
  end if;

  select c.id, c.nom, c.statut
  into v_competition
  from public.competitions c
  where c.id = v_id_competition
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Compétition introuvable.');
  end if;

  if v_nom = '' then
    return jsonb_build_object('succes', false, 'message', 'Merci de saisir un nom de compétition.');
  end if;

  if v_roles = '' then
    return jsonb_build_object('succes', false, 'message', 'Merci de sélectionner au moins un rôle autorisé.');
  end if;

  if v_statut not in ('Brouillon', 'Ouverte', 'Fermée', 'Archivée') then
    return jsonb_build_object('succes', false, 'message', 'Statut de compétition invalide.');
  end if;

  if v_statut = 'Archivée' and not v_superadmin then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : seul un SuperAdmin peut archiver une compétition.');
  end if;

  if v_fermeture_auto and (v_heure_ouverture is null or v_heure_fermeture is null) then
    return jsonb_build_object('succes', false, 'message', 'Merci de renseigner les horaires de fermeture automatique.');
  end if;

  if v_notification_active and v_heure_notification is null then
    return jsonb_build_object('succes', false, 'message', 'Merci de renseigner une heure de notification.');
  end if;

  if v_rappel_active and v_heure_rappel is null then
    return jsonb_build_object('succes', false, 'message', 'Merci de renseigner une heure de rappel Discord des présences.');
  end if;

  update public.competitions
  set
    nom = v_nom,
    statut = v_statut,
    roles_autorises = v_roles,
    description = v_description,
    fermeture_auto_active = v_fermeture_auto,
    heure_ouverture = case when v_fermeture_auto then v_heure_ouverture else null end,
    heure_fermeture = case when v_fermeture_auto then v_heure_fermeture else null end,
    notification_presence_active = v_notification_active,
    heure_notification_presence = case when v_notification_active then v_heure_notification else null end,
    rappel_presence_active = v_rappel_active,
    heure_rappel_presence = case when v_rappel_active then v_heure_rappel else null end
  where id = v_id_competition;

  insert into public.journal_activite (utilisateur, action, details)
  values (
    coalesce(nullif(trim(p_utilisateur), ''), 'Inconnu'),
    'Compétition modifiée',
    'Compétition : ' || v_nom ||
    E'\nStatut : ' || v_statut ||
    E'\nFermeture auto : ' || case when v_fermeture_auto then 'Oui' else 'Non' end ||
    E'\nNotification présences : ' || case when v_notification_active then 'Oui' else 'Non' end ||
    E'\nRappel sans réponse : ' || case when v_rappel_active then 'Oui à ' || to_char(v_heure_rappel, 'HH24:MI') else 'Non' end
  );

  return jsonb_build_object('succes', true, 'message', 'Compétition modifiée.');
exception
  when others then
    return jsonb_build_object('succes', false, 'message', 'Modification de la compétition impossible.');
end;
$$;

revoke all on function public.modifier_competition_complete_site(text, text, jsonb) from public;
grant execute on function public.modifier_competition_complete_site(text, text, jsonb) to anon;
grant execute on function public.modifier_competition_complete_site(text, text, jsonb) to authenticated;

create or replace function public.ajouter_date_competition_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_competition_id bigint,
  p_date_competition date,
  p_horaires text
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_competition record;
  v_superadmin boolean := false;
  v_officier boolean := false;
  v_mot_de_passe_attendu text;
  v_id_date bigint;
begin
  select j.pseudo, j.roles, j.statut, j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Utilisateur introuvable.');
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce compte n''est pas actif.');
  end if;

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'superadmin'
  ) into v_superadmin;
  v_superadmin := v_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object('succes', false, 'message', 'Mot de passe incorrect.');
  end if;

  select c.id, c.nom
  into v_competition
  from public.competitions c
  where c.id = p_competition_id
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Compétition introuvable.');
  end if;

  insert into public.dates_competition (
    competition_id,
    date_competition,
    horaires
  )
  values (
    p_competition_id,
    p_date_competition,
    coalesce(p_horaires, '')
  )
  returning id into v_id_date;

  insert into public.journal_activite (utilisateur, action, details)
  values (
    coalesce(nullif(trim(p_utilisateur), ''), 'Inconnu'),
    'Date ajoutée',
    'Compétition : ' || coalesce(v_competition.nom, 'Compétition inconnue') ||
    E'\nDate : ' || to_char(p_date_competition, 'DD/MM/YYYY')
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Date ajoutée.',
    'idDate', v_id_date
  );
end;
$$;

revoke all on function public.ajouter_date_competition_site(text, text, bigint, date, text) from public;
grant execute on function public.ajouter_date_competition_site(text, text, bigint, date, text) to anon;
grant execute on function public.ajouter_date_competition_site(text, text, bigint, date, text) to authenticated;

create or replace function public.supprimer_date_competition_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_date_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_date record;
  v_superadmin boolean := false;
  v_officier boolean := false;
  v_mot_de_passe_attendu text;
begin
  select j.pseudo, j.roles, j.statut, j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Utilisateur introuvable.');
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce compte n''est pas actif.');
  end if;

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'superadmin'
  ) into v_superadmin;
  v_superadmin := v_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object('succes', false, 'message', 'Mot de passe incorrect.');
  end if;

  select d.id, d.competition_id, d.date_competition, c.nom as nom_competition
  into v_date
  from public.dates_competition d
  left join public.competitions c on c.id = d.competition_id
  where d.id = p_date_id
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Date introuvable.');
  end if;

  delete from public.dates_competition
  where id = p_date_id;

  insert into public.journal_activite (utilisateur, action, details)
  values (
    coalesce(nullif(trim(p_utilisateur), ''), 'Inconnu'),
    'Date supprimée',
    'Compétition : ' || coalesce(v_date.nom_competition, 'Compétition inconnue') ||
    E'\nDate : ' || to_char(v_date.date_competition, 'DD/MM/YYYY')
  );

  return jsonb_build_object('succes', true, 'message', 'Date supprimée.');
end;
$$;

revoke all on function public.supprimer_date_competition_site(text, text, bigint) from public;
grant execute on function public.supprimer_date_competition_site(text, text, bigint) to anon;
grant execute on function public.supprimer_date_competition_site(text, text, bigint) to authenticated;

create or replace function public.supprimer_competition_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_competition_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_competition record;
  v_superadmin boolean := false;
  v_mot_de_passe_attendu text;
begin
  select j.pseudo, j.roles, j.statut, j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Utilisateur introuvable.');
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object('succes', false, 'message', 'Ce compte n''est pas actif.');
  end if;

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'superadmin'
  ) into v_superadmin;
  v_superadmin := v_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

  if not v_superadmin then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : seul un SuperAdmin peut supprimer une compétition.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(v_mot_de_passe_attendu, '') is null then
    v_mot_de_passe_attendu := 'superAD';
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object('succes', false, 'message', 'Mot de passe incorrect.');
  end if;

  select c.id, c.nom
  into v_competition
  from public.competitions c
  where c.id = p_competition_id
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Compétition introuvable.');
  end if;

  delete from public.competitions
  where id = p_competition_id;

  insert into public.journal_activite (utilisateur, action, details)
  values (
    coalesce(nullif(trim(p_utilisateur), ''), 'Inconnu'),
    'Compétition supprimée',
    'Compétition : ' || coalesce(v_competition.nom, 'Compétition inconnue')
  );

  return jsonb_build_object('succes', true, 'message', 'Compétition supprimée définitivement.');
end;
$$;

revoke all on function public.supprimer_competition_site(text, text, bigint) from public;
grant execute on function public.supprimer_competition_site(text, text, bigint) to anon;
grant execute on function public.supprimer_competition_site(text, text, bigint) to authenticated;

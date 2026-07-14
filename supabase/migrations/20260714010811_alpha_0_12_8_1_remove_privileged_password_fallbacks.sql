-- Alpha 0.12.8.1 - remove privileged password and identity fallbacks.
-- This migration intentionally performs no user-data update.

begin;

do $migration_guard$
begin
  if exists (
    select 1
    from public.joueurs j
    where lower(btrim(coalesce(j.statut, ''))) = 'actif'
      and exists (
        select 1
        from regexp_split_to_table(coalesce(j.roles, ''), '\s*,\s*') as roles(role_item)
        where lower(btrim(role_item)) in ('officier', 'superadmin')
      )
      and nullif(btrim(j.mot_de_passe), '') is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Migration bloquee : au moins un compte privilegie actif ne possede pas de mot de passe personnel.';
  end if;
end;
$migration_guard$;

create or replace function public.verifier_mot_de_passe_site(
  p_utilisateur text,
  p_mot_de_passe text
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_joueur record;
  v_roles text;
  v_statut text;
  v_mot_de_passe_attendu text;
  v_est_officier boolean := false;
  v_est_superadmin boolean := false;
begin
  select
    j.pseudo,
    j.roles,
    j.statut,
    j.mot_de_passe
  into v_joueur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Joueur introuvable.'
    );
  end if;

  v_roles := coalesce(v_joueur.roles, '');
  v_statut := coalesce(v_joueur.statut, '');

  if lower(trim(v_statut)) <> 'actif' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Ce compte n''est pas actif.'
    );
  end if;

  select exists (
    select 1
    from regexp_split_to_table(v_roles, '\s*,\s*') as role_item
    where lower(trim(role_item)) = 'superadmin'
  )
  into v_est_superadmin;

  select exists (
    select 1
    from regexp_split_to_table(v_roles, '\s*,\s*') as role_item
    where lower(trim(role_item)) = 'officier'
  )
  into v_est_officier;

  if not v_est_officier and not v_est_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : rôle officier requis.'
    );
  end if;

  v_mot_de_passe_attendu := v_joueur.mot_de_passe;

  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object(
      'succes', false,
      'message', 'Mot de passe incorrect.'
    );
  end if;

  return jsonb_build_object(
    'succes', true,
    'message', 'Mot de passe validé.',
    'pseudo', v_joueur.pseudo,
    'roles', v_roles,
    'statut', v_statut,
    'estOfficier', v_est_officier,
    'estSuperAdmin', v_est_superadmin
  );
end;
$$;

revoke all on function public.verifier_mot_de_passe_site(text, text) from public;
grant execute on function public.verifier_mot_de_passe_site(text, text) to anon, authenticated;

create or replace function public.changer_mot_de_passe_site(
  p_utilisateur text,
  p_ancien_mot_de_passe text,
  p_nouveau_mot_de_passe text
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_joueur record;
  v_roles text;
  v_statut text;
  v_mot_de_passe_attendu text;
  v_est_officier boolean := false;
  v_est_superadmin boolean := false;
begin
  select
    j.id,
    j.pseudo,
    j.roles,
    j.statut,
    j.mot_de_passe
  into v_joueur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Joueur introuvable.'
    );
  end if;

  v_roles := coalesce(v_joueur.roles, '');
  v_statut := coalesce(v_joueur.statut, '');

  if lower(trim(v_statut)) <> 'actif' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Ce compte n''est pas actif.'
    );
  end if;

  select exists (
    select 1
    from regexp_split_to_table(v_roles, '\s*,\s*') as role_item
    where lower(trim(role_item)) = 'superadmin'
  )
  into v_est_superadmin;

  select exists (
    select 1
    from regexp_split_to_table(v_roles, '\s*,\s*') as role_item
    where lower(trim(role_item)) = 'officier'
  )
  into v_est_officier;

  if not v_est_officier and not v_est_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : rôle officier requis.'
    );
  end if;

  v_mot_de_passe_attendu := v_joueur.mot_de_passe;

  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
  end if;

  if coalesce(p_ancien_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object(
      'succes', false,
      'message', 'Mot de passe actuel incorrect.'
    );
  end if;

  if nullif(trim(coalesce(p_nouveau_mot_de_passe, '')), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Le nouveau mot de passe ne peut pas être vide.'
    );
  end if;

  if char_length(trim(p_nouveau_mot_de_passe)) < 4 then
    return jsonb_build_object(
      'succes', false,
      'message', 'Le nouveau mot de passe doit contenir au moins 4 caractères.'
    );
  end if;

  update public.joueurs
  set
    mot_de_passe = p_nouveau_mot_de_passe,
    mot_de_passe_modifie = true,
    derniere_modification = now()
  where id = v_joueur.id;

  insert into public.journal_activite (
    utilisateur,
    action,
    details
  )
  values (
    v_joueur.pseudo,
    'Mot de passe modifié',
    'Mot de passe personnel modifié.'
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Mot de passe modifié avec succès.'
  );
end;
$$;

revoke all on function public.changer_mot_de_passe_site(text, text, text) from public;
grant execute on function public.changer_mot_de_passe_site(text, text, text) to anon, authenticated;

create or replace function public.ajouter_joueur_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_pseudo text,
  p_roles text,
  p_statut text,
  p_discord_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_demandeur_superadmin boolean := false;
  v_demandeur_officier boolean := false;
  v_mot_de_passe_attendu text;
  v_pseudo text := trim(coalesce(p_pseudo, ''));
  v_statut text := trim(coalesce(p_statut, ''));
  v_role text;
  v_role_canon text;
  v_roles_liste text[] := array[]::text[];
  v_roles_final text;
  v_roles_contient_superadmin boolean := false;
  v_discord_id text := null;
  v_id_joueur bigint;
  v_details text[];
begin
  select
    j.id,
    j.pseudo,
    j.roles,
    j.statut,
    j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Utilisateur introuvable.'
    );
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Ce compte n''est pas actif.'
    );
  end if;

  select exists (
    select 1
    from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') as roles(role_item)
    where lower(trim(role_item)) = 'superadmin'
  )
  into v_demandeur_superadmin;


  select exists (
    select 1
    from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') as roles(role_item)
    where lower(trim(role_item)) = 'officier'
  )
  into v_demandeur_officier;

  v_demandeur_officier := v_demandeur_officier or v_demandeur_superadmin;

  if not v_demandeur_officier and not v_demandeur_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : rôle officier requis.'
    );
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;

  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object(
      'succes', false,
      'message', 'Mot de passe incorrect.'
    );
  end if;

  if v_pseudo = '' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Merci de saisir un pseudo.'
    );
  end if;

  if exists (
    select 1
    from public.joueurs j
    where lower(trim(j.pseudo)) = lower(v_pseudo)
  ) then
    return jsonb_build_object(
      'succes', false,
      'message', 'Ce pseudo existe déjà.'
    );
  end if;

  if v_statut = '' then
    v_statut := 'Actif';
  end if;

  if v_statut not in ('Actif', 'Inactif', 'Suspendu') then
    return jsonb_build_object(
      'succes', false,
      'message', 'Statut joueur invalide.'
    );
  end if;

  for v_role in
    select trim(role_item)
    from regexp_split_to_table(coalesce(p_roles, ''), '\s*,\s*') as roles(role_item)
  loop
    if v_role = '' then
      continue;
    end if;

    v_role_canon := case lower(v_role)
      when 'superadmin' then 'SuperAdmin'
      when 'officier' then 'Officier'
      when 'strateur' then 'Strateur'
      when 'soldat' then 'Soldat'
      when 'réserviste' then 'Réserviste'
      when 'reserviste' then 'Réserviste'
      when 'recrue' then 'Recrue'
      else null
    end;

    if v_role_canon is null then
      return jsonb_build_object(
        'succes', false,
        'message', 'Rôle joueur invalide : ' || v_role || '.'
      );
    end if;

    if not (v_role_canon = any(v_roles_liste)) then
      v_roles_liste := array_append(v_roles_liste, v_role_canon);
    end if;
  end loop;

  if array_length(v_roles_liste, 1) is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Merci de sélectionner au moins un rôle.'
    );
  end if;

  v_roles_contient_superadmin := 'SuperAdmin' = any(v_roles_liste);

  if (v_roles_contient_superadmin) and not v_demandeur_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : seul un SuperAdmin peut attribuer le rôle SuperAdmin.'
    );
  end if;

  v_roles_final := array_to_string(v_roles_liste, ',');

  if v_demandeur_superadmin then
    v_discord_id := nullif(trim(coalesce(p_discord_id, '')), '');

    if v_discord_id is not null and v_discord_id !~ '^\d+$' then
      return jsonb_build_object(
        'succes', false,
        'message', 'L''ID Discord doit contenir uniquement des chiffres.'
      );
    end if;
  end if;

  insert into public.joueurs (
    pseudo,
    roles,
    statut,
    discord_id
  )
  values (
    v_pseudo,
    v_roles_final,
    v_statut,
    v_discord_id
  )
  returning id into v_id_joueur;

  v_details := array[
    'Joueur : ' || v_pseudo,
    'Rôles : ' || v_roles_final,
    'Statut : ' || v_statut
  ];

  if v_discord_id is not null then
    v_details := array_append(v_details, 'ID Discord : ajouté');
  end if;

  insert into public.journal_activite (
    utilisateur,
    action,
    details
  )
  values (
    v_demandeur.pseudo,
    'Joueur ajouté',
    array_to_string(v_details, E'\n')
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Joueur ajouté.',
    'idJoueur', v_id_joueur
  );
end;
$$;

revoke all on function public.ajouter_joueur_site(text, text, text, text, text, text) from public;
grant execute on function public.ajouter_joueur_site(text, text, text, text, text, text) to anon;
grant execute on function public.ajouter_joueur_site(text, text, text, text, text, text) to authenticated;

create or replace function public.modifier_joueur_site(
  p_utilisateur text,
  p_mot_de_passe text,
  p_id_joueur bigint,
  p_pseudo text,
  p_roles text,
  p_statut text,
  p_discord_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_demandeur record;
  v_joueur record;
  v_demandeur_superadmin boolean := false;
  v_demandeur_officier boolean := false;
  v_cible_superadmin boolean := false;
  v_mot_de_passe_attendu text;
  v_pseudo text := trim(coalesce(p_pseudo, ''));
  v_statut text := trim(coalesce(p_statut, ''));
  v_role text;
  v_role_canon text;
  v_roles_liste text[] := array[]::text[];
  v_roles_final text;
  v_roles_contient_superadmin boolean := false;
  v_discord_id text := null;
  v_changements text[] := array[]::text[];
begin
  select
    j.id,
    j.pseudo,
    j.roles,
    j.statut,
    j.mot_de_passe
  into v_demandeur
  from public.joueurs j
  where lower(trim(j.pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Utilisateur introuvable.'
    );
  end if;

  if lower(trim(coalesce(v_demandeur.statut, ''))) <> 'actif' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Ce compte n''est pas actif.'
    );
  end if;

  select exists (
    select 1
    from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') as roles(role_item)
    where lower(trim(role_item)) = 'superadmin'
  )
  into v_demandeur_superadmin;


  select exists (
    select 1
    from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') as roles(role_item)
    where lower(trim(role_item)) = 'officier'
  )
  into v_demandeur_officier;

  v_demandeur_officier := v_demandeur_officier or v_demandeur_superadmin;

  if not v_demandeur_officier and not v_demandeur_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : rôle officier requis.'
    );
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;

  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
  end if;

  if coalesce(p_mot_de_passe, '') <> coalesce(v_mot_de_passe_attendu, '') then
    return jsonb_build_object(
      'succes', false,
      'message', 'Mot de passe incorrect.'
    );
  end if;

  select
    j.id,
    j.pseudo,
    j.roles,
    j.statut,
    j.discord_id
  into v_joueur
  from public.joueurs j
  where j.id = p_id_joueur
  limit 1;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Joueur introuvable.'
    );
  end if;

  select exists (
    select 1
    from regexp_split_to_table(coalesce(v_joueur.roles, ''), '\s*,\s*') as roles(role_item)
    where lower(trim(role_item)) = 'superadmin'
  )
  into v_cible_superadmin;


  if v_cible_superadmin and not v_demandeur_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : seul un SuperAdmin peut modifier un SuperAdmin.'
    );
  end if;

  if v_pseudo = '' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Merci de saisir un pseudo.'
    );
  end if;

  if exists (
    select 1
    from public.joueurs j
    where lower(trim(j.pseudo)) = lower(v_pseudo)
      and j.id <> p_id_joueur
  ) then
    return jsonb_build_object(
      'succes', false,
      'message', 'Ce pseudo existe déjà.'
    );
  end if;

  if v_statut not in ('Actif', 'Inactif', 'Suspendu') then
    return jsonb_build_object(
      'succes', false,
      'message', 'Statut joueur invalide.'
    );
  end if;

  for v_role in
    select trim(role_item)
    from regexp_split_to_table(coalesce(p_roles, ''), '\s*,\s*') as roles(role_item)
  loop
    if v_role = '' then
      continue;
    end if;

    v_role_canon := case lower(v_role)
      when 'superadmin' then 'SuperAdmin'
      when 'officier' then 'Officier'
      when 'strateur' then 'Strateur'
      when 'soldat' then 'Soldat'
      when 'réserviste' then 'Réserviste'
      when 'reserviste' then 'Réserviste'
      when 'recrue' then 'Recrue'
      else null
    end;

    if v_role_canon is null then
      return jsonb_build_object(
        'succes', false,
        'message', 'Rôle joueur invalide : ' || v_role || '.'
      );
    end if;

    if not (v_role_canon = any(v_roles_liste)) then
      v_roles_liste := array_append(v_roles_liste, v_role_canon);
    end if;
  end loop;

  if array_length(v_roles_liste, 1) is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Merci de sélectionner au moins un rôle.'
    );
  end if;

  v_roles_contient_superadmin := 'SuperAdmin' = any(v_roles_liste);

  if (v_roles_contient_superadmin) and not v_demandeur_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : seul un SuperAdmin peut attribuer le rôle SuperAdmin.'
    );
  end if;

  if
    (
      v_cible_superadmin <>
      (v_roles_contient_superadmin)
    )
    and not v_demandeur_superadmin
  then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : seul un SuperAdmin peut retirer le rôle SuperAdmin.'
    );
  end if;

  if
    v_demandeur_superadmin
    and v_demandeur.id = v_joueur.id
    and v_cible_superadmin
    and not (v_roles_contient_superadmin)
  then
    return jsonb_build_object(
      'succes', false,
      'message', 'Impossible de retirer votre propre rôle SuperAdmin.'
    );
  end if;

  if
    v_demandeur_superadmin
    and v_demandeur.id = v_joueur.id
    and v_statut <> 'Actif'
  then
    return jsonb_build_object(
      'succes', false,
      'message', 'Impossible de désactiver votre propre compte SuperAdmin.'
    );
  end if;

  v_roles_final := array_to_string(v_roles_liste, ',');

  if v_demandeur_superadmin then
    v_discord_id := nullif(trim(coalesce(p_discord_id, '')), '');

    if v_discord_id is not null and v_discord_id !~ '^\d+$' then
      return jsonb_build_object(
        'succes', false,
        'message', 'L''ID Discord doit contenir uniquement des chiffres.'
      );
    end if;
  else
    v_discord_id := v_joueur.discord_id;
  end if;

  if coalesce(v_joueur.pseudo, '') <> v_pseudo then
    v_changements := array_append(
      v_changements,
      'Pseudo : ' || coalesce(v_joueur.pseudo, '-') || ' → ' || v_pseudo
    );
  end if;

  if coalesce(v_joueur.roles, '') <> v_roles_final then
    v_changements := array_append(
      v_changements,
      'Rôles : ' || coalesce(nullif(v_joueur.roles, ''), '-') || ' → ' || v_roles_final
    );
  end if;

  if coalesce(v_joueur.statut, '') <> v_statut then
    v_changements := array_append(
      v_changements,
      'Statut : ' || coalesce(nullif(v_joueur.statut, ''), '-') || ' → ' || v_statut
    );
  end if;

  if v_demandeur_superadmin and coalesce(v_joueur.discord_id, '') <> coalesce(v_discord_id, '') then
    if nullif(coalesce(v_joueur.discord_id, ''), '') is null and v_discord_id is not null then
      v_changements := array_append(v_changements, 'ID Discord : ajouté');
    elsif nullif(coalesce(v_joueur.discord_id, ''), '') is not null and v_discord_id is null then
      v_changements := array_append(v_changements, 'ID Discord : supprimé');
    else
      v_changements := array_append(v_changements, 'ID Discord : modifié');
    end if;
  end if;

  if array_length(v_changements, 1) is null then
    return jsonb_build_object(
      'succes', true,
      'message', 'Aucune modification détectée.',
      'modifie', false
    );
  end if;

  update public.joueurs
  set
    pseudo = v_pseudo,
    roles = v_roles_final,
    statut = v_statut,
    discord_id = case
      when v_demandeur_superadmin then v_discord_id
      else discord_id
    end,
    derniere_modification = now()
  where id = p_id_joueur;

  insert into public.journal_activite (
    utilisateur,
    action,
    details
  )
  values (
    v_demandeur.pseudo,
    'Joueur modifié',
    'Joueur : ' || coalesce(v_joueur.pseudo, v_pseudo) ||
      E'\n' ||
      array_to_string(v_changements, E'\n')
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Joueur modifié.',
    'modifie', true
  );
end;
$$;

revoke all on function public.modifier_joueur_site(text, text, bigint, text, text, text, text) from public;
grant execute on function public.modifier_joueur_site(text, text, bigint, text, text, text, text) to anon;
grant execute on function public.modifier_joueur_site(text, text, bigint, text, text, text, text) to authenticated;

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

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
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

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
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

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
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

  select exists (
    select 1 from regexp_split_to_table(coalesce(v_demandeur.roles, ''), '\s*,\s*') r(role_item)
    where lower(trim(role_item)) = 'officier'
  ) into v_officier;
  v_officier := v_officier or v_superadmin;

  if not v_officier then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : rôle officier requis.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
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

  if not v_superadmin then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : seul un SuperAdmin peut supprimer une compétition.');
  end if;

  v_mot_de_passe_attendu := v_demandeur.mot_de_passe;
  if nullif(btrim(v_mot_de_passe_attendu), '') is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
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

CREATE OR REPLACE FUNCTION public.modifier_statut_competition_site(p_utilisateur text, p_mot_de_passe text, p_competition_id bigint, p_nouveau_statut text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_utilisateur public.joueurs%rowtype;
  v_competition public.competitions%rowtype;
  v_roles text := '';
  v_est_officier boolean := false;
  v_est_superadmin boolean := false;
  v_mdp_attendu text;
  v_statut_demande text;
  v_statut_cible text;
  v_lignes integer := 0;
begin
  v_statut_demande := lower(trim(coalesce(p_nouveau_statut, '')));

  if v_statut_demande in ('brouillon') then
    v_statut_cible := 'Brouillon';
  elsif v_statut_demande in ('ouverte') then
    v_statut_cible := 'Ouverte';
  elsif v_statut_demande in ('fermée', 'fermee') then
    v_statut_cible := 'Fermée';
  elsif v_statut_demande in ('archivée', 'archivee') then
    v_statut_cible := 'Archivée';
  else
    return jsonb_build_object(
      'succes', false,
      'message', 'Statut demandé invalide.'
    );
  end if;

  select * into v_utilisateur
  from public.joueurs
  where lower(trim(pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Utilisateur introuvable.'
    );
  end if;

  if lower(trim(coalesce(v_utilisateur.statut, ''))) <> 'actif' then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : utilisateur inactif.'
    );
  end if;

  v_roles := coalesce(v_utilisateur.roles, '');

  v_est_superadmin := exists (
      select 1
      from regexp_split_to_table(v_roles, ',') role
      where lower(trim(role)) = 'superadmin'
    );

  v_est_officier :=
    v_est_superadmin
    or exists (
      select 1
      from regexp_split_to_table(v_roles, ',') role
      where lower(trim(role)) = 'officier'
    );

  if not v_est_officier then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : rôle officier requis.'
    );
  end if;

  v_mdp_attendu := nullif(btrim(v_utilisateur.mot_de_passe), '');
  if v_mdp_attendu is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
  end if;

  if coalesce(p_mot_de_passe, '') <> v_mdp_attendu then
    return jsonb_build_object(
      'succes', false,
      'message', 'Mot de passe incorrect.'
    );
  end if;

  if v_statut_cible = 'Archivée' and not v_est_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : seul un SuperAdmin peut archiver une compétition.'
    );
  end if;

  select * into v_competition
  from public.competitions
  where id = p_competition_id
  for update;

  if not found then
    return jsonb_build_object(
      'succes', false,
      'message', 'Compétition introuvable.'
    );
  end if;

  if coalesce(v_competition.statut, '') = v_statut_cible then
    return jsonb_build_object(
      'succes', true,
      'message', 'Statut déjà à jour.',
      'idCompetition', v_competition.id,
      'competition', v_competition.nom,
      'ancienStatut', v_competition.statut,
      'nouveauStatut', v_statut_cible,
      'modifie', false
    );
  end if;

  update public.competitions
  set statut = v_statut_cible
  where id = v_competition.id
    and statut is not distinct from v_competition.statut;

  get diagnostics v_lignes = row_count;

  if v_lignes <> 1 then
    return jsonb_build_object(
      'succes', false,
      'message', 'Le statut n’a pas été modifié. La compétition a peut-être changé entre-temps.'
    );
  end if;

  insert into public.journal_activite(utilisateur, action, details)
  values (
    v_utilisateur.pseudo,
    'Statut de compétition modifié',
    'Compétition : ' || coalesce(v_competition.nom, 'Sans nom') ||
    E'\nAncien statut : ' || coalesce(v_competition.statut, '') ||
    E'\nNouveau statut : ' || v_statut_cible
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Statut modifié.',
    'idCompetition', v_competition.id,
    'competition', v_competition.nom,
    'ancienStatut', v_competition.statut,
    'nouveauStatut', v_statut_cible,
    'modifie', true
  );
end;
$function$;

revoke all on function public.modifier_statut_competition_site(text, text, bigint, text) from public;
grant execute on function public.modifier_statut_competition_site(text, text, bigint, text) to anon;
grant execute on function public.modifier_statut_competition_site(text, text, bigint, text) to authenticated;

CREATE OR REPLACE FUNCTION public.supprimer_joueur_site(p_id_joueur bigint, p_utilisateur text, p_mot_de_passe text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin public.joueurs%rowtype;
  v_joueur public.joueurs%rowtype;
  v_admin_superadmin boolean := false;
  v_cible_superadmin boolean := false;
  v_mdp_attendu text;
  v_nb_presences integer := 0;
  v_nb_demandes integer := 0;
  v_nb_joueur integer := 0;
  v_lignes integer := 0;
begin
  select * into v_admin
  from public.joueurs
  where lower(trim(pseudo)) = lower(trim(coalesce(p_utilisateur, '')))
  limit 1;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Utilisateur administrateur introuvable.');
  end if;

  v_admin_superadmin := exists (
      select 1
      from regexp_split_to_table(coalesce(v_admin.roles, ''), ',') role
      where lower(trim(role)) = 'superadmin'
    );

  if lower(trim(coalesce(v_admin.statut, ''))) <> 'actif' or not v_admin_superadmin then
    return jsonb_build_object('succes', false, 'message', 'Accès refusé : seul un SuperAdmin actif peut supprimer un joueur.');
  end if;

  v_mdp_attendu := nullif(btrim(v_admin.mot_de_passe), '');
  if v_mdp_attendu is null then
    return jsonb_build_object(
      'succes', false,
      'message', 'Aucun mot de passe personnel n''est configure pour ce compte privilegie.'
    );
  end if;

  if coalesce(p_mot_de_passe, '') <> v_mdp_attendu then
    return jsonb_build_object('succes', false, 'message', 'Mot de passe SuperAdmin incorrect.');
  end if;

  select * into v_joueur
  from public.joueurs
  where id = p_id_joueur
  for update;

  if not found then
    return jsonb_build_object('succes', false, 'message', 'Joueur introuvable.');
  end if;

  v_cible_superadmin := exists (
      select 1
      from regexp_split_to_table(coalesce(v_joueur.roles, ''), ',') role
      where lower(trim(role)) = 'superadmin'
    );

  if v_cible_superadmin then
    return jsonb_build_object('succes', false, 'message', 'Impossible de supprimer un SuperAdmin.');
  end if;

  if lower(trim(v_joueur.pseudo)) = lower(trim(v_admin.pseudo)) then
    return jsonb_build_object('succes', false, 'message', 'Impossible de supprimer votre propre compte.');
  end if;

  delete from public.presences
  where pseudo = v_joueur.pseudo;
  get diagnostics v_nb_presences = row_count;

  if to_regclass('public.discord_link_requests') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'discord_link_requests'
        and column_name = 'joueur_id'
    ) then
      execute 'delete from public.discord_link_requests where joueur_id = $1'
      using v_joueur.id;
      get diagnostics v_lignes = row_count;
      v_nb_demandes := v_nb_demandes + v_lignes;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'discord_link_requests'
        and column_name = 'pseudo'
    ) then
      execute 'delete from public.discord_link_requests where pseudo = $1'
      using v_joueur.pseudo;
      get diagnostics v_lignes = row_count;
      v_nb_demandes := v_nb_demandes + v_lignes;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'discord_link_requests'
        and column_name = 'joueur_pseudo'
    ) then
      execute 'delete from public.discord_link_requests where joueur_pseudo = $1'
      using v_joueur.pseudo;
      get diagnostics v_lignes = row_count;
      v_nb_demandes := v_nb_demandes + v_lignes;
    end if;
  end if;

  delete from public.joueurs
  where id = v_joueur.id;
  get diagnostics v_nb_joueur = row_count;

  if v_nb_joueur <> 1 then
    raise exception 'La fiche joueur n’a pas été supprimée.';
  end if;

  insert into public.journal_activite(utilisateur, action, details)
  values (
    v_admin.pseudo,
    'Joueur supprimé',
    'Joueur : ' || v_joueur.pseudo ||
    E'\nPrésences supprimées : ' || v_nb_presences ||
    E'\nDemandes Discord supprimées : ' || v_nb_demandes
  );

  return jsonb_build_object(
    'succes', true,
    'message', 'Joueur supprimé. Présences supprimées : ' || v_nb_presences || '.',
    'pseudo', v_joueur.pseudo,
    'nbPresencesSupprimees', v_nb_presences,
    'nbDemandesDiscordSupprimees', v_nb_demandes
  );
end;
$function$;

revoke all on function public.supprimer_joueur_site(bigint, text, text) from public;
grant execute on function public.supprimer_joueur_site(bigint, text, text) to anon;
grant execute on function public.supprimer_joueur_site(bigint, text, text) to authenticated;

commit;

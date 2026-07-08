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

  v_demandeur_superadmin :=
    v_demandeur_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

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

  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_demandeur_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_demandeur_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
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

  if (v_roles_contient_superadmin or lower(v_pseudo) = 'raiju153') and not v_demandeur_superadmin then
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

  v_demandeur_superadmin :=
    v_demandeur_superadmin or lower(trim(coalesce(v_demandeur.pseudo, ''))) = 'raiju153';

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

  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_demandeur_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_demandeur_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
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

  v_cible_superadmin :=
    v_cible_superadmin or lower(trim(coalesce(v_joueur.pseudo, ''))) = 'raiju153';

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

  if (v_roles_contient_superadmin or lower(v_pseudo) = 'raiju153') and not v_demandeur_superadmin then
    return jsonb_build_object(
      'succes', false,
      'message', 'Accès refusé : seul un SuperAdmin peut attribuer le rôle SuperAdmin.'
    );
  end if;

  if
    (
      v_cible_superadmin <>
      (v_roles_contient_superadmin or lower(v_pseudo) = 'raiju153')
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
    and not (v_roles_contient_superadmin or lower(v_pseudo) = 'raiju153')
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

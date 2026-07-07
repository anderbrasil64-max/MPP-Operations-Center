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

  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_est_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_est_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
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

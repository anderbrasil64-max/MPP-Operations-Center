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

  if nullif(v_mot_de_passe_attendu, '') is null then
    if v_est_superadmin then
      v_mot_de_passe_attendu := 'superAD';
    elsif v_est_officier then
      v_mot_de_passe_attendu := 'offMPP';
    end if;
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

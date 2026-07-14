begin;

do $$
begin
  if not exists (
    select 1
    from app_private.release_state
    where release_name = 'alpha_0_13_0'
      and phase in (2, 3)
  ) then
    raise exception 'Migration order violation: short-lived sessions require phase 02.';
  end if;
end;
$$;

create or replace function app_private.role_cle(p_role text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select translate(
    lower(btrim(coalesce(p_role, ''))),
    'àâäçéèêëîïôöùûüÿ',
    'aaaceeeeiioouuuy'
  );
$$;

create or replace function app_private.role_present(p_roles text, p_role text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from regexp_split_to_table(coalesce(p_roles, ''), '\s*,\s*') as r(role_item)
    where app_private.role_cle(r.role_item) = app_private.role_cle(p_role)
  );
$$;

create or replace function app_private.roles_valides(p_roles text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(btrim(p_roles), '') <> ''
    and not exists (
      select 1
      from regexp_split_to_table(coalesce(p_roles, ''), '\s*,\s*') as r(role_item)
      where app_private.role_cle(r.role_item) not in (
        'superadmin', 'officier', 'strateur', 'soldat', 'reserviste', 'réserviste', 'recrue'
      )
    );
$$;

create or replace function app_private.competition_autorisee(
  p_roles_joueur text,
  p_roles_competition text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(btrim(p_roles_competition), '') = ''
    or exists (
      select 1
      from regexp_split_to_table(coalesce(p_roles_joueur, ''), '\s*,\s*') as r(role_item)
      where app_private.role_present(p_roles_competition, r.role_item)
    );
$$;

create or replace function app_private.identifiant_hash(p_valeur text)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select extensions.digest(lower(btrim(coalesce(p_valeur, ''))), 'sha256');
$$;

create or replace function app_private.credential_valide(p_secret text, p_hash text)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_secret_normalise text;
begin
  if octet_length(coalesce(p_secret, '')) > 256 then
    perform extensions.crypt(
      encode(extensions.digest('', 'sha256'), 'hex'),
      extensions.gen_salt('bf', 12)
    );
    return false;
  end if;
  v_secret_normalise := encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  if p_hash is null or p_hash !~ '^\$2[abxy]\$' then
    perform extensions.crypt(v_secret_normalise, extensions.gen_salt('bf', 12));
    return false;
  end if;
  return extensions.crypt(v_secret_normalise, p_hash) = p_hash;
end;
$$;

create or replace function app_private.auth_verrouillee(p_categorie text, p_identifiant text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select verrouille_jusqua > now()
    from app_private.auth_attempts
    where categorie = p_categorie
      and identifiant_hash = app_private.identifiant_hash(p_identifiant)
  ), false);
$$;

create or replace function app_private.auth_echec(p_categorie text, p_identifiant text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea := app_private.identifiant_hash(p_identifiant);
begin
  insert into app_private.auth_attempts (
    categorie,
    identifiant_hash,
    fenetre_debut,
    echecs,
    verrouille_jusqua,
    derniere_tentative_a
  ) values (
    p_categorie,
    v_hash,
    now(),
    1,
    null,
    now()
  )
  on conflict (categorie, identifiant_hash) do update
  set
    fenetre_debut = case
      when app_private.auth_attempts.fenetre_debut < now() - interval '15 minutes' then now()
      else app_private.auth_attempts.fenetre_debut
    end,
    echecs = case
      when app_private.auth_attempts.fenetre_debut < now() - interval '15 minutes' then 1
      else app_private.auth_attempts.echecs + 1
    end,
    verrouille_jusqua = case
      when (
        case
          when app_private.auth_attempts.fenetre_debut < now() - interval '15 minutes' then 1
          else app_private.auth_attempts.echecs + 1
        end
      ) >= 5 then now() + interval '15 minutes'
      else app_private.auth_attempts.verrouille_jusqua
    end,
    derniere_tentative_a = now();
end;
$$;

create or replace function app_private.auth_succes(p_categorie text, p_identifiant text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app_private.auth_attempts
  where categorie = p_categorie
    and identifiant_hash = app_private.identifiant_hash(p_identifiant);
$$;

create or replace function app_private.creer_session(p_joueur_id bigint, p_niveau text)
returns table(token text, expire_a timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_expire_a timestamptz;
  v_idle_a timestamptz;
  v_auth_version integer;
begin
  if p_niveau not in ('joueur', 'admin') then
    raise exception 'Invalid session level.';
  end if;

  perform app_private.verrou_auth_joueur(p_joueur_id);

  select auth_version into strict v_auth_version
  from public.joueurs
  where id = p_joueur_id
  for share;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expire_a := now() + case when p_niveau = 'admin' then interval '2 hours' else interval '12 hours' end;
  v_idle_a := now() + case when p_niveau = 'admin' then interval '15 minutes' else interval '2 hours' end;

  insert into app_private.sessions (
    token_hash,
    joueur_id,
    niveau,
    auth_version,
    expire_a,
    inactivite_expire_a
  ) values (
    extensions.digest(v_token, 'sha256'),
    p_joueur_id,
    p_niveau,
    v_auth_version,
    v_expire_a,
    v_idle_a
  );

  token := v_token;
  expire_a := v_expire_a;
  return next;
end;
$$;

create or replace function app_private.contexte_session(p_token text, p_niveau_requis text default 'joueur')
returns table(
  session_id uuid,
  joueur_id bigint,
  pseudo text,
  roles text,
  niveau text,
  est_officier boolean,
  est_superadmin boolean,
  expire_a timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session app_private.sessions%rowtype;
  v_joueur public.joueurs%rowtype;
  v_joueur_id bigint;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]+$' then
    return;
  end if;

  -- Resoudre l'identite avant tout verrou de ligne, puis serialiser toutes
  -- les operations de session d'un joueur avec le meme verrou advisory.
  select s.joueur_id into v_joueur_id
  from app_private.sessions s
  where s.token_hash = extensions.digest(p_token, 'sha256');

  if not found then return; end if;

  perform app_private.verrou_auth_joueur(v_joueur_id);

  select * into v_session
  from app_private.sessions
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found then return; end if;

  select * into v_joueur
  from public.joueurs
  where id = v_joueur_id;

  if not found
     or v_session.revoque_a is not null
     or v_session.expire_a <= now()
     or v_session.inactivite_expire_a <= now()
     or v_session.auth_version <> v_joueur.auth_version
     or lower(btrim(coalesce(v_joueur.statut, ''))) <> 'actif' then
    update app_private.sessions
    set revoque_a = coalesce(revoque_a, now()),
        raison_revocation = coalesce(raison_revocation, 'session_invalide')
    where id = v_session.id;
    return;
  end if;

  est_superadmin := app_private.role_present(v_joueur.roles, 'SuperAdmin');
  est_officier := est_superadmin or app_private.role_present(v_joueur.roles, 'Officier');

  if p_niveau_requis = 'admin' and (v_session.niveau <> 'admin' or not est_officier) then
    return;
  end if;

  update app_private.sessions
  set
    derniere_activite_a = now(),
    inactivite_expire_a = least(
      v_session.expire_a,
      now() + case when v_session.niveau = 'admin' then interval '15 minutes' else interval '2 hours' end
    )
  where id = v_session.id;

  session_id := v_session.id;
  joueur_id := v_joueur.id;
  pseudo := v_joueur.pseudo;
  roles := v_joueur.roles;
  niveau := v_session.niveau;
  expire_a := v_session.expire_a;
  return next;
end;
$$;

create or replace function public.ouvrir_session_joueur_site(
  p_pseudo text,
  p_code_acces text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pseudo text := btrim(coalesce(p_pseudo, ''));
  v_joueur public.joueurs%rowtype;
  v_session record;
  v_joueur_trouve boolean := false;
  v_joueur_id bigint;
  v_auth_identifiant text;
  v_credential_valide boolean;
  v_auth_verrouille boolean;
begin
  if v_pseudo = '' or char_length(v_pseudo) > 80 then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mpp-auth-unknown:joueur', 0)
    );
    perform app_private.credential_valide(p_code_acces, null);
    if not app_private.auth_verrouillee('joueur', 'inconnu') then
      perform app_private.auth_echec('joueur', 'inconnu');
    end if;
    return jsonb_build_object('succes', false, 'message', 'Identification impossible. Vérifiez vos informations.');
  end if;

  select * into v_joueur
  from public.joueurs
  where lower(btrim(pseudo)) = lower(v_pseudo)
    and lower(btrim(coalesce(statut, ''))) = 'actif'
  limit 1;
  v_joueur_trouve := found;
  v_joueur_id := v_joueur.id;
  v_auth_identifiant := case when v_joueur_trouve then v_joueur.id::text else 'inconnu' end;

  -- verrou_auth_joueur centralizes the mpp-session-user: advisory namespace.
  if v_joueur_trouve then
    perform app_private.verrou_auth_joueur(v_joueur_id);
    select * into v_joueur
    from public.joueurs
    where id = v_joueur_id
      and lower(btrim(coalesce(statut, ''))) = 'actif'
    for share;
    v_joueur_trouve := found;
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mpp-auth-unknown:joueur', 0)
    );
  end if;

  -- Keep unknown, invalid and locked authentication paths comparably expensive.
  v_credential_valide := app_private.credential_valide(
    p_code_acces,
    case when v_joueur_trouve then v_joueur.code_acces_hash else null end
  );
  v_auth_verrouille := app_private.auth_verrouillee('joueur', v_auth_identifiant);

  if v_auth_verrouille then
    insert into app_private.security_events (joueur_id, categorie, resultat)
    values (case when v_joueur_trouve then v_joueur_id else null end, 'session_joueur', 'verrouillage');
    return jsonb_build_object('succes', false, 'message', 'Identification impossible. Vérifiez vos informations.');
  end if;

  if not v_joueur_trouve or not v_credential_valide then
    perform app_private.auth_echec('joueur', v_auth_identifiant);
    insert into app_private.security_events (joueur_id, categorie, resultat)
    values (case when v_joueur_trouve then v_joueur.id else null end, 'session_joueur', 'refus');
    return jsonb_build_object('succes', false, 'message', 'Identification impossible. Vérifiez vos informations.');
  end if;

  perform app_private.auth_succes('joueur', v_auth_identifiant);
  select * into v_session from app_private.creer_session(v_joueur.id, 'joueur');

  update public.joueurs
  set derniere_connexion = now()
  where id = v_joueur.id;

  insert into app_private.security_events (joueur_id, categorie, resultat)
  values (v_joueur.id, 'session_joueur', 'succes');

  return jsonb_build_object(
    'succes', true,
    'sessionToken', v_session.token,
    'expireA', v_session.expire_a,
    'joueur', jsonb_build_object(
      'id', v_joueur.id,
      'pseudo', v_joueur.pseudo,
      'roles', v_joueur.roles,
      'statut', v_joueur.statut,
      'discordLie', nullif(btrim(coalesce(v_joueur.discord_id, '')), '') is not null
    )
  );
exception
  when others then
    return jsonb_build_object('succes', false, 'message', 'Identification indisponible.');
end;
$$;

create or replace function public.ouvrir_session_admin_site(
  p_session_joueur text,
  p_mot_de_passe text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexte record;
  v_joueur public.joueurs%rowtype;
  v_session record;
  v_credential_valide boolean;
  v_auth_verrouille boolean;
begin
  select * into v_contexte from app_private.contexte_session(p_session_joueur, 'joueur');
  if not found or not v_contexte.est_officier then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mpp-auth-unknown:admin', 0)
    );
    perform app_private.credential_valide(p_mot_de_passe, null);
    if not app_private.auth_verrouillee('admin', 'inconnu') then
      perform app_private.auth_echec('admin', 'inconnu');
    end if;
    return jsonb_build_object('succes', false, 'message', 'Authentification impossible.');
  end if;

  select * into strict v_joueur
  from public.joueurs
  where id = v_contexte.joueur_id
  for share;

  v_credential_valide := app_private.credential_valide(
    p_mot_de_passe,
    v_joueur.mot_de_passe_hash
  );
  v_auth_verrouille := app_private.auth_verrouillee('admin', v_contexte.joueur_id::text);

  if v_auth_verrouille then
    insert into app_private.security_events (joueur_id, categorie, resultat)
    values (v_contexte.joueur_id, 'session_admin', 'verrouillage');
    return jsonb_build_object('succes', false, 'message', 'Authentification impossible.');
  end if;

  if not v_credential_valide then
    perform app_private.auth_echec('admin', v_contexte.joueur_id::text);
    insert into app_private.security_events (joueur_id, categorie, resultat)
    values (v_joueur.id, 'session_admin', 'refus');
    return jsonb_build_object('succes', false, 'message', 'Authentification impossible.');
  end if;

  perform app_private.auth_succes('admin', v_contexte.joueur_id::text);
  select * into v_session from app_private.creer_session(v_joueur.id, 'admin');
  insert into app_private.security_events (joueur_id, categorie, resultat)
  values (v_joueur.id, 'session_admin', 'succes');

  return jsonb_build_object(
    'succes', true,
    'message', 'Accès officier validé.',
    'sessionToken', v_session.token,
    'expireA', v_session.expire_a,
    'estOfficier', true,
    'estSuperAdmin', v_contexte.est_superadmin
  );
exception
  when others then
    return jsonb_build_object('succes', false, 'message', 'Authentification indisponible.');
end;
$$;

create or replace function public.restaurer_session_site(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexte record;
  v_joueur public.joueurs%rowtype;
begin
  select * into v_contexte from app_private.contexte_session(p_session_token, 'joueur');
  if not found then
    return jsonb_build_object('succes', false, 'code', 'SESSION_EXPIREE', 'message', 'Session expirée.');
  end if;

  select * into strict v_joueur from public.joueurs where id = v_contexte.joueur_id;
  return jsonb_build_object(
    'succes', true,
    'expireA', v_contexte.expire_a,
    'niveau', v_contexte.niveau,
    'joueur', jsonb_build_object(
      'id', v_joueur.id,
      'pseudo', v_joueur.pseudo,
      'roles', v_joueur.roles,
      'statut', v_joueur.statut,
      'discordLie', nullif(btrim(coalesce(v_joueur.discord_id, '')), '') is not null
    )
  );
end;
$$;

create or replace function public.fermer_session_site(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_joueur_id bigint;
begin
  if p_session_token is not null
     and length(p_session_token) = 64
     and p_session_token ~ '^[0-9a-f]+$' then
    select joueur_id into v_joueur_id
    from app_private.sessions
    where token_hash = extensions.digest(p_session_token, 'sha256');

    if found then
      perform app_private.verrou_auth_joueur(v_joueur_id);
    end if;

    update app_private.sessions
    set revoque_a = coalesce(revoque_a, now()),
        raison_revocation = coalesce(raison_revocation, 'deconnexion')
    where token_hash = extensions.digest(p_session_token, 'sha256')
      and joueur_id = v_joueur_id;
  end if;
  return jsonb_build_object('succes', true, 'message', 'Session fermée.');
end;
$$;

drop function if exists public.changer_credential_session_site(text, text, text);

create or replace function public.changer_credential_session_site(
  p_session_admin text,
  p_nouveau_mot_de_passe text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexte record;
  v_joueur public.joueurs%rowtype;
begin
  select * into v_contexte from app_private.contexte_session(p_session_admin, 'admin');
  if not found then
    return jsonb_build_object('succes', false, 'message', 'Session expirée.');
  end if;

  select * into strict v_joueur from public.joueurs where id = v_contexte.joueur_id for update;

  if length(coalesce(p_nouveau_mot_de_passe, '')) < 12
     or octet_length(coalesce(p_nouveau_mot_de_passe, '')) > 256 then
    return jsonb_build_object('succes', false, 'message', 'Le nouveau mot de passe doit contenir au moins 12 caractères.');
  end if;

  update public.joueurs
  set
    mot_de_passe_hash = app_private.credential_hash(p_nouveau_mot_de_passe),
    auth_version = auth_version + 1,
    credential_modifie_a = now(),
    derniere_modification = now()
  where id = v_joueur.id;

  update app_private.sessions
  set revoque_a = coalesce(revoque_a, now()), raison_revocation = 'credential_modifie'
  where joueur_id = v_joueur.id and revoque_a is null;

  insert into public.journal_activite (utilisateur, action, details)
  values (v_joueur.pseudo, 'Mot de passe modifié', 'Credential personnel modifié; sessions révoquées.');

  insert into app_private.security_events (joueur_id, categorie, resultat)
  values (v_joueur.id, 'credential_admin', 'revocation');

  return jsonb_build_object(
    'succes', true,
    'message', 'Mot de passe modifié. Reconnectez-vous.',
    'sessionRevoquee', true
  );
end;
$$;

revoke all on function public.ouvrir_session_joueur_site(text, text) from public;
revoke all on function public.ouvrir_session_admin_site(text, text) from public;
revoke all on function public.restaurer_session_site(text) from public;
revoke all on function public.fermer_session_site(text) from public;
revoke all on function public.changer_credential_session_site(text, text) from public;

grant execute on function public.ouvrir_session_joueur_site(text, text) to anon, authenticated;
grant execute on function public.ouvrir_session_admin_site(text, text) to anon, authenticated;
grant execute on function public.restaurer_session_site(text) to anon, authenticated;
grant execute on function public.fermer_session_site(text) to anon, authenticated;
grant execute on function public.changer_credential_session_site(text, text) to anon, authenticated;

revoke all on function app_private.role_cle(text) from public, anon, authenticated;
revoke all on function app_private.role_present(text, text) from public, anon, authenticated;
revoke all on function app_private.roles_valides(text) from public, anon, authenticated;
revoke all on function app_private.competition_autorisee(text, text) from public, anon, authenticated;
revoke all on function app_private.identifiant_hash(text) from public, anon, authenticated;
revoke all on function app_private.credential_valide(text, text) from public, anon, authenticated;
revoke all on function app_private.auth_verrouillee(text, text) from public, anon, authenticated;
revoke all on function app_private.auth_echec(text, text) from public, anon, authenticated;
revoke all on function app_private.auth_succes(text, text) from public, anon, authenticated;
revoke all on function app_private.creer_session(bigint, text) from public, anon, authenticated;
revoke all on function app_private.contexte_session(text, text) from public, anon, authenticated;

update app_private.release_state
set phase = 3,
    phase_name = 'short_lived_sessions',
    updated_at = now()
where release_name = 'alpha_0_13_0'
  and phase in (2, 3);

commit;

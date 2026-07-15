import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateSecurityDefiners } from "../../scripts/lib/sql-functions.mjs";

async function sql013() {
  const directories = ["supabase/migrations", "supabase/postdeploy-migrations"];
  const result = [];
  for (const directory of directories) {
    for (const name of await readdir(directory)) {
      if (name.includes("alpha_0_13_0") && name.endsWith(".sql")) {
        result.push({ file: path.join(directory, name), sql: await readFile(path.join(directory, name), "utf8") });
      }
    }
  }
  return result;
}

function extraireFonction(sql, nomQualifie) {
  const nom = nomQualifie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const correspondance = sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${nom}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ));
  assert.ok(correspondance, `Fonction SQL absente: ${nomQualifie}`);
  return correspondance[0];
}

test("chaque signature SECURITY DEFINER controle son search_path et son REVOKE", async () => {
  let signatures = 0;
  for (const { file, sql } of await sql013()) {
    const validation = validateSecurityDefiners(file, sql);
    signatures += validation.count;
    assert.deepEqual(validation.errors, [], file);
  }
  assert.equal(signatures, 24);
});

test("les privileges par defaut ne ciblent aucun proprietaire externe", async () => {
  for (const { file, sql } of await sql013()) {
    assert.doesNotMatch(
      sql,
      /alter\s+default\s+privileges\s+for\s+(?:role|user)\b/i,
      file,
    );
  }
  const fondation = await readFile(
    "supabase/migrations/20260714090000_alpha_0_13_0_01_security_foundation.sql",
    "utf8",
  );
  assert.match(
    fondation,
    /alter\s+default\s+privileges\s+revoke\s+execute\s+on\s+functions\s+from\s+public,\s*anon,\s*authenticated/i,
  );
});

test("la presence joueur derive l'identite de la session", async () => {
  const sessions = await readFile("supabase/migrations/20260714092000_alpha_0_13_0_03_short_lived_sessions.sql", "utf8");
  const sql = await readFile("supabase/migrations/20260714093000_alpha_0_13_0_04_session_application_apis.sql", "utf8");
  const contexte = extraireFonction(sessions, "app_private.contexte_session");
  const joueurApi = extraireFonction(sql, "public.api_joueur_site");
  assert.match(contexte, /select s\.joueur_id into v_joueur_id\s+from app_private\.sessions s/);
  assert.doesNotMatch(contexte, /select joueur_id into v_joueur_id/);
  assert.match(joueurApi, /p\.joueur_id = v_ctx\.joueur_id/);
  assert.match(joueurApi, /date_competition_id, joueur_id\) do update/);
  assert.doesNotMatch(joueurApi, /p_payload->>'pseudo'/);
});

test("les credentials sont pre-haches et bornes avant bcrypt", async () => {
  const fondation = await readFile("supabase/migrations/20260714090000_alpha_0_13_0_01_security_foundation.sql", "utf8");
  const sessions = await readFile("supabase/migrations/20260714092000_alpha_0_13_0_03_short_lived_sessions.sql", "utf8");
  const api = await readFile("supabase/migrations/20260714093000_alpha_0_13_0_04_session_application_apis.sql", "utf8");
  assert.match(fondation, /credential_hash/);
  assert.match(fondation, /digest\(coalesce\(p_secret, ''\), 'sha256'\)/);
  assert.doesNotMatch(fondation, /crypt\(mot_de_passe,/);
  assert.doesNotMatch(fondation, /code_acces_hash\s*=\s*app_private\.credential_hash\(mot_de_passe\)/);
  assert.match(fondation, /initialiser_code_acces_joueur/);
  assert.match(sessions, /octet_length\(coalesce\(p_secret, ''\)\) > 256/);
  assert.ok(
    sessions.indexOf("octet_length(coalesce(p_secret, '')) > 256") < sessions.indexOf("v_secret_normalise := encode"),
    "la borne doit précéder le hachage du credential fourni"
  );
  assert.doesNotMatch(sessions, /temporairement indisponible\. Réessayez plus tard/);
  assert.match(sessions, /v_auth_identifiant := case when v_joueur_trouve then v_joueur\.id::text else 'inconnu' end/);
  assert.ok(sessions.indexOf("v_credential_valide := app_private.credential_valide") < sessions.indexOf("if not v_joueur_trouve or not v_credential_valide"));
  assert.match(sessions, /char_length\(v_pseudo\) > 80/);
  assert.doesNotMatch(api, /extensions\.crypt\(v_(?:nouveau_code|code_acces)/);
  assert.match(sessions, /mpp-session-user:/);
  assert.match(sessions, /function public\.changer_credential_session_site\(\s*p_session_admin text,\s*p_nouveau_mot_de_passe text/s);
  assert.doesNotMatch(sessions, /p_ancien_mot_de_passe/);
  assert.ok(
    sessions.indexOf("select s.joueur_id into v_joueur_id") < sessions.indexOf("for update;"),
    "l'identite de session doit etre resolue avant le verrou de ligne"
  );
});

test("l'API joueur limite les donnees et protege le dernier SuperAdmin actif", async () => {
  const sql = await readFile("supabase/migrations/20260714093000_alpha_0_13_0_04_session_application_apis.sql", "utf8");
  const joueurApi = extraireFonction(sql, "public.api_joueur_site");
  assert.doesNotMatch(joueurApi, /jsonb_agg\(to_jsonb\((?:c|d|p)\)/);
  assert.doesNotMatch(joueurApi, /'(?:discordId|discordUsername|discordLieA)'/);
  assert.doesNotMatch(joueurApi, /to_jsonb\(v_(?:joueur|competition)\)/);
  assert.match(sql, /lower\(btrim\(v_statut\)\)<>'actif'/);
  assert.match(joueurApi, /Valider tout le lot avant la première écriture/);
  assert.ok(joueurApi.indexOf("Valider tout le lot") < joueurApi.indexOf("insert into public.presences"));
  assert.match(joueurApi, /Une date de présence est répétée/);
  assert.match(joueurApi, /Un horaire de présence est invalide/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('mpp-superadmin-roster'/);
  assert.match(sql, /for share;/);
  assert.doesNotMatch(sql, /jsonb_agg\(to_jsonb\(/);
  assert.match(sql, /motDePasseAdminInitial/);
  assert.match(sql, /v_comp\.statut = 'Archivée'/);
});

test("les mutations admin sont atomiques et rejouables apres un timeout", async () => {
  const sql = await readFile("supabase/migrations/20260714093000_alpha_0_13_0_04_session_application_apis.sql", "utf8");
  const wrapper = extraireFonction(sql, "public.api_admin_site");
  const executeur = extraireFonction(sql, "app_private.executer_api_admin_site");
  assert.match(sql, /create table if not exists app_private\.admin_operations/);
  assert.match(sql, /alter table app_private\.admin_operations enable row level security/);
  assert.match(sql, /alter table app_private\.admin_operations force row level security/);
  assert.match(sql, /revoke all on table app_private\.admin_operations from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /admin_operations[\s\S]{0,500}\b(?:payload|password|mot_de_passe|token|secret|credential)\b/i);
  assert.match(executeur, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(wrapper, /security definer[\s\S]*set search_path = ''/i);
  assert.match(wrapper, /v_payload_metier := v_payload - 'operationId'/);
  assert.match(wrapper, /request_digest <> v_digest/);
  assert.match(wrapper, /v_existante\.session_id <> v_ctx\.session_id/);
  assert.match(wrapper, /v_existante\.joueur_id <> v_ctx\.joueur_id/);
  assert.match(wrapper, /pg_advisory_xact_lock/);
  assert.match(wrapper, /return v_existante\.resultat/);
  assert.match(wrapper, /v_resultat := app_private\.executer_api_admin_site/);
  assert.match(wrapper, /set resultat = v_resultat,[\s\S]*termine_a = now\(\)/);
});

test("les fragments Discord sont reserves avant envoi et repris prudemment", async () => {
  const sql = await readFile("supabase/migrations/20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql", "utf8");
  assert.match(sql, /function public\.reserver_fragment_discord_site/);
  assert.match(sql, /p_snapshot_hash text/);
  assert.match(sql, /p_fragment_count integer/);
  assert.match(sql, /mentions_autorisees jsonb/);
  assert.match(sql, /contenu_hash/);
  assert.match(sql, /v_fragment\.statut='en_cours'.*v_fragment\.execution_id<>p_execution_id/s);
  assert.match(sql, /v_fragment\.statut='en_cours'.*v_fragment\.execution_id=p_execution_id.*'busy'/s);
  assert.match(sql, /v_fragments_envoyes<>v_fragments_attendus/);
  assert.match(sql, /'manual_review'/);
  assert.match(sql, /'echec_permanent'/);
  assert.match(sql, /grant execute on function public\.reserver_fragment_discord_site\(bigint,uuid,integer,text,integer\) to service_role/);
});

test("le snapshot Discord est atomique, minimal et reserve au service role", async () => {
  const sql = await readFile("supabase/migrations/20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql", "utf8");
  const match = sql.match(
    /create or replace function public\.charger_donnees_rappels_discord_site\(p_date date\)[\s\S]*?\$\$;/,
  );
  assert.ok(match, "RPC de snapshot Discord absente");
  const rpc = match[0];
  assert.match(rpc, /language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(rpc, /with date_valide as \([\s\S]*dates_du_jour as materialized \([\s\S]*competitions_du_jour as materialized \([\s\S]*joueurs_eligibles as materialized \([\s\S]*presences_du_jour as materialized \(/);
  assert.match(rpc, /app_private\.competition_autorisee\(j\.roles, c\.roles_autorises\)/);
  assert.doesNotMatch(rpc, /discord_username|discord_lie_a|mot_de_passe|derniere_connexion/);
  assert.match(sql, /revoke all on function public\.charger_donnees_rappels_discord_site\(date\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.charger_donnees_rappels_discord_site\(date\) to service_role/);
});

test("la transition du rappel joueur fusionne les alias avant l'index quotidien", async () => {
  const sql = await readFile("supabase/migrations/20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql", "utf8");
  const indexPosition = sql.indexOf("create unique index if not exists rappels_presence_discord_unique_jour");
  const transitionPosition = sql.indexOf("create temporary table mpp_rappels_normalises");
  assert.ok(transitionPosition >= 0 && transitionPosition < indexPosition);
  assert.match(sql, /'presence_sans_reponse', 'sans_reponse_17h'[\s\S]*then 'sans_reponse_17h'/);
  assert.match(sql, /bool_or\(s\.statut = 'envoye'\) then 'envoye'/);
  assert.match(sql, /coalesce\(s\.nb_messages, 0\) > 0[\s\S]*then 'echec_incertain'/);
  assert.match(sql, /and r\.id <> n\.id_conserve/);
  assert.doesNotMatch(
    sql.slice(transitionPosition, sql.indexOf("do $$", transitionPosition)),
    /then 'presence_staff'/,
  );
});

test("les identites relationnelles sont garanties par des contraintes composites", async () => {
  const sql = await readFile("supabase/migrations/20260714091000_alpha_0_13_0_02_identity_integrity_expand.sql", "utf8");
  assert.match(sql, /dates_competition_identity_unique/);
  assert.match(sql, /presences_date_identity_fkey/);
  assert.match(sql, /rappels_presence_discord_date_identity_fkey/);
  assert.match(sql, /joueurs_discord_id_unique/);
});

test("le cutover bloque si les credentials ne sont pas prets", async () => {
  const sql = await readFile("supabase/postdeploy-migrations/20260714100000_alpha_0_13_0_06_privileges_and_rls_cutover.sql", "utf8");
  assert.match(sql, /code_acces_hash is null/i);
  assert.match(sql, /mot_de_passe_hash is null/i);
  assert.match(sql, /revoke all privileges on table public\.%I from public, anon, authenticated/i);
  assert.match(sql, /from pg_catalog\.pg_policy/i);
  assert.match(sql, /0::oid=any\(p\.polroles\)/i);
  assert.match(sql, /revoke execute on all functions in schema public from public/i);
  assert.match(sql, /cardinality\(v_browser_functions\)<>7/i);
  assert.match(sql, /array_position\(v_browser_functions,null::oid\) is not null/i);
  assert.ok((sql.match(/array_position\(v_browser_functions,null::oid\) is not null/gi) || []).length >= 2);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+table\s+public\.joueurs/i);
  assert.doesNotMatch(sql, /drop policy if exists "Public read/i);
});

test("le bootstrap initial genere un code fort une seule fois et reste owner-only", async () => {
  const sql = await readFile("supabase/migrations/20260714090000_alpha_0_13_0_01_security_foundation.sql", "utf8");
  const bootstrap = sql.match(
    /create or replace function app_private\.initialiser_code_acces_joueur[\s\S]*?\$\$;/i
  )?.[0] || "";
  assert.match(bootstrap, /initialiser_code_acces_joueur\(\s*p_joueur_id bigint\s*\)\s*returns text/i);
  assert.doesNotMatch(bootstrap, /p_(?:code|secret|mot_de_passe)/i);
  assert.match(bootstrap, /session_user <> v_function_owner/i);
  assert.match(bootstrap, /lower\(btrim\(coalesce\(statut,''\)\)\)='actif'/i);
  assert.match(bootstrap, /lower\(btrim\(r\.role_value\)\)='superadmin'/i);
  assert.match(bootstrap, /code_acces_hash is null/i);
  const randomBytes = Number(bootstrap.match(/gen_random_bytes\((\d+)\)/i)?.[1] || 0);
  assert.ok(randomBytes >= 16, "le bootstrap doit generer au moins 128 bits aleatoires");
  assert.match(bootstrap, /encode\(extensions\.gen_random_bytes\(\d+\),'hex'\)/i);
  assert.match(bootstrap, /code_acces_hash=app_private\.credential_hash\(v_code_acces\)/i);
  assert.match(bootstrap, /auth_version=coalesce\(auth_version,0\)\+1/i);
  assert.match(bootstrap, /return v_code_acces/i);
  const explicitErrors = [...bootstrap.matchAll(/raise exception '([^']+)'/gi)].map((match) => match[1]);
  assert.ok(explicitErrors.length >= 3);
  assert.ok(explicitErrors.every((message) => message === "Bootstrap refused."));
  assert.match(bootstrap, /provisionnement_code_joueur/);
  assert.match(sql, /revoke all on function app_private\.initialiser_code_acces_joueur\(bigint\)\s*from public, anon, authenticated, service_role/i);
});

test("le rollback ne reouvre aucune table", async () => {
  const sql = await readFile("supabase/rollback/alpha_0_13_0_cutover_compensation.sql", "utf8");
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+table/i);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.match(sql, /revoke all on table/i);
});

test("la compensation de fondation garde le bootstrap prive", async () => {
  const sql = await readFile("supabase/rollback/alpha_0_13_0_01_foundation_compensation.sql", "utf8");
  assert.match(sql, /revoke execute on all functions in schema app_private from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant\s+(?:usage|execute|all)/i);
});

test("le nettoyage legacy est rejouable et ignore les sessions deja expirees", async () => {
  const sql = await readFile("supabase/postdeploy-migrations/20260714101000_alpha_0_13_0_07_legacy_cleanup.sql", "utf8");
  assert.match(sql, /expire_a>now\(\)/);
  assert.match(sql, /inactivite_expire_a>now\(\)/);
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /drop column if exists mot_de_passe/);
});

test("les anciennes migrations ne contiennent plus de fallback actif", async () => {
  for (const name of await readdir("supabase/migrations")) {
    const sql = await readFile(path.join("supabase/migrations", name), "utf8");
    assert.doesNotMatch(sql, /mot_de_passe[^\n]*(?::=|=)\s*'[^']+'/i, name);
  }
});

test("la transition legacy neutralise les fallbacks avant les sessions 0.13", async () => {
  const sql = await readFile("supabase/migrations/20260714010811_alpha_0_12_8_1_remove_privileged_password_fallbacks.sql", "utf8");
  assert.equal((sql.match(/create or replace function/gi) || []).length, 11);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.match(sql, /do \$migration_guard\$/i);
  assert.match(sql, /where lower\(btrim\(coalesce\(j\.statut, ''\)\)\) = 'actif'/i);
  assert.match(sql, /nullif\(btrim\(j\.mot_de_passe\), ''\) is null/i);
  assert.match(sql, /raise exception using/i);
  assert.doesNotMatch(sql, /mot_de_passe[^\n]*(?::=|=)\s*'[^']+'/i);
});

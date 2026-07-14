import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateCutoverSeed } from "./generate-cutover-seed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const managedRoles = Object.freeze(["anon", "authenticated", "service_role"]);
const databaseTestDirectories = Object.freeze(["supabase/tests/database", "tests/sql"]);

export const migrationPlan = Object.freeze([
  "supabase/tests/fixtures/alpha_0_12_8_schema.sql",
  "supabase/migrations/20260714010811_alpha_0_12_8_1_remove_privileged_password_fallbacks.sql",
  "supabase/migrations/20260714090000_alpha_0_13_0_01_security_foundation.sql",
  "supabase/migrations/20260714091000_alpha_0_13_0_02_identity_integrity_expand.sql",
  "supabase/migrations/20260714092000_alpha_0_13_0_03_short_lived_sessions.sql",
  "supabase/migrations/20260714093000_alpha_0_13_0_04_session_application_apis.sql",
  "supabase/migrations/20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql"
]);

export const cutoverMigration =
  "supabase/postdeploy-migrations/20260714100000_alpha_0_13_0_06_privileges_and_rls_cutover.sql";
export const cleanupMigration =
  "supabase/postdeploy-migrations/20260714101000_alpha_0_13_0_07_legacy_cleanup.sql";
export const ownerBootstrapContract =
  "supabase/tests/contracts/01_owner_bootstrap.sql";
export const cutoverDriftFixture =
  "supabase/tests/fixtures/cutover_drift.sql";
export const compensationScenarios = Object.freeze([
  Object.freeze({
    name: "foundation-01",
    apply: Object.freeze(migrationPlan.slice(0, 3)),
    compensation: "supabase/rollback/alpha_0_13_0_01_foundation_compensation.sql",
    compensatedPhase: 1,
    replay: Object.freeze([migrationPlan[2]]),
    replayPhase: 1,
    revoked: Object.freeze([])
  }),
  Object.freeze({
    name: "identity-02",
    apply: Object.freeze(migrationPlan.slice(0, 4)),
    compensation: "supabase/rollback/alpha_0_13_0_02_identity_compensation.sql",
    compensatedPhase: 1,
    replay: Object.freeze([migrationPlan[3]]),
    replayPhase: 2,
    revoked: Object.freeze([])
  }),
  Object.freeze({
    name: "sessions-03",
    apply: Object.freeze(migrationPlan.slice(0, 5)),
    compensation: "supabase/rollback/alpha_0_13_0_03_sessions_compensation.sql",
    compensatedPhase: 2,
    replay: Object.freeze([migrationPlan[4]]),
    replayPhase: 3,
    revoked: Object.freeze(["session"])
  }),
  Object.freeze({
    name: "apis-04",
    apply: Object.freeze(migrationPlan.slice(0, 6)),
    compensation: "supabase/rollback/alpha_0_13_0_04_apis_compensation.sql",
    compensatedPhase: 3,
    replay: Object.freeze([migrationPlan[5]]),
    replayPhase: 4,
    revoked: Object.freeze(["api"])
  }),
  Object.freeze({
    name: "edge-05",
    apply: Object.freeze(migrationPlan),
    compensation: "supabase/rollback/alpha_0_13_0_05_edge_compensation.sql",
    compensatedPhase: 4,
    replay: Object.freeze([migrationPlan[6]]),
    replayPhase: 5,
    revoked: Object.freeze(["service"])
  }),
  Object.freeze({
    name: "predeploy-partial",
    apply: Object.freeze(migrationPlan),
    compensation: "supabase/rollback/alpha_0_13_0_predeploy_compensation.sql",
    compensatedPhase: 2,
    replay: Object.freeze(migrationPlan.slice(4)),
    replayPhase: 5,
    revoked: Object.freeze(["session", "api", "service"])
  }),
  Object.freeze({
    name: "cutover-06",
    apply: Object.freeze(migrationPlan),
    compensation: "supabase/rollback/alpha_0_13_0_cutover_compensation.sql",
    compensatedPhase: 5,
    replay: Object.freeze([cutoverMigration]),
    replayPhase: 6,
    revoked: Object.freeze([]),
    cutover: true
  })
]);
export const preCleanupOnlySqlTests = Object.freeze([
  "supabase/tests/database/05_release_state_retention.sql",
  "tests/sql/security-definers.sql"
]);
export const databaseExecutionOrder = Object.freeze([
  "fixture-prerequisite-and-01-05",
  "synthetic-cutover-seed",
  "inject-cutover-drift",
  "cutover-06",
  "two-connection-discord-concurrency",
  "pre-cleanup-tests",
  "cleanup-07",
  "post-cleanup-contract",
  "post-cleanup-tests"
]);

export const postCleanupContract = `begin;

do $post_cleanup_contract$
declare
  v_name text;
  v_phase smallint;
begin
  select phase into strict v_phase
  from app_private.release_state
  where release_name = 'alpha_0_13_0';

  if v_phase <> 7 then
    raise exception 'Post-cleanup contract requires release phase 07, got %.', v_phase;
  end if;

  foreach v_name in array array[
    'enregistrer_connexion_joueur_site',
    'sauvegarder_presences_site',
    'creer_competition_complete_site',
    'modifier_competition_complete_site',
    'ajouter_date_competition_site',
    'supprimer_date_competition_site',
    'supprimer_competition_site',
    'verifier_mot_de_passe_site',
    'changer_mot_de_passe_site',
    'ajouter_joueur_site',
    'modifier_joueur_site',
    'supprimer_joueur_site',
    'modifier_statut_competition_site'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
    ) then
      raise exception 'Legacy function remains after cleanup: public.%', v_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('app_private.initialiser_code_acces_joueur(bigint)') is not null
     or pg_catalog.to_regprocedure('app_private.initialiser_code_acces_joueur(bigint,text)') is not null then
    raise exception 'Legacy private credential initializer remains after cleanup.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'joueurs'
      and column_name in ('mot_de_passe', 'mot_de_passe_modifie')
  ) then
    raise exception 'Legacy credential columns remain after cleanup.';
  end if;
end;
$post_cleanup_contract$;

rollback;
`;

const compensationFunctionGroups = Object.freeze({
  session: Object.freeze([
    "public.ouvrir_session_joueur_site(text,text)",
    "public.ouvrir_session_admin_site(text,text)",
    "public.restaurer_session_site(text)",
    "public.fermer_session_site(text)",
    "public.changer_credential_session_site(text,text)"
  ]),
  api: Object.freeze([
    "public.api_joueur_site(text,text,jsonb)",
    "public.api_admin_site(text,text,jsonb)"
  ]),
  service: Object.freeze([
    "public.charger_donnees_rappels_discord_site(date)",
    "public.reserver_envoi_discord_site(text,bigint,date,time without time zone,jsonb,text,integer,integer)",
    "public.reserver_fragment_discord_site(bigint,uuid,integer,text,integer)",
    "public.enregistrer_fragment_discord_site(bigint,uuid,integer,text,integer,text,text,text)",
    "public.finaliser_envoi_discord_site(bigint,uuid,text,text,integer,integer,integer,integer,integer,jsonb,text)",
    "public.edge_creer_code_liaison_site(text,text,timestamp with time zone)",
    "public.edge_lister_demandes_liaison_site(text)",
    "public.edge_traiter_demande_liaison_site(text,uuid,text,text)",
    "public.edge_enregistrer_identite_discord_site(text,text,text)",
    "public.traiter_auto_statut_competitions_site(date,time without time zone)",
    "public.nettoyer_donnees_securite_site()"
  ])
});

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function functionPrivilegeContract(signatures, roles, expected, label) {
  return signatures.map((signature) => {
    const checks = roles.map((role) => {
      const call = `pg_catalog.has_function_privilege(${sqlLiteral(role)}, ${sqlLiteral(signature)}, 'EXECUTE')`;
      return expected ? `not ${call}` : call;
    }).join(" or ");
    return `if ${checks} then raise exception ${sqlLiteral(`${label} function privilege contract failed.`)}; end if;`;
  }).join("\n  ");
}

export function createCompensationContract(scenario, replayed = false) {
  const expectedPhase = replayed ? scenario.replayPhase : scenario.compensatedPhase;
  const checks = [];

  if (replayed) {
    if (expectedPhase >= 3) {
      checks.push(functionPrivilegeContract(
        compensationFunctionGroups.session,
        ["anon", "authenticated"],
        true,
        "Session replay"
      ));
    }
    if (expectedPhase >= 4) {
      checks.push(functionPrivilegeContract(
        compensationFunctionGroups.api,
        ["anon", "authenticated"],
        true,
        "Application replay"
      ));
    }
    if (expectedPhase >= 5) {
      checks.push(functionPrivilegeContract(
        compensationFunctionGroups.service,
        ["service_role"],
        true,
        "Service replay"
      ));
    }
  } else {
    for (const group of scenario.revoked) {
      checks.push(functionPrivilegeContract(
        compensationFunctionGroups[group],
        group === "service" ? ["service_role"] : ["anon", "authenticated"],
        false,
        `${group} compensation`
      ));
    }
  }

  return `begin;

do $compensation_contract$
declare
  v_phase smallint;
begin
  select phase into strict v_phase
  from app_private.release_state
  where release_name='alpha_0_13_0';

  if v_phase<>${expectedPhase} then
    raise exception 'Unexpected compensation phase.';
  end if;

  ${checks.join("\n  ")}
end;
$compensation_contract$;

rollback;
`;
}

export function createSqlTestPlan(testFiles) {
  const preCleanup = [...new Set(testFiles)].sort();
  for (const requiredTest of preCleanupOnlySqlTests) {
    if (!preCleanup.includes(requiredTest)) {
      throw new Error(`Test SQL pre-nettoyage requis absent: ${requiredTest}`);
    }
  }

  const postCleanup = preCleanup.filter((file) => !preCleanupOnlySqlTests.includes(file));
  if (!postCleanup.length) throw new Error("Aucun test SQL compatible post-nettoyage n'a ete trouve.");

  return Object.freeze({
    preCleanup: Object.freeze(preCleanup),
    postCleanup: Object.freeze(postCleanup)
  });
}

export function assertSafeDatabaseTarget(environment) {
  if (environment.MPP_ALLOW_EPHEMERAL_DATABASE !== "1") {
    throw new Error("Refus: definir MPP_ALLOW_EPHEMERAL_DATABASE=1 pour une base locale jetable.");
  }
  if (environment.DATABASE_URL || environment.PGSERVICE || environment.PGSERVICEFILE) {
    throw new Error("Refus: les URI et services PostgreSQL ne sont pas admis par le runner ephemere.");
  }

  const host = environment.PGHOST || "127.0.0.1";
  const hostAddress = environment.PGHOSTADDR || host;
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!localHosts.has(host) || !localHosts.has(hostAddress)) {
    throw new Error("Refus: le runner ephemere accepte uniquement une adresse loopback.");
  }

  const database = environment.PGDATABASE || "postgres";
  if (database !== "postgres") {
    throw new Error("Refus: PGDATABASE doit cibler la base administrative postgres.");
  }

  const port = Number(environment.PGPORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Refus: PGPORT est invalide.");
  }

  return { database, host, port };
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error("Identifiant PostgreSQL interne invalide.");
  return `"${identifier}"`;
}

function runPsql(argumentsList, options = {}) {
  const environment = {
    ...process.env,
    PGDATABASE: options.database || "postgres",
    PGAPPNAME: "mpp-ephemeral-tests"
  };

  return new Promise((resolve, reject) => {
    const child = spawn(options.binary || "psql", [
      "-X",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      ...argumentsList
    ], {
      cwd: root,
      env: environment,
      shell: false,
      stdio: [options.input === undefined ? "ignore" : "pipe", options.capture ? "pipe" : "inherit", "inherit"]
    });
    let output = "";

    if (options.capture) child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.once("error", (error) => reject(new Error(`Impossible de lancer psql: ${error.message}`)));
    child.once("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`psql a termine avec le code ${code}.`));
    });
    if (options.input !== undefined) child.stdin.end(options.input, "utf8");
  });
}

async function sqlCommand(command, options = {}) {
  return runPsql(["--command", command], options);
}

async function sqlFile(file, database) {
  console.info(`[database] ${file}`);
  await runPsql(["--file", path.join(root, file)], { database });
}

function lastOutputLine(output) {
  return String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
}

export async function runDiscordConcurrencyProbe(database) {
  const setup = `
    create sequence app_private.test_discord_barrier_seq;
    create table app_private.test_discord_barrier (
      worker text primary key,
      backend_pid integer not null,
      ready_at timestamptz not null default now()
    );
    with competition as (
      insert into public.competitions(nom,statut,cree_par,roles_autorises)
      values('test-discord-two-connections','Ouverte','test','Soldat')
      returning id
    ), date_row as (
      insert into public.dates_competition(competition_id,date_competition,horaires)
      select id,current_date+90,'21:00' from competition
      returning competition_id,date_competition
    )
    select competition_id::text || '|' || date_competition::text from date_row;
  `;
  const setupOutput = await runPsql([
    "--quiet", "--tuples-only", "--no-align", "--command", setup
  ], { database, capture: true });
  const [competitionId, competitionDate] = lastOutputLine(setupOutput).split("|");
  if (!/^\d+$/.test(competitionId || "") || !/^\d{4}-\d{2}-\d{2}$/.test(competitionDate || "")) {
    throw new Error("Le probe de concurrence Discord n'a pas obtenu son identite de test.");
  }

  const fragments = JSON.stringify([
    { sequence: 0, contenu: "fragment concurrent synthetique", mentionsAutorisees: [] }
  ]);
  const workerSql = (worker) => `
    insert into app_private.test_discord_barrier(worker,backend_pid)
    values (${sqlLiteral(worker)},pg_catalog.pg_backend_pid());
    do $barrier$
    declare
      v_attempt integer;
    begin
      perform pg_catalog.nextval('app_private.test_discord_barrier_seq'::pg_catalog.regclass);
      for v_attempt in 1..250 loop
        exit when (select last_value from app_private.test_discord_barrier_seq)=2;
        perform pg_catalog.pg_sleep(0.02);
      end loop;
      if (select last_value from app_private.test_discord_barrier_seq)<>2 then
        raise exception 'Two-connection test barrier timed out.';
      end if;
    end;
    $barrier$;
    select public.reserver_envoi_discord_site(
      'test_parallel_reservation',
      ${competitionId}::bigint,
      ${sqlLiteral(competitionDate)}::date,
      '17:00'::time,
      ${sqlLiteral(fragments)}::jsonb,
      app_private.discord_snapshot_hash(${sqlLiteral(fragments)}::jsonb),
      1,
      180
    )->>'etat';
  `;

  const outputs = await Promise.all(["worker-a", "worker-b"].map((worker) => runPsql([
    "--quiet", "--tuples-only", "--no-align", "--command", workerSql(worker)
  ], { database, capture: true })));
  const states = outputs.map(lastOutputLine).sort();
  if (states.length !== 2 || states[0] !== "busy" || states[1] !== "claimed") {
    throw new Error(`Contrat de concurrence Discord invalide: ${states.join(",") || "aucun resultat"}.`);
  }

  await runPsql(["--command", `
    do $parallel_reservation_contract$
    begin
      if (select count(distinct backend_pid) from app_private.test_discord_barrier)<>2 then
        raise exception 'Concurrency probe did not use two PostgreSQL connections.';
      end if;
      if (
        select count(*)
        from public.rappels_presence_discord
        where type_rappel='test_parallel_reservation'
          and competition_id=${competitionId}::bigint
          and date_competition=${sqlLiteral(competitionDate)}::date
      )<>1 then
        raise exception 'Concurrent reservation created an invalid row count.';
      end if;
    end;
    $parallel_reservation_contract$;
  `], { database });
}

export async function discoverSqlTestPlan() {
  const tests = [];
  for (const directory of databaseTestDirectories) {
    const names = (await readdir(path.join(root, directory)))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    tests.push(...names.map((name) => `${directory}/${name}`));
  }
  return createSqlTestPlan(tests);
}

async function executeDatabasePhase(phase, database, testPlan) {
  switch (phase) {
    case "fixture-prerequisite-and-01-05":
      for (const file of migrationPlan) {
        await sqlFile(file, database);
        if (file === migrationPlan[2]) await sqlFile(ownerBootstrapContract, database);
      }
      break;
    case "synthetic-cutover-seed":
      console.info("[database] seed cutover genere en memoire");
      await runPsql(["--file=-"], { database, input: generateCutoverSeed() });
      break;
    case "inject-cutover-drift":
      await sqlFile(cutoverDriftFixture, database);
      break;
    case "cutover-06":
      await sqlFile(cutoverMigration, database);
      break;
    case "two-connection-discord-concurrency":
      console.info("[database] concurrence Discord sur deux connexions psql");
      await runDiscordConcurrencyProbe(database);
      break;
    case "pre-cleanup-tests":
      console.info("[database] tests SQL pre-nettoyage");
      for (const file of testPlan.preCleanup) await sqlFile(file, database);
      break;
    case "cleanup-07":
      await sqlFile(cleanupMigration, database);
      break;
    case "post-cleanup-contract":
      console.info("[database] contrat SQL adapte post-nettoyage");
      await runPsql(["--file=-"], { database, input: postCleanupContract });
      break;
    case "post-cleanup-tests":
      console.info("[database] tests SQL compatibles post-nettoyage");
      for (const file of testPlan.postCleanup) await sqlFile(file, database);
      break;
    default:
      throw new Error(`Phase de test PostgreSQL inconnue: ${phase}`);
  }
}

async function existingManagedRoles() {
  const list = managedRoles.map((role) => `'${role}'`).join(",");
  const output = await runPsql([
    "--tuples-only",
    "--no-align",
    "--command",
    `select rolname from pg_catalog.pg_roles where rolname in (${list}) order by rolname;`
  ], { capture: true });
  return new Set(output.split(/\r?\n/).filter(Boolean));
}

async function removeCreatedRoles(roles) {
  if (!roles.length) return;
  const identifiers = roles.map(quoteIdentifier).join(", ");
  await sqlCommand(`drop role if exists ${identifiers};`);
}

async function withEphemeralDatabase(target, label, callback) {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const databaseName = `mpp_${safeLabel}_${process.pid}_${randomBytes(5).toString("hex")}`;
  const quotedDatabase = quoteIdentifier(databaseName);
  let created = false;

  try {
    console.info(`[database] creation base isolee: ${label}`);
    await sqlCommand(`create database ${quotedDatabase} template template0 encoding 'UTF8';`, {
      database: target.database
    });
    created = true;
    await callback(databaseName);
  } finally {
    if (created) {
      console.info(`[database] suppression base isolee: ${label}`);
      await sqlCommand(`drop database if exists ${quotedDatabase} with (force);`, {
        database: target.database
      });
    }
  }
}

async function applyMigrationFiles(files, database) {
  for (const file of files) {
    await sqlFile(file, database);
    if (file === migrationPlan[2]) await sqlFile(ownerBootstrapContract, database);
  }
}

async function runCompensationScenario(scenario, database) {
  console.info(`[database] compensation isolee: ${scenario.name}`);
  await applyMigrationFiles(scenario.apply, database);

  if (scenario.cutover) {
    await runPsql(["--file=-"], { database, input: generateCutoverSeed() });
    await sqlFile(cutoverDriftFixture, database);
    await sqlFile(cutoverMigration, database);
  }

  await sqlFile(scenario.compensation, database);
  await runPsql(["--file=-"], {
    database,
    input: createCompensationContract(scenario, false)
  });
  if (scenario.cutover) {
    await sqlFile("supabase/tests/contracts/02_no_public_table_access.sql", database);
    await sqlFile(cutoverDriftFixture, database);
  }

  await applyMigrationFiles(scenario.replay, database);
  await runPsql(["--file=-"], {
    database,
    input: createCompensationContract(scenario, true)
  });
  if (scenario.cutover) {
    await sqlFile("supabase/tests/contracts/02_no_public_table_access.sql", database);
  }
}

export async function runDatabaseTests() {
  const target = assertSafeDatabaseTarget(process.env);
  const versionNumber = Number(await runPsql([
    "--tuples-only", "--no-align", "--command", "show server_version_num;"
  ], { database: target.database, capture: true }));
  const majorVersion = Math.floor(versionNumber / 10000);
  if (majorVersion !== 17) throw new Error(`PostgreSQL 17 requis; version majeure detectee: ${majorVersion || "inconnue"}.`);

  const testPlan = await discoverSqlTestPlan();
  const rolesBefore = await existingManagedRoles();
  const rolesToRemove = managedRoles.filter((role) => !rolesBefore.has(role));
  let primaryError;

  try {
    await withEphemeralDatabase(target, "full-forward", async (databaseName) => {
      for (const phase of databaseExecutionOrder) {
        await executeDatabasePhase(phase, databaseName, testPlan);
      }

      console.info(
        `[database] succes forward: 01-05, bootstrap, drift, 06, concurrence, ` +
        `${testPlan.preCleanup.length} tests pre-nettoyage, 07, contrat adapte et ` +
        `${testPlan.postCleanup.length} tests post-nettoyage`
      );
    });

    for (const scenario of compensationScenarios) {
      await withEphemeralDatabase(target, `compensation-${scenario.name}`, async (databaseName) => {
        await runCompensationScenario(scenario, databaseName);
      });
    }

    console.info(
      `[database] succes compensations: ${compensationScenarios.length} scenarios isoles et replays forward`
    );
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await removeCreatedRoles(rolesToRemove);
    } catch (cleanupError) {
      if (!primaryError) primaryError = cleanupError;
      else console.error(`[database] nettoyage incomplet: ${cleanupError.message}`);
    }
  }

  if (primaryError) throw primaryError;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  runDatabaseTests().catch((error) => {
    console.error(`[database] echec: ${error.message}`);
    process.exitCode = 1;
  });
}

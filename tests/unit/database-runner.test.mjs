import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateCutoverSeed } from "../../scripts/generate-cutover-seed.mjs";
import {
  assertSafeDatabaseTarget,
  cleanupMigration,
  compensationScenarios,
  createCompensationContract,
  createSqlTestPlan,
  cutoverDriftFixture,
  cutoverMigration,
  databaseExecutionOrder,
  discoverSqlTestPlan,
  migrationPlan,
  ownerBootstrapContract,
  postCleanupContract
} from "../../scripts/run-database-tests.mjs";

test("le runner ephemere refuse toute cible non locale ou implicite", () => {
  assert.throws(() => assertSafeDatabaseTarget({}), /MPP_ALLOW_EPHEMERAL_DATABASE/);
  assert.throws(() => assertSafeDatabaseTarget({
    MPP_ALLOW_EPHEMERAL_DATABASE: "1",
    PGHOST: "database.example.test",
    PGDATABASE: "postgres"
  }), /loopback/);
  assert.throws(() => assertSafeDatabaseTarget({
    MPP_ALLOW_EPHEMERAL_DATABASE: "1",
    DATABASE_URL: "postgresql:\/\/127.0.0.1\/postgres"
  }), /URI/);
  assert.throws(() => assertSafeDatabaseTarget({
    MPP_ALLOW_EPHEMERAL_DATABASE: "1",
    PGHOST: "127.0.0.1",
    PGHOSTADDR: "203.0.113.10",
    PGDATABASE: "postgres"
  }), /loopback/);
  assert.throws(() => assertSafeDatabaseTarget({
    MPP_ALLOW_EPHEMERAL_DATABASE: "1",
    PGHOST: "127.0.0.1",
    PGDATABASE: "production"
  }), /PGDATABASE/);
  assert.deepEqual(assertSafeDatabaseTarget({
    MPP_ALLOW_EPHEMERAL_DATABASE: "1",
    PGHOST: "127.0.0.1",
    PGDATABASE: "postgres",
    PGPORT: "5432"
  }), { database: "postgres", host: "127.0.0.1", port: 5432 });
});

test("le plan part d une fixture 0.12.8 et respecte l ordre 01 a 05", () => {
  assert.equal(migrationPlan[0], "supabase/tests/fixtures/alpha_0_12_8_schema.sql");
  assert.match(migrationPlan[1], /alpha_0_12_8_1/);
  assert.deepEqual(
    migrationPlan.slice(2).map((file) => file.match(/_0([1-5])_/)[1]),
    ["1", "2", "3", "4", "5"]
  );
});

test("le runner impose seed, cutover, tests pre-nettoyage, cleanup et contrats adaptes", () => {
  assert.deepEqual(databaseExecutionOrder, [
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
  assert.match(cutoverMigration, /_06_privileges_and_rls_cutover\.sql$/);
  assert.match(cleanupMigration, /_07_legacy_cleanup\.sql$/);
  assert.match(ownerBootstrapContract, /owner_bootstrap\.sql$/);
  assert.match(cutoverDriftFixture, /cutover_drift\.sql$/);
});

test("chaque compensation dispose d une base fraiche, d un contrat et d un rejeu forward", () => {
  assert.deepEqual(compensationScenarios.map((scenario) => scenario.name), [
    "foundation-01",
    "identity-02",
    "sessions-03",
    "apis-04",
    "edge-05",
    "predeploy-partial",
    "cutover-06"
  ]);
  assert.equal(new Set(compensationScenarios.map((scenario) => scenario.compensation)).size, 7);
  for (const scenario of compensationScenarios) {
    assert.ok(scenario.apply.length >= 3, scenario.name);
    assert.ok(scenario.replay.length >= 1, scenario.name);
    assert.match(createCompensationContract(scenario, false), new RegExp(`v_phase<>${scenario.compensatedPhase}`));
    assert.match(createCompensationContract(scenario, true), new RegExp(`v_phase<>${scenario.replayPhase}`));
  }
  assert.equal(compensationScenarios.at(-1).cutover, true);
});

test("le probe Discord lance deux processus psql derriere une barriere partagee", async () => {
  const runner = await readFile("scripts/run-database-tests.mjs", "utf8");
  assert.match(runner, /test_discord_barrier/);
  assert.match(runner, /test_discord_barrier_seq/);
  assert.match(runner, /nextval\('app_private\.test_discord_barrier_seq'/);
  assert.match(runner, /Promise\.all\(\["worker-a", "worker-b"\]/);
  assert.match(runner, /count\(distinct backend_pid\).*<>2/s);
  assert.match(runner, /states\[0\] !== "busy" \|\| states\[1\] !== "claimed"/);
  assert.match(runner, /runPsql\(\[/);
});

test("les contrats lies a la phase 6 restent pre-nettoyage uniquement", () => {
  const plan = createSqlTestPlan([
    "tests/sql/security-definers.sql",
    "supabase/tests/database/05_release_state_retention.sql",
    "supabase/tests/database/02_session_identity.sql",
    "supabase/tests/database/01_security_contracts.sql"
  ]);

  assert.deepEqual(plan.preCleanup, [
    "supabase/tests/database/01_security_contracts.sql",
    "supabase/tests/database/02_session_identity.sql",
    "supabase/tests/database/05_release_state_retention.sql",
    "tests/sql/security-definers.sql"
  ]);
  assert.deepEqual(plan.postCleanup, [
    "supabase/tests/database/01_security_contracts.sql",
    "supabase/tests/database/02_session_identity.sql"
  ]);
  assert.throws(
    () => createSqlTestPlan(["supabase/tests/database/01_security_contracts.sql"]),
    /pre-nettoyage requis absent/
  );
});

test("le plan SQL reel couvre sept contrats avant 07 et cinq apres 07", async () => {
  const plan = await discoverSqlTestPlan();
  const postCleanupTests = [
    "supabase/tests/database/01_security_contracts.sql",
    "supabase/tests/database/02_session_identity.sql",
    "supabase/tests/database/03_discord_concurrency.sql",
    "supabase/tests/database/04_admin_authorization.sql",
    "supabase/tests/database/06_admin_idempotency.sql"
  ];

  assert.deepEqual(plan.preCleanup, [
    ...postCleanupTests.slice(0, 4),
    "supabase/tests/database/05_release_state_retention.sql",
    postCleanupTests[4],
    "tests/sql/security-definers.sql"
  ]);
  assert.deepEqual(plan.postCleanup, postCleanupTests);
});

test("le contrat post-nettoyage exige la phase 07 et les suppressions legacy", () => {
  assert.match(postCleanupContract, /v_phase <> 7/);
  assert.match(postCleanupContract, /initialiser_code_acces_joueur\(bigint\)/);
  assert.match(postCleanupContract, /initialiser_code_acces_joueur\(bigint,text\)/);
  assert.match(postCleanupContract, /mot_de_passe_modifie/);
  assert.match(postCleanupContract, /Legacy function remains after cleanup/);
  assert.doesNotMatch(postCleanupContract, /create\s+(?:or\s+replace\s+)?function/i);
});

test("le seed cutover ne contient aucune valeur de credential suivie", () => {
  const sql = generateCutoverSeed();
  assert.match(sql, /extensions\.gen_random_bytes\(32\)/);
  assert.match(sql, /app_private\.credential_hash/);
  assert.doesNotMatch(sql, /(?:code_acces_hash|mot_de_passe_hash)\s*=\s*'[^']+'/i);
  assert.doesNotMatch(sql, /insert\s+into/i);
});

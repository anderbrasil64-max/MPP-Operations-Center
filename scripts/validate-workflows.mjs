import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const directory = ".github/workflows";
const workflows = (await readdir(directory)).filter((name) => /\.ya?ml$/i.test(name));
const errors = [];
const expectedReleaseConfirmation = "DEPLOY ALPHA 0.13.0 - Security & Reliability";
const requiredReadinessInputs = Object.freeze({
  release_confirmation: "string",
  backend_migrations_ready: "boolean",
  edge_functions_ready: "boolean",
  backend_smoke_tests_passed: "boolean",
  production_release_approved: "boolean",
  exposed_credentials_rotated: "boolean",
  git_history_scan_reviewed: "boolean"
});
const requiredReadinessEnvironment = Object.freeze({
  RELEASE_CONFIRMATION: "${{ inputs.release_confirmation }}",
  BACKEND_MIGRATIONS_READY: "${{ inputs.backend_migrations_ready }}",
  EDGE_FUNCTIONS_READY: "${{ inputs.edge_functions_ready }}",
  BACKEND_SMOKE_TESTS_PASSED: "${{ inputs.backend_smoke_tests_passed }}",
  PRODUCTION_RELEASE_APPROVED: "${{ inputs.production_release_approved }}",
  EXPOSED_CREDENTIALS_ROTATED: "${{ inputs.exposed_credentials_rotated }}",
  GIT_HISTORY_SCAN_REVIEWED: "${{ inputs.git_history_scan_reviewed }}"
});
const denoCommands = Object.freeze([
  "deno fmt --check supabase/functions",
  "deno lint supabase/functions",
  "deno check --config supabase/functions/deno.json supabase/functions/*/index.ts"
]);

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function jobSteps(job) {
  return Array.isArray(job?.steps) ? job.steps : [];
}

function commandText(job) {
  return jobSteps(job).map((step) => step.run || "").join("\n");
}

function hasOrderedCommands(job, commands) {
  const script = commandText(job);
  let previousIndex = -1;
  for (const command of commands) {
    const index = script.indexOf(command, previousIndex + 1);
    if (index < 0) return false;
    previousIndex = index;
  }
  return true;
}

function validateActionReferences(file, jobs) {
  for (const [jobName, job] of Object.entries(jobs)) {
    const references = [job.uses, ...jobSteps(job).map((step) => step.uses)].filter(Boolean);
    for (const reference of references) {
      if (reference.startsWith("./")) continue;
      if (!/^[^@\s]+@[a-f0-9]{40}$/.test(reference)) {
        errors.push(`${file}: action non epinglee par SHA dans ${jobName} (${reference})`);
      }
    }
  }
}

function validatePostgresJob(file, job, workflow) {
  if (!job) {
    errors.push(`${file}: job PostgreSQL 17 ephemere absent`);
    return;
  }

  const service = job.services?.postgres;
  if (service?.image !== "postgres:17" || service?.env?.POSTGRES_HOST_AUTH_METHOD !== "trust") {
    errors.push(`${file}: service PostgreSQL 17 ephemere sans authentification trust absent`);
  }
  if (!asArray(service?.ports).map(String).includes("5432:5432")) {
    errors.push(`${file}: port local du service PostgreSQL 17 absent`);
  }

  const testStep = jobSteps(job).find((step) => /\bnpm run test:database\b/.test(step.run || ""));
  const environment = {
    ...(workflow.env || {}),
    ...(job.env || {}),
    ...(testStep?.env || {})
  };
  if (!testStep || String(environment.MPP_ALLOW_EPHEMERAL_DATABASE) !== "1") {
    errors.push(`${file}: runner PostgreSQL ephemere non branche`);
  }
  if (testStep?.["continue-on-error"] || job["continue-on-error"]) {
    errors.push(`${file}: le gate PostgreSQL ne peut pas ignorer un echec`);
  }
  if (
    environment.PGHOST !== "127.0.0.1" ||
    environment.PGDATABASE !== "postgres" ||
    String(environment.PGPORT) !== "5432" ||
    environment.PGUSER !== "postgres" ||
    environment.PGSSLMODE !== "disable" ||
    (environment.PGHOSTADDR && environment.PGHOSTADDR !== "127.0.0.1")
  ) {
    errors.push(`${file}: runner PostgreSQL doit rester confine a la boucle locale`);
  }
  if (["DATABASE_URL", "PGSERVICE", "PGSERVICEFILE", "PGPASSWORD", "PGPASSFILE"].some((name) => name in environment)) {
    errors.push(`${file}: cible ou secret PostgreSQL interdit dans le workflow`);
  }

  const permissions = job.permissions || workflow.permissions || {};
  if (permissions.pages === "write" || permissions["id-token"] === "write") {
    errors.push(`${file}: le job PostgreSQL ne doit posseder aucun droit de deploiement`);
  }
  if (job.environment) errors.push(`${file}: le job PostgreSQL ne doit cibler aucun environnement`);
}

function validatePagesWorkflow(file, workflow) {
  const jobs = workflow.jobs || {};
  const triggers = workflow.on || {};
  const triggerNames = Object.keys(triggers);
  if (triggerNames.length !== 1 || triggerNames[0] !== "workflow_dispatch") {
    errors.push(`${file}: seul workflow_dispatch peut declencher le deploiement Pages`);
  }

  const dispatchInputs = triggers.workflow_dispatch?.inputs || {};
  for (const [inputName, inputType] of Object.entries(requiredReadinessInputs)) {
    const input = dispatchInputs[inputName];
    if (!input || input.required !== true || input.type !== inputType) {
      errors.push(`${file}: input manuel requis invalide (${inputName})`);
    }
  }
  const unexpectedInputs = Object.keys(dispatchInputs).filter((name) => !(name in requiredReadinessInputs));
  if (unexpectedInputs.length) {
    errors.push(`${file}: inputs de deploiement inattendus (${unexpectedInputs.join(", ")})`);
  }

  const readiness = jobs.readiness;
  const readinessStep = jobSteps(readiness).find(
    (step) => step.name === "Validate manual production readiness"
  );
  if (!readiness || !readinessStep) {
    errors.push(`${file}: job de readiness manuel absent`);
  } else {
    for (const [name, value] of Object.entries(requiredReadinessEnvironment)) {
      if (readinessStep.env?.[name] !== value) {
        errors.push(`${file}: attestation non transmise au gate (${name})`);
      }
    }
    const readinessScript = readinessStep.run || "";
    const requiredChecks = [
      '"$GITHUB_REF" != "refs/heads/main"',
      `"$RELEASE_CONFIRMATION" != "${expectedReleaseConfirmation}"`,
      '"$BACKEND_MIGRATIONS_READY"',
      '"$EDGE_FUNCTIONS_READY"',
      '"$BACKEND_SMOKE_TESTS_PASSED"',
      '"$PRODUCTION_RELEASE_APPROVED"',
      '"$EXPOSED_CREDENTIALS_ROTATED"',
      '"$GIT_HISTORY_SCAN_REVIEWED"',
      '"$attestation" != "true"'
    ];
    for (const check of requiredChecks) {
      if (!readinessScript.includes(check)) {
        errors.push(`${file}: controle readiness absent (${check})`);
      }
    }
    const permissions = readiness.permissions || {};
    if (permissions.pages === "write" || permissions["id-token"] === "write") {
      errors.push(`${file}: le gate readiness ne doit posseder aucun droit de deploiement`);
    }
  }

  for (const jobName of ["postgresql-17", "build"]) {
    if (!new Set(asArray(jobs[jobName]?.needs)).has("readiness")) {
      errors.push(`${file}: ${jobName} doit dependre du gate readiness`);
    }
  }

  validatePostgresJob(file, jobs["postgresql-17"], workflow);

  const build = jobs.build;
  if (!hasOrderedCommands(build, denoCommands)) {
    errors.push(`${file}: controles Deno absents du garde de production`);
  }
  const uploadStep = jobSteps(build).find((step) =>
    step.uses?.startsWith("actions/upload-pages-artifact@")
  );
  if (uploadStep?.with?.path !== "site-dist") {
    errors.push(`${file}: artefact Pages non confine a site-dist`);
  }
  if (jobSteps(build).some((step) => step.with?.path === ".")) {
    errors.push(`${file}: publication de la racine interdite`);
  }
  if (!jobSteps(build).some((step) => step.run === "npm run ci:pages")) {
    errors.push(`${file}: gate npm Pages absent`);
  }

  const deploy = jobs.deploy;
  const needs = new Set(asArray(deploy?.needs));
  if (!needs.has("readiness") || !needs.has("build") || !needs.has("postgresql-17")) {
    errors.push(`${file}: deploy doit dependre de readiness, build et PostgreSQL 17`);
  }
  if (deploy?.environment?.name !== "github-pages") {
    errors.push(`${file}: seul l'environnement github-pages est admis`);
  }
}

function validateCiWorkflow(file, workflow) {
  const jobs = workflow.jobs || {};
  if (!hasOrderedCommands(jobs["static-and-unit"], denoCommands)) {
    errors.push(`${file}: controles Deno incomplets`);
  }
  if (!jobSteps(jobs["secret-scan"]).some((step) => step.name === "Run redacted repository secret scanner")) {
    errors.push(`${file}: scanner de secrets absent`);
  }
  validatePostgresJob(file, jobs["postgresql-17"], workflow);
}

const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
if (packageManifest.scripts?.["ci:pages"] !== "npm run test:all") {
  errors.push("package.json: ci:pages doit executer le gate complet test:all");
}

for (const name of workflows) {
  const file = path.join(directory, name);
  const source = await readFile(file, "utf8");
  let workflow;
  try {
    workflow = YAML.parse(source);
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    continue;
  }

  const jobs = workflow?.jobs || {};
  validateActionReferences(file, jobs);
  if (/\$\{\{\s*secrets(?:\.|\[)/i.test(source) || /^\s*secrets\s*:/mi.test(source)) {
    errors.push(`${file}: reference a un secret interdite`);
  }
  if (/\bnpx(?:\.cmd)?\s+playwright\s+install\b/.test(source)) {
    errors.push(`${file}: npx peut telecharger un Playwright non epingle`);
  }

  if (name === "deploy-pages.yml") validatePagesWorkflow(file, workflow);
  if (name === "ci.yml") validateCiWorkflow(file, workflow);
}

if (errors.length) throw new Error(errors.join("\n"));
console.info(`Workflows YAML valides, sans secret et actions epinglees: ${workflows.length}.`);

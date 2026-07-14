import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

const source = await readFile(".github/workflows/deploy-pages.yml", "utf8");
const workflow = YAML.parse(source);
const expectedRelease = "DEPLOY ALPHA 0.13.0 - Security & Reliability";
const requiredInputs = Object.freeze({
  release_confirmation: "string",
  backend_migrations_ready: "boolean",
  edge_functions_ready: "boolean",
  backend_smoke_tests_passed: "boolean",
  production_release_approved: "boolean",
  exposed_credentials_rotated: "boolean",
  git_history_scan_reviewed: "boolean"
});

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

test("Pages ne peut etre declenche que manuellement", () => {
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.on.push, undefined);

  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(inputs), Object.keys(requiredInputs));
  for (const [name, type] of Object.entries(requiredInputs)) {
    assert.equal(inputs[name].required, true, `${name} doit etre obligatoire`);
    assert.equal(inputs[name].type, type, `${name} doit etre de type ${type}`);
  }
});

test("le gate readiness impose main, la phrase exacte et toutes les attestations", () => {
  const readiness = workflow.jobs.readiness;
  const step = readiness.steps.find(
    (candidate) => candidate.name === "Validate manual production readiness"
  );

  assert.ok(step);
  assert.equal(step.env.RELEASE_CONFIRMATION, "${{ inputs.release_confirmation }}");
  assert.match(step.run, /\"\$GITHUB_REF\" != \"refs\/heads\/main\"/);
  assert.ok(step.run.includes(`"$RELEASE_CONFIRMATION" != "${expectedRelease}"`));
  for (const name of [
    "BACKEND_MIGRATIONS_READY",
    "EDGE_FUNCTIONS_READY",
    "BACKEND_SMOKE_TESTS_PASSED",
    "PRODUCTION_RELEASE_APPROVED",
    "EXPOSED_CREDENTIALS_ROTATED",
    "GIT_HISTORY_SCAN_REVIEWED"
  ]) {
    assert.ok(step.run.includes(`"$${name}"`), `${name} doit etre verifiee`);
  }
  assert.match(step.run, /\"\$attestation\" != \"true\"/);
});

test("aucun build ou deploiement ne peut contourner readiness", () => {
  assert.ok(asArray(workflow.jobs.build.needs).includes("readiness"));
  assert.ok(asArray(workflow.jobs["postgresql-17"].needs).includes("readiness"));
  assert.deepEqual(
    new Set(asArray(workflow.jobs.deploy.needs)),
    new Set(["readiness", "build", "postgresql-17"])
  );
  assert.equal(workflow.jobs.deploy.environment.name, "github-pages");
  assert.equal(workflow.jobs.build.steps.find(
    (step) => step.uses?.startsWith("actions/upload-pages-artifact@")
  ).with.path, "site-dist");
});

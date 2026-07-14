import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const version = "0.13.0";
const libelle = "Alpha 0.13.0 - Security & Reliability";
const [html, config, app, supabase, packageJson] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("js/config.js", "utf8"),
  readFile("app.js", "utf8"),
  readFile("supabase.js", "utf8"),
  readFile("package.json", "utf8")
]);

assert.ok(
  html.includes(libelle.replace("&", "&amp;")),
  "Le libelle de version HTML est incoherent."
);
assert.match(config, new RegExp(libelle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(app, /Version Alpha 0\.13\.0 - Security & Reliability/);
assert.match(supabase, /Version Alpha 0\.13\.0 - Security & Reliability/);
assert.equal(JSON.parse(packageJson).version, "0.13.0-rc.1");

const localReferences = [...html.matchAll(/(?:src|href)="(?!https?:|#)([^"?]+)\?v=([^"&]+)"/g)];
assert.ok(localReferences.length >= 13, "Les ressources locales doivent etre versionnees.");
for (const [, resource, cache] of localReferences) {
  assert.equal(cache, version, `Cache-busting incoherent: ${resource}`);
}

console.info(`Version et cache-busting coherents: ${libelle}.`);

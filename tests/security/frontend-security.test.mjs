import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function browserSources() {
  const files = ["app.js", "supabase.js"];
  for (const name of await readdir("js")) if (name.endsWith(".js")) files.push(path.join("js", name));
  return Promise.all(files.map(async (file) => ({ file, source: await readFile(file, "utf8") })));
}

test("aucun sink XSS ou acces table direct ne subsiste dans le frontend", async () => {
  for (const { file, source } of await browserSources()) {
    assert.doesNotMatch(source, /\.(?:innerHTML|outerHTML|insertAdjacentHTML)\b/, file);
    assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b/, file);
    assert.doesNotMatch(source, /\bon(?:click|change|submit|input|error)\s*=/i, file);
    assert.doesNotMatch(source, /\.from\s*\(\s*["']/, file);
  }
});

test("la CSP exclut eval, inline et les origines larges", async () => {
  const html = await readFile("index.html", "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|script-src[^;]*\*/);
  assert.match(html, /src="vendor\/supabase-js-2\.95\.0\.min\.js"/);
  assert.doesNotMatch(html, /https:\/\/cdn\.|unsafe-inline|unsafe-eval/);
});

test("aucun credential n'est persiste par le frontend", async () => {
  const sources = await browserSources();
  const combined = sources.map(({ source }) => source).join("\n");
  assert.doesNotMatch(combined, /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^\n]*(?:motDePasse|mot_de_passe|password|secret|webhook)/i);
  assert.match(combined, /savedPseudoKey|mpp_saved_pseudo/);
  assert.doesNotMatch(combined, /ancienMdp|p_ancien_mot_de_passe/);
});

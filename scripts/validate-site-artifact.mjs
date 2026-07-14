import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("site-dist");
const expected = new Set([
  ".nojekyll",
  "CNAME",
  "app.js",
  "images/logo_mpp_280.webp",
  "index.html",
  "js/config.js",
  "js/competitions.js",
  "js/dialog.js",
  "js/discord.js",
  "js/joueurs.js",
  "js/journal.js",
  "js/logger.js",
  "js/presences.js",
  "js/session-store.js",
  "js/state.js",
  "js/ui.js",
  "style.css",
  "supabase.js",
  "vendor/LICENSE.supabase-js.txt",
  "vendor/supabase-js-2.95.0.min.js"
]);
const forbiddenPath = /(^|\/)(?:supabase|migrations|functions|\.git|\.github|tests?|scripts?|docs?|node_modules)(?:\/|$)|\.(?:sql|ts|env|bak|backup|key|pem)$/i;

async function list(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await list(absolute));
    else result.push(path.relative(root, absolute).replaceAll("\\", "/"));
  }
  return result;
}

await stat(root);
const files = (await list(root)).sort();
const errors = [];
for (const file of files) {
  if (forbiddenPath.test(file)) errors.push(`Chemin interdit dans l'artefact: ${file}`);
  if (!expected.has(file)) errors.push(`Fichier non autorise dans l'artefact: ${file}`);
}
for (const file of expected) {
  if (!files.includes(file)) errors.push(`Fichier runtime manquant: ${file}`);
}

const html = await readFile(path.join(root, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="(?!https?:|#)([^"?]+)(?:\?[^"#]*)?"/g)) {
  if (!files.includes(match[1])) errors.push(`Reference locale absente: ${match[1]}`);
}

console.info("Manifeste site-dist:");
files.forEach((file) => console.info(`- ${file}`));
if (errors.length) throw new Error(errors.join("\n"));
console.info(`Artefact valide: ${files.length} fichiers runtime.`);

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { validateSecurityDefiners } from "./lib/sql-functions.mjs";

const directories = ["supabase/migrations", "supabase/postdeploy-migrations"];
const files = [];
for (const directory of directories) {
  for (const entry of await readdir(directory)) {
    if (entry.includes("alpha_0_13_0") && entry.endsWith(".sql")) files.push(path.join(directory, entry));
  }
}
files.sort();
const errors = [];
let securityDefinerCount = 0;
for (const file of files) {
  const sql = await readFile(file, "utf8");
  if (!/^begin;\s*$/im.test(sql) || !/commit;\s*$/i.test(sql.trim())) errors.push(`${file}: transaction explicite manquante`);
  const securityContracts = validateSecurityDefiners(file, sql);
  securityDefinerCount += securityContracts.count;
  errors.push(...securityContracts.errors);
  if (/mot_de_passe[^\n]*(?::=|=)\s*'[^']+'/i.test(sql)) errors.push(`${file}: valeur de mot de passe litterale`);
  if (/(?:token|secret|webhook)[^\n]*(?::=|=)\s*'[^']{8,}'/i.test(sql)) errors.push(`${file}: valeur sensible litterale`);
}

const transitionFile = "supabase/migrations/20260714010811_alpha_0_12_8_1_remove_privileged_password_fallbacks.sql";
const transitionSql = await readFile(transitionFile, "utf8");
if (!/^begin;\s*$/im.test(transitionSql) || !/commit;\s*$/i.test(transitionSql.trim())) {
  errors.push(`${transitionFile}: transaction explicite manquante`);
}
if ((transitionSql.match(/create or replace function/gi) || []).length !== 11) {
  errors.push(`${transitionFile}: les 11 RPC legacy attendues ne sont pas toutes remplacees`);
}
const transitionSecurityContracts = validateSecurityDefiners(transitionFile, transitionSql, { allowLegacySearchPath: true });
securityDefinerCount += transitionSecurityContracts.count;
errors.push(...transitionSecurityContracts.errors);
if (/mot_de_passe[^\n]*(?::=|=)\s*'[^']+'/i.test(transitionSql)) {
  errors.push(`${transitionFile}: fallback credential litteral`);
}

const names = files.map((file) => path.basename(file));
for (const required of ["01_security_foundation", "02_identity_integrity_expand", "03_short_lived_sessions", "04_session_application_apis", "05_edge_atomic_operations"]) {
  if (!names.some((name) => name.includes(required))) errors.push(`Migration requise absente: ${required}`);
}
if (errors.length) throw new Error(errors.join("\n"));
console.info(`Migrations validees statiquement: 1 transition, ${files.length} migrations 0.13, ${securityDefinerCount} signatures privilegiees.`);

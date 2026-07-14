import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const files = ["app.js", "supabase.js"];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(relative);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) files.push(relative);
  }
}
await collect("js");
await collect("scripts");

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.info(`Syntaxe JavaScript valide: ${files.length} fichiers.`);

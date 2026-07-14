import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const destination = path.join(root, "site-dist");
const runtime = [
  "index.html",
  "app.js",
  "supabase.js",
  "style.css",
  "CNAME",
  ".nojekyll",
  "js",
  "images/logo_mpp_280.webp",
  "vendor"
];

await rm(destination, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100
});
await mkdir(destination, { recursive: true });

for (const sourceRelative of runtime) {
  const source = path.join(root, sourceRelative);
  await stat(source);
  const target = path.join(destination, sourceRelative);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

console.info("Artefact Pages construit depuis une liste blanche explicite.");

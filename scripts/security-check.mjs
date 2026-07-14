import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const findings = [];
const textExtensions = new Set([".js", ".mjs", ".ts", ".html", ".css", ".sql", ".toml", ".md", ".json", ".yml", ".yaml", ".txt", ".ps1"]);
const ignoredDirectories = new Set([".git", "node_modules", "site-dist", "coverage", "playwright-report", "test-results", ".temp"]);

function fichierTexte(item) {
  const nom = path.basename(item).toLowerCase();
  return textExtensions.has(path.extname(item).toLowerCase()) || nom === ".env" || nom.startsWith(".env.");
}

async function filesFor(item) {
  const info = await lstat(item);
  if (info.isSymbolicLink()) return [];
  if (info.isFile()) return fichierTexte(item) && info.size <= 5 * 1024 * 1024 ? [item] : [];
  if (!info.isDirectory()) return [];
  const files = [];
  for (const entry of await readdir(item, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const child = path.join(item, entry.name);
    files.push(...await filesFor(child));
  }
  return files;
}

const files = await filesFor(".");
const secretRules = [
  ["cle privee", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["cle Supabase privee", /\bsb_secret_[A-Za-z0-9_-]{12,}/],
  ["webhook Discord", /https:\/\/(?:canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/],
  ["jeton GitHub", /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["jeton Supabase prive", /\bsbp_[A-Za-z0-9_-]{20,}\b/],
  ["jeton OpenAI", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["jeton Slack", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["cle AWS", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["cle Google", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["cle Stripe live", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ["credential dans URI", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@/]+@/i],
  ["affectation de secret", /(?:password|mot_de_passe|service_role|cron_secret|discord_(?:token|bot_token)|webhook_secret|private_key|api_key)\s*[:=]\s*["'][^"'$<{][^"']{11,}["']/i],
  ["credential SQL litteral", /mot_de_passe[^\n]*(?::=|=)\s*'[^']+'/i]
];

for (const file of files) {
  const source = await readFile(file, "utf8");
  if (source.includes("\0")) continue;
  const lines = source.split(/\r?\n/);
  for (const [type, rule] of secretRules) {
    lines.forEach((line, index) => {
      if (rule.test(line)) findings.push(`${type}: ${file}:${index + 1}`);
    });
  }
}

const productionJs = ["app.js", "supabase.js", ...(await filesFor("js"))];
for (const file of productionJs) {
  const source = await readFile(file, "utf8");
  const forbidden = [
    ["eval", /\beval\s*\(/],
    ["new Function", /\bnew\s+Function\b/],
    ["innerHTML", /\.innerHTML\b/],
    ["outerHTML", /\.outerHTML\b/],
    ["insertAdjacentHTML", /\.insertAdjacentHTML\b/],
    ["handler inline", /\bon(?:click|change|submit|input|load|error)\s*=/i]
  ];
  for (const [type, rule] of forbidden) if (rule.test(source)) findings.push(`${type}: ${file}`);
  if (/\.from\s*\(\s*["']/.test(source)) findings.push(`acces table Supabase direct: ${file}`);
  if (/(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^\n]*(?:password|motDePasse|mot_de_passe|token|secret|webhook)/i.test(source)) {
    findings.push(`credential persiste: ${file}`);
  }
}

if (findings.length) throw new Error(`Controle securite en echec:\n${findings.join("\n")}`);
console.info(`Controle securite valide: ${files.length} fichiers analyses, aucune valeur sensible affichee.`);

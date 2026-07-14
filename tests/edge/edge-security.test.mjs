import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { deriverCodeHmacAmical } from "../../supabase/functions/_shared/runtime.ts";

async function edgeSources() {
  const result = [];
  for (const entry of await readdir("supabase/functions", { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "_shared" || entry.name === "node_modules") continue;
    const file = path.join("supabase/functions", entry.name, "index.ts");
    result.push({ name: entry.name, source: await readFile(file, "utf8") });
  }
  return result;
}

test("toutes les Edge Functions sont versionnees et sans secret litteral", async () => {
  const sources = await edgeSources();
  assert.deepEqual(sources.map(({ name }) => name).sort(), [
    "auto-statut-competitions", "discord-link-admin", "discord-link-code",
    "discord-link-interactions", "discord-presences-staff", "discord-register-commands",
    "maintenance-securite", "rappel-presences-discord"
  ]);
  for (const { name, source } of sources) {
    assert.doesNotMatch(source, /https:\/\/discord(?:app)?\.com\/api\/webhooks\//, name);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'][^"']+["']/, name);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^)]*(?:token|secret|password|webhook)/i, name);
  }
});

test("la maintenance de retention exige un secret Cron et une RPC service role", async () => {
  const source = await readFile("supabase/functions/maintenance-securite/index.ts", "utf8");
  const sql = await readFile("supabase/migrations/20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql", "utf8");
  assert.match(source, /secretCronValide\(req, "CRON_SECRET_MAINTENANCE_SECURITE"\)/);
  assert.match(source, /nettoyer_donnees_securite_site/);
  assert.match(sql, /grant execute on function public\.nettoyer_donnees_securite_site\(\) to service_role/);
  assert.match(sql, /auth_attempts[\s\S]*30 days/);
  assert.match(sql, /security_events[\s\S]*365 days/);
  assert.match(sql, /to_regclass\('app_private\.admin_operations'\)[\s\S]*delete from app_private\.admin_operations where expire_a < now\(\)/);
});

test("le code de liaison est derive par HMAC avec une cle suffisamment longue", async () => {
  const cle = "K".repeat(32);
  const message = "mpp-discord-link-code:v1:" + "a".repeat(64) + ":018f2d2e-7f37-4f8f-8c17-0c79cfe96f12";
  const premier = await deriverCodeHmacAmical(cle, message);
  const rejeu = await deriverCodeHmacAmical(cle, message);
  const autre = await deriverCodeHmacAmical(cle, message.replace(/12$/, "13"));
  const cleUtf8Valide = await deriverCodeHmacAmical("é".repeat(16), message);
  assert.equal(premier, rejeu);
  assert.notEqual(premier, autre);
  assert.match(premier, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.match(cleUtf8Valide, /^[A-HJ-NP-Z2-9]{8}$/);
  await assert.rejects(
    () => deriverCodeHmacAmical("trop-courte", message),
    /HMAC_INVALIDE/,
  );
});

test("la liaison Discord exige operationId et reconcilie le hash avant le cooldown", async () => {
  const source = await readFile("supabase/functions/discord-link-code/index.ts", "utf8");
  const sql = await readFile("supabase/migrations/20260714094000_alpha_0_13_0_05_edge_atomic_operations.sql", "utf8");
  const rpc = sql.match(
    /create or replace function public\.edge_creer_code_liaison_site[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.match(source, /estUuidValide\(operationId\)/);
  assert.match(source, /new TextEncoder\(\)\.encode\(pepper\)\.byteLength < 32/);
  assert.match(source, /deriverCodeHmacAmical\([\s\S]*sessionToken[\s\S]*operationId/);
  assert.doesNotMatch(source, /codeAleatoire|getRandomValues/);
  assert.match(source, /const expireA = typeof data\.expireA === "string"/);
  const contexteLog = source.match(
    /logSecurise\("discord_code_genere",\s*\{([\s\S]*?)\}\);/,
  )?.[1] || "";
  assert.doesNotMatch(contexteLog, /operationId|sessionToken|empreinte|pepper|code\s*:/i);
  const rejeu = rpc.indexOf("and code_hash=p_code_hash");
  const cooldown = rpc.indexOf("created_at>now()-interval '60 seconds'");
  assert.ok(rejeu >= 0 && rejeu < cooldown, "le rejeu doit preceder le cooldown");
  assert.match(rpc, /'expireA',v_existante\.expires_at/);
  assert.match(rpc, /'rejoue',true/);
  assert.match(rpc, /code_hash is distinct from p_code_hash/);
  assert.doesNotMatch(rpc, /operation_id|session_token[^\n]*insert|\bcode\b[^\n]*insert/i);
});

test("les erreurs Edge restent des codes bornes et non des messages externes", async () => {
  const runtime = await readFile("supabase/functions/_shared/runtime.ts", "utf8");
  const discord = await readFile("supabase/functions/_shared/discord.ts", "utf8");
  const register = await readFile("supabase/functions/discord-register-commands/index.ts", "utf8");
  assert.match(runtime, /const CODES_TECHNIQUES = new Set/);
  assert.match(runtime, /codeTechnique\(erreur\)/);
  assert.doesNotMatch(runtime, /"messages",\s*"code"/);
  assert.match(discord, /reponse\.status !== 429/);
  assert.match(discord, /delaiRetryApresDiscord/);
  assert.match(discord, /LIMITE_REPONSE_DISCORD_OCTETS/);
  assert.match(discord, /MAX_TENTATIVES_DISCORD = 3/);
  assert.match(discord, /catch \(erreur\)[\s\S]*incertain: true[\s\S]*return/s);
  assert.match(register, /signal:\s*controleur\.signal/);
});

test("les rappels chargent un snapshot SQL unique sans lecture REST des tables source", async () => {
  const tablesSource = ["dates_competition", "competitions", "joueurs", "presences"];
  for (const file of ["rappel-presences-discord", "discord-presences-staff"]) {
    const source = await readFile(`supabase/functions/${file}/index.ts`, "utf8");
    assert.equal(
      (source.match(/charger_donnees_rappels_discord_site/g) || []).length,
      1,
      `${file}: la RPC de snapshot doit etre appelee exactement une fois`,
    );
    for (const table of tablesSource) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\.from\\(["']${table}["']\\)`),
        `${file}: lecture directe ${table}`,
      );
    }
  }
});

test("le rappel joueur utilise le type historique et normalise les roles accentues", async () => {
  const source = await readFile("supabase/functions/rappel-presences-discord/index.ts", "utf8");
  const frontend = await readFile("supabase.js", "utf8");
  assert.match(source, /const CLE_RESERVATION = "sans_reponse_17h"/);
  assert.doesNotMatch(source, /const CLE_RESERVATION = "presence_sans_reponse"/);
  assert.match(frontend, /SB_TYPE_RAPPEL_PRESENCES_SANS_REPONSE = "sans_reponse_17h"/);
  assert.doesNotMatch(frontend, /presence_sans_reponse/);
  assert.match(source, /normalize\("NFD"\)\.replace\(\s*\/\[\\u0300-\\u036f\]\//);
  assert.match(source, /\.map\(normaliserRole\)/);
});

test("la documentation decrit les retries Discord reels", async () => {
  const documentation = await readFile("docs/EDGE_CI.md", "utf8");
  assert.match(documentation, /429 respecte `Retry-After`[\s\S]*peut etre retente/);
  assert.match(documentation, /5xx[\s\S]*d'une[\s\S]*seule tentative HTTP[\s\S]*aucun retry aveugle/);
  assert.doesNotMatch(documentation, /5xx utilisent un backoff borne/);
});

test("les rappels utilisent le snapshot immuable retourne par la reservation", async () => {
  for (const file of ["rappel-presences-discord", "discord-presences-staff"]) {
    const source = await readFile(`supabase/functions/${file}/index.ts`, "utf8");
    assert.match(source, /reserver_envoi_discord_site/);
    assert.match(source, /p_fragments:\s*candidat\.fragments/);
    assert.match(source, /p_snapshot_hash:\s*candidat\.snapshotHash/);
    assert.match(source, /p_fragment_count:\s*candidat\.fragmentCount/);
    assert.match(source, /snapshotDepuisReservation\(reservation\)/);
    assert.match(source, /metadataDepuisReservation\(reservation\)/);
    assert.match(source, /reserver_fragment_discord_site/);
    assert.match(source, /enregistrer_fragment_discord_site/);
    assert.match(source, /finaliser_envoi_discord_site/);
    assert.ok(
      source.indexOf("reserver_fragment_discord_site") < source.indexOf("const envoi = await envoyerWebhookDiscord"),
      `${file}: le fragment doit etre reserve avant le premier appel webhook`
    );
    assert.match(source, /FRAGMENT_ETAT_INCONNU/);
    assert.match(source, /FRAGMENT_SNAPSHOT_DIVERGENT/);
    assert.match(source, /finalisationConforme/);
    assert.match(source, /finalisation\.etat === statutAttendu/);
    assert.match(source, /fragmentSnapshot\.contenu/);
    assert.match(source, /fragmentSnapshot\.mentionsAutorisees|utilisateursAutorises:\s*\[\]/);
  }
});

test("les mentions Discord sont explicitement limitees", async () => {
  const source = await readFile("supabase/functions/_shared/discord-payload.ts", "utf8");
  assert.match(source, /allowed_mentions:\s*\{\s*parse:\s*\[\],\s*users:/);
  assert.match(source, /\^\\d\{17,20\}\$/);
  assert.doesNotMatch(source, /matchAll\([^)]*<@/);
});

test("les huit fonctions verify_jwt=false ont une authentification applicative testee", async () => {
  const config = await readFile("supabase/config.toml", "utf8");
  const attendues = [
    "rappel-presences-discord", "discord-presences-staff", "auto-statut-competitions",
    "discord-link-code", "discord-link-admin", "discord-link-interactions",
    "discord-register-commands", "maintenance-securite",
  ];
  const configurees = [...config.matchAll(/\[functions\.([^\]]+)\]\s*\nverify_jwt\s*=\s*false/g)].map((match) => match[1]).sort();
  assert.deepEqual(configurees, [...attendues].sort());

  const marqueurs = new Map([
    ["rappel-presences-discord", /secretCronValide\(req, "CRON_SECRET_RAPPEL_PRESENCES"\)/],
    ["discord-presences-staff", /secretCronValide\(req, "CRON_SECRET_PRESENCES_STAFF"\)/],
    ["auto-statut-competitions", /secretCronValide\(req, "CRON_SECRET_AUTO_STATUT_COMPETITIONS"\)/],
    ["maintenance-securite", /secretCronValide\(req, "CRON_SECRET_MAINTENANCE_SECURITE"\)/],
    ["discord-link-code", /cors\(req\)[\s\S]*sessionToken/],
    ["discord-link-admin", /cors\(req\)[\s\S]*sessionToken/],
    ["discord-link-interactions", /x-signature-ed25519[\s\S]*verifierSignature/],
    ["discord-register-commands", /x-admin-secret[\s\S]*DISCORD_REGISTER_COMMANDS_SECRET/],
  ]);
  for (const [fonction, marqueur] of marqueurs) {
    const source = await readFile(`supabase/functions/${fonction}/index.ts`, "utf8");
    assert.match(source, marqueur, fonction);
  }
});

test("les corps HTTP sont lus en flux avec limites, deadline et statuts 400/408/413", async () => {
  const http = await readFile("supabase/functions/_shared/http.ts", "utf8");
  const runtime = await readFile("supabase/functions/_shared/runtime.ts", "utf8");
  const interaction = await readFile("supabase/functions/discord-link-interactions/index.ts", "utf8");
  assert.match(http, /req\.body\.getReader\(\)/);
  assert.match(http, /PAYLOAD_TROP_GRAND", 413/);
  assert.match(http, /JSON_INVALIDE", 400/);
  assert.match(http, /LECTURE_TIMEOUT", 408/);
  assert.match(http, /LECTURE_REPONSE_TIMEOUT/);
  assert.match(runtime, /fetchAvecDeadline/);
  assert.doesNotMatch(runtime, /req\.text\(\)/);
  assert.doesNotMatch(interaction, /req\.text\(\)/);
});

test("les competitions sont ordonnees, isolees et bornees dans le temps", async () => {
  for (const file of ["rappel-presences-discord", "discord-presences-staff"]) {
    const source = await readFile(`supabase/functions/${file}/index.ts`, "utf8");
    assert.match(source, /competitionsTriees[\s\S]*\.sort\(\(a, b\) =>[\s\S]*Number\(a\.id\)\s*-\s*Number\(b\.id\)/);
    assert.match(source, /for \(const competition of competitionsTriees\)[\s\S]*try \{/);
    assert.match(source, /catch \(erreurCompetition\)/);
    assert.match(source, /creerDeadlineGlobale\(\)/);
    assert.match(source, /estDansFenetreRetard\(maintenant\.heure, heure, 120\)/);
  }
});

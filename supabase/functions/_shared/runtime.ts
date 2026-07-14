import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ErreurRequete, lireCorpsReponseBorne, lireJsonBorne } from "./http.ts";

export { ErreurRequete, lireTexteBorne } from "./http.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const DUREE_FETCH_SUPABASE_MS = 8_000;
const LIMITE_REPONSE_SUPABASE_OCTETS = 4 * 1024 * 1024;
const ORIGINES_WEB = new Set([
  "https://mpp-clan.fr",
  "https://www.mpp-clan.fr",
]);

export function envObligatoire(nom: string): string {
  const valeur = Deno.env.get(nom)?.trim() || "";
  if (!valeur) throw new Error("CONFIGURATION_MANQUANTE");
  return valeur;
}

export function fetchAvecDeadline(
  deadlineMs: number,
  dureeMaxMs = DUREE_FETCH_SUPABASE_MS,
): typeof fetch {
  return async (entree: RequestInfo | URL, initialisation?: RequestInit) => {
    const restant = tempsRestant(deadlineMs);
    if (restant <= 0) {
      throw new DOMException("DEADLINE_GLOBALE", "AbortError");
    }

    const controleur = new AbortController();
    const signalSource = initialisation?.signal ??
      (entree instanceof Request ? entree.signal : undefined);
    const propagerAnnulation = () => controleur.abort(signalSource?.reason);
    if (signalSource?.aborted) {
      propagerAnnulation();
    } else {
      signalSource?.addEventListener("abort", propagerAnnulation, {
        once: true,
      });
    }

    const delai = Math.min(
      restant,
      Math.max(1, Math.floor(dureeMaxMs)),
    );
    const deadlineRequeteMs = Date.now() + delai;
    const minuterie = setTimeout(
      () => controleur.abort(new DOMException("FETCH_TIMEOUT", "AbortError")),
      delai,
    );
    try {
      const reponse = await globalThis.fetch(entree, {
        ...initialisation,
        signal: controleur.signal,
      });
      const corps = await lireCorpsReponseBorne(
        reponse,
        LIMITE_REPONSE_SUPABASE_OCTETS,
        deadlineRequeteMs,
      );
      const corpsReponse = corps.byteLength
        ? new Uint8Array(corps).buffer
        : null;
      return new Response(corpsReponse, {
        status: reponse.status,
        statusText: reponse.statusText,
        headers: reponse.headers,
      });
    } finally {
      clearTimeout(minuterie);
      signalSource?.removeEventListener("abort", propagerAnnulation);
    }
  };
}

export function clientService(deadlineMs: number): SupabaseClient {
  verifierDeadline(deadlineMs);
  return createClient(
    envObligatoire("SUPABASE_URL"),
    envObligatoire("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchAvecDeadline(deadlineMs) },
    },
  );
}

export function json(
  corps: unknown,
  statut = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function origineAutorisee(req: Request): string | null {
  const origine = req.headers.get("origin") || "";
  if (ORIGINES_WEB.has(origine)) return origine;
  try {
    const url = new URL(origine);
    if (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      ["http:", "https:"].includes(url.protocol)
    ) return origine;
  } catch (_erreur) {
    return null;
  }
  return null;
}

export function cors(req: Request): HeadersInit | null {
  const origine = origineAutorisee(req);
  if (!origine) return null;
  return {
    "access-control-allow-origin": origine,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function reponseCors(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  const headers = cors(req);
  return headers
    ? new Response(null, { status: 204, headers })
    : json({ succes: false }, 403);
}

export async function lireJson(
  req: Request,
  deadlineMs: number,
  limite = 16_384,
): Promise<Record<string, unknown>> {
  return await lireJsonBorne(req, limite, deadlineMs);
}

export function reponseErreurRequete(
  erreur: unknown,
  headers: HeadersInit = {},
  message = "Requête invalide.",
): Response | null {
  if (!(erreur instanceof ErreurRequete)) return null;
  return json({ succes: false, message }, erreur.statut, headers);
}

export function secretCronValide(req: Request, nom: string): boolean {
  const attendu = envObligatoire(nom);
  const recu = req.headers.get("x-cron-secret") || "";
  if (attendu.length !== recu.length) return false;
  let difference = 0;
  for (let i = 0; i < attendu.length; i += 1) {
    difference |= attendu.charCodeAt(i) ^ recu.charCodeAt(i);
  }
  return difference === 0;
}

export function estUuidValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(valeur);
}

const CODES_TECHNIQUES = new Set([
  "CONFIGURATION_MANQUANTE",
  "CONTENU_DISCORD_INVALIDE",
  "DEADLINE_GLOBALE",
  "DISCORD_RETRY_AFTER_INVALIDE",
  "DISCORD_RETRY_APRES_BUDGET",
  "FETCH_TIMEOUT",
  "FINALISATION_RAPPEL",
  "FINALISATION_RAPPEL_VIDE",
  "FINALISATION_STAFF",
  "FRAGMENT_ETAT_INCONNU",
  "FRAGMENT_NON_ENREGISTRE",
  "FRAGMENT_SNAPSHOT_DIVERGENT",
  "HEX_INVALIDE",
  "IDS_DISCORD_INVALIDES",
  "LECTURE_DATES",
  "LECTURE_PRESENCES",
  "LECTURE_RAPPEL",
  "LECTURE_REPONSE_TIMEOUT",
  "LIMITE_DISCORD_INVALIDE",
  "LIMITE_UTF8_INVALIDE",
  "MAINTENANCE_SECURITE",
  "RESEAU_INCERTAIN",
  "REPONSE_TROP_GRANDE",
  "RESERVATION_FRAGMENT",
  "RESERVATION_METADATA_ABSENTE",
  "RESERVATION_METADATA_INVALIDE",
  "RESERVATION_RAPPEL",
  "RESERVATION_SNAPSHOT_ABSENT",
  "RESERVATION_SNAPSHOT_HASH_INVALIDE",
  "RESERVATION_SNAPSHOT_INVALIDE",
  "RESERVATION_STAFF",
  "SNAPSHOT_FRAGMENT_INVALIDE",
  "SNAPSHOT_FRAGMENTS_INVALIDES",
  "SNAPSHOT_MENTIONS_DUPLIQUEES",
  "SNAPSHOT_MENTIONS_INVALIDES",
  "SNAPSHOT_MENTION_NON_AUTORISEE",
  "TIMEOUT_INCERTAIN",
  "TRAITEMENT_AUTO_STATUT",
]);

function codeTechnique(erreur: unknown): string {
  const candidat = erreur instanceof Error
    ? erreur.message
    : typeof erreur === "string"
    ? erreur
    : "";
  if (CODES_TECHNIQUES.has(candidat)) return candidat;
  if (/^DISCORD_HTTP_[1-5][0-9]{2}$/.test(candidat)) return candidat;
  return "ERREUR_INTERNE";
}

export function logSecurise(
  evenement: string,
  contexte: Record<string, string | number | boolean> = {},
): void {
  const autorise = Object.fromEntries(
    Object.entries(contexte).filter(([cle]) =>
      [
        "fonction",
        "action",
        "statut",
        "competitionId",
        "date",
        "heure",
        "tentative",
        "messages",
      ].includes(cle)
    ),
  );
  const evenementSecurise = /^[a-z0-9_]{1,80}$/.test(evenement)
    ? evenement
    : "evenement_invalide";
  const contexteSecurise = Object.fromEntries(
    Object.entries(autorise).map(([cle, valeur]) => [
      cle,
      typeof valeur === "string" ? valeur.slice(0, 80) : valeur,
    ]),
  );
  console.info(
    JSON.stringify({ evenement: evenementSecurise, ...contexteSecurise }),
  );
}

export function erreurSecurisee(
  evenement: string,
  erreur: unknown = "ERREUR_INTERNE",
): void {
  const evenementSecurise = /^[a-z0-9_]{1,80}$/.test(evenement)
    ? evenement
    : "erreur_invalide";
  console.error(
    JSON.stringify({
      evenement: evenementSecurise,
      code: codeTechnique(erreur),
    }),
  );
}

export function dateHeureParis(
  date = new Date(),
): { date: string; heure: string } {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valeurs = Object.fromEntries(
    parties.map((partie) => [partie.type, partie.value]),
  );
  return {
    date: `${valeurs.year}-${valeurs.month}-${valeurs.day}`,
    heure: `${valeurs.hour}:${valeurs.minute}`,
  };
}

export function heureHHMM(valeur: unknown): string {
  const match = String(valeur || "").match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function estHeureAtteinte(
  actuelle: string,
  programmee: string,
): boolean {
  return Boolean(actuelle && programmee && actuelle >= programmee);
}

function minutesDepuisMinuit(heure: string): number | null {
  const match = heure.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function estDansFenetreRetard(
  actuelle: string,
  programmee: string,
  retardMaxMinutes = 120,
): boolean {
  const maintenant = minutesDepuisMinuit(actuelle);
  const programme = minutesDepuisMinuit(programmee);
  if (maintenant === null || programme === null) return false;
  const retard = maintenant - programme;
  return retard >= 0 && retard <= retardMaxMinutes;
}

export function creerDeadlineGlobale(dureeMs = 50_000): number {
  return Date.now() + Math.min(Math.max(dureeMs, 1_000), 55_000);
}

export function tempsRestant(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

export function verifierDeadline(deadlineMs: number, margeMs = 0): void {
  if (tempsRestant(deadlineMs) <= margeMs) throw new Error("DEADLINE_GLOBALE");
}

export async function sha256Hex(valeur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(valeur),
  );
  return Array.from(new Uint8Array(empreinte)).map((octet) =>
    octet.toString(16).padStart(2, "0")
  ).join("");
}

const ALPHABET_CODE_AMICAL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function deriverCodeHmacAmical(
  cle: string,
  message: string,
  longueur = 8,
): Promise<string> {
  const encodeur = new TextEncoder();
  const cleOctets = encodeur.encode(cle);
  if (
    cleOctets.byteLength < 32 ||
    !message ||
    !Number.isInteger(longueur) ||
    longueur < 8 ||
    longueur > 32
  ) {
    throw new Error("HMAC_INVALIDE");
  }
  const cleHmac = await crypto.subtle.importKey(
    "raw",
    cleOctets,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", cleHmac, encodeur.encode(message)),
  );
  return Array.from(
    signature.subarray(0, longueur),
    (octet) => ALPHABET_CODE_AMICAL[octet & 31],
  ).join("");
}

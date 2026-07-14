import {
  clientService,
  cors,
  creerDeadlineGlobale,
  deriverCodeHmacAmical,
  envObligatoire,
  erreurSecurisee,
  estUuidValide,
  json,
  lireJson,
  logSecurise,
  reponseCors,
  reponseErreurRequete,
  sha256Hex,
} from "../_shared/runtime.ts";

const DUREE_CODE_MS = 10 * 60_000;

Deno.serve(async (req: Request) => {
  const preflight = reponseCors(req);
  if (preflight) return preflight;
  const headers = cors(req);
  if (!headers) return json({ succes: false }, 403);
  if (req.method !== "POST") return json({ succes: false }, 405, headers);
  const deadlineMs = creerDeadlineGlobale(15_000);
  try {
    const corps = await lireJson(req, deadlineMs, 4096);
    const sessionToken = typeof corps.sessionToken === "string"
      ? corps.sessionToken
      : "";
    const operationId = typeof corps.operationId === "string"
      ? corps.operationId.trim().toLowerCase()
      : "";
    if (!estUuidValide(operationId)) {
      return json(
        { succes: false, message: "Requete invalide." },
        400,
        headers,
      );
    }
    const pepper = envObligatoire("DISCORD_LINK_CODE_PEPPER");
    if (new TextEncoder().encode(pepper).byteLength < 32) {
      throw new Error("CONFIGURATION_MANQUANTE");
    }
    const code = await deriverCodeHmacAmical(
      pepper,
      `mpp-discord-link-code:v1:${sessionToken}:${operationId}`,
    );
    const empreinte = await sha256Hex(
      `${pepper}:${code}`,
    );
    const { data, error } = await clientService(deadlineMs).rpc(
      "edge_creer_code_liaison_site",
      {
        p_session_token: sessionToken,
        p_code_hash: empreinte,
        p_expire_at: new Date(Date.now() + DUREE_CODE_MS).toISOString(),
      },
    );
    if (error || !data?.succes) {
      const codeErreur = ["SESSION_EXPIREE", "OPERATION_EXPIREE"].includes(
          data?.code,
        )
        ? data.code
        : undefined;
      return json(
        {
          succes: false,
          ...(codeErreur ? { code: codeErreur } : {}),
          message: data?.message || "Code indisponible.",
        },
        error ? 500 : 400,
        headers,
      );
    }
    const expireA = typeof data.expireA === "string" ? data.expireA : "";
    if (!expireA || Number.isNaN(Date.parse(expireA))) {
      throw new Error("REPONSE_RPC_INVALIDE");
    }
    logSecurise("discord_code_genere", {
      fonction: "discord-link-code",
      statut: "succes",
    });
    return json(
      { succes: true, code, expireA, message: "Code de liaison généré." },
      200,
      headers,
    );
  } catch (erreur) {
    const reponseInvalide = reponseErreurRequete(erreur, headers);
    if (reponseInvalide) return reponseInvalide;
    erreurSecurisee("discord_code_echec", erreur);
    return json({ succes: false, message: "Code indisponible." }, 500, headers);
  }
});

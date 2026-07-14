import {
  clientService,
  cors,
  creerDeadlineGlobale,
  erreurSecurisee,
  estUuidValide,
  json,
  lireJson,
  logSecurise,
  reponseCors,
  reponseErreurRequete,
} from "../_shared/runtime.ts";
import { tronquerUtf8 } from "../_shared/utf8.ts";

Deno.serve(async (req: Request) => {
  const preflight = reponseCors(req);
  if (preflight) return preflight;
  const headers = cors(req);
  if (!headers) return json({ succes: false }, 403);
  if (req.method !== "POST") return json({ succes: false }, 405, headers);
  const deadlineMs = creerDeadlineGlobale(15_000);
  try {
    const corps = await lireJson(req, deadlineMs, 8192);
    const action = typeof corps.action === "string"
      ? corps.action.toLowerCase()
      : "";
    const sessionToken = typeof corps.sessionToken === "string"
      ? corps.sessionToken
      : "";
    const supabase = clientService(deadlineMs);
    if (action === "lister") {
      const { data, error } = await supabase.rpc(
        "edge_lister_demandes_liaison_site",
        { p_session_token: sessionToken },
      );
      if (error || !data?.succes) {
        return json(
          {
            succes: false,
            message: data?.message || "Demandes indisponibles.",
          },
          error ? 500 : 403,
          headers,
        );
      }
      return json(data, 200, headers);
    }
    if (!["valider", "refuser"].includes(action)) {
      return json({ succes: false, message: "Action invalide." }, 400, headers);
    }
    if (!estUuidValide(corps.idDemande)) {
      return json(
        { succes: false, message: "Demande invalide." },
        400,
        headers,
      );
    }
    const idDemande = corps.idDemande;
    const raison = typeof corps.raison === "string"
      ? tronquerUtf8(corps.raison.trim(), 500)
      : "";
    const { data, error } = await supabase.rpc(
      "edge_traiter_demande_liaison_site",
      {
        p_session_token: sessionToken,
        p_request_id: idDemande,
        p_action: action,
        p_raison: raison,
      },
    );
    if (error || !data?.succes) {
      return json(
        { succes: false, message: data?.message || "Traitement impossible." },
        error ? 500 : 400,
        headers,
      );
    }
    logSecurise("discord_demande_traitee", {
      fonction: "discord-link-admin",
      action,
      statut: "succes",
    });
    return json(data, 200, headers);
  } catch (erreur) {
    const reponseInvalide = reponseErreurRequete(erreur, headers);
    if (reponseInvalide) return reponseInvalide;
    erreurSecurisee("discord_admin_echec", erreur);
    return json(
      { succes: false, message: "Service Discord indisponible." },
      500,
      headers,
    );
  }
});

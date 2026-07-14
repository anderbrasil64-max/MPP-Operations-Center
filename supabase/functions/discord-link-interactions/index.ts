import {
  clientService,
  creerDeadlineGlobale,
  envObligatoire,
  ErreurRequete,
  erreurSecurisee,
  json,
  lireTexteBorne,
  logSecurise,
  sha256Hex,
} from "../_shared/runtime.ts";
import { neutraliserTexteDiscord } from "../_shared/messages.ts";

function octetsHex(valeur: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/i.test(valeur) || valeur.length % 2 !== 0) {
    throw new Error("HEX_INVALIDE");
  }
  const octets = new Uint8Array(valeur.length / 2);
  for (let index = 0; index < octets.length; index += 1) {
    octets[index] = Number.parseInt(valeur.slice(index * 2, index * 2 + 2), 16);
  }
  return octets;
}

async function verifierSignature(
  corps: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  const age = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!timestamp || !Number.isFinite(age) || age > 5 * 60_000) return false;
  try {
    const cle = await crypto.subtle.importKey(
      "raw",
      octetsHex(envObligatoire("DISCORD_PUBLIC_KEY")),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      cle,
      octetsHex(signature),
      new TextEncoder().encode(timestamp + corps),
    );
  } catch (_erreur) {
    return false;
  }
}

function optionCode(interaction: Record<string, unknown>): string {
  const data = interaction.data as {
    options?: Array<{ name?: string; value?: unknown }>;
  } | undefined;
  const option = data?.options?.find((item) => item.name === "code");
  return typeof option?.value === "string"
    ? option.value.trim().toUpperCase()
    : "";
}

function identiteDiscord(
  interaction: Record<string, unknown>,
): { id: string; username: string } {
  const member = interaction.member as {
    user?: { id?: string; username?: string; global_name?: string };
  } | undefined;
  const user = member?.user ||
    interaction.user as
      | { id?: string; username?: string; global_name?: string }
      | undefined;
  return {
    id: String(user?.id || ""),
    username: neutraliserTexteDiscord(user?.global_name || user?.username, 100),
  };
}

function messageEphemere(contenu: string): Response {
  return json({
    type: 4,
    data: { content: contenu, flags: 64, allowed_mentions: { parse: [] } },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée." }, 405);
  }
  const deadlineMs = creerDeadlineGlobale(2_750);
  try {
    const corpsBrut = await lireTexteBorne(req, 16_384, deadlineMs);
    const signature = req.headers.get("x-signature-ed25519") || "";
    const timestamp = req.headers.get("x-signature-timestamp") || "";
    if (!(await verifierSignature(corpsBrut, signature, timestamp))) {
      return json({ erreur: "Signature invalide." }, 401);
    }
    let interaction: Record<string, unknown>;
    try {
      const valeur = JSON.parse(corpsBrut);
      if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) {
        throw new Error("JSON_INVALIDE");
      }
      interaction = valeur as Record<string, unknown>;
    } catch (_erreur) {
      return json({ erreur: "Requête invalide." }, 400);
    }
    if (interaction.type === 1) return json({ type: 1 });
    const data = interaction.data as { name?: string } | undefined;
    if (interaction.type !== 2 || data?.name !== "lier") {
      return messageEphemere("Commande non prise en charge.");
    }
    const code = optionCode(interaction);
    const identite = identiteDiscord(interaction);
    if (!/^[A-Z2-9]{8}$/.test(code) || !/^\d{17,20}$/.test(identite.id)) {
      return messageEphemere("Code invalide ou expiré.");
    }
    const empreinte = await sha256Hex(
      `${envObligatoire("DISCORD_LINK_CODE_PEPPER")}:${code}`,
    );
    const { data: resultat, error } = await clientService(deadlineMs).rpc(
      "edge_enregistrer_identite_discord_site",
      {
        p_code_hash: empreinte,
        p_discord_id: identite.id,
        p_discord_username: identite.username,
      },
    );
    if (error || !resultat?.succes) {
      return messageEphemere(resultat?.message || "Liaison indisponible.");
    }
    logSecurise("discord_interaction_lier", {
      fonction: "discord-link-interactions",
      statut: "succes",
    });
    return messageEphemere(
      "Compte Discord reçu. Un SuperAdmin doit encore valider la liaison.",
    );
  } catch (erreur) {
    if (erreur instanceof ErreurRequete) {
      return json({ erreur: "Requête invalide." }, erreur.statut);
    }
    erreurSecurisee("discord_interaction_echec", erreur);
    return messageEphemere("Liaison temporairement indisponible.");
  }
});

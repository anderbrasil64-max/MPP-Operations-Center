import {
  creerDeadlineGlobale,
  envObligatoire,
  erreurSecurisee,
  json,
  logSecurise,
  tempsRestant,
} from "../_shared/runtime.ts";
import { delaiRetryApresDiscord } from "../_shared/discord.ts";

const MAX_TENTATIVES_DISCORD = 3;

function secretValide(recu: string, attendu: string): boolean {
  if (!recu || recu.length !== attendu.length) return false;
  let difference = 0;
  for (let i = 0; i < attendu.length; i += 1) {
    difference |= recu.charCodeAt(i) ^ attendu.charCodeAt(i);
  }
  return difference === 0;
}

async function enregistrerCommandeDiscord(
  endpoint: string,
  jeton: string,
  deadlineMs: number,
): Promise<{ succes: boolean; code: string }> {
  for (let tentative = 1; tentative <= MAX_TENTATIVES_DISCORD; tentative += 1) {
    const restant = tempsRestant(deadlineMs);
    if (restant <= 750) return { succes: false, code: "DEADLINE_GLOBALE" };
    const controleur = new AbortController();
    const minuterie = setTimeout(
      () => controleur.abort(),
      Math.min(8_000, restant - 500),
    );
    try {
      const reponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bot ${jeton}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "lier",
          description: "Lier votre compte Discord à MPP Operations Center",
          type: 1,
          dm_permission: false,
          options: [{
            name: "code",
            description: "Code affiché sur mpp-clan.fr",
            type: 3,
            required: true,
            min_length: 8,
            max_length: 8,
          }],
        }),
        signal: controleur.signal,
      });
      if (reponse.ok) {
        await reponse.body?.cancel();
        return { succes: true, code: "OK" };
      }
      if (reponse.status !== 429 || tentative === MAX_TENTATIVES_DISCORD) {
        await reponse.body?.cancel();
        return { succes: false, code: `DISCORD_HTTP_${reponse.status}` };
      }
      const delai = await delaiRetryApresDiscord(reponse, deadlineMs);
      if (delai === null) {
        return { succes: false, code: "DISCORD_RETRY_AFTER_INVALIDE" };
      }
      if (tempsRestant(deadlineMs) <= delai + 750) {
        return { succes: false, code: "DISCORD_RETRY_APRES_BUDGET" };
      }
      if (delai) await new Promise((resolve) => setTimeout(resolve, delai));
    } catch (erreur) {
      return {
        succes: false,
        code: erreur instanceof DOMException && erreur.name === "AbortError"
          ? "TIMEOUT_INCERTAIN"
          : "RESEAU_INCERTAIN",
      };
    } finally {
      clearTimeout(minuterie);
    }
  }
  return { succes: false, code: "TENTATIVES_EPUISEES" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ succes: false }, 405);
  const deadlineMs = creerDeadlineGlobale(30_000);
  try {
    if (
      !secretValide(
        req.headers.get("x-admin-secret") || "",
        envObligatoire("DISCORD_REGISTER_COMMANDS_SECRET"),
      )
    ) {
      return json({ succes: false }, 401);
    }
    const applicationId = envObligatoire("DISCORD_APPLICATION_ID");
    const guildId = Deno.env.get("DISCORD_GUILD_ID")?.trim() || "";
    const endpoint = guildId
      ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${applicationId}/commands`;
    const resultat = await enregistrerCommandeDiscord(
      endpoint,
      envObligatoire("DISCORD_BOT_TOKEN"),
      deadlineMs,
    );
    if (!resultat.succes) throw new Error(resultat.code);
    logSecurise("discord_commande_enregistree", {
      fonction: "discord-register-commands",
      statut: "succes",
    });
    return json({ succes: true, message: "Commande Discord enregistrée." });
  } catch (erreur) {
    erreurSecurisee("discord_register_echec", erreur);
    return json({
      succes: false,
      message: "Enregistrement Discord indisponible.",
    }, 500);
  }
});

import { construireCorpsWebhook } from "./discord-payload.ts";
import { lireJsonReponseBorne } from "./http.ts";

export {
  construireCorpsWebhook,
  estIdDiscordValide,
  validerIdsDiscord,
} from "./discord-payload.ts";

const STATUTS_TERMINAUX = new Set([400, 401, 403, 404]);
const MAX_TENTATIVES_DISCORD = 3;
const LIMITE_REPONSE_DISCORD_OCTETS = 32_768;

function tempsRestant(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

export type ResultatDiscord = {
  succes: boolean;
  messageId?: string;
  code: string;
  incertain: boolean;
  terminal: boolean;
  tentatives: number;
};

export type OptionsDiscord = {
  deadlineMs: number;
  utilisateursAutorises?: readonly string[];
  maxTentatives?: number;
};

function delaiDepuisSecondes(valeur: unknown): number | null {
  const secondes = typeof valeur === "number" ? valeur : Number(valeur);
  return Number.isFinite(secondes) && secondes >= 0
    ? Math.ceil(secondes * 1_000)
    : null;
}

async function annulerCorps(reponse: Response): Promise<void> {
  try {
    await reponse.body?.cancel();
  } catch (_erreur) {
    // Le corps peut deja etre consomme ou ferme.
  }
}

export async function delaiRetryApresDiscord(
  reponse: Response,
  deadlineMs: number,
): Promise<number | null> {
  const entete = reponse.headers.get("retry-after");
  const delaiEntete = entete === null ? null : delaiDepuisSecondes(entete);
  if (delaiEntete !== null) {
    await annulerCorps(reponse);
    return delaiEntete;
  }

  try {
    const donnees = await lireJsonReponseBorne(
      reponse,
      LIMITE_REPONSE_DISCORD_OCTETS,
      deadlineMs,
    );
    return delaiDepuisSecondes(donnees.retry_after);
  } catch (_erreur) {
    await annulerCorps(reponse);
    return null;
  }
}

async function attendre(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function envoyerWebhookDiscord(
  url: string,
  contenu: string,
  options: OptionsDiscord,
): Promise<ResultatDiscord> {
  const maxTentatives = Math.min(
    Math.max(options.maxTentatives ?? MAX_TENTATIVES_DISCORD, 1),
    MAX_TENTATIVES_DISCORD,
  );
  const corps = construireCorpsWebhook(contenu, options.utilisateursAutorises);
  const separateur = url.includes("?") ? "&" : "?";

  for (let tentative = 1; tentative <= maxTentatives; tentative += 1) {
    const restant = tempsRestant(options.deadlineMs);
    if (restant <= 750) {
      return {
        succes: false,
        code: "DEADLINE_GLOBALE",
        incertain: false,
        terminal: false,
        tentatives: tentative - 1,
      };
    }
    const controleur = new AbortController();
    const deadlineTentativeMs = Math.min(
      options.deadlineMs - 500,
      Date.now() + 8_000,
    );
    const minuterie = setTimeout(
      () => controleur.abort(),
      Math.max(1, deadlineTentativeMs - Date.now()),
    );
    try {
      const reponse = await fetch(`${url}${separateur}wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corps),
        signal: controleur.signal,
      });
      if (reponse.ok) {
        const donnees = await lireJsonReponseBorne(
          reponse,
          LIMITE_REPONSE_DISCORD_OCTETS,
          deadlineTentativeMs,
        );
        return {
          succes: true,
          messageId: typeof donnees.id === "string" ? donnees.id : undefined,
          code: "OK",
          incertain: false,
          terminal: false,
          tentatives: tentative,
        };
      }

      const terminal = STATUTS_TERMINAUX.has(reponse.status) ||
        (reponse.status >= 400 && reponse.status < 500 &&
          reponse.status !== 429);
      if (reponse.status !== 429 || tentative === maxTentatives) {
        await annulerCorps(reponse);
        return {
          succes: false,
          code: `DISCORD_HTTP_${reponse.status}`,
          incertain: reponse.status >= 500,
          terminal,
          tentatives: tentative,
        };
      }

      const delai = await delaiRetryApresDiscord(
        reponse,
        deadlineTentativeMs,
      );
      if (delai === null) {
        return {
          succes: false,
          code: "DISCORD_RETRY_AFTER_INVALIDE",
          incertain: false,
          terminal: false,
          tentatives: tentative,
        };
      }
      if (tempsRestant(options.deadlineMs) <= delai + 750) {
        return {
          succes: false,
          code: "DISCORD_RETRY_APRES_BUDGET",
          incertain: false,
          terminal: false,
          tentatives: tentative,
        };
      }
      await attendre(delai);
    } catch (erreur) {
      const code =
        (erreur instanceof DOMException && erreur.name === "AbortError") ||
          (erreur instanceof Error &&
            erreur.message === "LECTURE_REPONSE_TIMEOUT")
          ? "TIMEOUT_INCERTAIN"
          : "RESEAU_INCERTAIN";
      return {
        succes: false,
        code,
        incertain: true,
        terminal: false,
        tentatives: tentative,
      };
    } finally {
      clearTimeout(minuterie);
    }
  }

  return {
    succes: false,
    code: "TENTATIVES_EPUISEES",
    incertain: false,
    terminal: false,
    tentatives: maxTentatives,
  };
}

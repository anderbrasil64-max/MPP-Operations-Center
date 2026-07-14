import { longueurUtf8 } from "./utf8.ts";

const MAX_IDS_AUTORISES = 100;
const MAX_CONTENU_OCTETS = 1_900;

export function estIdDiscordValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && /^\d{17,20}$/.test(valeur);
}

export function validerIdsDiscord(valeurs: readonly unknown[]): string[] {
  if (
    valeurs.length > MAX_IDS_AUTORISES ||
    valeurs.some((valeur) => !estIdDiscordValide(valeur))
  ) {
    throw new Error("IDS_DISCORD_INVALIDES");
  }
  return [...new Set(valeurs as readonly string[])];
}

function neutraliserMentionsNonAutorisees(
  contenu: string,
  autorises: ReadonlySet<string>,
): string {
  return contenu
    .replace(
      /<@!?(\d+)>/g,
      (_mention, id: string) => autorises.has(id) ? `<@${id}>` : `‹@${id}›`,
    )
    .replace(/<(?:@&|#)\d+>/g, (mention) => `‹${mention.slice(1, -1)}›`)
    .replace(/@(everyone|here)/gi, (_mention, cible: string) => `＠${cible}`);
}

export function construireCorpsWebhook(
  contenu: string,
  utilisateursAutorises: readonly string[] = [],
): { content: string; allowed_mentions: { parse: never[]; users: string[] } } {
  if (!contenu || longueurUtf8(contenu) > MAX_CONTENU_OCTETS) {
    throw new Error("CONTENU_DISCORD_INVALIDE");
  }
  const ids = validerIdsDiscord(utilisateursAutorises);
  const autorises = new Set(ids);
  const content = neutraliserMentionsNonAutorisees(contenu, autorises);
  const presents = ids.filter((id) => content.includes(`<@${id}>`));
  return { content, allowed_mentions: { parse: [], users: presents } };
}

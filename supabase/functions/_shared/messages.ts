import { couperUtf8, longueurUtf8, tronquerUtf8 } from "./utf8.ts";

export type JoueurRappel = { pseudo: string; discord_id: string | null };
export type FragmentDiscord = Readonly<{
  contenu: string;
  mentionsAutorisees: readonly string[];
}>;

type BlocDiscord = string | {
  contenu: string;
  mentionsAutorisees?: readonly string[];
};

function formatDate(dateIso: string): string {
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee}`;
}

export function neutraliserTexteDiscord(
  valeur: unknown,
  longueurMax = 200,
): string {
  const remplacements: Record<string, string> = {
    "@": "＠",
    "<": "‹",
    ">": "›",
    "`": "ˋ",
    "*": "＊",
    "_": "＿",
    "~": "～",
    "|": "￨",
  };
  const texte = String(valeur ?? "")
    .normalize("NFKC")
    .split("")
    .map((caractere) => {
      const code = caractere.charCodeAt(0);
      return code < 32 || code === 127 ? " " : caractere;
    })
    .join("")
    .replace(/[@<>`*_~|]/g, (caractere) => remplacements[caractere])
    .replace(/\s+/g, " ")
    .trim();
  return tronquerUtf8(texte, longueurMax);
}

function idsValides(valeurs: readonly string[]): string[] {
  return [...new Set(valeurs.filter((valeur) => /^\d{17,20}$/.test(valeur)))]
    .slice(0, 100);
}

function figerFragment(
  contenu: string,
  ids: readonly string[],
): FragmentDiscord {
  const presents = idsValides(ids).filter((id) => contenu.includes(`<@${id}>`));
  return Object.freeze({
    contenu,
    mentionsAutorisees: Object.freeze(presents),
  });
}

export function assemblerBlocsDiscord(
  blocs: BlocDiscord[],
  limite = 1900,
): readonly FragmentDiscord[] {
  if (!Number.isSafeInteger(limite) || limite < 100 || limite > 2_000) {
    throw new Error("LIMITE_DISCORD_INVALIDE");
  }
  const messages: FragmentDiscord[] = [];
  let contenuCourant = "";
  let idsCourants: string[] = [];

  const pousser = () => {
    if (!contenuCourant) return;
    messages.push(figerFragment(contenuCourant, idsCourants));
    contenuCourant = "";
    idsCourants = [];
  };

  for (const entree of blocs) {
    const bloc = typeof entree === "string"
      ? { contenu: entree, mentionsAutorisees: [] }
      : entree;
    if (!bloc.contenu) continue;
    const idsBloc = idsValides(bloc.mentionsAutorisees ?? []);
    let restant = bloc.contenu;
    let premierMorceau = true;
    while (restant) {
      const separateur = contenuCourant ? (premierMorceau ? "\n\n" : "\n") : "";
      const place = limite - longueurUtf8(contenuCourant) -
        longueurUtf8(separateur);
      if (place <= 0) {
        pousser();
        continue;
      }
      if (longueurUtf8(restant) <= place) {
        contenuCourant += separateur + restant;
        idsCourants.push(...idsBloc);
        restant = "";
        continue;
      }

      const { prefixe: portion } = couperUtf8(restant, place);
      if (!portion) {
        pousser();
        continue;
      }
      const coupureLigne = portion.lastIndexOf("\n");
      const coupure = coupureLigne >= 0 &&
          longueurUtf8(portion.slice(0, coupureLigne)) > Math.floor(place / 2)
        ? coupureLigne
        : portion.length;
      contenuCourant += separateur + restant.slice(0, coupure);
      idsCourants.push(...idsBloc);
      restant = restant.slice(coupure).replace(/^\n/, "");
      premierMorceau = false;
      pousser();
    }
  }
  pousser();
  return Object.freeze(messages);
}

export function construireRappelPresences(
  competition: { nom: string },
  dateIso: string,
  lies: JoueurRappel[],
  nonLies: JoueurRappel[],
): readonly FragmentDiscord[] {
  const nomCompetition = neutraliserTexteDiscord(competition.nom) || "Sans nom";
  const idsLies = idsValides(lies.map((joueur) => joueur.discord_id || ""));
  const blocs: BlocDiscord[] = [
    "⏰ Rappel présences - MPP",
    `🏆 Compétition : ${nomCompetition}\n📅 Aujourd'hui : ${
      formatDate(dateIso)
    }`,
    "Les joueurs suivants n'ont pas encore renseigné leurs présences pour ce soir.",
    "Merci de remplir vos disponibilités avant 19h00 :",
    "https://mpp-clan.fr/",
  ];
  if (idsLies.length) {
    blocs.push(
      "Liste des joueurs n’ayant pas rempli leurs présences :",
      {
        contenu: idsLies.map((id) => `<@${id}>`).join("\n"),
        mentionsAutorisees: idsLies,
      },
    );
  }
  if (nonLies.length) {
    blocs.push(
      "Joueurs sans Discord lié :",
      nonLies.map((joueur) =>
        `• ${
          neutraliserTexteDiscord(joueur.pseudo, 100) || "Pseudo indisponible"
        }`
      ).join("\n"),
    );
  }
  return assemblerBlocsDiscord(blocs);
}

export function construireResumeStaff(
  competition: { nom: string },
  dateIso: string,
  compteurs: {
    presents: number;
    remplacants: number;
    absents: number;
    repondants: number;
  },
): FragmentDiscord {
  const contenu = [
    "📊 Présences du jour - MPP",
    `🏆 Compétition : ${
      neutraliserTexteDiscord(competition.nom) || "Sans nom"
    }`,
    `📅 Date : ${formatDate(dateIso)}`,
    `Présents : ${compteurs.presents}`,
    `Remplaçants : ${compteurs.remplacants}`,
    `Absents : ${compteurs.absents}`,
    `Réponses enregistrées : ${compteurs.repondants}`,
  ].join("\n");
  return figerFragment(contenu, []);
}

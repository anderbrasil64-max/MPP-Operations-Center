import type { FragmentDiscord } from "./messages.ts";
import { longueurUtf8 } from "./utf8.ts";

export type FragmentSnapshot = Readonly<{
  sequence: number;
  contenu: string;
  mentionsAutorisees: readonly string[];
}>;

export type SnapshotDiscord = Readonly<{
  fragments: readonly FragmentSnapshot[];
  snapshotHash: string;
  fragmentCount: number;
}>;

export type MetadataReservationDiscord = Readonly<{
  rappelId: number;
  executionId: string;
  tentative: number;
  etat: "claimed" | "retry_claimed";
}>;

const UUID_CANONIQUE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idsDiscord(valeurs: unknown): readonly string[] {
  if (
    !Array.isArray(valeurs) || valeurs.length > 100 ||
    valeurs.some((id) => typeof id !== "string" || !/^\d{17,20}$/.test(id))
  ) {
    throw new Error("SNAPSHOT_MENTIONS_INVALIDES");
  }
  if (new Set(valeurs).size !== valeurs.length) {
    throw new Error("SNAPSHOT_MENTIONS_DUPLIQUEES");
  }
  return Object.freeze([...valeurs] as string[]);
}

function normaliserFragments(valeur: unknown): readonly FragmentSnapshot[] {
  if (!Array.isArray(valeur) || valeur.length > 50) {
    throw new Error("SNAPSHOT_FRAGMENTS_INVALIDES");
  }
  const fragments = valeur.map((fragment, index) => {
    if (!fragment || typeof fragment !== "object" || Array.isArray(fragment)) {
      throw new Error("SNAPSHOT_FRAGMENT_INVALIDE");
    }
    const objet = fragment as Record<string, unknown>;
    if (
      objet.sequence !== index || typeof objet.contenu !== "string" ||
      !objet.contenu || longueurUtf8(objet.contenu) > 1_900
    ) {
      throw new Error("SNAPSHOT_FRAGMENT_INVALIDE");
    }
    const mentionsAutorisees = idsDiscord(objet.mentionsAutorisees);
    const mentionsTexte = [...objet.contenu.matchAll(/<@!?(\d+)>/g)].map((
      match,
    ) => match[1]);
    if (
      mentionsTexte.some((id) => !mentionsAutorisees.includes(id)) ||
      /@(?:everyone|here)|<(?:@&|#)\d+>/i.test(objet.contenu)
    ) {
      throw new Error("SNAPSHOT_MENTION_NON_AUTORISEE");
    }
    return Object.freeze({
      sequence: index,
      contenu: objet.contenu,
      mentionsAutorisees,
    });
  });
  return Object.freeze(fragments);
}

async function hashFragments(
  fragments: readonly FragmentSnapshot[],
): Promise<string> {
  // Le format en tableaux rend l'empreinte indépendante de l'ordre des clés
  // réémises par PostgreSQL jsonb lors d'une reprise de Cron.
  const contenu = JSON.stringify(fragments.map((fragment) => [
    fragment.sequence,
    fragment.contenu,
    [...fragment.mentionsAutorisees],
  ]));
  const empreinte = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(contenu),
  );
  return Array.from(
    new Uint8Array(empreinte),
    (octet) => octet.toString(16).padStart(2, "0"),
  ).join("");
}

export async function creerSnapshotDiscord(
  fragments: readonly FragmentDiscord[],
): Promise<SnapshotDiscord> {
  const normalises = normaliserFragments(
    fragments.map((fragment, sequence) => ({
      sequence,
      contenu: fragment.contenu,
      mentionsAutorisees: [...fragment.mentionsAutorisees],
    })),
  );
  return Object.freeze({
    fragments: normalises,
    snapshotHash: await hashFragments(normalises),
    fragmentCount: normalises.length,
  });
}

export async function snapshotDepuisReservation(
  reservation: unknown,
): Promise<SnapshotDiscord> {
  if (
    !reservation || typeof reservation !== "object" ||
    Array.isArray(reservation)
  ) throw new Error("RESERVATION_SNAPSHOT_ABSENT");
  const objet = reservation as Record<string, unknown>;
  const fragments = normaliserFragments(objet.fragments);
  const snapshotHash = typeof objet.snapshotHash === "string"
    ? objet.snapshotHash.toLowerCase()
    : "";
  const fragmentCount = Number(objet.fragmentCount);
  if (
    !/^[a-f0-9]{64}$/.test(snapshotHash) ||
    !Number.isSafeInteger(fragmentCount) || fragmentCount !== fragments.length
  ) {
    throw new Error("RESERVATION_SNAPSHOT_INVALIDE");
  }
  if (await hashFragments(fragments) !== snapshotHash) {
    throw new Error("RESERVATION_SNAPSHOT_HASH_INVALIDE");
  }
  return Object.freeze({ fragments, snapshotHash, fragmentCount });
}

export function metadataDepuisReservation(
  reservation: unknown,
): MetadataReservationDiscord {
  if (
    !reservation || typeof reservation !== "object" ||
    Array.isArray(reservation)
  ) throw new Error("RESERVATION_METADATA_ABSENTE");
  const objet = reservation as Record<string, unknown>;
  const rappelId = Number(objet.rappelId);
  const executionId = typeof objet.executionId === "string"
    ? objet.executionId.toLowerCase()
    : "";
  const tentative = Number(objet.tentative);
  const etat = objet.etat;
  if (
    !Number.isSafeInteger(rappelId) || rappelId <= 0 ||
    !UUID_CANONIQUE.test(executionId) ||
    !Number.isSafeInteger(tentative) || tentative < 1 || tentative > 5 ||
    (etat !== "claimed" && etat !== "retry_claimed")
  ) throw new Error("RESERVATION_METADATA_INVALIDE");
  return Object.freeze({ rappelId, executionId, tentative, etat });
}

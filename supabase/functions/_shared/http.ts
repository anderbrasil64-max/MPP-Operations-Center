export class ErreurRequete extends Error {
  readonly code: "JSON_INVALIDE" | "LECTURE_TIMEOUT" | "PAYLOAD_TROP_GRAND";
  readonly statut: 400 | 408 | 413;

  constructor(
    code: "JSON_INVALIDE" | "LECTURE_TIMEOUT" | "PAYLOAD_TROP_GRAND",
    statut: 400 | 408 | 413,
  ) {
    super(code);
    this.name = "ErreurRequete";
    this.code = code;
    this.statut = statut;
  }
}

async function lireChunkAvecDeadline(
  lecteur: ReadableStreamDefaultReader<Uint8Array>,
  deadlineMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const restant = deadlineMs - Date.now();
  if (!Number.isFinite(restant) || restant <= 0) {
    throw new ErreurRequete("LECTURE_TIMEOUT", 408);
  }

  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lecteur.read(),
      new Promise<never>((_resolve, reject) => {
        minuterie = setTimeout(
          () => reject(new ErreurRequete("LECTURE_TIMEOUT", 408)),
          restant,
        );
      }),
    ]);
  } finally {
    if (minuterie !== undefined) clearTimeout(minuterie);
  }
}

async function lireChunkReponseAvecDeadline(
  lecteur: ReadableStreamDefaultReader<Uint8Array>,
  deadlineMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const restant = deadlineMs - Date.now();
  if (!Number.isFinite(restant) || restant <= 0) {
    throw new Error("LECTURE_REPONSE_TIMEOUT");
  }

  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lecteur.read(),
      new Promise<never>((_resolve, reject) => {
        minuterie = setTimeout(
          () => reject(new Error("LECTURE_REPONSE_TIMEOUT")),
          restant,
        );
      }),
    ]);
  } finally {
    if (minuterie !== undefined) clearTimeout(minuterie);
  }
}

export async function lireCorpsReponseBorne(
  reponse: Response,
  limite: number,
  deadlineMs: number,
): Promise<Uint8Array> {
  const longueurTexte = reponse.headers.get("content-length");
  if (longueurTexte !== null) {
    const longueur = Number(longueurTexte);
    if (!Number.isSafeInteger(longueur) || longueur < 0 || longueur > limite) {
      throw new Error("REPONSE_TROP_GRANDE");
    }
  }
  if (!reponse.body) return new Uint8Array();

  const lecteur = reponse.body.getReader();
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  try {
    while (true) {
      const { done, value } = await lireChunkReponseAvecDeadline(
        lecteur,
        deadlineMs,
      );
      if (done) break;
      taille += value.byteLength;
      if (taille > limite) throw new Error("REPONSE_TROP_GRANDE");
      morceaux.push(value);
    }
  } catch (erreur) {
    try {
      await lecteur.cancel("LECTURE_REPONSE_INTERROMPUE");
    } catch (_erreurAnnulation) {
      // Le flux peut deja etre ferme par le serveur.
    }
    throw erreur;
  } finally {
    lecteur.releaseLock();
  }

  const corps = new Uint8Array(taille);
  let position = 0;
  for (const morceau of morceaux) {
    corps.set(morceau, position);
    position += morceau.byteLength;
  }
  return corps;
}

export async function lireJsonReponseBorne(
  reponse: Response,
  limite: number,
  deadlineMs: number,
): Promise<Record<string, unknown>> {
  const corps = await lireCorpsReponseBorne(reponse, limite, deadlineMs);
  if (!corps.byteLength) return {};
  try {
    const texte = new TextDecoder("utf-8", { fatal: true }).decode(corps);
    const valeur = JSON.parse(texte);
    return valeur && typeof valeur === "object" && !Array.isArray(valeur)
      ? valeur as Record<string, unknown>
      : {};
  } catch (_erreur) {
    return {};
  }
}

export async function lireCorpsBorne(
  req: Request,
  limite: number,
  deadlineMs: number,
): Promise<Uint8Array> {
  if (req.signal.aborted || deadlineMs <= Date.now()) {
    throw new ErreurRequete("LECTURE_TIMEOUT", 408);
  }
  const longueurTexte = req.headers.get("content-length");
  if (longueurTexte !== null) {
    const longueur = Number(longueurTexte);
    if (!Number.isSafeInteger(longueur) || longueur < 0) {
      throw new ErreurRequete("JSON_INVALIDE", 400);
    }
    if (longueur > limite) throw new ErreurRequete("PAYLOAD_TROP_GRAND", 413);
  }

  if (!req.body) return new Uint8Array();
  const lecteur = req.body.getReader();
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  try {
    while (true) {
      const { done, value } = await lireChunkAvecDeadline(lecteur, deadlineMs);
      if (done) break;
      taille += value.byteLength;
      if (taille > limite) {
        await lecteur.cancel("PAYLOAD_TROP_GRAND");
        throw new ErreurRequete("PAYLOAD_TROP_GRAND", 413);
      }
      morceaux.push(value);
    }
  } catch (erreur) {
    try {
      await lecteur.cancel(
        erreur instanceof ErreurRequete ? erreur.code : "LECTURE_INTERROMPUE",
      );
    } catch (_erreurAnnulation) {
      // Le flux peut deja etre ferme par le client.
    }
    throw erreur;
  } finally {
    lecteur.releaseLock();
  }

  const corps = new Uint8Array(taille);
  let position = 0;
  for (const morceau of morceaux) {
    corps.set(morceau, position);
    position += morceau.byteLength;
  }
  return corps;
}

export async function lireTexteBorne(
  req: Request,
  limite: number,
  deadlineMs: number,
): Promise<string> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await lireCorpsBorne(req, limite, deadlineMs),
    );
  } catch (erreur) {
    if (erreur instanceof ErreurRequete) throw erreur;
    throw new ErreurRequete("JSON_INVALIDE", 400);
  }
}

export async function lireJsonBorne(
  req: Request,
  limite: number,
  deadlineMs: number,
): Promise<Record<string, unknown>> {
  const texte = await lireTexteBorne(req, limite, deadlineMs);
  try {
    const valeur = texte ? JSON.parse(texte) : {};
    if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) {
      throw new ErreurRequete("JSON_INVALIDE", 400);
    }
    return valeur as Record<string, unknown>;
  } catch (erreur) {
    if (erreur instanceof ErreurRequete) throw erreur;
    throw new ErreurRequete("JSON_INVALIDE", 400);
  }
}

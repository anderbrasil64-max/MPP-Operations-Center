const ENCODEUR_UTF8 = new TextEncoder();

export function longueurUtf8(valeur: string): number {
  return ENCODEUR_UTF8.encode(valeur).byteLength;
}

function indexUtf16PourOctets(valeur: string, limiteOctets: number): number {
  let octets = 0;
  let index = 0;
  for (const caractere of valeur) {
    const taille = longueurUtf8(caractere);
    if (octets + taille > limiteOctets) break;
    octets += taille;
    index += caractere.length;
  }
  return index;
}

export function tronquerUtf8(valeur: string, limiteOctets: number): string {
  if (!Number.isSafeInteger(limiteOctets) || limiteOctets < 0) {
    throw new Error("LIMITE_UTF8_INVALIDE");
  }
  if (longueurUtf8(valeur) <= limiteOctets) return valeur;
  return valeur.slice(0, indexUtf16PourOctets(valeur, limiteOctets));
}

export function couperUtf8(
  valeur: string,
  limiteOctets: number,
): { prefixe: string; reste: string } {
  const prefixe = tronquerUtf8(valeur, limiteOctets);
  return { prefixe, reste: valeur.slice(prefixe.length) };
}

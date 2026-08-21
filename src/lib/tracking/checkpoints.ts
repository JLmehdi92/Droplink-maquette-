/**
 * LES POINTS DE PASSAGE — module PUR.
 *
 * Le fournisseur renvoie l'HISTORIQUE COMPLET à chaque interrogation. Ce fichier
 * en tire la liste ordonnée et dédupliquée que la page publique montre, et
 * l'instant du dernier mouvement dont dépend tout le reste : la cadence
 * d'interrogation, le silence nommé, et l'abandon.
 *
 * PUR, DONC ÉPROUVABLE SANS RÉSEAU. C'est la vraie raison du port : pas de
 * changer de fournisseur un jour, mais de pouvoir vérifier ce qu'on affiche sans
 * dépendre de ce qu'un tiers veut bien répondre au moment du test.
 *
 * LA DÉDUPLICATION EXISTE AUSSI EN BASE, sous forme de contrainte d'unicité.
 * Les deux ne font pas double emploi : celle d'ici donne un affichage propre et
 * un `dernierMouvement` juste ; celle de la base garantit que le prochain chemin
 * d'écriture — celui qu'on n'a pas encore écrit — ne pourra pas dupliquer.
 */

export interface PointBrut {
  readonly instant: string | null;
  readonly description: string | null;
  readonly lieu?: string | null;
  readonly etape?: string | null;
}

export interface Point {
  readonly instant: Date;
  readonly description: string;
  readonly lieu: string | null;
  readonly etape: string | null;
}

export interface Passage {
  /** Du plus RÉCENT au plus ancien : c'est l'ordre dans lequel on les lit. */
  readonly points: readonly Point[];
  readonly premierMouvement: Date | null;
  readonly dernierMouvement: Date | null;
  /** Points écartés, et pourquoi. Un rejet muet est un rejet qu'on ne verra jamais. */
  readonly ecartes: number;
}

function instantValide(brut: string | null): Date | null {
  if (brut === null || brut.trim() === "") return null;
  const date = new Date(brut);
  // `new Date("n'importe quoi")` rend une date INVALIDE au lieu de lever, et
  // cette date invalide se propage ensuite dans des comparaisons qui rendent
  // toutes `false` — le colis paraîtrait immobile pour toujours.
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Ordonne, déduplique et borne les points de passage d'un colis.
 *
 * `plafond` existe parce que certains transporteurs émettent un scan par centre
 * de tri traversé : sans borne, la page publique d'un colis parti d'Asie porte
 * quarante lignes dont trente-cinq disent la même chose. Le plafond garde les
 * plus RÉCENTES — les anciennes n'apprennent plus rien une fois le colis arrivé.
 */
export function assemblerPassages(bruts: readonly PointBrut[], plafond = 30): Passage {
  const vus = new Set<string>();
  const points: Point[] = [];
  let ecartes = 0;

  for (const brut of bruts) {
    const instant = instantValide(brut.instant);
    const description = (brut.description ?? "").trim();

    // Un point sans instant ou sans description n'est pas affichable : l'un le
    // rend impossible à situer, l'autre ne dit rien. On les compte plutôt que de
    // les faire disparaître.
    if (instant === null || description === "") {
      ecartes += 1;
      continue;
    }

    // La clef de déduplication est CELLE DE LA CONTRAINTE en base. Deux clefs
    // différentes feraient diverger l'affichage et le stockage, et la divergence
    // ne se verrait que chez le client.
    const clef = instant.toISOString() + "|" + description;
    if (vus.has(clef)) {
      ecartes += 1;
      continue;
    }
    vus.add(clef);

    points.push({
      instant,
      description,
      lieu: (brut.lieu ?? "").trim() === "" ? null : (brut.lieu ?? "").trim(),
      etape: (brut.etape ?? "").trim() === "" ? null : (brut.etape ?? "").trim(),
    });
  }

  points.sort((a, b) => b.instant.getTime() - a.instant.getTime());

  // Les bornes sont prises AVANT le plafond : le premier mouvement d'un colis
  // qui en compte quarante est justement celui que le plafond couperait, et
  // c'est lui qui date le départ.
  const dernierMouvement = points[0]?.instant ?? null;
  const premierMouvement = points[points.length - 1]?.instant ?? null;

  return {
    points: points.slice(0, plafond),
    premierMouvement,
    dernierMouvement,
    ecartes,
  };
}

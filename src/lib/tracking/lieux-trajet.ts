import { ETAPES, etapeDuJalon, type Etape } from "./normalize";

/**
 * LE LIEU DE CHAQUE ARRÊT DU TRAJET (décision de Mehdi du 03/10/2026, D2).
 *
 * C'est 17TRACK qui fournit tout le suivi, lieux compris ; la base garde le lieu de chaque
 * passage. Le trajet du héros le montre sans rien interpréter :
 * - étape TERMINÉE : le lieu du PLUS ANCIEN passage de cette étape parmi ceux lus ;
 * - étape EN COURS : le lieu et l'instant du PLUS RÉCENT passage de cette étape ;
 * - aucun passage de l'étape parmi ceux lus (la lecture publique n'en rend que les 30 plus
 *   récents) : aucun lieu.
 * Le lieu est rendu TEL QUE 17TRACK le donne — ni traduit, ni déduit, ni raccourci — et
 * toujours avec la date de SON passage (`textesDuTrajet`).
 */
export interface PassageLu {
  readonly instant: string;
  readonly lieu: string | null;
  /** Le stage brut 17TRACK du passage. */
  readonly etape: string | null;
}

export interface ArretLu {
  readonly lieu: string | null;
  /** L'instant du passage retenu (utile à l'étape en cours, qui n'a pas d'autre date). */
  readonly instant: string | null;
}

export function lieuxDuTrajet(passages: readonly PassageLu[], courante: Etape): Readonly<Record<Etape, ArretLu>> {
  const rangCourant = ETAPES.indexOf(courante);
  const resultat = {} as Record<Etape, ArretLu>;
  for (const etape of ETAPES) {
    const rang = ETAPES.indexOf(etape);
    const siens = passages
      .filter((p) => etapeDuJalon(p.etape) === etape)
      .slice()
      .sort((a, b) => new Date(a.instant).getTime() - new Date(b.instant).getTime());
    // La livraison atteinte est terminée ; une autre étape l'est quand on l'a dépassée.
    const terminee = rang < rangCourant || (etape === "livre" && courante === "livre");
    const enCours = rang === rangCourant && !terminee;
    const retenu = terminee ? siens[0] : enCours ? siens[siens.length - 1] : undefined;
    const lieu = retenu?.lieu?.trim() ?? "";
    resultat[etape] = { lieu: lieu === "" ? null : lieu, instant: retenu?.instant ?? null };
  }
  return resultat;
}

/**
 * LE TEXTE DE CHAQUE ARRÊT (« Lyon · 28 sept. »). Le lieu et la date viennent du MÊME
 * passage : le lieu d'un passage collé à la date d'un autre affirmerait un fait que la base
 * n'a pas enregistré (contrainte n° 8, relecture du 03/10/2026). Sans lieu retenu, l'étape en
 * cours garde la date de son passage, les autres la date de repli (création de la commande,
 * premier mouvement, livraison) ; rien sinon.
 */
export function textesDuTrajet(
  lieux: Readonly<Record<Etape, ArretLu>>,
  repli: Readonly<Record<Etape, string | null>>,
  courante: Etape,
  jourCourt: (instant: string) => string,
): Readonly<Record<Etape, string | null>> {
  const resultat = {} as Record<Etape, string | null>;
  for (const etape of ETAPES) {
    const { lieu, instant } = lieux[etape];
    const enCours = etape === courante && etape !== "livre";
    const date = instant !== null && (lieu !== null || enCours) ? jourCourt(instant) : repli[etape];
    const texte = [lieu, date].filter((x): x is string => x !== null && x !== "").join(" · ");
    resultat[etape] = texte === "" ? null : texte;
  }
  return resultat;
}

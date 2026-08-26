/**
 * Couleur d'accent pilotée par le vendeur, rendue accessible automatiquement.
 *
 * Le vendeur choisit une couleur pour sa marque, pas pour sa lisibilité. Le
 * design doit rester correct avec N'IMPORTE quelle valeur — un rouge saturé, un
 * jaune vif, du blanc, du noir. Exiger du vendeur qu'il cherche « une couleur
 * qui marche » reviendrait à lui faire payer une limite qui est la nôtre.
 *
 * Cibles WCAG : 4,5:1 pour du texte, 3:1 pour un élément d'interface.
 *
 * La méthode conserve la TEINTE et n'ajuste que la clarté. Un vendeur qui
 * choisit un rouge doit obtenir un rouge : une correction qui dérive vers une
 * autre teinte serait rejetée comme un bogue, et à raison.
 */

export const RATIO_TEXTE = 4.5;
export const RATIO_INTERFACE = 3;

/** Valeur de repli, identique au défaut de `shops.accent_color` en base. */
export const ACCENT_DEFAUT = "#0058be";

export interface Rvb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface AccentResolu {
  /** La couleur telle que le vendeur l'a choisie, normalisée. */
  readonly brut: string;
  /** Version utilisable comme TEXTE accentué sur le fond de page. */
  readonly texte: string;
  /** Version utilisable comme bordure, icône ou trait d'interface. */
  readonly interface: string;
  /** Remplissage de bouton, et la couleur d'écriture qui va dessus. */
  readonly remplissage: string;
  readonly surRemplissage: string;
  /**
   * Les deux retraits de `surRemplissage`, pour ce qui est SUBORDONNÉ sur un
   * aplat d'accent : un libellé secondaire, un segment de frise non franchi.
   *
   * Ils vivent ICI et pas dans les composants parce qu'ils dépendent d'une
   * chose que seul ce module sait : laquelle du blanc ou du noir a été retenue.
   * Recalculés à chaque appel, ils dériveraient — et le jour où l'un d'eux
   * partirait du blanc alors que l'écriture est noire, le résultat serait
   * invisible sans être faux nulle part.
   *
   * ILS NE VISENT PAS 4,5:1 ET NE LE PRÉTENDENT PAS. Ce sont des retraits
   * délibérés, réservés à ce dont la lecture ne dépend pas.
   */
  readonly surRemplissageDoux: string;
  readonly surRemplissageFaible: string;
  /** Vrai si la couleur choisie a dû être ajustée pour atteindre les cibles. */
  readonly ajuste: boolean;
}

/**
 * Analyse un hexadécimal `#rgb` ou `#rrggbb`.
 * Rend `null` plutôt que de lever : une valeur invalide est un cas prévu, pas
 * un incident.
 */
export function analyserHex(valeur: string): Rvb | null {
  const v = valeur.trim().toLowerCase();
  const court = /^#([0-9a-f]{3})$/.exec(v);
  const long = /^#([0-9a-f]{6})$/.exec(v);

  let hex: string;
  if (long !== null) {
    hex = long[1] as string;
  } else if (court !== null) {
    const c = court[1] as string;
    hex = `${c[0] as string}${c[0] as string}${c[1] as string}${c[1] as string}${c[2] as string}${c[2] as string}`;
  } else {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function versHex({ r, g, b }: Rvb): string {
  const octet = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${octet(r)}${octet(g)}${octet(b)}`;
}

/** Luminance relative WCAG 2.x. */
export function luminance({ r, g, b }: Rvb): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Ratio de contraste WCAG entre deux couleurs. Toujours >= 1. */
export function ratioContraste(a: Rvb, b: Rvb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const clair = Math.max(la, lb);
  const sombre = Math.min(la, lb);
  return (clair + 0.05) / (sombre + 0.05);
}

// --- Conversions RVB <-> TSL, pour n'ajuster que la clarté ------------------

interface Tsl {
  readonly t: number;
  readonly s: number;
  readonly l: number;
}

function versTsl({ r, g, b }: Rvb): Tsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { t: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let t: number;
  if (max === rn) t = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) t = ((bn - rn) / d + 2) / 6;
  else t = ((rn - gn) / d + 4) / 6;

  return { t, s, l };
}

function versRvb({ t, s, l }: Tsl): Rvb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (decalage: number): number => {
    let x = t + decalage;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: canal(1 / 3) * 255, g: canal(0) * 255, b: canal(-1 / 3) * 255 };
}

/**
 * Arrondit sur 8 bits par canal, c'est-a-dire exactement ce que `versHex`
 * emettra. Toute mesure de contraste doit passer par la, sinon on certifie une
 * couleur qui n'est pas celle qu'on rend.
 */
function quantifier({ r, g, b }: Rvb): Rvb {
  const c = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
  return { r: c(r), g: c(g), b: c(b) };
}

/**
 * Ajuste la clarté jusqu'à atteindre le ratio visé contre `fond`.
 *
 * La direction est choisie d'après le fond : sur un fond clair on assombrit, sur
 * un fond sombre on éclaircit. Recherche dichotomique sur la clarté, à teinte et
 * saturation constantes.
 *
 * Rend la meilleure approximation trouvée si la cible est inatteignable — ce qui
 * n'arrive pas contre du blanc ou du noir purs, puisque le noir atteint 21:1
 * contre blanc, mais reste possible contre un fond intermédiaire.
 */
export function ajusterPourRatio(couleur: Rvb, fond: Rvb, ratioVise: number): Rvb {
  // Toute mesure porte sur la couleur RÉELLEMENT ÉMISE, donc quantifiée sur 8
  // bits. Mesurer la couleur continue produisait un écart de l'ordre de 0,003 —
  // assez pour rendre `#ef0000` à 4,4966 en le déclarant conforme à 4,5. Une
  // dégradation, pas une casse : rien ne plante, la palette est simplement
  // fausse, et elle affirme le contraire.
  const fondEmis = quantifier(fond);
  if (ratioContraste(quantifier(couleur), fondEmis) >= ratioVise) return couleur;

  const tsl = versTsl(couleur);
  const fondEstClair = luminance(fondEmis) > 0.18;
  // Sur fond clair on descend la clarté vers 0, sinon on la monte vers 1.
  let bas = fondEstClair ? 0 : tsl.l;
  let haut = fondEstClair ? tsl.l : 1;

  let meilleure = quantifier(versRvb({ ...tsl, l: fondEstClair ? 0 : 1 }));
  // 24 itérations : la clarté est bornée à [0,1], donc la précision atteinte est
  // très en deçà du pas d'un canal 8 bits. Inutile d'aller plus loin.
  for (let i = 0; i < 24; i += 1) {
    const milieu = (bas + haut) / 2;
    const candidat = quantifier(versRvb({ ...tsl, l: milieu }));
    if (ratioContraste(candidat, fondEmis) >= ratioVise) {
      // Assez contrasté : on garde et on tente de rester plus proche de
      // l'original, pour ne pas noircir plus que nécessaire.
      meilleure = candidat;
      if (fondEstClair) bas = milieu;
      else haut = milieu;
    } else if (fondEstClair) {
      haut = milieu;
    } else {
      bas = milieu;
    }
  }
  return meilleure;
}

const BLANC: Rvb = { r: 255, g: 255, b: 255 };
const NOIR: Rvb = { r: 0, g: 0, b: 0 };

/**
 * Rend la palette d'accent complète et conforme pour une couleur de vendeur.
 *
 * Une valeur invalide retombe sur `ACCENT_DEFAUT`. Ce n'est pas une politesse :
 * la page publique d'un vendeur ne doit jamais cesser de s'afficher parce qu'une
 * couleur est mal formée.
 */
export function resoudreAccent(accentBrut: string, fondPage: string = "#ffffff"): AccentResolu {
  const fond = analyserHex(fondPage) ?? BLANC;
  const choisi = analyserHex(accentBrut);
  const base = choisi ?? (analyserHex(ACCENT_DEFAUT) as Rvb);

  const texte = ajusterPourRatio(base, fond, RATIO_TEXTE);
  const elementInterface = ajusterPourRatio(base, fond, RATIO_INTERFACE);

  // Pour un bouton, c'est l'accent qui fait le fond : on choisit l'écriture qui
  // contraste le mieux, et on n'assombrit le remplissage que si aucune des deux
  // n'atteint la cible.
  let remplissage = base;
  const surRemplissage = ratioContraste(base, BLANC) >= ratioContraste(base, NOIR) ? BLANC : NOIR;
  if (ratioContraste(quantifier(remplissage), surRemplissage) < RATIO_TEXTE) {
    remplissage = ajusterPourRatio(base, surRemplissage, RATIO_TEXTE);
  }

  const ecritureBlanche = surRemplissage === BLANC;

  return {
    brut: versHex(base),
    texte: versHex(texte),
    interface: versHex(elementInterface),
    remplissage: versHex(remplissage),
    surRemplissage: versHex(surRemplissage),
    surRemplissageDoux: ecritureBlanche ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.72)",
    surRemplissageFaible: ecritureBlanche ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.22)",
    ajuste: choisi === null || versHex(texte) !== versHex(base),
  };
}

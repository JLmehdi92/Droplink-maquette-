/**
 * Détection de faute de frappe sur le domaine d'une adresse email.
 *
 * POURQUOI CE MODULE EXISTE.
 *
 * Sur la page de connexion, deux besoins semblent s'opposer : signaler à
 * quelqu'un qu'il s'est trompé d'adresse, et ne pas révéler quelles adresses ont
 * un compte. Ils ne s'opposent que si on les traite au même endroit.
 *
 * La fuite se produit CÔTÉ SERVEUR — répondre différemment selon que le compte
 * existe permet de balayer des adresses et d'apprendre lesquelles sont chez
 * nous. La faute de frappe, elle, se produit CÔTÉ SAISIE. On la traite donc à la
 * saisie, ici, sans qu'aucune requête ne parte : le serveur peut alors répondre
 * rigoureusement la même chose à tout le monde, sans que l'utilisateur y perde.
 *
 * CE MODULE NE CORRIGE JAMAIS AUTOMATIQUEMENT. Il suggère. Corriger d'office une
 * adresse rare mais légitime enverrait le lien de connexion — donc l'accès au
 * compte — à quelqu'un d'autre. Le coût d'une suggestion ignorée est nul ; le
 * coût d'une correction erronée est un compte livré à un tiers.
 *
 * Aucun réseau, aucune dépendance : le module part dans le navigateur.
 */

/**
 * Domaines connus.
 *
 * La liste sert DEUX fins opposées, et c'est ce qui la rend utile :
 *   - une adresse dont le domaine y figure EXACTEMENT ne reçoit jamais de
 *     suggestion ;
 *   - une adresse proche d'un de ces domaines en reçoit une.
 *
 * D'où l'importance d'y faire figurer les domaines réels qui ressemblent à
 * d'autres : sans `mail.com`, une adresse parfaitement valide chez `mail.com`
 * se verrait proposer `gmail.com`, à une lettre de distance.
 *
 * Les fournisseurs chinois ne sont pas un ajout de confort : le fournisseur en
 * Chine est le persona pour qui le lien email est l'UNIQUE porte d'entrée, la
 * connexion Google lui étant inaccessible. Une liste sans `qq.com`, `163.com` et
 * `126.com` ne couvrirait pas celui qui a le plus besoin d'être couvert.
 */
export const DOMAINES_CONNUS: readonly string[] = [
  // Occident
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "gmx.com",
  "gmx.fr",
  "mail.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "tutanota.com",
  "zoho.com",
  "fastmail.com",
  // France
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bbox.fr",
  "numericable.fr",
  "neuf.fr",
  "aliceadsl.fr",
  // Chine — le fournisseur n'a pas d'autre porte d'entrée que l'email
  "qq.com",
  "foxmail.com",
  "163.com",
  "126.com",
  "yeah.net",
  "sina.com",
  "sina.cn",
  "sohu.com",
  "aliyun.com",
  "139.com",
  "189.cn",
  "outlook.jp",
];

const ENSEMBLE_CONNUS = new Set(DOMAINES_CONNUS);

/**
 * Distance de Damerau-Levenshtein (variante par alignement simple), bornée.
 *
 * DAMERAU ET NON LEVENSHTEIN, et ce n'est pas un raffinement académique : une
 * TRANSPOSITION de deux lettres voisines est la faute de frappe la plus
 * fréquente qui soit — `gmial` pour `gmail`, `hotmial` pour `hotmail`, `yaho`
 * pour `yahoo`. Levenshtein la compte pour deux éditions, ce qui obligerait à
 * relâcher le seuil à 2 pour la rattraper, et donc à accepter du même coup deux
 * substitutions arbitraires. Damerau la compte pour une, ce qui rattrape le cas
 * courant AVEC un seuil serré. Le choix d'algorithme est ici un choix de
 * sécurité : un seuil large suggérerait des corrections devinées.
 *
 * Bornée parce qu'au-delà du seuil la valeur exacte n'intéresse personne, et
 * qu'un abandon anticipé évite de parcourir la matrice entière pour chacun des
 * domaines de la liste, à chaque frappe.
 */
export function distance(a: string, b: string, plafond: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > plafond) return plafond + 1;

  const lignes = a.length + 1;
  const colonnes = b.length + 1;
  const d: number[] = new Array<number>(lignes * colonnes).fill(0);
  const at = (i: number, j: number): number => d[i * colonnes + j] ?? 0;
  const set = (i: number, j: number, v: number): void => {
    d[i * colonnes + j] = v;
  };

  for (let i = 0; i < lignes; i += 1) set(i, 0, i);
  for (let j = 0; j < colonnes; j += 1) set(0, j, j);

  for (let i = 1; i < lignes; i += 1) {
    let minLigne = Number.POSITIVE_INFINITY;
    for (let j = 1; j < colonnes; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let valeur = Math.min(
        at(i, j - 1) + 1, // insertion
        at(i - 1, j) + 1, // suppression
        at(i - 1, j - 1) + cout, // substitution
      );
      // Transposition de deux caractères adjacents.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valeur = Math.min(valeur, at(i - 2, j - 2) + 1);
      }
      set(i, j, valeur);
      if (valeur < minLigne) minLigne = valeur;
    }
    // Toute la ligne dépasse déjà le plafond : aucune suite ne pourra
    // redescendre en dessous.
    if (minLigne > plafond) return plafond + 1;
  }

  return at(a.length, b.length);
}

/**
 * Tolérance admise, fonction de la longueur du domaine.
 *
 * Une édition sur `qq.com` en change déjà un sixième : au-delà, on ne suggère
 * plus, on devine. Grâce à Damerau, une transposition ne coûte qu'une édition,
 * si bien que le seuil de 1 couvre déjà la faute la plus courante sur les
 * domaines courts.
 */
function tolerance(domaine: string): number {
  return domaine.length <= 9 ? 1 : 2;
}

export type Suggestion = {
  /** L'adresse complète telle qu'elle serait après correction. */
  readonly adresse: string;
  /** Le domaine suggéré, pour un message qui ne montre que ce qui change. */
  readonly domaine: string;
};

/**
 * Suggère une correction du domaine, ou `null` s'il n'y a rien à dire.
 *
 * Rend `null` — donc se tait — dans tous les cas douteux : adresse malformée,
 * domaine déjà connu, ou aucun candidat assez proche. Se taire est le
 * comportement par défaut, parce qu'une suggestion inutile apprend à ignorer les
 * suggestions.
 */
export function suggererCorrection(adresse: string): Suggestion | null {
  const propre = adresse.trim().toLowerCase();
  const arobase = propre.lastIndexOf("@");
  if (arobase <= 0 || arobase === propre.length - 1) return null;

  const locale = propre.slice(0, arobase);
  const domaine = propre.slice(arobase + 1);

  // Un domaine que nous connaissons est un domaine correct : ne rien dire.
  if (ENSEMBLE_CONNUS.has(domaine)) return null;
  // Sans point, ce n'est pas encore un domaine — l'utilisateur est en train de
  // taper. Le presser d'une suggestion à mi-saisie serait bruyant.
  if (!domaine.includes(".")) return null;

  const plafond = 2;
  let meilleur: string | null = null;
  let meilleureDistance = plafond + 1;

  for (const candidat of DOMAINES_CONNUS) {
    const d = distance(domaine, candidat, plafond);
    if (d < meilleureDistance && d <= tolerance(candidat)) {
      meilleureDistance = d;
      meilleur = candidat;
    }
  }

  if (meilleur === null || meilleureDistance === 0) return null;
  return { adresse: `${locale}@${meilleur}`, domaine: meilleur };
}

import { LANGUES } from "@/i18n/config";

/**
 * « CE CHEMIN EST-IL UN LIEN CLIENT AU NOM DU VENDEUR ? »
 *
 * `droplink.fr/atelier-nord/xK9…` doit servir la MÊME page que
 * `droplink.fr/p/xK9…`. Pas une copie, pas une variante : la même, réécrite.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE FONCTION EXISTE AU LIEU D'UNE ROUTE `app/[slug]/[token]`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le segment dynamique de la racine est DÉJÀ pris par `[locale]` (next-intl), et
 * Next refuse deux noms dynamiques au même niveau. `app/[slug]/` entrerait en
 * collision frontale avec `app/[locale]/`.
 *
 * Et même si Next l'acceptait, une seconde route serait une seconde page :
 * seconde racine de mise en page, second budget, second endroit où oublier une
 * garde. La page client tient sous 300 Ko hors médias et doit s'afficher en
 * moins de deux secondes en 4G — c'est la contrainte la plus chère du produit.
 * Une réécriture ne coûte RIEN : le navigateur reçoit exactement les mêmes
 * octets, servis par exactement le même code.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE QU'ELLE DOIT SURTOUT NE PAS FAIRE : AVALER UNE VRAIE ROUTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle s'exécute AVANT la négociation de langue, sur tout chemin que le matcher
 * laisse passer. Trop large, elle détournerait une page du produit vers la page
 * client — qui répondrait 404, sans que rien ne dise pourquoi.
 *
 * Elle exige donc QUATRE conditions simultanées, et chacune suffirait presque
 * seule :
 *
 *   1. EXACTEMENT deux segments. Toutes les surfaces du produit en ont deux ou
 *      plus SOUS une langue (`/fr/commandes`), jamais deux à la racine.
 *   2. Le premier n'est pas une langue. C'est la collision de la décision 4,
 *      traitée explicitement plutôt que laissée au hasard des longueurs.
 *   3. Le premier a la forme d'un nom de lien (migrations 182-183).
 *   4. Le second a la forme EXACTE d'un jeton : `[0-9A-Za-z]`, 16 à 64
 *      caractères, AUCUN tiret. Aucun segment de route du produit ne ressemble
 *      à ça — ils sont tous des mots, souvent avec des tirets.
 *
 * ⚠️ ET LA QUATRIÈME NE FIXE PAS 21, qui est pourtant la longueur produite
 * aujourd'hui par `generer_jeton_public()`. Le jour où le générateur changerait
 * de longueur, les jetons de 21 caractères DÉJÀ ENVOYÉS devraient continuer de
 * répondre : une borne les couvre, une égalité les casserait au moment où
 * personne n'y penserait. C'est la même borne que `JetonPublic` côté lecture,
 * et ce n'est pas une coïncidence.
 *
 * ⚠️ CETTE FONCTION N'AUTORISE RIEN. Elle décide d'une RÉÉCRITURE, pas d'un
 * accès : le `public_token` reste le seul secret, et c'est la page qui vérifie
 * ensuite que ce nom appartient bien à la boutique de cette commande. Un nom
 * inventé traverse donc cette fonction sans difficulté — et rend 404 à l'étape
 * suivante.
 */

/** La forme d'un jeton public, identique à `JetonPublic` de la lecture. */
const FORME_JETON = /^[0-9A-Za-z]{16,64}$/;

/**
 * La forme d'un nom de lien, en casse indifférente.
 *
 * ⚠️ ELLE EST PLUS PERMISSIVE QUE LA BASE, ET C'EST VOULU. `slug_valide()`
 * n'accepte que les minuscules ; ici on reconnaît aussi les majuscules pour
 * pouvoir REDIRIGER vers la forme minuscule plutôt que rendre 404. Une URL se
 * recopie à la main depuis une capture d'écran et se dicte au téléphone :
 * « Atelier-Nord » doit mener quelque part.
 */
const FORME_NOM = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,38}[a-zA-Z0-9]$/;

const LANGUES_MINUSCULES: ReadonlySet<string> = new Set(
  LANGUES.map((langue) => langue.toLowerCase()),
);

/**
 * Un lien client demandé sous le nom d'un vendeur.
 *
 * `nom` est TOUJOURS en minuscules — c'est la forme que la base stocke et la
 * seule qu'elle sait comparer. `jeton` est rendu tel quel.
 */
export interface LienAuNom {
  readonly nom: string;
  readonly jeton: string;
}

export function lireLienAuNom(chemin: string): LienAuNom | null {
  const segments = chemin.split("/");
  // `"/a/b".split("/")` rend `["", "a", "b"]` : quatre éléments signifient trois
  // segments, ou un segment vide — dans les deux cas ce n'est pas notre forme.
  if (segments.length !== 3) return null;

  const nom = segments[1];
  const jeton = segments[2];
  if (nom === undefined || jeton === undefined) return null;

  if (!FORME_JETON.test(jeton)) return null;
  if (!FORME_NOM.test(nom)) return null;
  // Deux tirets d'affilée : `atelier--nord` est une usurpation d'`atelier-nord`
  // qui ne se voit pas dans un message. La base la refuse à l'écriture ; la
  // refuser ici aussi évite d'aller le lui demander.
  if (nom.includes("--")) return null;

  const minuscule = nom.toLowerCase();
  // LA COLLISION DE LA DÉCISION 4, traitée en premier et nommément. `/fr/…` et
  // `/zh-CN/…` appartiennent à next-intl, quelle que soit la suite.
  if (LANGUES_MINUSCULES.has(minuscule)) return null;

  /*
   * ⚠️ SEUL LE NOM EST MIS EN MINUSCULES, JAMAIS LE JETON. Le jeton est en base
   * 62 : `xK9` et `Xk9` sont deux jetons différents, et en abaisser la casse
   * rendrait 404 sur un lien parfaitement valide.
   *
   * ⚠️ ET UNE MAJUSCULE DANS LE NOM N'EST PAS REDIRIGÉE, ELLE EST SERVIE.
   * Le premier jet renvoyait un 308 vers la forme minuscule. MESURÉ AU
   * NAVIGATEUR le 20/09/2026, il rendait 500 :
   *
   *     TypeError: Invalid URL — input: '/atelier-nord/xK9…'
   *
   * Next 16 EXIGE une `Location` absolue dans un middleware. Or la seule base
   * absolue disponible au bord est `requete.url`, c'est-à-dire l'adresse par
   * laquelle le conteneur a été joint — `localhost:8080` chez Railway. C'est
   * précisément ce que `tests/unit/redirections-relatives.test.ts` interdit
   * depuis le 08/09, où Wassim a atterri sur `ERR_CONNECTION_REFUSED` après sa
   * première connexion Google.
   *
   * Servir directement supprime le problème au lieu de le contourner : aucune
   * URL absolue à fabriquer, aucun aller-retour de plus sur la page qui doit
   * s'afficher en moins de deux secondes, et le client garde dans sa barre
   * d'adresse le nom du vendeur tel qu'il l'a reçu. Les deux casses désignent la
   * même page — sans conséquence ici, puisqu'elle est `noindex` et qu'on ne
   * l'atteint que par un lien qu'on nous a envoyé.
   */
  return { nom: minuscule, jeton };
}

/**
 * Le nom sous lequel la page client a été demandée, transporté de la réécriture
 * jusqu'à la page.
 *
 * ⚠️ IL EST FORGEABLE, ET ÇA N'A AUCUNE CONSÉQUENCE. N'importe qui peut appeler
 * `/p/<jeton>?nom=<ce-qu-il-veut>` à la main : la page interrogera la base, la
 * base répondra non, et la page rendra 404 — à lui seul, sur sa propre requête.
 * Le sens de marche est le bon : ce paramètre ne peut que RESTREINDRE l'accès à
 * une page qu'il faut déjà savoir ouvrir, jamais l'élargir.
 */
export const PARAM_NOM = "nom";

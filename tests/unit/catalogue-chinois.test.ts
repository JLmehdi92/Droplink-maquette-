import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CHAQUE CHAÎNE DU CATALOGUE CHINOIS EST RÉELLEMENT EN CHINOIS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER EXISTE PARCE QU'UNE FALSIFICATION EST PASSÉE AU VERT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le 06/09/2026, deux chaînes FRANÇAISES ont été posées dans `zh-CN.json`, puis
 * la fumée relancée sur un serveur servi. Elle a répondu :
 *
 *     OK    aucune page ne sert un libelle de l AUTRE langue
 *
 * Aucune des trois gardes de langue ne l'a vue, et chacune pour une raison qui
 * lui est propre :
 *
 *   - LE BALAYAGE PAR SENTINELLES de la fumée ne compare que les clés dont les
 *     trois langues DIFFÈRENT. En copiant le français dans le chinois, on rend
 *     ces deux valeurs égales : la clé sort de l'ensemble comparé, et cesse
 *     donc d'être surveillée par le geste même qui la corrompt.
 *
 *   - `i18n-parite` refuse un catalogue copié, mais sur une PROPORTION : son
 *     seuil est à 30 %. Deux clés sur 948 passent très en dessous.
 *
 *   - `vocabulaire` cherche des termes interdits, pas la langue d'écriture.
 *
 * Le contrôle qui manquait ne compare rien : il regarde ce que la chaîne EST.
 * Une valeur chinoise porte des idéogrammes — sauf les exceptions déclarées
 * ci-dessous, une par une, avec leur raison.
 *
 * ⚠️ ET IL ÉCHOUE DANS LES DEUX SENS. Une exception qui ne correspond plus à
 * rien est retirée de force : c'est ainsi qu'une liste d'exceptions devient une
 * liste de trous.
 */

const IDEOGRAMME = /[一-鿿]/;

/**
 * Les chaînes qui n'ont légitimement aucun idéogramme, et pourquoi.
 *
 * Trois familles, et aucune n'est une traduction manquante :
 *   - des NOMS PROPRES, qui ne se traduisent pas ;
 *   - des EXEMPLES de saisie, qui doivent montrer la forme attendue ;
 *   - des GABARITS purement composés de variables et de ponctuation.
 */
const SANS_IDEOGRAMME: ReadonlyMap<string, string> = new Map([
  ["legal.signalement.lienExemple", "Un début d'URL, montré tel quel."],
  /* L'éditeur des pages légales. C'est un nom de marque, et le lexique le range
     avec les transporteurs et les noms de personnes : il ne se traduit pas.
     Posé le 18/09/2026, quand les pastilles « raison sociale à compléter » ont
     été retirées — décision de Wassim. */
  ["legal.editeurNom", "Le nom de la marque, identique dans les trois langues."],
  /* Le sélecteur de langue de la landing nomme chaque langue DANS ELLE-MÊME —
     « Français », « English », « 中文 » —, comme la planche et comme tout
     sélecteur de langue : un lecteur qui ne lit pas le chinois doit pouvoir y
     retrouver la sienne. Ces deux-là sont donc les mêmes dans les trois
     catalogues (18/09/2026). */
  ["landing.kit.langues.fr", "Le nom du français en français : un sélecteur nomme chaque langue en elle-même."],
  ["landing.kit.langues.en", "Le nom de l'anglais en anglais : un sélecteur nomme chaque langue en elle-même."],
  /* Vide, et c'est la planche : sa phrase chinoise 三步生成客户物流链接 n'a pas de
     mot final à mettre en dégradé. Même exception dans `i18n-parite`. */
  ["landing.kit.howHl", "Vide : la planche ne met aucun mot en dégradé dans ce titre chinois."],
  /* Deux gabarits de l'éditeur, composés d'une variable ou d'un signe seul.
     « à 09:15 » n'a pas d'équivalent chinois : l'heure s'écrit nue à côté de sa
     date, et ajouter un idéogramme pour satisfaire ce garde mettrait un mot
     dans une colonne de 92 px qui n'en a pas la place. Le tiret d'une valeur
     absente, lui, est le signe que le kit emploie lui-même. */
  ["editeur.historique.aHeure", "L'heure seule : le chinois n'introduit pas l'heure par un mot."],
  /* Le commentaire du client sous son arbitrage (18/09/2026) : SA phrase, entre
     les guillemets du chinois simplifié. Le gabarit n'a rien d'autre à dire. */
  ["editeur.historique.commentaire", "Les guillemets chinois “ ” autour du texte du client, seuls."],
  ["editeur.tuileVide", "Le tiret d'une valeur absente, identique dans les trois langues."],
  /* La documentation emploie trois mots qui ne se traduisent pas : « Logo » est
     international, et les unités de stockage s'écrivent en lettres latines en
     chinois comme ailleurs. */
  ["docs.regLogo", "« Logo » s'écrit ainsi en chinois."],
  ["docs.plStockageG", "Une unité de stockage : « 1 GB »."],
  ["docs.plStockageP", "Une unité de stockage : « 50 GB »."],
  ["connexion.placeholderEmail", "Un exemple d'adresse : il doit ressembler à une adresse."],
  [
    "connexion.suggestionSuffixe",
    "Le point d'interrogation PLEINE LARGEUR de la typographie chinoise, seul.",
  ],
  /* La part d'un statut dans l'anneau du panneau d'administration. Le chinois
     écrit le pourcentage COLLé à son nombre, sans l'espace insécable du
     français : la chaîne se réduit donc à la variable et au signe, et le
     libellé du statut est écrit juste à côté, en idéogrammes. */
  ["admin.panneau.statutPart", "La variable et le signe pour cent, collés comme en chinois."],
  ["admin.comptes.part", "Le même gabarit, sur l'anneau des comptes."],
  ["admin.boutiques.part", "Le même gabarit, sur l'anneau des boutiques."],
  ["admin.statistiques.tauxValeur", "Une variable et le signe pour cent, collés comme en chinois."],
  ["admin.statistiques.part", "Le même gabarit, sur la légende des types de compte et des transporteurs."],
  ["admin.statistiques.nombreEntreParentheses", "Une variable entre parenthèses pleine chasse."],
  ["admin.statistiques.ecartHausse", "Un signe, une variable et le signe pour cent."],
  ["admin.statistiques.ecartBaisse", "Un signe moins, une variable et le signe pour cent."],
  ["admin.commandes.colonnes.reference", "Le dièse de la colonne des références, comme le kit l'écrit dans les trois langues."],
  ["admin.journal.part", "Le même gabarit, sur l'anneau du journal."],
  ["marque.reseau.instagram", "Nom propre."],
  ["marque.reseau.tiktok", "Nom propre."],
  ["marque.reseau.whatsapp", "Nom propre."],
  ["marque.reseauExemple.instagram", "Exemple de nom de compte, forme latine."],
  ["marque.reseauExemple.tiktok", "Exemple de nom de compte, forme latine."],
  [
    "marque.reseauExemple.whatsapp",
    "Un numéro au format international — avec l'indicatif chinois, qui est la " +
      "forme utile au persona visé.",
  ],
  ["marque.reseauExemple.site", "Exemple d'adresse de site."],
  [
    "commandes.plusMedias",
    "Un signe plus et un nombre : la pastille « +N » de la colonne des " +
      "produits ne porte aucun mot, dans aucune langue.",
  ],
  [
    "commandes.periodeEntreCourt",
    "Deux dates et un tiret demi-cadratin. Les dates sont format\u00e9es par " +
      "`Intl`, donc d\u00e9j\u00e0 localis\u00e9es : \u00e9crire un mot autour les redirait.",
  ],
  ["medias.compteur", "Deux variables et une barre oblique."],
  ["marque.descriptionCompteur", "Deux variables et une barre oblique."],
  /* Trois mots de l'écran de marque qui ne se traduisent pas : « Pro » est le
     nom du plan, et l'exemple de lien doit montrer la FORME attendue — un
     segment d'URL en lettres latines, parce que c'est ce qu'une adresse
     accepte. */
  ["marque.lienPro", "Le nom du plan, entre parenthèses pleine largeur."],
  ["marque.lienProBadge", "Le nom du plan, seul."],
  ["admin.plan.plans.pro", "Le nom du plan, seul, comme le badge de « Ma marque »."],
  ["marque.lienPlaceholder", "Un exemple de segment d'URL : il doit ressembler à une adresse."],
  ["admin.comptes.colisSurSeuil", "Deux variables et une barre oblique."],
  ["admin.fiche.surPlafond", "Deux variables et une barre oblique."],
  ["admin.panneau.stockageValeur", "Une valeur et son unité, toutes deux injectées."],
  ["admin.boutiques.taille", "Une valeur et son unité, toutes deux injectées."],
  ["admin.unites.o", "Symbole d'unité de données, international."],
  ["admin.unites.Ko", "Symbole d'unité de données, international."],
  ["admin.unites.Mo", "Symbole d'unité de données, international."],
  ["admin.unites.Go", "Symbole d'unité de données, international."],
  ["admin.unites.To", "Symbole d'unité de données, international."],
]);

function catalogue(): ReadonlyMap<string, string> {
  const brut = readFileSync(join(process.cwd(), "messages", "zh-CN.json"), "utf8");
  const plat = new Map<string, string>();
  const parcourir = (noeud: Record<string, unknown>, prefixe: string): void => {
    for (const [cle, valeur] of Object.entries(noeud)) {
      const chemin = prefixe === "" ? cle : `${prefixe}.${cle}`;
      if (typeof valeur === "string") plat.set(chemin, valeur);
      else parcourir(valeur as Record<string, unknown>, chemin);
    }
  };
  parcourir(JSON.parse(brut) as Record<string, unknown>, "");
  return plat;
}

describe("Le catalogue chinois est écrit en chinois", () => {
  const ZH = catalogue();

  test("la sonde lit réellement le catalogue", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : un chemin devenu faux rendrait tous les
    // contrôles ci-dessous verts sans avoir rien inspecté.
    expect(ZH.size, "catalogue chinois vide ou illisible").toBeGreaterThan(900);
  });

  test("chaque chaîne porte des idéogrammes, aux exceptions déclarées près", () => {
    const fautives = [...ZH.entries()]
      .filter(([cle, valeur]) => !IDEOGRAMME.test(valeur) && !SANS_IDEOGRAMME.has(cle))
      .map(([cle, valeur]) => `${cle} = ${JSON.stringify(valeur)}`);

    expect(
      fautives,
      "Ces chaînes du catalogue chinois ne contiennent aucun idéogramme. Une " +
        "valeur d'une AUTRE langue y a-t-elle été copiée ? Le balayage par " +
        "sentinelles ne peut pas le voir : copier le français dans le chinois " +
        "rend les deux valeurs égales, donc sort la clé de l'ensemble comparé. — " +
        fautives.join(" | "),
    ).toEqual([]);
  });

  test("chaque exception déclarée correspond encore à une chaîne SANS idéogramme", () => {
    // L'AUTRE SENS. Une exception dont la chaîne est devenue chinoise est une
    // permission qui survit à son motif : elle couvrira un jour une copie qu'on
    // n'a pas voulue.
    const inutiles = [...SANS_IDEOGRAMME.keys()].filter((cle) => {
      const valeur = ZH.get(cle);
      return valeur === undefined || IDEOGRAMME.test(valeur);
    });
    expect(
      inutiles,
      `Exceptions devenues inutiles : ${inutiles.join(", ")}. Les retirer — une ` +
        "exception périmée couvre le retour du défaut qu'elle décrivait.",
    ).toEqual([]);
  });

  test("CONTRE-TEST : la sonde sait reconnaître un idéogramme", () => {
    /*
     * Sans lui, une expression régulière devenue inopérante — un intervalle
     * Unicode mal recopié, un drapeau perdu — rendrait le contrôle vert sur un
     * catalogue entièrement français. C'est le mode de défaillance exact que ce
     * fichier existe pour empêcher, appliqué à lui-même.
     */
    expect(IDEOGRAMME.test("订单")).toBe(true);
    expect(IDEOGRAMME.test("Votre commande")).toBe(false);
    expect(IDEOGRAMME.test("Your order")).toBe(false);
    // La ponctuation pleine largeur n'est PAS un idéogramme : une chaîne qui
    // n'en porterait que ne serait pas traduite pour autant.
    expect(IDEOGRAMME.test("？")).toBe(false);
  });
});

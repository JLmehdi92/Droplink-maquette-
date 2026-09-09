import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEUIL_SILENCE_JOURS } from "@/lib/tracking/silence";

/**
 * LA PILULE « BLOQUÉES » NE DOIT LISTER QUE DES COLIS RÉELLEMENT IMMOBILES.
 *
 * ⚠️ DÉFAUT MONTRÉ EN CAPTURE PAR WASSIM LE 09/09/2026. Il ouvre « Bloquées » et
 * y trouve une commande « En transit » qui bouge normalement. La requête ne
 * posait AUCUN seuil de temps : elle prenait toute commande en transit dont le
 * colis avait bougé au moins une fois, et se contentait de les ORDONNER du
 * mouvement le plus ancien au plus récent. Un tri, pas une réponse.
 *
 * CE QUE ÇA COÛTAIT : la pilule répond à « quels colis dois-je relancer ». Une
 * liste qui contient des colis parfaitement en route ne répond pas à cette
 * question — et pire, elle apprend à ne plus la regarder. Un vendeur à 200
 * commandes par semaine cesse d'ouvrir un écran qui lui a menti deux fois.
 *
 * ⚠️ ET LE DÉFAUT ÉTAIT INVISIBLE À TOUTE RELECTURE : la requête est correcte,
 * l'index est le bon, le tri fait exactement ce qu'il annonce. Il n'y a rien de
 * faux dans ce code — il manque seulement une condition, et une condition
 * absente ne se voit pas. C'est un vendeur qui l'a vue, sur son écran.
 */
const SOURCE = readFileSync(join(process.cwd(), "src/lib/commandes/liste.ts"), "utf8");

/** Le code sans ses commentaires — L-031 : une garde ne lit pas sa description. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("la pilule « Bloquées »", () => {
  test("CONTRE-TEST : la requete du tri est bien lue", () => {
    expect(
      /parametres\.tri === "bloquees"/.test(CODE),
      "le bloc du tri « bloquees » est introuvable : cette suite n'inspecte rien",
    ).toBe(true);
  });

  test("elle exige un colis EN TRANSIT qui a deja bouge", () => {
    expect(/\.eq\("status", "en_transit"\)/.test(CODE)).toBe(true);
    expect(/\.not\("parcel_last_movement_at", "is", null\)/.test(CODE)).toBe(true);
  });

  /**
   * LE CONTRÔLE QUI MANQUAIT. Sans borne de temps, la pilule liste des colis en
   * mouvement — c'est le défaut du 09/09.
   */
  test("elle exige que le silence DURE, pas seulement qu il ait commence", () => {
    expect(
      /\.lt\("parcel_last_movement_at",\s*borneDuSilence\(\)\)/.test(CODE),
      "aucune borne de temps sur le dernier mouvement : « Bloquées » listerait " +
        "des colis qui viennent de bouger, ce qui est exactement le défaut montré " +
        "en capture le 09/09/2026.",
    ).toBe(true);
  });

  /**
   * ⚠️ LE SEUIL EST CELUI DU PRODUIT, PAS UN SECOND. La page du client écrit
   * « aucun mouvement depuis N jours » à partir de `SEUIL_SILENCE_JOURS`
   * (décision 8 du brief). Si la liste du vendeur en employait un autre, les
   * deux écrans parleraient d'ensembles différents sous le même mot — et le
   * vendeur qui lit « bloqué » chez son client sans le retrouver dans sa liste
   * ne saurait plus lequel croire.
   */
  test("le seuil est DERIVE de celui du produit, jamais recopie", () => {
    expect(
      /SEUIL_SILENCE_JOURS/.test(CODE),
      "`liste.ts` n'importe plus le seuil du produit : un nombre recopié ici " +
        "diverge le jour où la décision 8 change, en silence.",
    ).toBe(true);
    expect(
      new RegExp(`\\b${SEUIL_SILENCE_JOURS}\\b\\s*\\*\\s*24`).test(CODE) ||
        /SEUIL_SILENCE_JOURS\s*\*\s*24/.test(CODE),
      "la borne ne dérive pas du seuil : elle doit se calculer à partir de " +
        "`SEUIL_SILENCE_JOURS`, pas d'une valeur écrite à la main.",
    ).toBe(true);
  });

  /**
   * ⚠️ L'INDEX PARTIEL DOIT RESTER UTILISABLE. `orders_bloquees_idx` porte
   * `(shop_id, parcel_last_movement_at asc, id asc)` : la borne est une
   * comparaison sur CETTE colonne, donc un parcours d'intervalle. Une condition
   * posée sur une autre colonne — la date de création, par exemple — forcerait
   * un tri en mémoire, et la dégradation resterait invisible tant qu'un vendeur
   * n'aurait pas beaucoup de lignes.
   */
  test("la borne porte sur la colonne de l index, pas sur une autre", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/090_le_colis_met_a_jour_la_commande.sql"),
      "utf8",
    );
    expect(
      /orders_bloquees_idx[\s\S]*?parcel_last_movement_at/.test(migration),
      "l'index `orders_bloquees_idx` ne porte plus sur `parcel_last_movement_at`",
    ).toBe(true);
    expect(
      /\.lt\("parcel_last_movement_at"/.test(CODE),
      "la borne ne porte pas sur la colonne de l'index : le tri se ferait en mémoire",
    ).toBe(true);
  });
});

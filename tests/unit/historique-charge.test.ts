import { describe, expect, test } from "vitest";
import { resumerCharge } from "@/lib/commandes/historique";

/**
 * LA CHARGE UTILE DU JOURNAL NE S'ÉCHAPPE PAS À L'ÉCRAN.
 *
 * `order_events.payload` est un `jsonb` libre. Le rendre tel quel serait une
 * surface de fuite ouverte sur l'avenir : il suffirait qu'un futur appel y
 * range une note interne, un jeton, ou l'adresse du destinataire pour que la
 * valeur apparaisse dans l'éditeur sans que personne ait pris cette décision.
 *
 * C'est exactement le motif du « contrôle par VALEUR, pas par nom » pris à
 * l'envers : une valeur voyage sous n'importe quel nom, donc on n'affiche que
 * les noms qu'on a explicitement admis, et on jette le reste.
 */
describe("Résumé d'une charge de journal", () => {
  test("les clés ADMISES sont rendues", () => {
    expect(resumerCharge({ champ: "customer_label" })).toBe("customer_label");
    expect(resumerCharge({ nombre: 4 })).toBe("4");
    expect(resumerCharge({ lot: 12 })).toBe("12");
  });

  test("une clé INCONNUE est ignorée, même seule", () => {
    // Le témoin porte des noms plausibles : c'est sous ceux-là qu'une donnée
    // sensible arriverait, pas sous « secret ».
    expect(resumerCharge({ internal_notes: "prix d'achat 12 €" })).toBeNull();
    expect(resumerCharge({ public_token: "abcdefghijklmnop" })).toBeNull();
    expect(resumerCharge({ meta: "x", debug: "y", diagnostic: "z" })).toBeNull();
  });

  test("une clé inconnue mêlée à une clé admise ne s'invite pas", () => {
    /*
     * LE CAS QUI COMPTE, et celui qu'un contrôle naïf raterait : la charge est
     * VALIDE au sens du schéma, donc elle passe — et si le résumé concaténait
     * tout, la valeur interdite partirait avec.
     */
    const resume = resumerCharge({ champ: "product_ref", internal_notes: "prix 12 €" });
    expect(resume).toBe("product_ref");
    expect(resume).not.toContain("12");
  });

  test("une charge vide, nulle ou d'un autre type ne rend rien", () => {
    expect(resumerCharge({})).toBeNull();
    expect(resumerCharge(null)).toBeNull();
    expect(resumerCharge("texte")).toBeNull();
    expect(resumerCharge([1, 2, 3])).toBeNull();
  });

  test("un champ trop long est REFUSÉ plutôt que tronqué", () => {
    // Tronquer rendrait un début de valeur à l'écran ; refuser n'en rend
    // aucune. Sur une donnée dont on ne maîtrise pas l'origine, l'un des deux
    // seulement est sûr.
    expect(resumerCharge({ champ: "x".repeat(41) })).toBeNull();
    expect(resumerCharge({ champ: "x".repeat(40) })).toBe("x".repeat(40));
  });
});

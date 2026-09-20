import { describe, expect, test, vi } from "vitest";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";

/**
 * L'ANALYTIQUE NE RETIENT JAMAIS LA RÉPONSE D'UN VENDEUR PLUS QUE SA BORNE.
 *
 * ⚠️ DÉFAUT RÉEL, MESURÉ AU NAVIGATEUR LE 20/09/2026, ET C'EST LE CORRECTIF DU
 * 26/08 QUI NE TENAIT PAS.
 *
 * Cet audit a piloté l'éditeur de commande au vrai clavier : six champs saisis
 * l'un après l'autre, deux secondes entre chacun. UN SEUL est arrivé en base.
 * La cause n'était pas l'éditeur — elle tient en deux faits mesurés :
 *
 *  1. `marquerPremierContenu` attend `emettre()` EN LIGNE — il a besoin du
 *     retour pour savoir s'il doit rendre sa marque à usage unique. Sans borne,
 *     un tiers qui ne répond pas coûtait **15,5 s par sauvegarde**, pendant
 *     qu'une LECTURE de la même page répondait en **952 ms**. Et comme la
 *     marque est RENDUE quand l'envoi échoue, la sauvegarde suivante la
 *     re-réclame et re-paie : chaque champ, à chaque fois.
 *  2. Next.js SÉRIALISE les Server Actions. Tant que la première n'a pas
 *     répondu, les suivantes ne partent même pas : mesuré, **un seul POST pour
 *     six saisies**. Le vendeur ne voit aucune erreur, le témoin reste sur
 *     « Enregistrement… », et s'il quitte l'écran ses cinq autres champs sont
 *     perdus sans que rien ne l'ait dit.
 *
 * ⚠️ J'AI D'ABORD ACCUSÉ `after()`, ET C'ÉTAIT FAUX. L'explication « Next attend
 * ses rappels avant de terminer la réponse d'une action » collait à toutes les
 * durées observées. Elle a été démentie par une mesure faite ensuite : une
 * sauvegarde de numéro de suivi, dont l'attache pose un `after()` qui DORT 31
 * secondes, répond en **1,72 s**, colis bien attaché. Une explication cohérente
 * n'est pas une explication exécutée — L-014, commis en corrigeant L-014.
 *
 * CE QU'ON BORNE EST DONC LA DURÉE DE L'APPEL, en ligne comme différé : une
 * panne du tiers coûte au plus `BORNE_EMISSION_MS`. L'événement est alors
 * compté comme perdu, ce qu'il est — et le compteur existait déjà.
 *
 * ⚠️ CE CONTRÔLE ÉCHOUE DANS LES DEUX SENS : une émission qui dépasse sa borne,
 * et une borne qui refuserait une émission NORMALE (contre-test positif). Sans
 * le second, une borne à zéro passerait ce fichier en rejetant tout.
 */

const etat = vi.hoisted(() => ({
  /** `true` : `flush()` ne se résout JAMAIS — la panne qu'on veut borner. */
  pendJamais: true,
  captures: 0,
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture(): void {
      etat.captures += 1;
    }
    flush(): Promise<void> {
      if (etat.pendJamais) return new Promise<void>(() => {});
      return Promise.resolve();
    }
  },
}));

const attendre = (ms: number): Promise<"TOUJOURS EN ATTENTE"> =>
  new Promise((r) => setTimeout(() => r("TOUJOURS EN ATTENTE"), ms));

/**
 * Le module lit son client à la PREMIÈRE émission et le mémoïse : les variables
 * doivent être posées avant, et remises à zéro entre deux cas.
 */
async function preparer(): Promise<typeof import("@/lib/instrumentation/emettre")> {
  process.env["NEXT_PUBLIC_POSTHOG_KEY"] = "phc_sonde_de_test";
  process.env["NEXT_PUBLIC_POSTHOG_HOST"] = "https://analytique.invalid";
  const emission = await import("@/lib/instrumentation/emettre");
  emission.reinitialiserInstrumentation();
  etat.captures = 0;
  return emission;
}

describe("L'émission d'un événement est BORNÉE", () => {
  test("une analytique en panne ne retient pas la réponse au-delà de la borne", async () => {
    const { emettre, compteursEmission, BORNE_EMISSION_MS } = await preparer();
    etat.pendJamais = true;

    const debut = Date.now();
    let parti: boolean | "PAS RENDU" = "PAS RENDU";
    const issue = await Promise.race([
      emettre(EVENEMENTS.COMMANDE_MODIFIEE, { sujet: "profil-de-sonde" }).then((r) => {
        parti = r;
        return "rendu" as const;
      }),
      attendre(BORNE_EMISSION_MS + 3_000),
    ]);
    const duree = Date.now() - debut;

    expect(
      issue,
      `emettre() n'a pas rendu la main en ${BORNE_EMISSION_MS + 3_000} ms : ` +
        "la réponse d'une Server Action attend cette promesse, donc le vendeur attend aussi.",
    ).toBe("rendu");
    expect(duree, `borne ${BORNE_EMISSION_MS} ms, mesuré ${duree} ms`).toBeLessThan(
      BORNE_EMISSION_MS + 3_000,
    );

    /*
     * L'ÉVÉNEMENT EST PERDU, ET LE RETOUR DOIT LE DIRE.
     *
     * ⚠️ CETTE ASSERTION MANQUAIT, et la falsification l'a montré : en rendant
     * `true` sur le chemin borné, le produit cassé passait ce fichier en entier.
     * Le retour n'est pas décoratif — `marquerPremierContenu` et l'inscription
     * RENDENT une marque à usage unique en base quand il vaut `false`. Un `true`
     * menteur consommerait la marque pour un événement qui n'est jamais parti,
     * sans réémission possible : un dénominateur perdu fait monter le taux du
     * côté rassurant, exactement le piège que le brief nomme.
     */
    expect(parti, "une émission abandonnée ne doit JAMAIS se déclarer partie").toBe(false);
    expect(compteursEmission().echecs, "l'abandon doit être COMPTÉ, pas avalé").toBe(1);
  });

  test("CONTRE-TEST : une analytique qui répond n'est pas abandonnée", async () => {
    const { emettre, compteursEmission } = await preparer();
    etat.pendJamais = false;

    const parti = await emettre(EVENEMENTS.COMMANDE_MODIFIEE, { sujet: "profil-de-sonde" });

    // Sans ce cas, une borne à zéro — ou un `return false` inconditionnel —
    // passerait le test ci-dessus en ne prouvant rien du tout.
    expect(parti, "une émission normale doit rester un succès").toBe(true);
    expect(etat.captures, "l'événement doit avoir été réellement confié au client").toBe(1);
    expect(compteursEmission().emis).toBe(1);
    expect(compteursEmission().echecs).toBe(0);
  });

  test("la borne reste courte : un vendeur n'attend pas une analytique", async () => {
    const { BORNE_EMISSION_MS } = await preparer();
    // Une borne large rendrait la protection décorative : l'éditeur enchaîne les
    // sauvegardes, et Next les sérialise. La valeur est un ARBITRAGE, donc elle
    // est tenue par un contrôle plutôt que par la mémoire de celui qui l'a posée.
    expect(BORNE_EMISSION_MS).toBeGreaterThan(0);
    expect(BORNE_EMISSION_MS).toBeLessThanOrEqual(2_000);
  });
});

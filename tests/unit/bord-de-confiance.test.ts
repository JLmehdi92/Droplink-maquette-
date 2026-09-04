import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * CHAQUE BORD POSE SON EN-TÊTE, ET UN MODE N'EN CROIT QU'UN.
 *
 * ⚠️ DÉFAUT TROUVÉ LE 04/09/2026, EN PRÉPARANT LE DÉPLOIEMENT — donc AVANT
 * qu'il coûte quoi que ce soit, et c'est le seul moment où celui-ci se voit.
 *
 * La cible de déploiement est Railway, dont la documentation dit qu'il pose
 * `X-Real-IP` pour identifier le client, et qui ne pose PAS `cf-connecting-ip`.
 * Or le seul mode strict était `cloudflare`, qui ne croit que cet en-tête-là.
 * La chaîne, entièrement silencieuse :
 *
 *   BORD_DE_CONFIANCE absente → mode `cloudflare` → aucun `cf-connecting-ip`
 *   → `adresseAppelant()` rend `null` →
 *     • les six écrans admin rendent 404 à un vrai administrateur ;
 *     • la limitation publique tombe en mode « autorise » — plus aucun plafond ;
 *     • `enregistrerVue` REFUSE d'écrire, donc `link_views` reste VIDE.
 *
 * Le troisième est le plus grave et le moins visible. « Vues de lien par
 * commande > 3 » est une MÉTRIQUE DE VERDICT de la phase de validation, et le
 * brief le dit : *un compteur branché après coup démarre vide, donc
 * inexploitable au moment précis où il faut décider*. Le produit aurait tourné
 * des semaines en paraissant marcher, et la donnée qu'on est venu chercher
 * n'aurait jamais existé.
 *
 * ⚠️ CE QUE CETTE SUITE NE PEUT PAS FAIRE, et il faut le dire : elle ne prouve
 * pas que le bord de Railway RÉÉCRIT `x-real-ip` plutôt que de laisser passer
 * celui du client. Aucun test hors ligne ne peut l'établir — c'est une
 * propriété du bord, pas du code. `scripts/verifier-bord.mjs` la mesure en
 * boîte noire contre le déploiement réel, et il est à lancer UNE FOIS EN LIGNE.
 * Se tromper de mode ne peut cependant jamais rendre le produit plus ouvert
 * qu'aujourd'hui : un en-tête absent rend `null`, exactement comme avant.
 */

const enTetes = new Headers();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(enTetes),
}));

const AVANT = process.env["BORD_DE_CONFIANCE"];

beforeEach(() => {
  vi.resetModules();
  for (const [cle] of [...enTetes.entries()]) enTetes.delete(cle);
});

afterEach(() => {
  if (AVANT === undefined) delete process.env["BORD_DE_CONFIANCE"];
  else process.env["BORD_DE_CONFIANCE"] = AVANT;
});

async function adresseSous(mode: string | undefined, poses: Record<string, string>) {
  if (mode === undefined) delete process.env["BORD_DE_CONFIANCE"];
  else process.env["BORD_DE_CONFIANCE"] = mode;
  for (const [cle, valeur] of Object.entries(poses)) enTetes.set(cle, valeur);
  const { adresseAppelant } = await import("@/lib/limitation/empreinte");
  return adresseAppelant();
}

/**
 * L'INVENTAIRE EST DÉCLARÉ, et le test échoue DANS LES DEUX SENS : un mode
 * ajouté sans en-tête décrit ici, et un mode décrit ici qui n'existerait plus.
 * Sans le second sens, un mode retiré laisserait une ligne verte qui n'éprouve
 * plus rien.
 */
const MODES: ReadonlyMap<string, string> = new Map([
  ["cloudflare", "cf-connecting-ip"],
  ["railway", "x-real-ip"],
  ["xff", "x-forwarded-for"],
]);

describe("Le bord de confiance", () => {
  test("la sonde éprouve réellement quelque chose", async () => {
    // ⚠️ EN PREMIER : tout ce qui suit est vrai d'un inventaire vide.
    expect(MODES.size).toBeGreaterThanOrEqual(3);
    const { bordDeConfiance } = await import("@/lib/limitation/empreinte");
    expect(bordDeConfiance()).toBeTypeOf("string");
  });

  test("chaque mode LIT l'en-tête de son bord", async () => {
    for (const [mode, enTete] of MODES) {
      expect(await adresseSous(mode, { [enTete]: "198.51.100.7" }), `mode ${mode}`).toBe(
        "198.51.100.7",
      );
      vi.resetModules();
      for (const [cle] of [...enTetes.entries()]) enTetes.delete(cle);
    }
  });

  test("et il n'en lit AUCUN AUTRE — un mode ne se replie jamais", async () => {
    /*
     * C'est le contrôle qui compte. Le repli est le défaut d'origine de ce
     * fichier : « on prend l'en-tête de notre bord quand il existe, et seulement
     * à défaut `x-forwarded-for` ». Il suffisait de ne pas poser le premier pour
     * que le second — que le client contrôle — fasse autorité.
     */
    for (const [mode] of MODES) {
      for (const [autre, enTete] of MODES) {
        if (autre === mode) continue;
        expect(
          await adresseSous(mode, { [enTete]: "203.0.113.9" }),
          `mode ${mode} a cru « ${enTete} », qui est l'en-tête de ${autre}`,
        ).toBeNull();
        vi.resetModules();
        for (const [cle] of [...enTetes.entries()]) enTetes.delete(cle);
      }
    }
  });

  test("`aucun` ne lit rien, même quand tous les en-têtes sont posés", async () => {
    const tous = Object.fromEntries([...MODES.values()].map((e) => [e, "192.0.2.5"]));
    expect(await adresseSous("aucun", tous)).toBeNull();
  });

  test("une valeur absente ou illisible retombe sur le mode STRICT", async () => {
    const { bordDeConfiance } = await import("@/lib/limitation/empreinte");
    void bordDeConfiance;
    for (const valeur of [undefined, "", "  ", "railwey", "RAILWAY-ish", "true"]) {
      expect(
        await adresseSous(valeur, { "x-real-ip": "203.0.113.1", "x-forwarded-for": "203.0.113.2" }),
        `« ${String(valeur)} » a ouvert quelque chose`,
      ).toBeNull();
      vi.resetModules();
      for (const [cle] of [...enTetes.entries()]) enTetes.delete(cle);
    }
  });

  test("la casse et les espaces d'une valeur légitime ne la font pas retomber", async () => {
    expect(await adresseSous("  RaIlWaY  ", { "x-real-ip": "198.51.100.3" })).toBe("198.51.100.3");
  });

  test("`xff` prend la PREMIÈRE entrée de la liste, pas la dernière", async () => {
    // La liste se rallonge par la droite : la première entrée est celle que le
    // bord le plus proche du client a écrite.
    expect(await adresseSous("xff", { "x-forwarded-for": "198.51.100.1, 10.0.0.1, 10.0.0.2" })).toBe(
      "198.51.100.1",
    );
  });

  test("un en-tête présent mais VIDE ne vaut pas une adresse", async () => {
    // Il a la forme d'une valeur et franchirait toute validation de présence.
    for (const [mode, enTete] of MODES) {
      expect(await adresseSous(mode, { [enTete]: "   " }), `mode ${mode}`).toBeNull();
      vi.resetModules();
      for (const [cle] of [...enTetes.entries()]) enTetes.delete(cle);
    }
  });
});

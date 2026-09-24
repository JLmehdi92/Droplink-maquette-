import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * L'ADRESSE DE PAIEMENT DU PLAN PRO.
 *
 * C'est la seule URL du produit vers laquelle on envoie un vendeur pour qu'il
 * tape un numéro de carte, et elle vient de l'ENVIRONNEMENT — donc elle peut
 * être fausse par accident comme par malveillance.
 *
 * ⚠️ UNE VALEUR QUI A LA FORME D'UNE CONFIGURATION FRANCHIT TOUTES LES
 * VALIDATIONS DE PRÉSENCE (L-026). « La variable est définie » ne dit rien de
 * ce qu'elle contient.
 */

const CLE = "LEMON_SQUEEZY_CHECKOUT_URL";

/**
 * Le module est rechargé à CHAQUE cas.
 *
 * Il lit `process.env` à l'appel et non à l'import, mais le recharger enlève
 * toute dépendance à cet ordre : une sonde qui tiendrait à ce que la lecture
 * soit paresseuse cesserait de prouver quoi que ce soit le jour où quelqu'un
 * met la valeur en constante de module.
 */
async function lireUrl(valeur: string | undefined): Promise<string | null> {
  if (valeur === undefined) delete process.env[CLE];
  else process.env[CLE] = valeur;
  vi.resetModules();
  // `module` est un nom réservé côté Next : le lint le refuse, et il a raison.
  const charge = await import("@/lib/paiement/plan");
  return charge.urlPaiementPro();
}

describe("L'adresse de paiement du plan Pro", () => {
  const avant = process.env[CLE];
  let erreurs: string[] = [];

  beforeEach(() => {
    erreurs = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      erreurs.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (avant === undefined) delete process.env[CLE];
    else process.env[CLE] = avant;
  });

  test("ABSENTE, elle rend `null` — et ce n'est pas une panne", async () => {
    /*
     * C'est l'état NORMAL aujourd'hui : le produit Lemon Squeezy n'existe pas
     * encore. L'écran doit savoir se présenter SANS bouton. Un bouton mort sur
     * une page d'abonnement fait conclure que le produit est cassé, pas que
     * l'abonnement n'est pas ouvert.
     */
    expect(await lireUrl(undefined)).toBeNull();
    expect(erreurs, "une absence attendue ne se journalise pas comme un incident").toEqual([]);
  });

  test("vide ou blanche, elle rend `null` sans bruit", async () => {
    expect(await lireUrl("")).toBeNull();
    expect(await lireUrl("   ")).toBeNull();
    expect(erreurs).toEqual([]);
  });

  test("⚠️ UN HÔTE QUI CONTIENT LE NÔTRE N'EST PAS LE NÔTRE", async () => {
    /*
     * LE CONTRÔLE DISCRIMINANT DE CE FICHIER.
     *
     * Une comparaison par `includes` — le réflexe — accepterait
     * `lemonsqueezy.com.pirate.net`, qui contient bien la chaîne
     * « lemonsqueezy.com ». Le vendeur atterrirait sur une page qui ressemble à
     * celle du fournisseur, avec un champ de carte.
     *
     * Vérifier seulement qu'un hôte inconnu est refusé ne sépare pas les deux
     * mondes : il l'est dans les deux. C'est ce nom-là qui les sépare.
     */
    expect(await lireUrl("https://lemonsqueezy.com.pirate.net/checkout")).toBeNull();
    expect(await lireUrl("https://store.lemonsqueezy.com.pirate.net/checkout")).toBeNull();
    expect(await lireUrl("https://faux-lemonsqueezy.com/checkout")).toBeNull();
    expect(erreurs.length, "un hôte refusé DOIT être dit côté serveur").toBeGreaterThan(0);
  });

  test("un hôte tiers est refusé", async () => {
    expect(await lireUrl("https://exemple-mal.test/checkout")).toBeNull();
  });

  test("le protocole DOIT être https", async () => {
    // Une page de paiement en clair expose le formulaire qu'elle porte, et
    // « ça marche quand même » est exactement le raisonnement qui la laisse.
    expect(await lireUrl("http://store.lemonsqueezy.com/checkout/buy/abc")).toBeNull();
    expect(erreurs.some((e) => e.includes("https"))).toBe(true);
  });

  test("ce qui n'est pas une URL est refusé plutôt que concaténé", async () => {
    expect(await lireUrl("store.lemonsqueezy.com/checkout")).toBeNull();
    expect(await lireUrl("a-remplir")).toBeNull();
  });

  test("CONTRE-TEST : une VRAIE adresse passe", async () => {
    /*
     * Sans lui, une fonction qui rendrait toujours `null` passerait tous les
     * contrôles ci-dessus à 100 % — et le bouton ne s'afficherait jamais, y
     * compris le jour où Wassim aura créé le produit.
     */
    expect(await lireUrl("https://store.lemonsqueezy.com/checkout/buy/abc-123")).toBe(
      "https://store.lemonsqueezy.com/checkout/buy/abc-123",
    );
    // Une boutique Lemon Squeezy vit sur un SOUS-DOMAINE du fournisseur.
    expect(await lireUrl("https://droplink.lemonsqueezy.com/buy/abc-123")).toBe(
      "https://droplink.lemonsqueezy.com/buy/abc-123",
    );
    expect(erreurs, "une adresse valide ne journalise rien").toEqual([]);
  });

  test("⚠️ LE LIEN DU BOUTON PORTE L'IDENTIFIANT DU COMPTE (audit ECC, 24/09/2026)", async () => {
    /*
     * Le webhook rattache un paiement par `meta.custom_data.profil_id` — la voie
     * sûre — et, à défaut, par l'e-mail du PAYEUR. Le bouton envoyait l'adresse
     * brute : un vendeur qui payait avec une autre adresse que celle de son compte
     * était débité SANS recevoir le Pro. Lemon Squeezy renvoie dans
     * `custom_data` ce que le lien porte en `checkout[custom][…]`.
     */
    process.env[CLE] = "https://droplink.lemonsqueezy.com/buy/abc-123?media=0";
    vi.resetModules();
    const { urlPaiementPourCompte } = await import("@/lib/paiement/plan");
    const brut = urlPaiementPourCompte({
      profilId: "11111111-2222-4333-8444-555555555555",
      email: "vendeur+pro@exemple.test",
    });
    expect(brut).not.toBeNull();
    const url = new URL(brut ?? "");
    expect(url.hostname).toBe("droplink.lemonsqueezy.com");
    expect(url.searchParams.get("checkout[custom][profil_id]")).toBe("11111111-2222-4333-8444-555555555555");
    expect(url.searchParams.get("checkout[email]")).toBe("vendeur+pro@exemple.test");
    expect(url.searchParams.get("media"), "les paramètres déjà posés sont gardés").toBe("0");
  });

  test("CONTRE-TEST : sans adresse configurée, pas de lien — même avec un compte", async () => {
    delete process.env[CLE];
    vi.resetModules();
    const { urlPaiementPourCompte } = await import("@/lib/paiement/plan");
    expect(urlPaiementPourCompte({ profilId: "11111111-2222-4333-8444-555555555555", email: "a@b.test" })).toBeNull();
  });

  test("le prix a UN SEUL point d'émission, et c'est un nombre", async () => {
    vi.resetModules();
    const { PRIX_PRO_EUR } = await import("@/lib/paiement/plan");
    expect(Number.isInteger(PRIX_PRO_EUR)).toBe(true);
    expect(PRIX_PRO_EUR).toBeGreaterThan(0);
  });

  test("aucun catalogue n'écrit le prix en dur", async () => {
    /*
     * ⚠️ LA GARDE QUI COMPTE VRAIMENT. Le contrôle précédent prouve que la
     * constante existe ; il ne prouve pas que les catalogues s'en servent. Un
     * « 20 € » recopié dans une phrase de `fr.json` passerait inaperçu jusqu'au
     * jour où le prix change — et ce jour-là, deux des trois langues
     * annonceraient encore l'ancien montant.
     */
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fautifs: string[] = [];
    for (const langue of ["fr", "en", "zh-CN"]) {
      const brut = readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8");
      // Un montant suivi d'un symbole de devise, ou l'inverse.
      if (/\d+[,.]?\d*\s*€|€\s*\d/.test(brut)) fautifs.push(langue);
    }
    expect(
      fautifs,
      `Ces catalogues portent un montant en euros : ${fautifs.join(", ")}. Le prix ` +
        "vit dans `lib/paiement/plan.ts` et n'existe qu'à un seul endroit ; une " +
        "phrase de catalogue ne porte que le gabarit autour.",
    ).toEqual([]);
  });
});

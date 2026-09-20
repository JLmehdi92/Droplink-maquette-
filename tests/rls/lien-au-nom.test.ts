import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LE LIEN AU NOM DU VENDEUR — décision de Wassim, 20/09/2026.
 *
 * « le lien a ton nom c'est une features pro ! »
 *
 * `droplink.fr/atelier-nord/xK9…` au lieu de `droplink.fr/p/xK9…`.
 *
 * ⚠️ DEUX PROPRIÉTÉS PORTENT TOUT LE RESTE, et elles tirent dans des sens
 * opposés — c'est pour ça qu'elles sont éprouvées ensemble :
 *
 *   1. UN LIEN PARTI DOIT CONTINUER DE RÉPONDRE. Toujours. Même après un
 *      changement de nom, même après un retour au plan gratuit. Il vit dans le
 *      DM d'un client qui n'a pas de compte, n'a rien demandé, et ne sera
 *      jamais prévenu.
 *   2. UN NOM NE SE PRÊTE PAS. Sans vérification, n'importe qui servirait sa
 *      propre page sous le nom d'un concurrent — une page par ailleurs
 *      authentique, donc une usurpation invisible.
 *
 * Une garde qui ne tiendrait que la seconde casserait des liens ; une qui ne
 * tiendrait que la première ouvrirait l'usurpation.
 */

let pro: UtilisateurDeTest;
let gratuit: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
const service = clientService();

/** Un nom différent à chaque exécution : la réservation est À VIE. */
const marque = Math.random().toString(36).slice(2, 8);
const NOM_PRO = "atelier-" + marque;
const NOM_SUIVANT = "boutique-" + marque;
const NOM_VOISIN = "voisin-" + marque;

async function jetonDUneCommandeDe(u: UtilisateurDeTest): Promise<string> {
  const { data, error } = await service
    .from("orders")
    .insert({ shop_id: u.shopId, customer_label: "Client du lien brandé" })
    .select("public_token")
    .single();
  if (error !== null) throw new Error("commande de sonde impossible : " + error.message);
  return data.public_token;
}

const slugVautPour = async (jeton: string, slug: string): Promise<boolean> => {
  const { data } = await clientAnonyme().rpc("verifier_slug_commande", {
    p_jeton: jeton,
    p_slug: slug,
  });
  return data === true;
};

beforeAll(async () => {
  pro = await creerUtilisateur("lien-nom-pro");
  gratuit = await creerUtilisateur("lien-nom-gratuit");
  voisin = await creerUtilisateur("lien-nom-voisin");
  await passerEnPro(pro);
  await passerEnPro(voisin);
}, 180_000);

afterAll(async () => {
  await supprimerUtilisateur(pro);
  await supprimerUtilisateur(gratuit);
  await supprimerUtilisateur(voisin);
});

describe("Qui peut poser un nom de lien", () => {
  test("un compte GRATUIT ne peut pas — c'est une fonctionnalité Pro", async () => {
    const { error } = await gratuit.client.rpc("definir_slug_boutique", { p_slug: "refuse-moi" });
    expect(error, "un compte gratuit a pu poser son nom de lien").not.toBeNull();
    expect(error?.code).toBe("DL059");
  });

  test("CONTRE-TEST : un compte PRO le peut", async () => {
    // Sans ce cas, une garde qui refuserait TOUT le monde passerait le test
    // ci-dessus sans rien prouver — et la fonctionnalité vendue ne marcherait
    // pour personne.
    const { data, error } = await pro.client.rpc("definir_slug_boutique", { p_slug: NOM_PRO });
    expect(error, error?.message ?? "").toBeNull();
    expect(data).toBe(NOM_PRO);

    const { data: boutique } = await service
      .from("shops")
      .select("slug")
      .eq("id", pro.shopId)
      .single();
    expect(boutique?.slug).toBe(NOM_PRO);
  });

  test("`anon` ne peut pas en poser du tout", async () => {
    // La fonction est `security definer` : sans révocation, PostgREST
    // l'exposerait à quiconque détient la clé publiable — qui est dans le bundle.
    const { error } = await clientAnonyme().rpc("definir_slug_boutique", { p_slug: "anonyme" });
    expect(error, "anon a pu poser un nom de lien").not.toBeNull();
  });
});

describe("Ce qu'un nom de lien ne peut pas être", () => {
  test.each([
    ["ab", "deux caractères"],
    ["-atelier", "un tiret en tête"],
    ["atelier-", "un tiret en queue"],
    ["a--b", "un tiret double, qui usurpe sans se voir"],
    ["atelier nord", "une espace"],
    ["atelier_nord", "un tiret bas"],
    ["a".repeat(41), "quarante et un caractères"],
  ])("refuse « %s » (%s)", async (candidat) => {
    const { error } = await pro.client.rpc("definir_slug_boutique", { p_slug: candidat });
    expect(error, `« ${candidat} » a été accepté`).not.toBeNull();
    expect(error?.code).toBe("DL071");
  });

  test.each(["admin", "api", "fr", "zh-cn", "docs", "connexion", "droplink", "support"])(
    "refuse le mot réservé « %s »",
    async (reserve) => {
      /*
       * ⚠️ CE N'EST PAS UNE POLITESSE. Un vendeur qui prendrait `admin` ou
       * `droplink` se ferait passer pour NOUS auprès de ses propres clients —
       * et le jour où le routage bouge, son lien capturerait une surface du
       * produit.
       */
      const { error } = await pro.client.rpc("definir_slug_boutique", { p_slug: reserve });
      expect(error, `le mot réservé « ${reserve} » a été accepté`).not.toBeNull();
      expect(error?.code).toBe("DL071");
    },
  );

  test("refuse un nom déjà porté par une AUTRE boutique", async () => {
    await voisin.client.rpc("definir_slug_boutique", { p_slug: NOM_VOISIN });

    const { error } = await pro.client.rpc("definir_slug_boutique", { p_slug: NOM_VOISIN });
    expect(error, "deux boutiques ont pu porter le même nom").not.toBeNull();
    expect(error?.code).toBe("DL072");
  });

  test("les MAJUSCULES sont normalisées, pas refusées", async () => {
    /*
     * ⚠️ CE CAS EXIGEAIT D'ABORD UN REFUS, ET C'ÉTAIT MON TEST QUI AVAIT TORT.
     *
     * `definir_slug_boutique` met en minuscules AVANT de valider. Refuser
     * « Atelier-Nord » punirait le vendeur d'avoir tapé son nom comme il
     * l'écrit partout ailleurs, pour un détail qu'il ne peut pas deviner. La
     * valeur STOCKÉE reste canonique — c'est la seule chose qui compte, puisque
     * c'est elle qui devra se dicter au téléphone.
     *
     * Ce qui reste refusé est ce qu'aucune normalisation ne peut sauver : une
     * espace, un tiret bas, une longueur hors bornes.
     */
    const { data, error } = await pro.client.rpc("definir_slug_boutique", {
      p_slug: NOM_PRO.toUpperCase(),
    });
    expect(error, error?.message ?? "").toBeNull();
    expect(data, "la majuscule n'a pas été normalisée").toBe(NOM_PRO);
  });

  test("reposer SON PROPRE nom n'est pas une erreur", async () => {
    // Réenregistrer le même formulaire est un geste ordinaire. Le refuser
    // transformerait un clic sans conséquence en message d'échec.
    const { error } = await pro.client.rpc("definir_slug_boutique", { p_slug: NOM_PRO });
    expect(error, error?.message ?? "").toBeNull();
  });
});

describe("Un lien parti continue de répondre", () => {
  test("le nom courant vaut pour les commandes de sa boutique", async () => {
    const jeton = await jetonDUneCommandeDe(pro);
    expect(await slugVautPour(jeton, NOM_PRO)).toBe(true);
  });

  test("⚠️ APRÈS UN CHANGEMENT DE NOM, L'ANCIEN LIEN RÉPOND TOUJOURS", async () => {
    /*
     * LA PROPRIÉTÉ QUI A DÉCIDÉ DE TOUT LE MODÈLE, et le choix de Wassim :
     * « changeable, anciens gardés ».
     *
     * Le vendeur renomme sa boutique. Les liens déjà envoyés portent l'ANCIEN
     * nom, et ils vivent dans les messages privés de clients qui n'ont pas de
     * compte chez nous. Les casser punirait des tiers pour un geste qu'ils
     * ignorent.
     */
    const jeton = await jetonDUneCommandeDe(pro);

    const { error } = await pro.client.rpc("definir_slug_boutique", { p_slug: NOM_SUIVANT });
    expect(error, error?.message ?? "").toBeNull();

    expect(await slugVautPour(jeton, NOM_SUIVANT), "le nouveau nom ne répond pas").toBe(true);
    expect(
      await slugVautPour(jeton, NOM_PRO),
      "L'ANCIEN LIEN EST CASSÉ — il est dans le DM d'un client qui ne sera jamais prévenu",
    ).toBe(true);
  });

  test("⚠️ ET IL RÉPOND ENCORE APRÈS UN RETOUR AU PLAN GRATUIT", async () => {
    /*
     * Le plan garde la CRÉATION du nom, jamais son SERVICE. Une résiliation ne
     * doit pas casser les liens déjà chez les clients d'un tiers : ils n'y sont
     * pour rien, et ils ne sauraient même pas à qui se plaindre.
     */
    const jeton = await jetonDUneCommandeDe(pro);
    await service.from("profiles").update({ plan: "gratuit" }).eq("id", pro.profilId);
    try {
      expect(
        await slugVautPour(jeton, NOM_SUIVANT),
        "une résiliation a cassé un lien déjà envoyé à un client",
      ).toBe(true);
    } finally {
      await passerEnPro(pro);
    }
  });

  test("mais il ne permet PLUS d'en poser un nouveau", async () => {
    // Le contre-test du précédent : le service survit au plan, la CRÉATION non.
    await service.from("profiles").update({ plan: "gratuit" }).eq("id", pro.profilId);
    try {
      const { error } = await pro.client.rpc("definir_slug_boutique", {
        p_slug: "encore-" + marque,
      });
      expect(error?.code).toBe("DL059");
    } finally {
      await passerEnPro(pro);
    }
  });
});

describe("Un nom ne se prête pas", () => {
  test("⚠️ le nom d'un AUTRE vendeur ne vaut pas pour ma commande", async () => {
    /*
     * L'USURPATION, et elle ne coûterait rien : `droplink.fr/<nom-du-
     * concurrent>/<mon-jeton>` afficherait MA page sous SON nom. La page serait
     * par ailleurs authentique — donc rien ne le trahirait.
     */
    const jeton = await jetonDUneCommandeDe(pro);
    expect(
      await slugVautPour(jeton, NOM_VOISIN),
      "le nom d'un autre vendeur a été accepté pour cette commande",
    ).toBe(false);
  });

  test("un nom qui n'existe pas ne vaut pour rien", async () => {
    const jeton = await jetonDUneCommandeDe(pro);
    expect(await slugVautPour(jeton, "nom-qui-nexiste-pas-" + marque)).toBe(false);
  });

  test("un jeton inconnu ne vaut pour aucun nom", async () => {
    expect(await slugVautPour("JetonQuiNExistePasDuTout123", NOM_SUIVANT)).toBe(false);
  });
});

describe("Qui voit les noms de lien", () => {
  test("un vendeur lit les SIENS, et ceux de personne d'autre", async () => {
    const { data } = await pro.client.from("shop_slugs").select("slug, shop_id");
    expect(data, "le vendeur ne voit aucun de ses noms").not.toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).every((l) => l.shop_id === pro.shopId)).toBe(true);
    expect((data ?? []).some((l) => l.slug === NOM_VOISIN)).toBe(false);
  });

  test("un vendeur ne peut pas ÉCRIRE dans l'historique des noms", async () => {
    // Pouvoir y écrire permettrait de réserver le nom d'un concurrent sans
    // jamais passer par la garde du plan.
    const { error } = await pro.client
      .from("shop_slugs")
      .insert({ shop_id: pro.shopId, slug: "ecriture-directe-" + marque });
    expect(error, "un vendeur a pu écrire dans l'historique des noms").not.toBeNull();
  });

  test("`anon` ne lit rien de l'historique des noms", async () => {
    const { data, error } = await clientAnonyme().from("shop_slugs").select("slug");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe("La contrainte de forme ne ferme pas la table au vendeur", () => {
  /*
   * ⚠️ CE CONTRÔLE EXISTE PARCE QUE LA MIGRATION 184 A FAILLI CASSER LA MARQUE.
   *
   * `shops_slug_forme` appelle `public.slug_valide(slug)`, et une contrainte
   * `CHECK` s'évalue avec les droits de CELUI QUI ÉCRIT — pas avec ceux du
   * propriétaire de la fonction. La 184 révoque `execute` à `PUBLIC` sur cette
   * fonction et sur l'aide qu'elle appelle : sans le `grant` explicite à
   * `authenticated` qui l'accompagne, un vendeur ayant posé un nom de lien ne
   * pourrait plus enregistrer AUCUN réglage de marque — ni son nom de boutique,
   * ni sa couleur, ni sa langue publique.
   *
   * Et le refus ne ressemblerait pas à ce qu'il est : « permission denied for
   * function slug_valide » sur un formulaire de couleur ne désigne rien.
   *
   * ⚠️ LA COMMANDE EST UNE MISE À JOUR D'UNE AUTRE COLONNE, délibérément.
   * Postgres réévalue les contraintes `CHECK` de la ligne à chaque `update`, y
   * compris quand la colonne contrainte n'est pas touchée : c'est précisément
   * ce qui rend le défaut invisible à qui ne teste que l'écriture du slug.
   */
  test("un vendeur qui a posé un nom peut encore enregistrer sa marque", async () => {
    // CONTRE-TEST D'ABORD : établir que la boutique porte bien un nom, sans
    // quoi l'écriture ci-dessous n'exercerait pas la contrainte du tout.
    const { data: avant } = await pro.client
      .from("shops")
      .select("slug")
      .eq("id", pro.shopId)
      .maybeSingle();
    expect(avant?.slug, "la boutique ne porte aucun nom : le contrôle n'exerce rien").not.toBeNull();

    const { error } = await pro.client
      .from("shops")
      .update({ name: "Boutique " + marque })
      .eq("id", pro.shopId);

    expect(
      error,
      "Le vendeur ne peut plus écrire dans sa boutique : la contrainte `shops_slug_forme` " +
        "s'évalue avec SES droits, et `slug_valide` ne lui est plus accordée. " +
        (error?.message ?? ""),
    ).toBeNull();
  });
});

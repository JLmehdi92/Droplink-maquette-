import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  clientAnonyme,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { appliquerReglagesMarque, ReglagesMarque } from "@/lib/boutique/reglages";
import { lireCommandePublique } from "@/lib/page-publique/lecture";

/**
 * LES RÉSEAUX DU VENDEUR, ET LES COMPTEURS DE TÊTE DE LISTE.
 *
 * DEUX SURFACES NEUVES, DEUX RISQUES DIFFÉRENTS.
 *
 * LES RÉSEAUX SONT UN CHAMP DE LIEN RENDU SUR LA PAGE D'UN TIERS. C'est la
 * définition d'une redirection ouverte : qui prend le compte d'un vendeur peut
 * envoyer TOUS ses clients où il veut, depuis une page qu'ils croient être
 * celle de leur vendeur. Zod le refuse ; ce fichier vérifie surtout que LA BASE
 * le refuse aussi — parce que Zod ne protège que le chemin qui passe par Zod, et
 * qu'un second chemin d'écriture s'écrira un jour.
 *
 * LES COMPTEURS SONT UNE FONCTION QUI COMPTE DES LIGNES. Une fonction de
 * comptage mal cadrée ne fuite pas une donnée : elle fuite un VOLUME — combien
 * de commandes ont les autres. C'est moins grave et bien plus discret, donc plus
 * durable.
 *
 * UTILISATEURS RÉELLEMENT AUTHENTIFIÉS, jamais de mock : un test qui simule la
 * RLS ne teste pas la RLS.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let jetonAlice: string;

beforeAll(async () => {
  alice = await creerUtilisateur("reseaux-alice");
  bob = await creerUtilisateur("reseaux-bob");

  const { data } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId, customer_label: "Yanis" })
    .select("public_token")
    .single();
  jetonAlice = (data as { public_token: string }).public_token;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
});

const REGLAGES_DE_BASE = {
  nom: "Atelier Nord",
  couleurAccent: "#0058be",
  languePublique: "fr",
  filigrane: false,
} as const;

describe("Les réseaux du vendeur arrivent chez son client, et rien d'autre n'arrive", () => {
  test("les trois liens configurés sont servis à la page publique", async () => {
    const ok = await appliquerReglagesMarque(alice.client, alice.shopId, {
      ...REGLAGES_DE_BASE,
      instagram: "https://instagram.com/atelier.nord",
      tiktok: "https://tiktok.com/@atelier.nord",
      whatsapp: "https://wa.me/33612345678",
    });
    expect(ok, "l'écriture des réseaux a échoué").toBe(true);

    const publique = await lireCommandePublique(jetonAlice);
    expect(publique).not.toBeNull();
    if (publique === null) return;

    expect(publique.boutique.instagram).toBe("https://instagram.com/atelier.nord");
    expect(publique.boutique.tiktok).toBe("https://tiktok.com/@atelier.nord");
    expect(publique.boutique.whatsapp).toBe("https://wa.me/33612345678");
  });

  test("un champ vidé redevient une ABSENCE, pas un lien vide", async () => {
    const ok = await appliquerReglagesMarque(alice.client, alice.shopId, {
      ...REGLAGES_DE_BASE,
      instagram: "",
      tiktok: "   ",
      whatsapp: undefined,
    });
    expect(ok).toBe(true);

    const publique = await lireCommandePublique(jetonAlice);
    expect(publique).not.toBeNull();
    if (publique === null) return;

    // `null` et pas `""` : c'est `null` qui fait OMETTRE le bloc entier. Une
    // chaîne vide produirait trois boutons qui ne mènent nulle part.
    expect(publique.boutique.instagram).toBeNull();
    expect(publique.boutique.tiktok).toBeNull();
    expect(publique.boutique.whatsapp).toBeNull();
  });

  /*
   * LE CŒUR DE CE FICHIER.
   *
   * Chaque cas est écrit EN BASE, directement, en contournant Zod — c'est le
   * seul moyen de savoir si la CONTRAINTE tient, et non le schéma. Un contrôle
   * qui n'exercerait que Zod prouverait que Zod fonctionne, ce que personne ne
   * met en doute, et laisserait la base ouverte au prochain chemin d'écriture.
   */
  const REFUSES = [
    ["javascript:alert(1)", "un schéma exécutable — le cas qui donne le contrôle du navigateur"],
    ["data:text/html,<script>", "une charge inline déguisée en lien"],
    ["http://instagram.com/x", "http en clair depuis une page servie en TLS"],
    [
      "https://instagram.com.attaquant.example/x",
      "le domaine attendu en PRÉFIXE d'un autre — sans ancre de fin, il passerait",
    ],
    [
      "https://attaquant.example/instagram.com/x",
      "le domaine attendu en CHEMIN — l'autre moitié du même piège",
    ],
    ["https://facebook.com/x", "un réseau qui n'est pas dans les trois retenus"],
    ["", "la chaîne vide : l'absence s'écrit `null`, jamais une chaîne"],
  ] as const;

  test.each(REFUSES)("la BASE refuse « %s » (%s)", async (valeur) => {
    const { error } = await alice.client
      .from("shops")
      .update({ instagram_url: valeur })
      .eq("id", alice.shopId);

    expect(error, `la base a ACCEPTÉ « ${valeur} »`).not.toBeNull();
  });

  // CONTRE-TEST POSITIF. Une suite où tout est refusé passe à 100 % sans rien
  // prouver : il faut qu'au moins une écriture directe ABOUTISSE, sinon la
  // contrainte pourrait tout refuser sans qu'on le voie.
  test("la base ACCEPTE un lien conforme écrit directement", async () => {
    const { error } = await alice.client
      .from("shops")
      .update({ instagram_url: "https://www.instagram.com/atelier.nord/" })
      .eq("id", alice.shopId);

    expect(error).toBeNull();
  });

  test("Bob ne peut pas écrire les réseaux d'Alice", async () => {
    const { error } = await bob.client
      .from("shops")
      .update({ instagram_url: "https://instagram.com/pirate" })
      .eq("id", alice.shopId);

    // La RLS ne lève pas : elle ne trouve simplement aucune ligne à modifier.
    // C'est la LECTURE qui fait foi, pas l'absence d'erreur.
    expect(error).toBeNull();

    const publique = await lireCommandePublique(jetonAlice);
    expect(publique?.boutique.instagram).not.toBe("https://instagram.com/pirate");
  });

  test("le schéma NOMME le champ fautif plutôt que de rendre un refus muet", () => {
    const analyse = ReglagesMarque.safeParse({
      ...REGLAGES_DE_BASE,
      tiktok: "https://tiktok.com/sans-arobase",
    });
    expect(analyse.success).toBe(false);
    if (analyse.success) return;
    expect(analyse.error.issues.map((i) => i.path[0])).toContain("tiktok");
  });
});

describe("Les compteurs ne comptent que les commandes de leur appelant", () => {
  test("chacun voit SON total, et le total de l'autre ne l'atteint pas", async () => {
    // Alice a déjà une commande ; Bob en reçoit trois.
    await bob.client.from("orders").insert([
      { shop_id: bob.shopId, customer_label: "b1" },
      { shop_id: bob.shopId, customer_label: "b2" },
      { shop_id: bob.shopId, customer_label: "b3" },
    ]);

    const { data: vueAlice } = await alice.client.rpc("compter_commandes_par_etat");
    const { data: vueBob } = await bob.client.rpc("compter_commandes_par_etat");

    const a = (Array.isArray(vueAlice) ? vueAlice[0] : vueAlice) as { preparation: number };
    const b = (Array.isArray(vueBob) ? vueBob[0] : vueBob) as { preparation: number };

    // CONTRE-TEST D'ABORD : si la fonction rendait zéro pour tout le monde, la
    // comparaison d'isolation passerait sans rien prouver.
    expect(Number(a.preparation), "Alice ne voit aucune de ses commandes").toBeGreaterThan(0);
    expect(Number(b.preparation)).toBe(3);
    expect(Number(a.preparation), "Alice voit les commandes de Bob").toBeLessThan(3);
  });

  test("les archivées sortent du compte, comme elles sortent de la liste", async () => {
    const avant = await bob.client.rpc("compter_commandes_par_etat");
    const n = Number(
      ((Array.isArray(avant.data) ? avant.data[0] : avant.data) as { preparation: number })
        .preparation,
    );

    await bob.client
      .from("orders")
      .update({ archived_at: new Date().toISOString() })
      .eq("shop_id", bob.shopId)
      .eq("customer_label", "b1");

    const apres = await bob.client.rpc("compter_commandes_par_etat");
    const m = Number(
      ((Array.isArray(apres.data) ? apres.data[0] : apres.data) as { preparation: number })
        .preparation,
    );

    expect(m, "archiver n'a pas fait bouger le compteur").toBe(n - 1);
  });

  /*
   * LE DROIT SE LIT DANS LE CATALOGUE, PAS DANS LA RÉPONSE.
   *
   * DÉFAUT TROUVÉ EN FALSIFIANT CE FICHIER : la première version de ce contrôle
   * appelait simplement la RPC en anonyme et exigeait une erreur. On a ACCORDÉ
   * `execute` à `anon` en base pour la casser — et elle est restée VERTE.
   * L'appel échouait encore, mais pour une autre raison (le cache de schéma de
   * PostgREST). Le contrôle prouvait « anon reçoit une erreur », jamais « anon
   * n'a pas le droit » : exactement L-020, on interrogeait un MOT et pas
   * l'EFFET.
   *
   * Postgres accorde `EXECUTE` à `PUBLIC` par défaut, et un droit d'exécution ne
   * s'écrit pas dans le corps d'une fonction : aucune relecture de code ne peut
   * le voir. Il faut interroger le catalogue.
   */
  test("ni anon ni public n'ont le droit d'exécuter la fonction", async () => {
    const client = await ouvrirConnexionCatalogue();
    try {
      const lignes = await interroger<{ anon: boolean; publique: boolean }>(
        client,
        `select has_function_privilege('anon', 'public.compter_commandes_par_etat()', 'EXECUTE') as anon,
                has_function_privilege('public', 'public.compter_commandes_par_etat()', 'EXECUTE') as publique`,
      );
      const droits = lignes[0];
      expect(droits, "la fonction est introuvable dans le catalogue").toBeDefined();
      if (droits === undefined) return;

      expect(droits.anon, "anon peut exécuter le comptage").toBe(false);
      expect(droits.publique, "PUBLIC peut exécuter le comptage").toBe(false);

      // CONTRE-TEST : si la sonde répondait `false` à tout le monde, elle
      // passerait sans rien prouver — y compris sur une fonction qui n'existe
      // plus sous ce nom.
      const attendu = await interroger<{ ok: boolean }>(
        client,
        `select has_function_privilege('authenticated', 'public.compter_commandes_par_etat()', 'EXECUTE') as ok`,
      );
      expect(attendu[0]?.ok, "authenticated a perdu le droit d'exécuter le comptage").toBe(true);
    } finally {
      await client.end();
    }
  });

  test("l'appel anonyme échoue aussi en pratique", async () => {
    const { error } = await clientAnonyme().rpc("compter_commandes_par_etat");
    expect(error, "anon a obtenu une réponse").not.toBeNull();
  });
});

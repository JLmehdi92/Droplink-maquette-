import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { appliquerChamp, type ClientEcriture } from "@/lib/commandes/ecriture";

/**
 * LES ÉCRITURES DE L'ÉDITEUR, éprouvées sur la fonction que la Server Action
 * appelle, avec des utilisateurs RÉELLEMENT authentifiés.
 *
 * Le point le plus important de cette suite est le jeton public : c'est la seule
 * chose qui protège la page d'un client, il est immuable à vie, et le test de
 * non-régression doit être ÉTENDU À CHAQUE NOUVELLE MUTATION. L'éditeur en
 * ajoute sept d'un coup.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let commande: string;
let jetonInitial: string;

const ecrire = (u: UtilisateurDeTest, id: string, champ: string, valeur: string) =>
  appliquerChamp(u.client as unknown as ClientEcriture, u.profilId, id, champ, valeur);

async function lire(u: UtilisateurDeTest, id: string, colonnes: string) {
  const { data } = await u.client.from("orders").select(colonnes).eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

beforeAll(async () => {
  alice = await creerUtilisateur("ecr-alice");
  bob = await creerUtilisateur("ecr-bob");

  const { data, error } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId })
    .select("id, public_token")
    .single();

  expect(error, `création impossible : ${error?.message}`).toBeNull();
  commande = (data as { id: string }).id;
  jetonInitial = (data as { public_token: string }).public_token;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
});

describe("Le jeton public survit à TOUTES les mutations de l'éditeur", () => {
  test("aucun des sept champs éditables ne le change", async () => {
    const mutations: ReadonlyArray<readonly [string, string]> = [
      ["customer_label", "Yanis"],
      ["product_ref", "REF-9"],
      ["tracking_number", "LX123456789FR"],
      ["carrier_code", "dhl"],
      ["internal_notes", "acheté 38 €"],
      ["status", "en_transit"],
      ["qc_status", "approuve"],
    ];

    // Un ensemble vide passe tout : sans cette borne, « aucune mutation ne
    // change le jeton » serait vrai parce qu'aucune n'aurait été jouée.
    expect(mutations.length).toBe(7);

    for (const [champ, valeur] of mutations) {
      const resultat = await ecrire(alice, commande, champ, valeur);
      expect(resultat.statut, `écriture refusée sur ${champ}`).toBe("ok");

      const ligne = await lire(alice, commande, "public_token");
      expect(ligne?.["public_token"], `le jeton a changé après ${champ}`).toBe(jetonInitial);
    }
  });

  test("contre-test positif : les valeurs écrites SONT bien arrivées", async () => {
    // Sans lui, « le jeton n'a pas bougé » resterait vrai si aucune écriture
    // n'avait abouti.
    const ligne = await lire(alice, commande, "customer_label, status, qc_status");
    expect(ligne?.["customer_label"]).toBe("Yanis");
    expect(ligne?.["status"]).toBe("en_transit");
    expect(ligne?.["qc_status"]).toBe("approuve");
  });
});

describe("Isolation", () => {
  test("Bob ne peut pas écrire dans la commande d'Alice", async () => {
    const resultat = await ecrire(bob, commande, "customer_label", "détourné");
    expect(resultat.statut).toBe("echec");
    // « Introuvable » et non « interdit » : distinguer les deux confirmerait
    // l'existence d'une commande que Bob n'a pas le droit de connaître.
    if (resultat.statut === "echec") expect(resultat.motif).toBe("introuvable");

    const ligne = await lire(alice, commande, "customer_label");
    expect(ligne?.["customer_label"]).toBe("Yanis");
  });

  test("contre-test positif : Bob écrit sans problème dans SA commande", async () => {
    // Une implémentation qui refuserait TOUTE écriture passerait le test
    // ci-dessus à cent pour cent sans rien prouver.
    const { data } = await bob.client
      .from("orders")
      .insert({ shop_id: bob.shopId })
      .select("id")
      .single();

    const id = (data as { id: string }).id;
    const resultat = await ecrire(bob, id, "customer_label", "Client de Bob");
    expect(resultat.statut).toBe("ok");
  });
});

describe("Ce que l'éditeur accepte d'écrire", () => {
  test("une colonne hors de la liste est refusée", async () => {
    // `shop_id` la transférerait à un autre compte, `public_token` en changerait
    // la capacité. Aucune des deux n'est éditable, et le refus vient de la
    // validation, avant même que la base ait à trancher.
    for (const champ of ["shop_id", "public_token", "unsubscribe_token", "archived_at", "id"]) {
      const resultat = await ecrire(alice, commande, champ, "n'importe quoi");
      expect(resultat.statut, `${champ} a été accepté`).toBe("echec");
      if (resultat.statut === "echec") expect(resultat.motif).toBe("saisie");
    }
  });

  test("un statut inventé est refusé", async () => {
    const resultat = await ecrire(alice, commande, "status", "perdu_en_mer");
    expect(resultat.statut).toBe("echec");
  });

  test("un champ de texte vidé redevient NULL, pas une chaîne vide", async () => {
    // Deux façons de dire « rien » finiraient par diverger : la page publique
    // OMET une information absente, et « omis » se lit en base comme NULL.
    await ecrire(alice, commande, "product_ref", "");
    const ligne = await lire(alice, commande, "product_ref");
    expect(ligne?.["product_ref"]).toBeNull();
  });
});

describe("Le premier contenu réel", () => {
  test("des notes internes SEULES ne marquent pas la commande comme créée", async () => {
    // Les notes sont pour le vendeur, pas pour son client : une commande qui n'a
    // qu'une note n'a rien à montrer. La compter comme une création gonflerait
    // la métrique de verdict du côté rassurant.
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    await ecrire(alice, id, "internal_notes", "acheté 38 €");
    expect((await lire(alice, id, "first_content_at"))?.["first_content_at"]).toBeNull();

    // ... alors qu'un nom de client, lui, compte.
    await ecrire(alice, id, "customer_label", "Yanis");
    expect((await lire(alice, id, "first_content_at"))?.["first_content_at"]).not.toBeNull();
  });

  /**
   * LE TEST QUI MANQUAIT. Les précédents vérifiaient `first_content_at` — un
   * FAIT posé par un déclencheur depuis la migration 006. Ils restaient donc
   * verts alors que l'ÉVÉNEMENT `order_created`, lui, n'était jamais émis : la
   * fonction censée le réclamer arrivait après le déclencheur et rendait
   * toujours `false`.
   *
   * On interroge donc la réclamation elle-même, qui est ce que le code émetteur
   * consulte réellement.
   */
  test("l'événement de création est réclamable UNE fois, et une seule", async () => {
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    // Sans contenu réel, il n'y a rien à réclamer.
    const avant = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(avant.data, "réclamé alors que la commande est vide").toBe(false);

    // On écrit SANS passer par `appliquerChamp` : celui-ci réclame déjà
    // l'événement, et c'est bien son rôle. Le consommer ici masquerait ce qu'on
    // cherche à établir.
    await alice.client.from("orders").update({ customer_label: "Yanis" }).eq("id", id);

    const premiere = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(premiere.data, "l'événement n'a PAS pu être réclamé").toBe(true);

    const seconde = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(seconde.data, "l'événement a été réclamé deux fois").toBe(false);
  });

  /**
   * ET LE LIEN AVEC LE CODE ÉMETTEUR. Le test précédent établit que la
   * réclamation fonctionne ; celui-ci établit que le chemin du produit
   * l'emprunte réellement — sans quoi la fonction serait correcte et l'événement
   * toujours perdu, ce qui est exactement ce qui vient d'arriver.
   */
  test("une écriture de contenu réel emprunte le chemin de réclamation", async () => {
    /*
     * CE TEST A CHANGÉ DE CONTRAT, PARCE QUE LE PRODUIT A CHANGÉ.
     *
     * Il exigeait auparavant que la réclamation soit CONSOMMÉE après une
     * écriture de contenu. C'était l'ancien comportement — et c'était le défaut :
     * la marque était consommée AVANT l'émission, et `emettre` rend `false`
     * sans lever quand le collecteur n'est pas configuré. L'événement n'était
     * alors jamais réémis. Avec la clé d'analytics vide — l'état actuel du
     * dépôt, et celui de ce harnais — cela signifiait 100 % de pertes
     * définitives sur le NUMÉRATEUR de la métrique de verdict.
     *
     * Le produit REND désormais la marque quand l'émission n'est pas partie.
     * Ici, l'analytics n'étant pas configuré, la marque doit donc être encore
     * disponible : c'est la preuve que rien n'a été perdu en silence.
     *
     * CE QUE LE TEST ÉTABLIT MALGRÉ TOUT — et c'était sa vraie raison d'être :
     * que le chemin d'écriture emprunte bien la réclamation, au lieu de laisser
     * la fonction correcte et l'événement jamais émis.
     */
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    await ecrire(alice, id, "product_ref", "REF-emission");

    // Le premier contenu, lui, EST posé : c'est ce qui prouve que l'écriture a
    // traversé le chemin instrumenté et non un raccourci.
    const { data: marque } = await alice.client
      .from("orders")
      .select("first_content_at")
      .eq("id", id)
      .single();
    expect(
      (marque as { first_content_at: string | null } | null)?.first_content_at,
      "le premier contenu n'a pas été posé",
    ).not.toBeNull();

    const restant = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(
      restant.data,
      "la marque a été consommée alors que l'événement n'est pas parti : la perte serait définitive",
    ).toBe(true);
  });

  test("Bob ne peut pas réclamer l'événement d'une commande d'Alice", async () => {
    const { error } = await bob.client.rpc("reclamer_evenement_creation", {
      p_order_id: commande,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("DL027");
  });

  test("la marque n'est posée QU'UNE FOIS", async () => {
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    await ecrire(alice, id, "customer_label", "Premier");
    const premiere = (await lire(alice, id, "first_content_at"))?.["first_content_at"];

    await ecrire(alice, id, "product_ref", "REF-2");
    const seconde = (await lire(alice, id, "first_content_at"))?.["first_content_at"];

    expect(seconde).toBe(premiere);
  });
});

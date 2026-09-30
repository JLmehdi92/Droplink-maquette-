import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  archiverCommande,
  dupliquerCommande,
  revoquerLien,
  type ClientCycle,
} from "@/lib/commandes/cycle";

/**
 * LE CYCLE DE VIE — révocation, duplication, archivage.
 *
 * La révocation est la seule action du produit qui change le `public_token`.
 * C'est aussi la seule dont l'erreur est irréversible : elle coupe un lien déjà
 * envoyé à quelqu'un.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;

const clientDe = (u: UtilisateurDeTest) => u.client as unknown as ClientCycle;

async function creerCommande(
  u: UtilisateurDeTest,
  champs: Record<string, unknown> = {},
): Promise<{ id: string; jeton: string; desabonnement: string }> {
  const { data, error } = await u.client
    .from("orders")
    .insert({ shop_id: u.shopId, ...champs })
    .select("id, public_token, unsubscribe_token")
    .single();
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  const l = data as { id: string; public_token: string; unsubscribe_token: string };
  return { id: l.id, jeton: l.public_token, desabonnement: l.unsubscribe_token };
}

beforeAll(async () => {
  alice = await creerUtilisateur("cyc-alice");
  bob = await creerUtilisateur("cyc-bob");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; Alice en crée une dizaine (duplication comprise), et ce
  // test mesure la révocation, la duplication et l'archivage, pas le quota.
  await passerEnPro(alice);
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
});

describe("La révocation", () => {
  test("elle change LES DEUX jetons, pas seulement le public", async () => {
    // Oublier celui de désabonnement laisserait un pouvoir résiduel à qui
    // détient le lien fuité. Un jeton, un pouvoir — et une révocation qui n'en
    // coupe qu'un n'a coupé qu'à moitié.
    const avant = await creerCommande(alice);

    const resultat = await revoquerLien(clientDe(alice), alice.profilId, avant.id);
    expect(resultat.statut).toBe("ok");
    if (resultat.statut !== "ok") return;

    const { data } = await alice.client
      .from("orders")
      .select("public_token, unsubscribe_token")
      .eq("id", avant.id)
      .single();

    const apres = data as { public_token: string; unsubscribe_token: string };
    expect(apres.public_token).toBe(resultat.nouveauJeton);
    expect(apres.public_token).not.toBe(avant.jeton);
    expect(apres.unsubscribe_token).not.toBe(avant.desabonnement);

    // Et les deux restent distincts : un jeton, un pouvoir.
    expect(apres.public_token).not.toBe(apres.unsubscribe_token);
  });

  test("le nouveau jeton est rendu immédiatement, sans relecture", async () => {
    // Un vendeur qui doit rafraîchir pour retrouver son lien hésitera à
    // révoquer — et le lien fuité restera actif.
    const commande = await creerCommande(alice);
    const resultat = await revoquerLien(clientDe(alice), alice.profilId, commande.id);

    expect(resultat.statut).toBe("ok");
    if (resultat.statut !== "ok") return;
    expect(resultat.nouveauJeton.length).toBeGreaterThanOrEqual(16);
    expect(resultat.nouveauJeton).not.toBe(commande.jeton);
  });

  test("Bob ne peut pas révoquer le lien d'Alice", async () => {
    const commande = await creerCommande(alice);

    const resultat = await revoquerLien(clientDe(bob), bob.profilId, commande.id);
    expect(resultat.statut).toBe("echec");
    // « Introuvable » et non « interdit » : distinguer révélerait l'existence de
    // la commande d'un autre vendeur.
    if (resultat.statut === "echec") expect(resultat.motif).toBe("introuvable");

    const { data } = await alice.client
      .from("orders")
      .select("public_token")
      .eq("id", commande.id)
      .single();
    expect((data as { public_token: string }).public_token).toBe(commande.jeton);
  });

  test("le jeton reste immuable par toute AUTRE voie", async () => {
    // La révocation est le seul chemin. Une écriture directe doit être refusée
    // par la base, pas par notre code.
    const commande = await creerCommande(alice);

    const { error } = await alice.client
      .from("orders")
      .update({ public_token: "jetonForgeParUnVendeur" })
      .eq("id", commande.id);

    expect(error, "le jeton a pu être réécrit directement").not.toBeNull();
  });
});

describe("La duplication", () => {
  test("elle est un GABARIT : ni client, ni suivi, ni médias", async () => {
    const source = await creerCommande(alice, {
      customer_label: "Yanis",
      product_ref: "REF-source",
      internal_notes: "acheté 38 €",
      tracking_number: "LX123456789FR",
      carrier_code: "dhl",
    });

    // Un média sur la source, pour établir qu'il ne suit pas.
    await alice.client.from("order_media").insert({
      order_id: source.id,
      type: "photo",
      cle:
        "medias/" + alice.shopId + "/" + source.id + "/aaaaaaaa-0000-4000-8000-000000000001.jpg",
      taille_octets: 42,
      position: 0,
    });

    const resultat = await dupliquerCommande(
      clientDe(alice),
      alice.profilId,
      alice.shopId,
      source.id,
    );
    expect(resultat.statut).toBe("ok");
    if (resultat.statut !== "ok") return;

    const { data } = await alice.client
      .from("orders")
      .select("customer_label, product_ref, internal_notes, tracking_number, carrier_code, public_token")
      .eq("id", resultat.nouvelleCommande)
      .single();

    const copie = data as Record<string, string | null>;

    // LE NOM DU CLIENT EST EXCLU : envoyer une page portant le pseudo de
    // quelqu'un d'autre est le défaut le plus visible que ce produit puisse
    // produire — et le plus facile à commettre, puisqu'on duplique justement
    // parce que la commande précédente ressemble à la suivante.
    expect(copie["customer_label"]).toBeNull();
    expect(copie["tracking_number"]).toBeNull();
    expect(copie["carrier_code"]).toBeNull();

    // Ce qu'un vendeur retape réellement, lui, est repris.
    expect(copie["product_ref"]).toBe("REF-source");
    expect(copie["internal_notes"]).toBe("acheté 38 €");

    // Un jeton NEUF : partager le jeton ferait de deux commandes une seule page.
    expect(copie["public_token"]).not.toBe(source.jeton);

    // Aucun média n'a suivi.
    const { data: medias } = await alice.client
      .from("order_media")
      .select("id")
      .eq("order_id", resultat.nouvelleCommande);
    expect(medias ?? []).toEqual([]);
  });

  test("Bob ne peut pas dupliquer une commande d'Alice", async () => {
    const source = await creerCommande(alice, { product_ref: "REF-privee" });

    const resultat = await dupliquerCommande(clientDe(bob), bob.profilId, bob.shopId, source.id);
    expect(resultat.statut).toBe("echec");
    if (resultat.statut === "echec") expect(resultat.motif).toBe("introuvable");

    // Et rien n'a été créé chez Bob.
    const { data } = await bob.client.from("orders").select("id").eq("product_ref", "REF-privee");
    expect(data ?? []).toEqual([]);
  });
});

describe("L'archivage", () => {
  test("il range, et il se défait", async () => {
    const commande = await creerCommande(alice);

    const range = await archiverCommande(clientDe(alice), alice.profilId, commande.id, true);
    expect(range.statut).toBe("ok");
    if (range.statut === "ok") expect(range.archivee).toBe(true);

    const sorti = await archiverCommande(clientDe(alice), alice.profilId, commande.id, false);
    expect(sorti.statut).toBe("ok");
    if (sorti.statut === "ok") expect(sorti.archivee).toBe(false);
  });

  test("il NE TOUCHE PAS au jeton", async () => {
    // Archiver range le plan de travail du vendeur ; cela ne doit rien casser de
    // la promesse faite au client.
    const commande = await creerCommande(alice);
    await archiverCommande(clientDe(alice), alice.profilId, commande.id, true);

    const { data } = await alice.client
      .from("orders")
      .select("public_token")
      .eq("id", commande.id)
      .single();
    expect((data as { public_token: string }).public_token).toBe(commande.jeton);
  });

  test("Bob ne peut pas archiver une commande d'Alice", async () => {
    const commande = await creerCommande(alice);

    const resultat = await archiverCommande(clientDe(bob), bob.profilId, commande.id, true);
    expect(resultat.statut).toBe("echec");

    const { data } = await alice.client
      .from("orders")
      .select("archived_at")
      .eq("id", commande.id)
      .single();
    expect((data as { archived_at: string | null }).archived_at).toBeNull();
  });

  test("contre-test positif : Bob archive SA commande sans problème", async () => {
    const commande = await creerCommande(bob);
    const resultat = await archiverCommande(clientDe(bob), bob.profilId, commande.id, true);
    expect(resultat.statut).toBe("ok");
  });
});

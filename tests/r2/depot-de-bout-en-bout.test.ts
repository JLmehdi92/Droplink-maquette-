import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { stockageConfigure } from "@/lib/storage/config";
import {
  preparerDepot,
  preparerDepotVignette,
  confirmerDepot,
  type ClientMedias,
} from "@/lib/commandes/medias";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LE DÉPÔT D'UN MÉDIA, DE BOUT EN BOUT.
 *
 * CE CONTRÔLE MANQUAIT, ET C'EST POURQUOI LE DÉFAUT N'A PAS ÉTÉ VU. Le
 * branchement R2 était éprouvé (signature, dépôt, relecture de taille,
 * suppression) et l'écriture en base l'était aussi — chacun de son côté. Le
 * CHEMIN COMPLET, lui, ne l'était par personne : préparer, déposer réellement
 * l'objet, puis confirmer.
 *
 * C'est exactement là que le produit échouait pour un vendeur qui dépose ses
 * photos : chaque moitié fonctionnait, leur enchaînement non.
 *
 * IL DÉPOSE POUR DE VRAI, sur le bucket réel. C'est le sens de ce projet de
 * test : `pnpm check:r2` n'est pas dans les portes de qualité parce qu'il exige
 * un compte tiers, mais rien d'autre ne peut établir qu'un dépôt aboutit.
 */

let vendeur: UtilisateurDeTest;
let commande: string;

/** Un PNG minimal valide — le plus petit fichier qu'un navigateur enverrait. */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  vendeur = await creerUtilisateur("depot-bout-en-bout");
  const { data } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId })
    .select("id")
    .single();
  commande = (data as { id: string }).id;
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
});

describe("Un dépôt aboutit réellement", () => {
  test("le stockage est configuré : sans lui, la sonde ne prouverait rien", () => {
    // Un ensemble vide passe tout. Sans identifiants, tous les contrôles
    // suivants échoueraient pour la mauvaise raison — ou pire, seraient sautés.
    expect(stockageConfigure(), "R2 n'est pas configuré dans .env.local").toBe(true);
  });

  test("préparer, déposer, confirmer : les trois s'enchaînent", async () => {
    const client = vendeur.client as unknown as ClientMedias;

    const preparation = await preparerDepot(client, vendeur.profilId, vendeur.shopId, {
      orderId: commande,
      typeMime: "image/png",
      tailleAnnoncee: PNG_1x1.length,
    });

    expect(
      preparation.statut,
      `préparation refusée : ${"motif" in preparation ? preparation.motif : "?"}`,
    ).toBe("ok");
    if (preparation.statut !== "ok") return;

    // LE DÉPÔT RÉEL. C'est ce que le navigateur fait, avec les en-têtes que le
    // serveur a imposés : les omettre ferait échouer la signature, et c'est
    // précisément le genre d'écart qu'un test qui « simule » ne voit pas.
    const reponse = await fetch(preparation.url, {
      method: "PUT",
      headers: preparation.enTetes,
      body: new Uint8Array(PNG_1x1),
    });
    expect(reponse.ok, `le dépôt R2 a échoué : ${reponse.status}`).toBe(true);

    const confirmation = await confirmerDepot(client, vendeur.profilId, vendeur.shopId, {
      orderId: commande,
      mediaId: preparation.mediaId,
      typeMime: "image/png",
      largeur: 1,
      hauteur: 1,
    });

    expect(
      confirmation.statut,
      `confirmation refusée : ${"motif" in confirmation ? confirmation.motif : "?"}`,
    ).toBe("ok");

    const { data } = await vendeur.client
      .from("order_media")
      .select("id, position, taille_octets")
      .eq("order_id", commande);
    expect((data ?? []).length, "aucun média en base après un dépôt réussi").toBe(1);
  }, 60_000);

  test("AVEC SA VIGNETTE — c'est ce que fait le navigateur", async () => {
    /*
     * LE DÉFAUT QUE CE CONTRÔLE AURAIT ATTRAPÉ.
     *
     * Le premier contrôle ci-dessus dépose un média SANS vignette, et il passait
     * — c'est pourquoi il ne prouvait pas ce qu'il fallait. Le navigateur, lui,
     * génère toujours une vignette : `confirmerDepot` renseigne alors
     * `cle_vignette`, et c'est cette colonne que le déclencheur contrôle.
     *
     * Les deux dérivations divergeaient d'un point — le code retire l'extension
     * du média, la migration la gardait — donc TOUTE photo déposée par un
     * vendeur était refusée en base avec DL040, après avoir pourtant été
     * stockée. Onze photos, onze « Enregistrement impossible ».
     */
    const client = vendeur.client as unknown as ClientMedias;

    const preparation = await preparerDepot(client, vendeur.profilId, vendeur.shopId, {
      orderId: commande,
      typeMime: "image/png",
      tailleAnnoncee: PNG_1x1.length,
    });
    expect(preparation.statut).toBe("ok");
    if (preparation.statut !== "ok") return;

    await fetch(preparation.url, {
      method: "PUT",
      headers: preparation.enTetes,
      body: new Uint8Array(PNG_1x1),
    });

    // LA VIGNETTE, exactement comme le composant la dépose.
    const sigVignette = await preparerDepotVignette(client, vendeur.shopId, {
      orderId: commande,
      mediaId: preparation.mediaId,
      typeMime: "image/png",
      tailleAnnoncee: PNG_1x1.length,
    });
    expect(
      sigVignette.statut,
      `signature de vignette refusée : ${"motif" in sigVignette ? sigVignette.motif : "?"}`,
    ).toBe("ok");
    if (sigVignette.statut !== "ok") return;

    const depotVignette = await fetch(sigVignette.url, {
      method: "PUT",
      headers: sigVignette.enTetes,
      body: new Uint8Array(PNG_1x1),
    });
    expect(depotVignette.ok, `dépôt de la vignette échoué : ${depotVignette.status}`).toBe(true);

    const confirmation = await confirmerDepot(client, vendeur.profilId, vendeur.shopId, {
      orderId: commande,
      mediaId: preparation.mediaId,
      typeMime: "image/png",
      largeur: 1,
      hauteur: 1,
    });
    expect(
      confirmation.statut,
      `confirmation refusée AVEC vignette : ${"motif" in confirmation ? confirmation.motif : "?"}`,
    ).toBe("ok");

    // La sonde doit prouver que la vignette a bien été RETENUE : une correction
    // qui cesserait simplement de l'enregistrer passerait le contrôle ci-dessus.
    const { data } = await vendeur.client
      .from("order_media")
      .select("cle_vignette")
      .eq("id", confirmation.statut === "ok" ? confirmation.mediaId : "")
      .maybeSingle();
    expect(
      (data as { cle_vignette: string | null } | null)?.cle_vignette,
      "la vignette n'a pas été enregistrée : le média s'affichera sans aperçu",
    ).not.toBeNull();
  }, 60_000);

  test("un SECOND dépôt sur la même commande aboutit aussi", async () => {
    /*
     * LE CAS RÉEL DU PRODUIT : un vendeur ne dépose jamais une photo, il en
     * dépose dix. La position est calculée à partir du nombre de médias
     * existants, et `unique (order_id, position)` la protège — si ce calcul se
     * trompe d'une seule unité, le second dépôt échoue et tous les suivants
     * avec lui.
     *
     * Éprouver un seul dépôt aurait donc laissé passer exactement le défaut que
     * le vendeur rencontre à sa deuxième photo.
     */
    const client = vendeur.client as unknown as ClientMedias;

    const preparation = await preparerDepot(client, vendeur.profilId, vendeur.shopId, {
      orderId: commande,
      typeMime: "image/png",
      tailleAnnoncee: PNG_1x1.length,
    });
    expect(
      preparation.statut,
      `préparation refusée : ${"motif" in preparation ? preparation.motif : "?"}`,
    ).toBe("ok");
    if (preparation.statut !== "ok") return;

    const reponse = await fetch(preparation.url, {
      method: "PUT",
      headers: preparation.enTetes,
      body: new Uint8Array(PNG_1x1),
    });
    expect(reponse.ok, `le dépôt R2 a échoué : ${reponse.status}`).toBe(true);

    const confirmation = await confirmerDepot(client, vendeur.profilId, vendeur.shopId, {
      orderId: commande,
      mediaId: preparation.mediaId,
      typeMime: "image/png",
      largeur: 1,
      hauteur: 1,
    });
    expect(
      confirmation.statut,
      `deuxième dépôt refusé : ${"motif" in confirmation ? confirmation.motif : "?"}`,
    ).toBe("ok");

    const { data } = await vendeur.client
      .from("order_media")
      .select("position")
      .eq("order_id", commande)
      .order("position");
    const positions = (data ?? []).map((l) => (l as { position: number }).position);

    // DES POSITIONS DISTINCTES ET CONSÉCUTIVES, sans coder leur nombre : c'est
    // la propriété qui compte, et elle reste vraie quel que soit le nombre de
    // dépôts que ce fichier finira par enchaîner. `unique (order_id, position)`
    // les protège en base — un calcul qui se tromperait d'une unité ferait
    // échouer le dépôt suivant, et tous ceux d'après.
    expect(positions.length, "moins de deux médias : rien n'est éprouvé").toBeGreaterThan(1);
    expect(
      positions,
      `positions non consécutives : ${positions.join(", ")}`,
    ).toEqual(positions.map((_, i) => i));
  }, 60_000);
});

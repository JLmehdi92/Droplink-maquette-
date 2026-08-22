import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { lireSuiviPublic } from "@/lib/page-publique/lecture";

/**
 * LE SUIVI SUR LA PAGE PUBLIQUE.
 *
 * C'est la troisième surface de lecture par jeton, après la commande et les
 * médias, et elle refait le MÊME filtre de suspension. Ce n'est pas une redite :
 * une coupure à moitié faite est une coupure qui n'a pas eu lieu. Un compte
 * suspendu dont la page ne répond plus mais dont le suivi resterait
 * interrogeable divulguerait la position d'un colis à qui détient un lien qu'on
 * a précisément voulu couper.
 *
 * Elle ne rend AUCUN chiffre de coût — nombre d'interrogations, retours vides.
 * Ce sont nos chiffres, et ce qui n'est pas rendu ne peut pas fuiter.
 */

let alice: UtilisateurDeTest;
let catalogue: Client;
let commande: string;
let jeton: string;
let parcelId: string;

const NUMERO = "LX-PUBLIC-0001";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("suivipub-alice");

  const { data, error } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId, customer_label: "Yanis" })
    .select("id, public_token")
    .single();
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  commande = (data as { id: string }).id;
  jeton = (data as { public_token: string }).public_token;

  const attache = await alice.client.rpc("attacher_colis", {
    p_order_id: commande,
    p_numero: NUMERO,
    p_transporteur: "3011",
  });
  const ligne = Array.isArray(attache.data) ? attache.data[0] : null;
  parcelId = ligne?.parcel_id ?? "";
  expect(parcelId, "aucun colis attaché : la sonde n'inspecte rien").not.toBe("");

  await interroger(
    catalogue,
    `select public.appliquer_etat_colis($1, 'en_transit'::public.parcel_status, 'InTransit', '3011',
      $2::jsonb, '', '', '{}'::jsonb, '')`,
    [
      NUMERO,
      JSON.stringify([
        {
          instant: "2026-08-10T12:00:00Z",
          description: "Départ du centre de tri",
          lieu: "Shenzhen",
          etape: "Departure",
        },
        {
          instant: "2026-08-09T08:00:00Z",
          description: "Pris en charge",
          lieu: "Shenzhen",
          etape: "PickedUp",
        },
      ]),
    ],
  );
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await catalogue.end();
});

describe("Ce que le jeton donne du suivi", () => {
  test("l'étape, le numéro et les points de passage", async () => {
    const suivi = await lireSuiviPublic(jeton);
    expect(suivi, "aucun suivi rendu").not.toBeNull();
    if (suivi === null) return;

    expect(suivi.etape).toBe("en_transit");
    expect(suivi.numero).toBe(NUMERO);
    expect(suivi.passages.length).toBe(2);
    // Du plus récent au plus ancien : c'est l'ordre dans lequel on les lit.
    expect(suivi.passages[0]?.description).toBe("Départ du centre de tri");
    expect(suivi.dernierMouvement).not.toBeNull();
  });

  /**
   * CONTRÔLE PAR VALEUR. Les compteurs de coût sont dans la MÊME ligne que ce
   * qu'on rend : il suffirait d'un `select *` pour qu'ils sortent, sous
   * n'importe quel nom.
   */
  test("aucun chiffre de coût ne sort, sous aucun nom", async () => {
    // On les rend distinctifs pour pouvoir les chercher par VALEUR.
    await interroger(
      catalogue,
      "update public.tracked_parcels set query_count = 4242, empty_count = 3131 where id = $1",
      [parcelId],
    );

    const suivi = await lireSuiviPublic(jeton);
    const rendu = JSON.stringify(suivi);

    expect(rendu).not.toContain("4242");
    expect(rendu).not.toContain("3131");
  });

  test("contre-test positif : ces valeurs SONT bien en base", async () => {
    const lignes = await interroger<{ query_count: number }>(
      catalogue,
      "select query_count from public.tracked_parcels where id = $1",
      [parcelId],
    );
    expect(Number(lignes[0]?.query_count)).toBe(4242);
  });

  test("un jeton inconnu ne rend rien", async () => {
    expect(await lireSuiviPublic("aaaaaaaaaaaaaaaaaaaaa")).toBeNull();
  });

  test("une commande SANS colis rend `null`, ce qui est le cas normal", async () => {
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId, customer_label: "Sans colis" })
      .select("public_token")
      .single();
    const autre = (data as { public_token: string }).public_token;
    expect(await lireSuiviPublic(autre)).toBeNull();
  });
});

describe("La coupure de suspension, sur CETTE surface aussi", () => {
  test("un compte suspendu ne rend plus son suivi", async () => {
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", alice.profilId);

    expect(await lireSuiviPublic(jeton), "le suivi répond encore").toBeNull();

    await service.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
    // La réactivation rétablit : sans cette moitié, une fonction cassée passerait
    // pour une suspension qui fonctionne.
    expect(await lireSuiviPublic(jeton), "la réactivation n'a pas rétabli").not.toBeNull();
  });
});

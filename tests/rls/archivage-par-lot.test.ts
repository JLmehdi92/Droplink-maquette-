import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * L'ARCHIVAGE PAR LOT — ce que cette suite établit.
 *
 * CHAQUE LOT EST TOUT-OU-RIEN. Une sélection à moitié archivée, sans que le
 * vendeur sache LAQUELLE, est pire que l'échec complet : un échec se refait, un
 * état partiel se découvre des semaines plus tard sur la commande qu'on croyait
 * rangée.
 *
 * Le défaut visé n'est pas une fuite mais un SILENCE. Sous RLS, un
 * `update ... where id = any(...)` ne touche que les commandes de l'appelant —
 * ce qui est correct — et ignore les autres SANS RIEN DIRE. L'écran afficherait
 * « lot archivé » pour une sélection dont une partie n'a pas bougé.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commandesAlice: string[] = [];
let commandeBob: string;

async function creerCommandes(
  utilisateur: UtilisateurDeTest,
  combien: number,
): Promise<string[]> {
  const lignes = Array.from({ length: combien }, (_, i) => ({
    shop_id: utilisateur.shopId,
    customer_label: "lot " + String(i),
  }));
  const { data, error } = await utilisateur.client.from("orders").insert(lignes).select("id");
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  return (data as { id: string }[]).map((l) => l.id);
}

async function archivees(ids: readonly string[]): Promise<number> {
  const lignes = await interroger<{ n: string }>(
    catalogue,
    "select count(*)::text as n from public.orders where id = any($1) and archived_at is not null",
    [[...ids]],
  );
  return Number.parseInt(lignes[0]?.n ?? "0", 10);
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("lot-alice");
  bob = await creerUtilisateur("lot-bob");

  commandesAlice = await creerCommandes(alice, 5);
  commandeBob = (await creerCommandes(bob, 1))[0] as string;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Un lot qui aboutit", () => {
  test("archive TOUTES les commandes demandées", async () => {
    // Le contre-test positif d'abord : sans lui, une fonction qui refuse tout
    // passerait chacune des vérifications suivantes.
    const { data, error } = await alice.client.rpc("archiver_lot", {
      p_ids: commandesAlice,
      p_archiver: true,
    });
    expect(error, `lot refusé : ${error?.message}`).toBeNull();
    expect(data).toBe(commandesAlice.length);
    expect(await archivees(commandesAlice)).toBe(commandesAlice.length);
  });

  test("et le lot inverse les fait TOUTES revenir", async () => {
    const { error } = await alice.client.rpc("archiver_lot", {
      p_ids: commandesAlice,
      p_archiver: false,
    });
    expect(error).toBeNull();
    expect(await archivees(commandesAlice)).toBe(0);
  });

  test("un lot vide ne fait rien et ne lève pas", async () => {
    // Un formulaire soumis sans case cochée est un geste ordinaire, pas une
    // erreur : le traiter comme un incident apprendrait à ignorer les incidents.
    const { data, error } = await alice.client.rpc("archiver_lot", {
      p_ids: [],
      p_archiver: true,
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });
});

describe("Un lot qui déborde", () => {
  /**
   * LE CŒUR DE LA SUITE. Quatre commandes d'Alice et UNE de Bob : sous RLS,
   * l'`update` ne toucherait que les quatre et rendrait « 4 » sans erreur.
   * L'écran dirait « lot archivé ». La fonction doit REFUSER, et surtout ne
   * laisser AUCUNE des quatre archivée.
   */
  test("une seule commande étrangère annule TOUT le lot", async () => {
    const melange = [...commandesAlice.slice(0, 4), commandeBob];

    const { error } = await alice.client.rpc("archiver_lot", {
      p_ids: melange,
      p_archiver: true,
    });

    expect(error, "le lot a été accepté alors qu'il déborde").not.toBeNull();
    expect(error?.code, `code inattendu : ${error?.code}`).toBe("DL038");

    // ET RIEN N'A BOUGÉ. C'est la moitié qui compte : un refus qui laisse
    // quatre commandes archivées est exactement le défaut qu'on cherche.
    expect(await archivees(commandesAlice), "des commandes sont restées archivées").toBe(0);
    expect(await archivees([commandeBob]), "la commande d'un autre a été touchée").toBe(0);
  });

  test("un identifiant inexistant annule le lot de la même façon", async () => {
    // Hors du cas motivant : ce n'est plus une question d'isolation mais de
    // sélection périmée — la commande a été supprimée entre l'affichage de la
    // liste et le clic. Le vendeur doit l'apprendre, pas archiver quatre lignes
    // sur cinq en croyant en avoir rangé cinq.
    const melange = [...commandesAlice.slice(0, 3), "3f2504e0-4f89-11d3-9a0c-0305e82c3301"];

    const { error } = await alice.client.rpc("archiver_lot", {
      p_ids: melange,
      p_archiver: true,
    });

    expect(error, "un identifiant inconnu est passé").not.toBeNull();
    expect(await archivees(commandesAlice)).toBe(0);
  });

  test("le message ne révèle PAS quelles commandes sont hors de portée", async () => {
    const melange = [...commandesAlice.slice(0, 2), commandeBob];
    const { error } = await alice.client.rpc("archiver_lot", {
      p_ids: melange,
      p_archiver: true,
    });

    // Nommer les identifiants refusés confirmerait l'existence des commandes
    // d'un autre vendeur à qui en devine les identifiants. Le message dit
    // COMBIEN, ce qui suffit à l'écran pour être honnête.
    expect(error?.message ?? "").not.toContain(commandeBob);
  });
});

describe("Ce que le lot ne permet pas", () => {
  test("Bob ne peut pas archiver les commandes d'Alice", async () => {
    const { error } = await bob.client.rpc("archiver_lot", {
      p_ids: commandesAlice,
      p_archiver: true,
    });
    expect(error, "un vendeur a archivé le lot d'un autre").not.toBeNull();
    expect(await archivees(commandesAlice)).toBe(0);
  });

  test("`anon` ne peut pas l'exécuter du tout", async () => {
    const { clientAnonyme } = await import("../aide/utilisateurs");
    const { error } = await clientAnonyme().rpc("archiver_lot", {
      p_ids: commandesAlice,
      p_archiver: true,
    });
    expect(error, "anon a pu appeler l'archivage par lot").not.toBeNull();
  });

  test("un lot au-delà du plafond est refusé EN BASE", async () => {
    // Le plafond vit dans la fonction et pas seulement dans l'écran : une borne
    // posée côté application est une borne que le prochain appelant n'aura pas.
    // DES IDENTIFIANTS DISTINCTS, et ce détail vient d'un défaut réel : la
    // sélection est désormais DÉDOUBLONNÉE avant d'être comptée, parce qu'un
    // doublon faisait annoncer « hors de portée » pour des commandes qui étaient
    // bien à soi. Deux cent une fois le même identifiant ne décrivent donc plus
    // un lot de deux cent un — et ce contrôle ne prouvait plus le plafond.
    const trop = Array.from(
      { length: 201 },
      (_, i) => `3f2504e0-4f89-11d3-9a0c-${String(i).padStart(12, "0")}`,
    );
    const { error } = await alice.client.rpc("archiver_lot", {
      p_ids: trop,
      p_archiver: true,
    });
    expect(error?.code, `code inattendu : ${error?.code}`).toBe("DL037");
  });
});

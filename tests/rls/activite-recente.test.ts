import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { lireActiviteRecente } from "@/lib/analyses/recente";
import { referenceCourte } from "@/lib/commandes/reference";
import type { ClientLecture } from "@/lib/analyses/activite";

/**
 * L'ACTIVITÉ RÉCENTE DU TABLEAU DE BORD — appelée pour de vrai, 23/09/2026.
 *
 * Son exception de couverture disait « servie par /fr/analyses, que la fumée
 * rend ». Une page qui rend ne dit pas QUELLES lignes elle montre. Ce panneau lit
 * `order_events` sous la session du vendeur : ce qu'il faut établir, c'est qu'il
 * ne montre QUE ses commandes, dans la fenêtre demandée, les plus récentes
 * d'abord, et pas plus que la limite.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commandesAlice: string[] = [];
let commandeBob = "";

async function creer(u: UtilisateurDeTest, n: number): Promise<string[]> {
  const { data, error } = await u.client
    .from("orders")
    .insert(Array.from({ length: n }, (_, i) => ({ shop_id: u.shopId, customer_label: "recente " + String(i) })))
    .select("id");
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  return (data as { id: string }[]).map((l) => l.id);
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("recente-alice");
  bob = await creerUtilisateur("recente-bob");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; ce test mesure la limite d'affichage (5) sur 7 commandes,
  // pas le quota.
  await passerEnPro(alice);
  commandesAlice = await creer(alice, 7);
  commandeBob = (await creer(bob, 1))[0] as string;

  // Des événements RÉELS, écrits par le produit : l'archivage par lot en trace un
  // par commande.
  const a = await alice.client.rpc("archiver_lot", { p_ids: commandesAlice, p_archiver: true });
  expect(a.error, a.error?.message).toBeNull();
  const b = await bob.client.rpc("archiver_lot", { p_ids: [commandeBob], p_archiver: true });
  expect(b.error, b.error?.message).toBeNull();

  // Une commande d'Alice est vieillie hors de la fenêtre de sept jours.
  await interroger(
    catalogue,
    "update public.order_events set occurred_at = now() - interval '12 days' where order_id = $1",
    [commandesAlice[0]],
  );
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
}, 60_000);

describe("L'activité récente", () => {
  test("CONTRE-TEST : le vendeur voit ses propres événements, au plus la limite", async () => {
    const faits = await lireActiviteRecente(alice.client as ClientLecture, "30j", new Date(), 20);
    expect(faits).not.toBeNull();
    const commandes = new Set((faits ?? []).map((f) => f.commandeId));
    for (const id of commandesAlice) expect(commandes.has(id), id).toBe(true);
    expect((await lireActiviteRecente(alice.client as ClientLecture, "30j", new Date()))?.length).toBe(5);
  });

  test("⚠️ AUCUN ÉVÉNEMENT D'UN AUTRE VENDEUR", async () => {
    const faits = await lireActiviteRecente(alice.client as ClientLecture, "90j", new Date(), 100);
    expect((faits ?? []).map((f) => f.commandeId)).not.toContain(commandeBob);
  });

  test("la fenêtre est respectée : un événement de douze jours sort des sept derniers", async () => {
    const sept = await lireActiviteRecente(alice.client as ClientLecture, "7j", new Date(), 100);
    expect((sept ?? []).map((f) => f.commandeId)).not.toContain(commandesAlice[0]);
    const trente = await lireActiviteRecente(alice.client as ClientLecture, "30j", new Date(), 100);
    expect((trente ?? []).map((f) => f.commandeId)).toContain(commandesAlice[0]);
  });

  test("les plus récents d'abord, et la référence est celle que montre la liste", async () => {
    const faits = (await lireActiviteRecente(alice.client as ClientLecture, "30j", new Date(), 100)) ?? [];
    const instants = faits.map((f) => Date.parse(f.quand));
    expect([...instants].sort((x, y) => y - x)).toEqual(instants);
    for (const f of faits) expect(f.reference).toBe(referenceCourte(f.commandeId));
  });
});

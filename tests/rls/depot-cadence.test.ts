import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { preparerDepot, type ClientMedias } from "@/lib/commandes/medias";
import { seuil } from "@/lib/limitation/quota";

/**
 * LE TROISIÈME SEUIL DU BRIEF — les dépôts par minute.
 *
 * Le brief nomme trois plafonds : 20 sur un jeton inconnu, 120 sur un jeton
 * valide, 60 dépôts. Les deux premiers existaient ; le troisième n'avait jamais
 * été écrit. Rien ne le signalait, et c'est le point : les plafonds PAR
 * COMMANDE — 20 médias, 3 vidéos — ressemblent assez à une limite de dépôt pour
 * qu'on croie l'avoir posée. Ils bornent le RÉSULTAT, jamais le DÉBIT.
 *
 * DEUX PROPRIÉTÉS, ET ELLES SE FALSIFIENT SÉPARÉMENT :
 *   1. au-delà du plafond, la préparation est REFUSÉE ;
 *   2. le compteur est PAR VENDEUR — un vendeur saturé n'en coupe aucun autre.
 * La seconde est celle qui compte pour le fournisseur en Chine, derrière un
 * réseau partagé : comptée par adresse, la limite aurait coupé des comptes
 * légitimes entre eux.
 */

let bd: Client;
let sature: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
let commandeSature: string;
let commandeVoisin: string;

const clientDe = (u: UtilisateurDeTest) => u.client as unknown as ClientMedias;

/** Les DEUX fenêtres alignées que l'appel peut atteindre : la courante et la suivante. */
const FENETRES = `
  select to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60) as f
  union all
  select to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60 + 60)
`;

/**
 * Sature le compteur d'un vendeur sur les deux fenêtres.
 *
 * DEUX FENÊTRES ET NON UNE : la fenêtre est alignée sur la minute, donc un
 * ensemencement posé à la 59ᵉ seconde vaudrait pour une fenêtre que l'appel
 * suivant a déjà quittée. Le test passerait alors au vert sans rien prouver, et
 * une fois par minute environ. Un test qui échoue par intermittence se BORNE,
 * il ne se relance pas jusqu'au vert.
 */
async function saturer(profilId: string, compte: number): Promise<void> {
  await bd.query(
    `insert into public.rate_limit (cle, fenetre_debut, compte)
     select $1, f, $2 from (${FENETRES}) as fenetres
     on conflict (cle, fenetre_debut) do update set compte = excluded.compte`,
    [`depot:${profilId}`, compte],
  );
}

async function demander(u: UtilisateurDeTest, orderId: string) {
  return preparerDepot(clientDe(u), u.profilId, u.shopId, {
    orderId,
    typeMime: "image/jpeg",
    tailleAnnoncee: 1024,
  });
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  sature = await creerUtilisateur("depot-sature");
  voisin = await creerUtilisateur("depot-voisin");

  const creer = async (u: UtilisateurDeTest): Promise<string> => {
    const { data, error } = await u.client
      .from("orders")
      .insert({ shop_id: u.shopId })
      .select("id")
      .single();
    expect(error, `création impossible : ${error?.message}`).toBeNull();
    return (data as { id: string }).id;
  };

  commandeSature = await creer(sature);
  commandeVoisin = await creer(voisin);
}, 60_000);

afterAll(async () => {
  await bd.query("delete from public.rate_limit where cle like 'depot:%'");
  await supprimerUtilisateur(sature);
  await supprimerUtilisateur(voisin);
  await bd.end();
});

describe("Le seuil existe, et il vaut ce que le brief annonce", () => {
  test("60 dépôts par fenêtre d'une minute", () => {
    // La valeur est LUE, jamais recopiée : un test qui réécrirait 60 de son côté
    // resterait vert le jour où le produit passerait à 6.
    expect(seuil("depot")).toEqual({ plafond: 60, fenetreSecondes: 60 });
  });
});

describe("Au-delà du plafond, la préparation est refusée", () => {
  test("contre-test : sous le plafond, elle passe", async () => {
    // ⚠️ IL VIENT EN PREMIER. Une suite où tout est refusé passe à 100 % sans
    // rien prouver : il faut d'abord établir que ce chemin sait dire oui.
    await saturer(sature.profilId, 0);
    const avant = await demander(sature, commandeSature);
    expect(avant.statut, `refus inattendu : ${JSON.stringify(avant)}`).toBe("ok");
  }, 30_000);

  test("le plafond atteint, elle rend `cadence`", async () => {
    await saturer(sature.profilId, seuil("depot").plafond);
    const apres = await demander(sature, commandeSature);
    expect(apres.statut).toBe("echec");
    expect(apres.statut === "echec" ? apres.motif : null).toBe("cadence");
  }, 30_000);

  test("le refus tombe AVANT toute lecture de la commande", async () => {
    // La commande n'existe pas : sans le plafond en tête, la fonction irait la
    // chercher et répondrait `introuvable`. Le motif rendu prouve donc l'ORDRE,
    // qui est toute la raison d'être du contrôle — un plafond appliqué après la
    // dépense qu'il prétend éviter n'en est pas un.
    await saturer(sature.profilId, seuil("depot").plafond);
    const refus = await demander(sature, "00000000-0000-4000-8000-000000000000");
    expect(refus.statut === "echec" ? refus.motif : null).toBe("cadence");
  }, 30_000);
});

describe("Le compteur est PAR VENDEUR", () => {
  test("un vendeur saturé n'en coupe aucun autre", async () => {
    await saturer(sature.profilId, seuil("depot").plafond);
    await saturer(voisin.profilId, 0);

    const bloque = await demander(sature, commandeSature);
    expect(bloque.statut === "echec" ? bloque.motif : null).toBe("cadence");

    const passe = await demander(voisin, commandeVoisin);
    expect(
      passe.statut,
      "le voisin est coupé par la saturation d'un autre compte : le compteur " +
        "n'est pas keyé sur le vendeur",
    ).toBe("ok");
  }, 30_000);
});

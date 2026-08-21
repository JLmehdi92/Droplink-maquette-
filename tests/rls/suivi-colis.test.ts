import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LE SUIVI DE COLIS, CÔTÉ BASE.
 *
 * Deux propriétés portent tout le reste, et aucune des deux ne vit dans du code
 * applicatif :
 *
 *  1. LE STATUT NE RECULE JAMAIS, garanti par `greatest()` sur l'énumération.
 *     Il y aura au moins deux chemins d'écriture — la notification poussée et la
 *     tâche de fond — et une règle applicative peut être oubliée dans le second.
 *  2. UN NUMÉRO EST UNIQUE PAR VENDEUR, pas globalement. Un revendeur et son
 *     fournisseur suivent le MÊME colis : une unicité globale aurait attribué au
 *     second le colis du premier, avec ses points de passage.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

const NUMERO = "LX-SUIVI-TEST-0001";

async function colisDe(utilisateur: UtilisateurDeTest): Promise<{
  id: string;
  statut: string;
  premier: string | null;
  dernier: string | null;
  vides: number;
  interrogations: number;
}> {
  const lignes = await interroger<{
    id: string;
    normalized_status: string;
    first_movement_at: string | null;
    last_movement_at: string | null;
    empty_count: number;
    query_count: number;
  }>(
    catalogue,
    `select id, normalized_status, first_movement_at, last_movement_at, empty_count, query_count
     from public.tracked_parcels where shop_id = $1 and tracking_number = $2`,
    [utilisateur.shopId, NUMERO],
  );
  const l = lignes[0];
  if (l === undefined) throw new Error("colis introuvable : la sonde vise à côté");
  // Le pilote rend des objets `Date`, pas des chaînes : comparer deux `Date`
  // avec `toBe` compare l'IDENTITÉ, et deux instants égaux échouent. Normalisé
  // ici plutôt qu'à chaque comparaison — sinon la première oubliée passe.
  const iso = (v: unknown): string | null =>
    v === null || v === undefined ? null : new Date(v as string).toISOString();

  return {
    id: l.id,
    statut: l.normalized_status,
    premier: iso(l.first_movement_at),
    dernier: iso(l.last_movement_at),
    vides: Number(l.empty_count),
    interrogations: Number(l.query_count),
  };
}

async function appliquer(
  etape: string,
  statutBrut: string,
  points: { instant: string; description: string; lieu?: string }[],
): Promise<number> {
  const lignes = await interroger<{ n: number }>(
    catalogue,
    "select public.appliquer_etat_colis($1, $2::public.parcel_status, $3, $4, $5::jsonb, $6, $7, $8::jsonb) as n",
    [
      NUMERO,
      etape,
      statutBrut,
      "",
      JSON.stringify(points.map((p) => ({ ...p, lieu: p.lieu ?? "", etape: "" }))),
      "",
      "",
      JSON.stringify({ source: "test" }),
    ],
  );
  return Number(lignes[0]?.n ?? 0);
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("colis-alice");
  bob = await creerUtilisateur("colis-bob");

  // LES DEUX vendeurs suivent le MÊME numéro. C'est le cas normal d'un revendeur
  // et de son fournisseur, et c'est aussi le cas qui casserait une unicité
  // globale.
  for (const u of [alice, bob]) {
    await interroger(
      catalogue,
      "insert into public.tracked_parcels (shop_id, tracking_number) values ($1, $2)",
      [u.shopId, NUMERO],
    );
  }
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Un numéro par VENDEUR, pas par monde", () => {
  test("deux vendeurs peuvent suivre le même numéro", async () => {
    const a = await colisDe(alice);
    const b = await colisDe(bob);
    expect(a.id).not.toBe(b.id);
  });

  test("le même vendeur ne peut pas l'enregistrer deux fois", async () => {
    // La règle de coût rendue STRUCTURELLE : le fournisseur facture à la prise
    // en charge, et deux lignes pour un même numéro chez un même vendeur
    // paieraient deux fois le même colis.
    await expect(
      interroger(
        catalogue,
        "insert into public.tracked_parcels (shop_id, tracking_number) values ($1, $2)",
        [alice.shopId, NUMERO],
      ),
    ).rejects.toThrow();
  });
});

describe("Appliquer un état", () => {
  test("il touche TOUS les colis qui portent le numéro", async () => {
    const touches = await appliquer("en_transit", "InTransit", [
      { instant: "2026-08-10T12:00:00Z", description: "Départ du centre de tri", lieu: "Shenzhen" },
      { instant: "2026-08-09T08:00:00Z", description: "Pris en charge", lieu: "Shenzhen" },
    ]);
    expect(touches, "un seul colis a été mis à jour").toBe(2);

    for (const u of [alice, bob]) {
      const c = await colisDe(u);
      expect(c.statut).toBe("en_transit");
      expect(c.dernier).not.toBeNull();
      expect(c.premier).not.toBeNull();
    }
  });

  test("les points de passage sont dédupliqués par la CONTRAINTE", async () => {
    // Le fournisseur renvoie l'historique COMPLET à chaque appel : sans la
    // contrainte, chaque notification dupliquerait tout ce qui précède.
    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.parcel_checkpoints where parcel_id = $1",
      [(await colisDe(alice)).id],
    );

    await appliquer("en_transit", "InTransit", [
      { instant: "2026-08-10T12:00:00Z", description: "Départ du centre de tri", lieu: "Shenzhen" },
      { instant: "2026-08-09T08:00:00Z", description: "Pris en charge", lieu: "Shenzhen" },
    ]);

    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.parcel_checkpoints where parcel_id = $1",
      [(await colisDe(alice)).id],
    );
    expect(Number(apres[0]?.n)).toBe(Number(avant[0]?.n));
    expect(Number(apres[0]?.n), "aucun point : la sonde n'inspecte rien").toBe(2);
  });

  /**
   * LA PROPRIÉTÉ QUI COMPTE LE PLUS. Les transporteurs reculent : un scan tardif
   * arrive après un scan plus avancé. Un client qui a lu « en transit » et lit
   * « en préparation » le lendemain conclut que son colis s'est perdu — et écrit
   * à son vendeur, c'est-à-dire exactement ce que le produit doit tuer.
   */
  test("un état MOINS avancé ne fait pas reculer le statut", async () => {
    await appliquer("preparation", "InfoReceived", []);
    expect((await colisDe(alice)).statut, "le statut a reculé").toBe("en_transit");
  });

  test("mais un état PLUS avancé passe — sinon rien n'avancerait jamais", async () => {
    await appliquer("livre", "Delivered", [
      { instant: "2026-08-14T09:00:00Z", description: "Livré" },
    ]);
    expect((await colisDe(alice)).statut).toBe("livre");
  });

  test("un numéro inconnu ne touche rien, et ne lève pas", async () => {
    const lignes = await interroger<{ n: number }>(
      catalogue,
      "select public.appliquer_etat_colis($1, 'livre'::public.parcel_status, '', '', '[]'::jsonb, '', '', '{}'::jsonb) as n",
      ["NUMERO-QUI-NEXISTE-PAS"],
    );
    // Zéro n'est pas une erreur : le fournisseur pousse aussi pour des numéros
    // qu'on ne suit plus. Mais c'est une INFORMATION — « il répond » est la
    // propriété que tous les résidus possèdent.
    expect(Number(lignes[0]?.n)).toBe(0);
  });
});

describe("Une interrogation vide", () => {
  test("elle compte dans le COÛT sans rien déplacer", async () => {
    const avant = await colisDe(alice);

    const lignes = await interroger<{ n: number }>(
      catalogue,
      "select public.compter_interrogation_vide($1) as n",
      [NUMERO],
    );
    expect(Number(lignes[0]?.n)).toBe(2);

    const apres = await colisDe(alice);
    expect(apres.interrogations, "le coût n'a pas été compté").toBe(avant.interrogations + 1);
    expect(apres.vides).toBe(avant.vides + 1);
    // Rien d'autre ne bouge : un « pas encore scanné » qui écraserait
    // `last_movement_at` ferait paraître immobile un colis en transit.
    expect(apres.statut).toBe(avant.statut);
    expect(apres.dernier).toBe(avant.dernier);
  });
});

describe("Qui peut lire, qui peut écrire", () => {
  test("un vendeur lit SES colis et pas ceux des autres", async () => {
    const sien = await alice.client.from("tracked_parcels").select("id, tracking_number");
    expect(sien.error).toBeNull();
    expect((sien.data ?? []).length, "le vendeur ne voit pas son colis").toBe(1);

    // Le colis de Bob porte le MÊME numéro : si l'isolation était mal posée,
    // Alice en verrait deux.
    expect((sien.data as { id: string }[])[0]?.id).toBe((await colisDe(alice)).id);
  });

  test("un vendeur ne peut RIEN écrire sur un colis", async () => {
    // L'écriture vient du transporteur. Un vendeur qui pourrait écrire ses
    // propres points de passage raconterait à son client une expédition qui n'a
    // pas eu lieu.
    const avant = await colisDe(alice);

    const maj = await alice.client
      .from("tracked_parcels")
      .update({ normalized_status: "preparation" })
      .eq("id", avant.id);
    expect((await colisDe(alice)).statut, `écriture acceptée : ${maj.error?.message ?? "aucune"}`).toBe(
      avant.statut,
    );

    const insertion = await alice.client.from("parcel_checkpoints").insert({
      parcel_id: avant.id,
      occurred_at: new Date().toISOString(),
      description: "Livré (inventé par le vendeur)",
    });
    expect(insertion.error, "un vendeur a pu écrire un point de passage").not.toBeNull();
  });

  test("les réponses BRUTES ne sont lisibles par personne d'autre que le système", async () => {
    // Elles contiennent des champs que nous n'exposons pas, et leur seul usage
    // est le diagnostic. Ce qui n'est pas lisible ne peut pas fuiter.
    const lecture = await alice.client.from("tracking_snapshots").select("*").limit(1);
    const vide = lecture.error !== null || (lecture.data ?? []).length === 0;
    expect(vide, "un vendeur lit les réponses brutes du fournisseur").toBe(true);

    // Contre-test : elles EXISTENT bien. Sans lui, « personne ne les lit » serait
    // vrai parce qu'il n'y a rien à lire.
    const service = clientService();
    const brutes = await service.from("tracking_snapshots").select("id").limit(1);
    expect((brutes.data ?? []).length, "aucune réponse brute enregistrée").toBeGreaterThan(0);
  });

  test("`anon` ne touche rien du suivi", async () => {
    const anonyme = clientAnonyme();

    for (const table of ["tracked_parcels", "parcel_checkpoints", "tracking_snapshots"] as const) {
      const { data, error } = await anonyme.from(table).select("*").limit(1);
      const vide = error !== null || (data ?? []).length === 0;
      expect(vide, `anon a pu lire ${table}`).toBe(true);
    }

    const appel = await anonyme.rpc("appliquer_etat_colis", {
      p_numero: NUMERO,
      p_etape: "livre",
      p_statut_brut: "",
      p_transporteur: "",
      p_points: [],
      p_estimation_du: "",
      p_estimation_au: "",
      p_brut: {},
    });
    expect(appel.error, "anon a pu écrire l'état d'un colis").not.toBeNull();
  });

  test("le droit d'exécution est retiré DANS LE CATALOGUE", async () => {
    const lignes = await interroger<{ beneficiaire: string }>(
      catalogue,
      `select coalesce(a.grantee::regrole::text, 'PUBLIC') as beneficiaire
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace,
            aclexplode(p.proacl) a
       where n.nspname = 'public'
         and p.proname in ('appliquer_etat_colis', 'compter_interrogation_vide')
         and a.privilege_type = 'EXECUTE'`,
    );
    const ouverts = lignes
      .map((l) => l.beneficiaire)
      .filter((r) => r === "PUBLIC" || r === "anon" || r === "authenticated");
    expect(ouverts, "l'écriture du suivi est exécutable trop largement").toEqual([]);
  });
});

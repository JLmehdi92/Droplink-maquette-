import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  decoderCurseur,
  encoderCurseur,
  listerCommandesAdmin,
  PAR_PAGE,
  type ParametresCommandes,
} from "@/lib/audit/commandes";
import { referenceCourte } from "@/lib/commandes/reference";

/**
 * LES COMMANDES DE LA PLATEFORME, VUES PAR L'ADMINISTRATION (migrations 159-160).
 *
 * Quatre propriétés :
 *  1. SEUL UN ADMINISTRATEUR LIT, et un vendeur n'apprend pas que la surface existe.
 *  2. AUCUN CONTENU NE SORT — contrôlé par VALEUR : pseudo et adresse du client,
 *     référence produit, note interne, jeton public.
 *  3. CHAQUE PAGE ÉCRIT UNE ENTRÉE D'AUDIT portant ses critères.
 *  4. LES FILTRES FILTRENT, et un filtre inconnu est REFUSÉ plutôt qu'ignoré.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
let catalogue: Client;

const AUCUNE_EMPREINTE = "";
const SANS_FILTRE: ParametresCommandes = { q: "", statut: "", jours: "", curseur: null };
/** Les comptes de CETTE suite : parcourir toute la base de tests écrirait une
 *  entrée d'audit par page, pour des lignes que d'autres suites écrivent en même temps. */
const DU_JEU: ParametresCommandes = { ...SANS_FILTRE, q: "test-commandes-" };

const SENTINELLES = {
  client: "sentinelle-client-8f3a1c",
  email: "sentinelle-8f3a1c@client.invalid",
  produit: "sentinelle-produit-8f3a1c",
  note: "sentinelle-note-prix-achat-8f3a1c",
};

let commandeLivree: string;
let commandeVoisine: string;
let brouillon: string;

async function creerCommande(
  shopId: string,
  champs: { client: string; statut?: string; creeeIlYA?: string },
): Promise<string> {
  const lignes = await interroger<{ id: string }>(
    catalogue,
    `insert into public.orders (shop_id, customer_label, product_ref, internal_notes, notify_email, status, created_at)
     values ($1, $2, $3, $4, $5, coalesce($6, 'preparation')::public.order_status,
             now() - coalesce($7, '0 minutes')::interval)
     returning id`,
    [
      shopId,
      champs.client,
      SENTINELLES.produit,
      SENTINELLES.note,
      SENTINELLES.email,
      champs.statut ?? null,
      champs.creeeIlYA ?? null,
    ],
  );
  const id = lignes[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("commandes-admin");
  vendeur = await creerUtilisateur("commandes-vendeur");
  voisin = await creerUtilisateur("commandes-voisin");

  /*
   * ⚠️ `pro`, parce que la pagination par curseur ne se mesure qu'au-delà
   * d'une page — donc bien au-delà des quinze commandes À VIE d'un compte
   * gratuit (migration 176). Le quota a sa propre suite.
   */
  await passerEnPro(vendeur);
  await passerEnPro(voisin);

  await promouvoirAdmin(catalogue, admin);
  await interroger(catalogue, "update public.shops set name = $2 where id = $1", [
    vendeur.shopId,
    "Crème Brûlée Studio",
  ]);

  commandeLivree = await creerCommande(vendeur.shopId, {
    client: SENTINELLES.client,
    statut: "livre",
  });
  await creerCommande(vendeur.shopId, { client: "client-ancien", creeeIlYA: "20 days" });
  commandeVoisine = await creerCommande(voisin.shopId, {
    client: "client-voisin",
    statut: "en_transit",
  });

  // UN BROUILLON : aucune colonne de contenu, donc pas de `first_content_at`.
  const b = await interroger<{ id: string }>(
    catalogue,
    "insert into public.orders (shop_id) values ($1) returning id",
    [voisin.shopId],
  );
  brouillon = b[0]?.id ?? "";
}, 180_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(voisin);
  await catalogue.end();
});

/** Toutes les pages, en suivant le curseur — la liste réelle, pas la première page. */
async function toutesLesLignes(parametres: ParametresCommandes) {
  const lignes = [];
  let curseur: string | null = null;
  for (let tour = 0; tour < 200; tour++) {
    const page = await listerCommandesAdmin(
      admin.client,
      { ...parametres, curseur },
      AUCUNE_EMPREINTE,
    );
    lignes.push(...page.lignes);
    if (page.curseurSuivant === null) return lignes;
    curseur = page.curseurSuivant;
  }
  throw new Error("la pagination ne s'arrête pas");
}

describe("Qui peut lire la liste", () => {
  test("un vendeur est refusé", async () => {
    await expect(
      listerCommandesAdmin(vendeur.client, SANS_FILTRE, AUCUNE_EMPREINTE),
    ).rejects.toThrow(/impossible/i);
  });

  test("et le refus ne dit pas que la surface existe (DL031, « introuvable »)", async () => {
    const { error } = await vendeur.client.rpc("lister_commandes_admin", {
      p_recherche: "",
      p_statut: "",
      p_jours: "",
      p_curseur_date: "",
      p_curseur_id: "",
      p_limite: 10,
      p_ip_hash: "",
    });
    expect(error?.code).toBe("DL031");
  });

  test("contre-test positif : l'administrateur lit les commandes de DEUX vendeurs", async () => {
    const ids = (await toutesLesLignes({ ...SANS_FILTRE, q: "commandes-" })).map((l) => l.id);
    expect(ids).toContain(commandeLivree);
    expect(ids).toContain(commandeVoisine);
  });
});

describe("Ce que la liste ne rend PAS", () => {
  test("aucun contenu de commande ne sort, contrôlé PAR VALEUR", async () => {
    const jetons = await interroger<{ t: string; u: string }>(
      catalogue,
      "select public_token as t, unsubscribe_token as u from public.orders where shop_id = any($1)",
      [[vendeur.shopId, voisin.shopId]],
    );
    // Un ensemble vide passe tout.
    expect(jetons.length).toBeGreaterThan(0);

    const rendu = JSON.stringify(await toutesLesLignes(DU_JEU));

    for (const j of jetons) {
      expect(rendu.includes(j.t), "un public_token est sorti de la liste").toBe(false);
      expect(rendu.includes(j.u), "un jeton de désabonnement est sorti").toBe(false);
    }
    for (const [nom, valeur] of Object.entries(SENTINELLES)) {
      expect(rendu, `la sentinelle « ${nom} » est sortie`).not.toContain(valeur);
    }
  });

  test("CONTRE-TEST : les lignes éprouvées sont bien dans ce rendu", async () => {
    // Sans lui, une liste qui ne rendrait RIEN passerait le contrôle précédent.
    const ids = (await toutesLesLignes(DU_JEU)).map((l) => l.id);
    expect(ids).toContain(commandeLivree);
  });

  test("un brouillon sans contenu réel n'est pas une commande de la plateforme", async () => {
    const ids = (await toutesLesLignes(DU_JEU)).map((l) => l.id);
    expect(ids, "un brouillon a été listé").not.toContain(brouillon);
  });

  test("la référence courte est celle que le vendeur lit dans son écran", async () => {
    const ligne = (await toutesLesLignes({ ...SANS_FILTRE, q: "creme brulee" })).find(
      (l) => l.id === commandeLivree,
    );
    expect(ligne?.reference).toBe(referenceCourte(commandeLivree));
  });
});

describe("Les filtres", () => {
  test("la recherche par boutique est INSENSIBLE AUX ACCENTS", async () => {
    const lignes = await toutesLesLignes({ ...SANS_FILTRE, q: "creme brulee" });
    expect(lignes.map((l) => l.id)).toContain(commandeLivree);
    expect(lignes.map((l) => l.id), "une commande d'une autre boutique est passée").not.toContain(
      commandeVoisine,
    );
  });

  test("la recherche trouve une commande par sa RÉFÉRENCE COURTE, dièse compris", async () => {
    const lignes = await toutesLesLignes({ ...SANS_FILTRE, q: referenceCourte(commandeVoisine) });
    expect(lignes.map((l) => l.id)).toContain(commandeVoisine);
    expect(lignes.map((l) => l.id)).not.toContain(commandeLivree);
  });

  test("le statut ne rend QUE ce statut", async () => {
    const lignes = await toutesLesLignes({ ...SANS_FILTRE, q: "commandes-", statut: "livre" });
    expect(lignes.map((l) => l.id)).toContain(commandeLivree);
    expect(lignes.every((l) => l.statut === "livre"), "un autre statut est passé").toBe(true);
    expect(lignes.map((l) => l.id)).not.toContain(commandeVoisine);
  });

  test("la fenêtre de 7 jours écarte la commande créée il y a 20 jours", async () => {
    const tout = await toutesLesLignes({ ...SANS_FILTRE, q: "creme brulee" });
    const recentes = await toutesLesLignes({ ...SANS_FILTRE, q: "creme brulee", jours: "7" });
    // Le contre-test d'abord : sans fenêtre, les DEUX commandes sont là.
    expect(tout.length).toBe(2);
    expect(recentes.map((l) => l.id)).toEqual([commandeLivree]);
  });

  test("un statut ou une fenêtre INCONNUS sont refusés par la base, jamais ignorés", async () => {
    for (const [p_statut, p_jours] of [
      ["annulee", ""],
      ["", "365"],
      ["", "-1"],
    ] as const) {
      const { error } = await admin.client.rpc("lister_commandes_admin", {
        p_recherche: "",
        p_statut,
        p_jours,
        p_curseur_date: "",
        p_curseur_id: "",
        p_limite: 10,
        p_ip_hash: "",
      });
      expect(error?.code, `filtre accepté : statut « ${p_statut} », jours « ${p_jours} »`).toBe(
        "DL055",
      );
    }
  });
});

describe("La pagination par curseur", () => {
  test("la liste est triée du plus récent au plus ancien, sans doublon entre les pages", async () => {
    const lignes = await toutesLesLignes(DU_JEU);
    const ids = lignes.map((l) => l.id);
    expect(new Set(ids).size, "une ligne est revenue sur deux pages").toBe(ids.length);
    const dates = lignes.map((l) => Date.parse(l.creeLe));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  test("la frontière d'une page se franchit sans rien perdre ni répéter", async () => {
    // UNE BOUTIQUE À PLUS D'UNE PAGE, et comptée par sa propre adresse : les
    // autres suites écrivent des commandes en même temps, donc un total de la
    // plateforme ne serait jamais stable. Toutes à la MÊME seconde, pour que le
    // départage par identifiant soit ce qui tient la frontière.
    await interroger(
      catalogue,
      `insert into public.orders (shop_id, customer_label, created_at)
       select $1, 'lot-' || n, date_trunc('second', now()) - interval '1 hour'
         from generate_series(1, $2::int) n`,
      [voisin.shopId, PAR_PAGE + 5],
    );

    const premiere = await listerCommandesAdmin(
      admin.client,
      { ...SANS_FILTRE, q: voisin.email },
      AUCUNE_EMPREINTE,
    );
    expect(premiere.lignes.length, "la première page n'est pas pleine").toBe(PAR_PAGE);
    expect(premiere.curseurSuivant, "aucune frontière à franchir").not.toBeNull();

    const lignes = await toutesLesLignes({ ...SANS_FILTRE, q: voisin.email });
    const ids = lignes.map((l) => l.id);
    // 55 du lot + la commande en transit ; le brouillon n'en est pas.
    expect(ids.length).toBe(PAR_PAGE + 5 + 1);
    expect(new Set(ids).size, "une ligne est revenue sur deux pages").toBe(ids.length);
  });

  test("l'instant du curseur garde ses MICROSECONDES", () => {
    const instant = "2026-09-14T10:11:12.345678+00:00";
    const id = "0b7c1f1e-1111-4222-8333-444455556666";
    expect(decoderCurseur(encoderCurseur(instant, id))).toEqual({ instant, id });
  });

  test("un curseur forgé est refusé avant d'atteindre la requête", () => {
    for (const forge of ["2026-09-14),(1", "demain", "1e9", ""]) {
      const code = Buffer.from(`${forge}|0b7c1f1e-1111-4222-8333-444455556666`).toString("base64url");
      expect(decoderCurseur(code), `curseur accepté : ${forge}`).toBeNull();
    }
    const idForge = Buffer.from("2026-09-14T10:11:12Z|1,2").toString("base64url");
    expect(decoderCurseur(idForge)).toBeNull();
  });
});

describe("La consultation est tracée", () => {
  test("UNE entrée par page, portant ses critères", async () => {
    const compter = async (): Promise<number> => {
      const l = await interroger<{ n: string }>(
        catalogue,
        "select count(*) as n from public.admin_audit_log where action = 'commandes.liste'",
      );
      return Number(l[0]?.n ?? 0);
    };
    const avant = await compter();

    await listerCommandesAdmin(
      admin.client,
      { q: "creme", statut: "livre", jours: "30", curseur: null },
      "empreinte-de-test",
    );

    expect(await compter(), "le nombre d'entrées écrites ne vaut pas un").toBe(avant + 1);

    const trace = await interroger<{
      payload: { recherche?: string; statut?: string; jours?: number };
      ip_hash: string | null;
    }>(
      catalogue,
      `select payload, ip_hash from public.admin_audit_log
        where action = 'commandes.liste' order by occurred_at desc limit 1`,
    );
    expect(trace[0]?.payload).toMatchObject({ recherche: "creme", statut: "livre", jours: 30 });
    expect(trace[0]?.ip_hash).toBe("empreinte-de-test");
  });

  test("un refus n'écrit rien : le vendeur ne remplit pas le journal", async () => {
    const l = async () =>
      Number(
        (
          await interroger<{ n: string }>(
            catalogue,
            "select count(*) as n from public.admin_audit_log where action = 'commandes.liste'",
          )
        )[0]?.n ?? 0,
      );
    const avant = await l();
    await expect(
      listerCommandesAdmin(vendeur.client, SANS_FILTRE, AUCUNE_EMPREINTE),
    ).rejects.toThrow();
    expect(await l()).toBe(avant);
  });
});

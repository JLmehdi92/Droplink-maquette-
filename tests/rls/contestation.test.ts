import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { clientAnonyme, creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { bloquerLienCommande, debloquerLienCommande } from "@/lib/audit/blocage-lien";
import {
  contestationsEnAttenteParmi,
  lireAlerteContestations,
  lireContestationAdmin,
  refuserContestation,
} from "@/lib/audit/contestation";
import { referenceCourte } from "@/lib/commandes/reference";
import { cleContestationAppartient, contester, lireEtatBlocage } from "@/lib/commandes/contestation";

/**
 * LA CONTESTATION D'UN LIEN BLOQUÉ — décision de Wassim, 19/09/2026 (migration 168).
 *
 * Le vendeur VOIT le blocage et le CONTESTE (explication obligatoire, image facultative) ;
 * l'administrateur lit — tracé — et débloque ou refuse avec une réponse que le vendeur lit.
 *
 * Les défaillances à craindre sont silencieuses : un vendeur qui lirait la contestation d'un
 * autre, qui en empilerait sans fin, qui choisirait la clé d'image d'un tiers ; un administrateur
 * qui lirait sans trace ; un dossier qui resterait « en attente » sur un lien débloqué ; une
 * image qui survivrait à sa commande. Chacune est éprouvée par l'EFFET, sur la base de tests.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let autre: UtilisateurDeTest;
let catalogue: Client;
let commandeId: string;
let jeton: string;
let commandeAutre: string;

const IP = "empreinte-contestation-0123456789ab";
const MOTIF = "Signalement d un ayant droit, dossier 2026-230";
const EXPLICATION = "Ce produit est le mien, voici la facture d achat du fournisseur.";

// Identifiants FACTICES : signer une URL est un calcul local (voir tests/unit/storage.test.ts).
const ENV_FACTICE = {
  R2_ACCOUNT_ID: "compte-de-test",
  R2_ACCESS_KEY_ID: "cle-acces-de-test",
  R2_SECRET_ACCESS_KEY: "secret-de-test-suffisamment-long",
  R2_BUCKET: "bucket-de-test",
} as const;
const sauvegarde: Record<string, string | undefined> = {};

async function creerCommande(u: UtilisateurDeTest, client: string): Promise<{ id: string; public_token: string }> {
  const { data } = await u.client
    .from("orders")
    .insert({ shop_id: u.shopId, customer_label: client })
    .select("id, public_token")
    .single();
  return data as { id: string; public_token: string };
}

beforeAll(async () => {
  for (const [nom, valeur] of Object.entries(ENV_FACTICE)) {
    sauvegarde[nom] = process.env[nom];
    process.env[nom] = valeur;
  }
  const { oublierConfigR2 } = await import("@/lib/storage/config");
  oublierConfigR2();

  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("contest-admin");
  vendeur = await creerUtilisateur("contest-vendeur");
  autre = await creerUtilisateur("contest-autre");
  await promouvoirAdmin(catalogue, admin);

  const c = await creerCommande(vendeur, "Client de la contestation");
  commandeId = c.id;
  jeton = c.public_token;
  commandeAutre = (await creerCommande(autre, "Client d un autre vendeur")).id;
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(autre);
  await catalogue.end();
  for (const [nom, valeur] of Object.entries(sauvegarde)) {
    if (valeur === undefined) delete process.env[nom];
    else process.env[nom] = valeur;
  }
  const { oublierConfigR2 } = await import("@/lib/storage/config");
  oublierConfigR2();
});

async function statutsEnBase(): Promise<string[]> {
  const l = await interroger<{ s: string }>(
    catalogue,
    "select status::text as s from public.link_contests where order_id = $1 order by created_at",
    [commandeId],
  );
  return l.map((x) => x.s);
}

describe("Avant tout blocage", () => {
  test("CONTRE-TEST : le vendeur voit sa commande NON bloquée", async () => {
    expect(await lireEtatBlocage(vendeur.client, commandeId)).toEqual({ bloque: false });
  });

  test("on ne conteste pas un lien qui n'est pas bloqué", async () => {
    const r = await contester(vendeur.client, vendeur.shopId, { commandeId, message: EXPLICATION, cleImage: null });
    expect(r).toEqual({ statut: "erreur", motif: "non-bloque" });
  });
});

describe("Le vendeur voit le blocage et le conteste", () => {
  test("bloquée par l'administration, la commande le dit à son vendeur", async () => {
    expect((await bloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP)).statut).toBe("ok");
    const etat = await lireEtatBlocage(vendeur.client, commandeId);
    expect(etat?.bloque, "le vendeur ne voit pas que son lien est bloqué").toBe(true);
    if (etat?.bloque) {
      expect(etat.peutContester).toBe(true);
      expect(etat.restantes).toBe(3);
      // « Oui on montre la raison au vendeur » (Wassim, 20/09/2026, migration 169).
      expect(etat.motif, "le vendeur ne lit pas pourquoi son lien est bloqué").toBe(MOTIF);
    }
  });

  test("le vendeur ne réécrit pas le motif du blocage", async () => {
    await vendeur.client
      .from("orders")
      .update({ admin_block_reason: "Ce n est pas vrai" } as never)
      .eq("id", commandeId);
    const l = await interroger<{ r: string | null }>(
      catalogue,
      "select admin_block_reason as r from public.orders where id = $1",
      [commandeId],
    );
    expect(l[0]?.r, "un vendeur a réécrit le motif de son propre blocage").toBe(MOTIF);
  });

  test("une explication trop courte est refusée, EN BASE comme au module", async () => {
    expect((await contester(vendeur.client, vendeur.shopId, { commandeId, message: "trop court", cleImage: null })).statut).toBe(
      "erreur",
    );
    // Le module n'est pas le seul chemin : l'appel direct doit rencontrer la même borne.
    const { error } = await vendeur.client.rpc("contester_blocage", {
      p_commande: commandeId,
      p_message: "trop court",
      p_image_key: null as unknown as string,
    });
    expect(error?.code).toBe("DL064");
  });

  test("une image rangée sous une AUTRE commande est refusée par la base", async () => {
    const { error } = await vendeur.client.rpc("contester_blocage", {
      p_commande: commandeId,
      p_message: EXPLICATION,
      p_image_key: `contestations/${autre.shopId}/${commandeAutre}/aaaaaaaa-0000-4000-8000-000000000001.jpg`,
    });
    expect(error?.code, "la base a accepté l'image d'un autre vendeur").toBe("DL065");
  });

  test("le module refuse une clé hors forme ou hors de la commande, par segment", () => {
    const bonne = `contestations/${vendeur.shopId}/${commandeId}/aaaaaaaa-0000-4000-8000-000000000001.png`;
    expect(cleContestationAppartient(bonne, vendeur.shopId, commandeId)).toBe(true);
    expect(cleContestationAppartient(bonne, autre.shopId, commandeId)).toBe(false);
    expect(
      cleContestationAppartient(`contestations/${vendeur.shopId}/${commandeId}/../../medias/x.png`, vendeur.shopId, commandeId),
    ).toBe(false);
    expect(cleContestationAppartient(bonne.replace(".png", ".svg"), vendeur.shopId, commandeId)).toBe(false);
  });

  test("la contestation part, et une seconde en attente est refusée", async () => {
    const r = await contester(vendeur.client, vendeur.shopId, { commandeId, message: EXPLICATION, cleImage: null });
    expect(r).toEqual({ statut: "ok" });
    const encore = await contester(vendeur.client, vendeur.shopId, { commandeId, message: EXPLICATION, cleImage: null });
    expect(encore).toEqual({ statut: "erreur", motif: "deja" });
    expect(await statutsEnBase()).toEqual(["en_attente"]);
  });

  test("un autre vendeur ne conteste pas, ne lit pas, n'écrit pas", async () => {
    const r = await contester(autre.client, autre.shopId, { commandeId, message: EXPLICATION, cleImage: null });
    expect(r).toEqual({ statut: "erreur", motif: "introuvable" });
    const { data } = await autre.client.from("link_contests").select("id").eq("order_id", commandeId);
    expect(data ?? [], "un vendeur lit la contestation d'un autre").toEqual([]);
  });

  test("le vendeur n'écrit pas la table directement, et ne lit pas qui a tranché", async () => {
    const ecrit = await vendeur.client
      .from("link_contests")
      .update({ status: "acceptee" } as never)
      .eq("order_id", commandeId)
      .select("id");
    expect(ecrit.data ?? []).toEqual([]);
    expect(await statutsEnBase()).toEqual(["en_attente"]);
    const qui = await vendeur.client.from("link_contests").select("decided_by" as "id").eq("order_id", commandeId);
    expect(qui.error, "le vendeur lit l'identité de l'administrateur").not.toBeNull();
  });
});

describe("L'administration lit — et c'est tracé — puis répond", () => {
  test("la liste sait laquelle attend, sans rien tracer", async () => {
    const r = await contestationsEnAttenteParmi(admin.client, [commandeId, commandeAutre]);
    expect(r.statut === "ok" && [...r.ids]).toEqual([commandeId]);
    // Un vendeur n'a pas accès à cette vue d'ensemble.
    const refus = await contestationsEnAttenteParmi(vendeur.client, [commandeId]);
    expect(refus.statut).toBe("erreur");
  });

  test("l'alerte de la vue d'ensemble compte et désigne la plus ancienne, sans rien tracer (213)", async () => {
    const traces = async () =>
      Number(
        (
          await interroger<{ n: string }>(
            catalogue,
            "select count(*) as n from public.admin_audit_log where admin_id = $1",
            [admin.profilId],
          )
        )[0]?.n,
      );
    const avant = await traces();
    const r = await lireAlerteContestations(admin.client);
    // La vérité, lue par le catalogue : la base de tests peut porter d'autres dossiers.
    const attendu = await interroger<{ n: string; commande: string; le: Date }>(
      catalogue,
      `select (select count(*) from public.link_contests where status = 'en_attente') as n,
              order_id as commande, created_at as le
         from public.link_contests where status = 'en_attente'
        order by created_at, id limit 1`,
    );
    const premiere = attendu[0];
    if (premiere === undefined) throw new Error("aucune contestation en attente : le test ne prouverait rien");
    expect(r).toEqual({
      statut: "ok",
      nombre: Number(premiere.n),
      reference: referenceCourte(premiere.commande),
      envoyeeLe: expect.any(String),
    });
    if (r.statut === "ok") expect(new Date(r.envoyeeLe).getTime()).toBe(new Date(premiere.le).getTime());
    expect(await traces(), "l'alerte a écrit au journal").toBe(avant);
  });

  test("un vendeur et un anonyme reçoivent le refus d'une surface inexistante (213)", async () => {
    const parVendeur = await vendeur.client.rpc("compter_contestations_en_attente_admin");
    expect(parVendeur.error?.code).toBe("DL031");
    expect(parVendeur.data).toBeNull();
    const parAnonyme = await clientAnonyme().rpc("compter_contestations_en_attente_admin");
    expect(parAnonyme.error, "un anonyme lit l'alerte").not.toBeNull();
    expect(parAnonyme.data).toBeNull();
    // Par le module : le refus devient « illisible », jamais « aucune ».
    expect(await lireAlerteContestations(vendeur.client)).toEqual({ statut: "illisible" });
  });

  test("la lecture rend l'explication, et le journal l'a consignée", async () => {
    const r = await lireContestationAdmin(admin.client, commandeId, IP);
    expect(r.statut).toBe("ok");
    if (r.statut === "ok") {
      expect(r.contestation.message).toBe(EXPLICATION);
      expect(r.contestation.rang).toBe(1);
    }
    const trace = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n from public.admin_audit_log
        where action = 'contestations.detail' and admin_id = $1`,
      [admin.profilId],
    );
    expect(Number(trace[0]?.n), "une lecture de contestation n'a laissé aucune trace").toBeGreaterThanOrEqual(1);
  });

  test("un vendeur ne lit pas par la porte de l'administration", async () => {
    expect((await lireContestationAdmin(vendeur.client, commandeId, IP)).statut).toBe("erreur");
  });

  test("refuser exige une réponse, et le vendeur la lit", async () => {
    const lue = await lireContestationAdmin(admin.client, commandeId, IP);
    const id = lue.statut === "ok" ? lue.contestation.id : "";
    expect((await refuserContestation(admin.client, { contestationId: id, reponse: "  " }, IP)).statut).toBe("erreur");
    const r = await refuserContestation(
      admin.client,
      { contestationId: id, reponse: "La facture ne correspond pas au produit signalé." },
      IP,
    );
    expect(r).toEqual({ statut: "ok" });

    const etat = await lireEtatBlocage(vendeur.client, commandeId);
    expect(etat?.bloque).toBe(true);
    if (etat?.bloque) {
      expect(etat.contestations[0]?.statut).toBe("refusee");
      expect(etat.contestations[0]?.reponse).toBe("La facture ne correspond pas au produit signalé.");
      expect(etat.peutContester, "après un refus, une nouvelle contestation doit rester possible").toBe(true);
      expect(etat.restantes).toBe(2);
    }
  });

  test("trois contestations au plus par blocage", async () => {
    for (let i = 0; i < 2; i++) {
      expect((await contester(vendeur.client, vendeur.shopId, { commandeId, message: EXPLICATION, cleImage: null })).statut).toBe(
        "ok",
      );
      const lue = await lireContestationAdmin(admin.client, commandeId, IP);
      if (lue.statut === "ok") {
        await refuserContestation(admin.client, { contestationId: lue.contestation.id, reponse: "Toujours pas suffisant." }, IP);
      }
    }
    const quatrieme = await contester(vendeur.client, vendeur.shopId, { commandeId, message: EXPLICATION, cleImage: null });
    expect(quatrieme, "une quatrième contestation du même blocage est passée").toEqual({
      statut: "erreur",
      motif: "plafond",
    });
  });
});

describe("Débloquer clôt le dossier, sur le même lien", () => {
  test("un nouveau blocage ouvre un nouveau dossier, que le déblocage clôt en « acceptée »", async () => {
    expect((await debloquerLienCommande(admin.client, { commandeId, motif: "Levée après vérification" }, IP)).statut).toBe("ok");
    expect((await bloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP)).statut).toBe("ok");
    const etat = await lireEtatBlocage(vendeur.client, commandeId);
    expect(etat?.bloque && etat.restantes, "le nouveau blocage a hérité du plafond de l'ancien").toBe(3);

    expect((await contester(vendeur.client, vendeur.shopId, { commandeId, message: EXPLICATION, cleImage: null })).statut).toBe("ok");
    expect((await debloquerLienCommande(admin.client, { commandeId, motif: "Contestation fondée" }, IP)).statut).toBe("ok");

    const derniere = await interroger<{ s: string; r: string | null }>(
      catalogue,
      `select status::text as s, admin_response as r from public.link_contests
        where order_id = $1 order by created_at desc limit 1`,
      [commandeId],
    );
    expect(derniere[0], "le dossier est resté « en attente » sur un lien débloqué").toEqual({
      s: "acceptee",
      r: "Contestation fondée",
    });
    expect(await lireEtatBlocage(vendeur.client, commandeId)).toEqual({ bloque: false });
    const l = await interroger<{ r: string | null }>(
      catalogue,
      "select admin_block_reason as r from public.orders where id = $1",
      [commandeId],
    );
    expect(l[0]?.r, "le motif a survécu au déblocage").toBeNull();
  });

  test("le jeton du client n'a jamais bougé", async () => {
    const l = await interroger<{ t: string }>(catalogue, "select public_token as t from public.orders where id = $1", [commandeId]);
    expect(l[0]?.t).toBe(jeton);
  });
});

describe("L'image ne survit pas à sa commande", () => {
  test("supprimer la commande met l'image de sa contestation en file de purge", async () => {
    const c = await creerCommande(vendeur, "Client a supprimer");
    await bloquerLienCommande(admin.client, { commandeId: c.id, motif: MOTIF }, IP);
    const cle = `contestations/${vendeur.shopId}/${c.id}/aaaaaaaa-0000-4000-8000-00000000c0de.webp`;
    // L'appel direct, avec une clé à la bonne forme : l'objet n'existe pas chez R2, et ce
    // n'est pas ce qu'on mesure ici — seulement que la base la retient puis la rend à la purge.
    const { error } = await vendeur.client.rpc("contester_blocage", {
      p_commande: c.id,
      p_message: EXPLICATION,
      p_image_key: cle,
    });
    expect(error).toBeNull();
    // Un vendeur n a AUCUN droit DELETE sur ses commandes : elles partent avec son compte, en
    // cascade. On supprime donc par la connexion du catalogue — la même cascade, le même déclencheur.
    await interroger(catalogue, "delete from public.orders where id = $1", [c.id]);
    const file = await interroger<{ n: string }>(catalogue, "select count(*) as n from public.purges_r2 where cle = $1", [cle]);
    expect(Number(file[0]?.n), "l'image d'une contestation a survécu à sa commande").toBe(1);
    await interroger(catalogue, "delete from public.purges_r2 where cle = $1", [cle]);
  });
});

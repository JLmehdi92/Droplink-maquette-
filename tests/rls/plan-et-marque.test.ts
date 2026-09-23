import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { definirPlanCompte, lirePlanCompte } from "@/lib/audit/plan";
import { lireCommandePublique } from "@/lib/page-publique/lecture";
import { appliquerReglagesMarque, type ReglagesMarque } from "@/lib/boutique/reglages";

/**
 * LE PLAN D'UN COMPTE ET LA MARQUE DROPLINK — décisions de Wassim, 19/09/2026 (migration 167).
 *
 * En gratuit, la page client porte la marque DropLink ; un compte Pro peut la retirer. Aucun
 * paiement ne passe par le produit : l'administration pose le plan, motif à l'appui.
 *
 * DEUX MODES DE DÉFAILLANCE, TOUS DEUX SILENCIEUX. Un vendeur gratuit qui obtient une page sans
 * marque — par un appel direct, en contournant l'écran — prive le produit de sa seule publicité
 * sans que rien ne le signale. Et un vendeur Pro dont la page garde la marque paie pour rien.
 * Le contrôle porte donc sur ce que la PAGE répond, et sur chaque chemin d'écriture.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;
let jeton: string;

const IP = "empreinte-plan-0123456789abcdef";
const MOTIF = "Paiement reçu le 19/09 par virement";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("plan-admin");
  vendeur = await creerUtilisateur("plan-vendeur");
  await promouvoirAdmin(catalogue, admin);
  const { data } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId, customer_label: "Client du plan" })
    .select("public_token")
    .single();
  jeton = (data as { public_token: string }).public_token;
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

/** Ce que « Ma marque » enregistre, à l'interrupteur près : l'écriture RÉELLE de l'écran. */
function reglages(masquerMarque: boolean | undefined): ReglagesMarque {
  return { couleurAccent: "#5b4bf5", languePublique: "fr", filigrane: false, masquerMarque };
}

/** L'interrupteur tel que la base le porte, sans passer par aucun écran. */
async function interrupteur(): Promise<boolean> {
  const l = await interroger<{ h: boolean }>(
    catalogue,
    "select hide_droplink_brand as h from public.shops where id = $1",
    [vendeur.shopId],
  );
  return l[0]?.h === true;
}

describe("En gratuit, la marque reste", () => {
  test("un compte naît gratuit, et sa page porte la marque", async () => {
    expect(await lirePlanCompte(admin.client, vendeur.profilId)).toEqual({ statut: "ok", plan: "gratuit" });
    const page = await lireCommandePublique(jeton);
    expect(page, "la page ne répond pas").not.toBeNull();
    expect(page?.boutique.marqueMasquee, "la marque est masquée pour un compte gratuit").toBe(false);
  });

  test("un vendeur gratuit ne peut pas lever l'interrupteur, même par PostgREST", async () => {
    // L'écran n'est pas le seul chemin : c'est la BASE qui refuse (déclencheur, DL059).
    const { error } = await vendeur.client
      .from("shops")
      .update({ hide_droplink_brand: true } as never)
      .eq("id", vendeur.shopId);
    expect(error?.code, "la base a laissé un compte gratuit masquer la marque").toBe("DL059");
    expect(await interrupteur()).toBe(false);
  });

  test("ni par l'écriture de « Ma marque », qui échoue au lieu de réussir à moitié", async () => {
    const ok = await appliquerReglagesMarque(vendeur.client, vendeur.shopId, reglages(true));
    expect(ok, "l'enregistrement a été annoncé réussi alors que la base l'a refusé").toBe(false);
    expect(await interrupteur()).toBe(false);
  });

  test("et il ne peut pas se passer Pro lui-même", async () => {
    await vendeur.client.from("profiles").update({ plan: "pro" } as never).eq("id", vendeur.profilId);
    const r = await definirPlanCompte(vendeur.client, { profilId: vendeur.profilId, plan: "pro", motif: MOTIF }, IP);
    expect(r).toEqual({ statut: "erreur", motif: "introuvable" });
    expect(await lirePlanCompte(admin.client, vendeur.profilId)).toEqual({ statut: "ok", plan: "gratuit" });
  });
});

describe("En Pro, le vendeur choisit", () => {
  test("l'administration passe le compte en Pro, et c'est tracé avec son motif", async () => {
    const r = await definirPlanCompte(admin.client, { profilId: vendeur.profilId, plan: "pro", motif: MOTIF }, IP);
    expect(r.statut, "le passage en Pro a échoué").toBe("ok");
    expect(await lirePlanCompte(admin.client, vendeur.profilId)).toEqual({ statut: "ok", plan: "pro" });

    const trace = await interroger<{ payload: { motif?: string; plan?: string; avant?: string } }>(
      catalogue,
      `select payload from public.admin_audit_log
        where action = 'compte.plan' and resource_id = $1 order by occurred_at desc limit 1`,
      [vendeur.profilId],
    );
    expect(trace[0]?.payload).toMatchObject({ motif: MOTIF, plan: "pro", avant: "gratuit" });
  });

  test("CONTRE-TEST : Pro sans interrupteur levé, la marque reste", async () => {
    // Le plan seul ne retire rien : c'est le vendeur qui choisit.
    expect((await lireCommandePublique(jeton))?.boutique.marqueMasquee).toBe(false);
  });

  test("Pro, il lève l'interrupteur depuis « Ma marque », et sa page perd la marque", async () => {
    const ok = await appliquerReglagesMarque(vendeur.client, vendeur.shopId, reglages(true));
    expect(ok, "un compte Pro n'a pas pu lever l'interrupteur").toBe(true);
    expect((await lireCommandePublique(jeton))?.boutique.marqueMasquee).toBe(true);
  });

  test("une écriture qui ignore l'interrupteur (l'onboarding) ne le rabaisse pas", async () => {
    // L'onboarding passe par la même écriture sans connaître cette option : l'absence doit
    // valoir « ne pas toucher », sinon terminer l'onboarding rendrait la marque à un Pro.
    const ok = await appliquerReglagesMarque(vendeur.client, vendeur.shopId, reglages(undefined));
    expect(ok).toBe(true);
    expect(await interrupteur(), "une écriture sans l'option a rabaissé l'interrupteur").toBe(true);
  });

  test("repassé en gratuit, la marque revient et l'interrupteur retombe", async () => {
    const r = await definirPlanCompte(
      admin.client,
      { profilId: vendeur.profilId, plan: "gratuit", motif: "Fin de la période payée" },
      IP,
    );
    expect(r.statut).toBe("ok");
    expect((await lireCommandePublique(jeton))?.boutique.marqueMasquee).toBe(false);
    expect(await interrupteur(), "l'interrupteur est resté levé sur un compte gratuit").toBe(false);
  });
});

describe("Ce que le passage de plan exige", () => {
  test("un motif trop court est refusé, par le module ET par la base", async () => {
    const r = await definirPlanCompte(admin.client, { profilId: vendeur.profilId, plan: "pro", motif: "ok" }, IP);
    expect(r).toEqual({ statut: "erreur", motif: "saisie" });
    const { error } = await admin.client.rpc("definir_plan_compte", {
      p_profil: vendeur.profilId,
      p_plan: "pro",
      p_motif: "  ",
      p_ip_hash: IP,
    });
    expect(error?.code).toBe("DL032");
  });

  test("un plan inconnu et un plan déjà en place sont refusés, sans trace", async () => {
    const compter = async () =>
      Number(
        (
          await interroger<{ n: string }>(
            catalogue,
            "select count(*) as n from public.admin_audit_log where action = 'compte.plan' and resource_id = $1",
            [vendeur.profilId],
          )
        )[0]?.n,
      );
    const avant = await compter();
    const inconnu = await admin.client.rpc("definir_plan_compte", {
      p_profil: vendeur.profilId,
      p_plan: "platine",
      p_motif: MOTIF,
      p_ip_hash: IP,
    });
    expect(inconnu.error?.code).toBe("DL060");
    const deja = await admin.client.rpc("definir_plan_compte", {
      p_profil: vendeur.profilId,
      p_plan: "gratuit",
      p_motif: MOTIF,
      p_ip_hash: IP,
    });
    expect(deja.error?.code).toBe("DL057");
    expect(await compter(), "un refus a laissé une trace").toBe(avant);
  });

  test("un vendeur ne lit pas le plan d'un autre compte", async () => {
    expect(await lirePlanCompte(vendeur.client, admin.profilId)).toEqual({ statut: "erreur" });
  });

  test("le passage de plan ne touche jamais le lien du client", async () => {
    const avant = (await lireCommandePublique(jeton))?.jeton;
    await definirPlanCompte(admin.client, { profilId: vendeur.profilId, plan: "pro", motif: MOTIF }, IP);
    expect((await lireCommandePublique(jeton))?.jeton, "le jeton a changé").toBe(avant);
  });
});

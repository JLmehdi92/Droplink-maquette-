import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { promouvoirAdmin } from "../aide/admin";
import {
  clientService,
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT as GRATUIT } from "@/lib/audit/panneau";
import { lireCompte } from "@/lib/audit/comptes";

/**
 * LE PRO REPART DE ZÉRO, LE GRATUIT COMPTE TOUT — migration 200.
 *
 * Décision de Wassim du 27/09/2026 : « le compte gratuit a 15/15, et s'il paye ça
 * débloque 300 commandes par mois ; pareil pour quelqu'un qui n'a jamais rien
 * utilisé : s'il paye le Pro, il a 300/300 ». Le quota gratuit vaut 5 depuis la
 * 210 (décision de Mehdi, 30/09/2026) ; la règle, elle, n'a pas changé.
 *
 * ⚠️ CE QUE LA 198 FAISAIT : le plafond Pro comptait TOUT le mois, commandes
 * gratuites comprises. Un gratuit arrivé au bout de son quota qui payait n'avait
 * que « plafond − quota » ce mois-là.
 *
 * ET LE SENS INVERSE, qui compte autant : un Pro qui repasse en gratuit ne
 * retrouve PAS son quota gratuit — son total à vie inclut ce qu'il a créé en Pro.
 *
 * ⚠️ LE PLAFOND PRO EST DISTINCT DU QUOTA GRATUIT, ET AUCUN VOLUME N'EST NUL
 * (audit ECC du 30/09/2026). Ce fichier réglait le Pro SUR le quota gratuit et
 * soustrayait 5 : à la 210, quota = 5, « quota − 5 » créait ZÉRO commande, et
 * deux tests passaient sans rien prouver. `creerCommandes` refuse désormais un
 * volume nul, et un test refuse que les deux plafonds se confondent.
 */

const service = clientService();
let catalogue: Client;
let plafondAvant: unknown = null;
const comptes: UtilisateurDeTest[] = [];
const PLAFOND_PRO = 12;

async function nouveau(etiquette: string): Promise<UtilisateurDeTest> {
  const u = await creerUtilisateur(etiquette);
  comptes.push(u);
  return u;
}

async function creerCommandes(u: UtilisateurDeTest, combien: number): Promise<string | null> {
  // UN VOLUME NUL NE PROUVE RIEN : c'est exactement ainsi que ce fichier s'est vidé.
  expect(combien, "le test crée zéro commande et passerait sans rien prouver").toBeGreaterThan(0);
  const { error } = await u.client.from("orders").insert(Array.from({ length: combien }, () => ({ shop_id: u.shopId })));
  return error?.code ?? null;
}

async function compterCommandes(u: UtilisateurDeTest): Promise<number> {
  const { count, error } = await u.client.from("orders").select("id", { count: "exact", head: true });
  expect(error).toBeNull();
  return count ?? -1;
}

async function attacherColis(u: UtilisateurDeTest, combien: number, prefixe: string): Promise<string | null> {
  expect(combien).toBeGreaterThan(0);
  const lignes = Array.from({ length: combien }, (_, i) => ({
    shop_id: u.shopId,
    tracking_number: `${prefixe}-${i}`,
    carrier_code: 6051,
  }));
  const { error } = await service.from("tracked_parcels").insert(lignes);
  return error?.code ?? null;
}

async function repasserEnGratuit(u: UtilisateurDeTest): Promise<void> {
  const { error } = await service.from("profiles").update({ plan: "gratuit" }).eq("id", u.profilId);
  expect(error).toBeNull();
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  const lu = await interroger<{ value: unknown }>(
    catalogue,
    "select value from public.system_settings where key = 'plafond_commandes_mensuel'",
  );
  plafondAvant = lu[0]?.value ?? null;
  await interroger(
    catalogue,
    `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb($1::int))
       on conflict (key) do update set value = excluded.value`,
    [PLAFOND_PRO],
  );
});

afterAll(async () => {
  // LE RÉGLAGE GLOBAL EST RENDU tel qu'il était : d'autres suites le lisent.
  if (plafondAvant === null) {
    await interroger(catalogue, "delete from public.system_settings where key = 'plafond_commandes_mensuel'");
  } else {
    await interroger(
      catalogue,
      `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', $1::jsonb)
         on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(plafondAvant)],
    );
  }
  for (const u of comptes) await supprimerUtilisateur(u);
  await catalogue.end();
});

describe("Le Pro repart de zéro, le gratuit compte tout", () => {
  test("LES DEUX PLAFONDS SONT DISTINCTS : confondus, « le gratuit mange le Pro » ne se verrait pas", () => {
    expect(PLAFOND_PRO).toBeGreaterThan(GRATUIT);
    // La marge exacte ci-dessous consomme 2 commandes avant de compter le reste.
    expect(GRATUIT).toBeGreaterThan(2);
  });

  test("un gratuit arrivé au bout de son quota qui passe Pro a TOUT son plafond du mois", async () => {
    const u = await nouveau("gratuit-puis-pro");
    expect(await creerCommandes(u, GRATUIT)).toBeNull();
    expect(await creerCommandes(u, 1), "le quota à vie ne tient plus").toBe("DL067");

    await passerEnPro(u);

    expect(await creerCommandes(u, PLAFOND_PRO), "les commandes gratuites mangent le plafond Pro").toBeNull();
    // CONTRE-TEST : le Pro reste borné, à son plafond et pas au-delà.
    expect(await creerCommandes(u, 1)).toBe("DL035");
  });

  test("un Pro qui n'a jamais rien créé a son plafond entier, et pas une de plus", async () => {
    const u = await nouveau("pro-neuf");
    await passerEnPro(u);
    expect(await creerCommandes(u, PLAFOND_PRO)).toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL035");
  });

  test("un Pro qui repasse en gratuit ne retrouve PAS son quota gratuit — et garde ses commandes", async () => {
    // Sinon, cesser de payer rendrait un quota gratuit neuf à chaque fois. 2 en
    // gratuit puis « quota » en Pro : au-delà du quota au total. Un compteur qui
    // oublierait le Pro ne verrait que 2, et laisserait créer.
    const u = await nouveau("pro-puis-gratuit");
    expect(await creerCommandes(u, 2)).toBeNull();
    await passerEnPro(u);
    expect(await creerCommandes(u, GRATUIT)).toBeNull();
    await repasserEnGratuit(u);
    expect(await creerCommandes(u, 1), "le total à vie a oublié les commandes Pro").toBe("DL067");
    // UN COMPTE AU-DELÀ DU QUOTA GARDE CE QU'IL A CRÉÉ : il ne peut plus ajouter,
    // rien ne lui est retiré. C'est aussi le sort des gratuits à 15 quand la 210 passe.
    expect(await compterCommandes(u), "des commandes ont disparu au retour en gratuit").toBe(2 + GRATUIT);
  });

  test("CONTRE-TEST : un gratuit sous le quota qui repasse de Pro garde sa marge exacte", async () => {
    const u = await nouveau("marge-exacte");
    expect(await creerCommandes(u, 1)).toBeNull();
    await passerEnPro(u);
    expect(await creerCommandes(u, 1)).toBeNull();
    await repasserEnGratuit(u);
    // 2 au total : il en reste « quota − 2 », ni plus ni moins.
    expect(await creerCommandes(u, GRATUIT - 2)).toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL067");
  });

  test("un prélèvement échoué puis régularisé dans le MÊME mois ne double pas le plafond", async () => {
    // Pro → gratuit (past_due, 193) → Pro le lendemain : c'est le même mois payé.
    // Remettre le compteur Pro à zéro donnerait deux plafonds — 600 pour 300.
    const u = await nouveau("double-bascule");
    await passerEnPro(u);
    expect(await creerCommandes(u, PLAFOND_PRO - 2)).toBeNull();
    await repasserEnGratuit(u);
    await passerEnPro(u);
    expect(await creerCommandes(u, 2)).toBeNull();
    expect(await creerCommandes(u, 1), "la seconde bascule a rendu un plafond neuf").toBe("DL035");
  });

  test("COLIS (hors du cas motivant) : les colis gratuits ne mangent pas le plafond Pro", async () => {
    const u = await nouveau("colis-gratuit-puis-pro");
    expect(await attacherColis(u, GRATUIT, "GRATUIT")).toBeNull();
    expect(await attacherColis(u, 1, "TROP")).toBe("DL070");
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBe("gratuit");

    await passerEnPro(u);
    expect((await u.client.rpc("mon_quota_colis_atteint")).data, "le suivi resterait dit bloqué après paiement").toBeNull();
    expect(await attacherColis(u, PLAFOND_PRO, "PRO")).toBeNull();
    expect(await attacherColis(u, 1, "PRO-TROP")).toBe("DL051");
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBe("mensuel");
  });
});

describe("La fiche d'administration dit la règle du plan", () => {
  let admin: UtilisateurDeTest;

  beforeAll(async () => {
    admin = await nouveau("admin-quota");
    await promouvoirAdmin(catalogue, admin);
  });

  test("gratuit : le quota À VIE, tout compris — plein même le mois suivant", async () => {
    const u = await nouveau("fiche-gratuit");
    // Une commande antidatée du mois dernier : un compteur « du mois » dirait un de moins.
    const moisDernier = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await service.from("orders").insert({ shop_id: u.shopId, created_at: moisDernier });
    expect(error).toBeNull();
    expect(await creerCommandes(u, GRATUIT - 1)).toBeNull();

    const fiche = await lireCompte(admin.client, u.profilId, "ip-test");
    expect(fiche?.plan).toBe("gratuit");
    expect(fiche?.quotaCommandes).toEqual({ utilise: GRATUIT, plafond: GRATUIT });
  });

  test("Pro : ce mois-ci, EN PRO seulement — le gratuit consommé n'y est pas", async () => {
    const u = await nouveau("fiche-pro");
    expect(await creerCommandes(u, GRATUIT - 1)).toBeNull();
    await passerEnPro(u);
    expect(await creerCommandes(u, 2)).toBeNull();

    const fiche = await lireCompte(admin.client, u.profilId, "ip-test");
    expect(fiche?.plan).toBe("pro");
    expect(fiche?.quotaCommandes).toEqual({ utilise: 2, plafond: PLAFOND_PRO });
  });
});

import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientService,
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LA MIGRATION 192 — trois défauts de la revue ECC du 23/09/2026.
 *
 * 1. LES QUOTAS CÉDAIENT SOUS DEUX INSERTIONS SIMULTANÉES. Le déclencheur
 *    comptait puis laissait passer : deux transactions comptaient le même total,
 *    voyaient toutes deux « sous le plafond », et passaient. On le prouve avec
 *    DEUX CONNEXIONS RÉELLES dont la première garde sa transaction ouverte —
 *    une suite séquentielle ne peut pas voir une course.
 * 2. UN VENDEUR SUSPENDU CONTINUAIT D'ÉCRIRE À SES CLIENTS par les e-mails de
 *    suivi, alors que sa page rend 404.
 * 3. UN NOM DE LIEN PRIS AU MÊME INSTANT par deux vendeurs rendait au second
 *    une erreur d'unicité générique au lieu de « déjà pris ».
 *
 * Chaque cas a son CONTRE-TEST : un verrou qui refuserait tout, un filtre qui
 * tairait tout le monde, passeraient sinon ces tests sans rien prouver.
 */

const service = clientService();
let a: Client;
let b: Client;
let catalogue: Client;
const comptes: UtilisateurDeTest[] = [];

async function compte(etiquette: string): Promise<UtilisateurDeTest> {
  const u = await creerUtilisateur(etiquette);
  comptes.push(u);
  return u;
}

/**
 * Attend que la connexion `pid` soit BLOQUÉE sur un verrou, ou que sa requête
 * soit finie. Sans cette attente, « la seconde a attendu » serait une
 * affirmation sur l'ordonnanceur, pas une mesure.
 */
async function bloqueeOuFinie(pid: number, requete: Promise<unknown>): Promise<"bloquee" | "finie"> {
  let finie = false;
  requete.then(
    () => (finie = true),
    () => (finie = true),
  );
  for (let i = 0; i < 100; i += 1) {
    if (finie) return "finie";
    const l = await interroger<{ attend: boolean }>(
      catalogue,
      "select wait_event_type = 'Lock' as attend from pg_stat_activity where pid = $1",
      [pid],
    );
    if (l[0]?.attend === true) return "bloquee";
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("la seconde connexion n'a ni fini ni attendu en 5 s");
}

/** Code SQL d'une erreur `pg`, ou `null` si la requête a réussi. */
async function codeDe(requete: Promise<unknown>): Promise<string | null> {
  try {
    await requete;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "inconnu";
  }
}

/*
 * ⚠️ LE PID SE LIT DANS LA TRANSACTION, JAMAIS PAR `client.processID`. Derrière
 * le pooler de Supabase, ce dernier n'est pas le processus serveur : la
 * première version de ce fichier attendait un pid qui n'existait pas, et
 * concluait « ni fini ni bloqué ».
 */
async function ouvrir(c: Client): Promise<number> {
  await c.query("begin");
  const r = await c.query<{ pid: number }>("select pg_backend_pid() as pid");
  return r.rows[0]?.pid ?? -1;
}

/** Un test qui échoue ne doit pas laisser sa transaction avortée au suivant. */
async function remettre(): Promise<void> {
  for (const c of [a, b]) await c.query("rollback");
}

async function nombre(sql: string, params: unknown[]): Promise<number> {
  const l = await interroger<{ n: string }>(catalogue, sql, params);
  return Number(l[0]?.n ?? -1);
}

beforeAll(async () => {
  [a, b, catalogue] = await Promise.all([
    ouvrirConnexionCatalogue(),
    ouvrirConnexionCatalogue(),
    ouvrirConnexionCatalogue(),
  ]);
}, 60_000);

afterAll(async () => {
  await remettre();
  for (const u of comptes) await supprimerUtilisateur(u);
  await Promise.all([a.end(), b.end(), catalogue.end()]);
}, 90_000);

describe("⚠️ Deux insertions simultanées ne dépassent pas un quota", () => {
  beforeEach(remettre);
  test("la DERNIÈRE commande gratuite ne se prend pas deux fois", async () => {
    const v = await compte("course-commandes");
    const plafond = await nombre("select public.lire_plafond_gratuit_a_vie() as n", []);
    // Une de moins que le plafond : la place restante est unique.
    await interroger(
      catalogue,
      "insert into public.orders (shop_id, customer_label) select $1, 'course ' || g from generate_series(1, $2::int) g",
      [v.shopId, plafond - 1],
    );

    await ouvrir(a);
    await a.query("insert into public.orders (shop_id, customer_label) values ($1, 'a')", [v.shopId]);
    const pid = await ouvrir(b);
    const secondeB = b.query("insert into public.orders (shop_id, customer_label) values ($1, 'b')", [v.shopId]);
    const etat = await bloqueeOuFinie(pid, secondeB);
    await a.query("commit");
    const code = await codeDe(secondeB);
    await b.query(code === null ? "commit" : "rollback");

    expect(etat, "la seconde doit ATTENDRE la première").toBe("bloquee");
    expect(code).toBe("DL067");
    expect(await nombre("select count(*) as n from public.orders where shop_id = $1", [v.shopId])).toBe(plafond);
  }, 60_000);

  test("le DERNIER colis gratuit ne se prend pas deux fois", async () => {
    const v = await compte("course-colis");
    // UNE FOIS le quota de commandes depuis la 201 (le facteur 2 est retiré).
    const plafond = await nombre("select public.lire_plafond_gratuit_a_vie() as n", []);
    await interroger(
      catalogue,
      "insert into public.tracked_parcels (shop_id, tracking_number) select $1, 'COURSE' || g from generate_series(1, $2::int) g",
      [v.shopId, plafond - 1],
    );

    await ouvrir(a);
    await a.query("insert into public.tracked_parcels (shop_id, tracking_number) values ($1, 'COURSEA')", [v.shopId]);
    const pid = await ouvrir(b);
    const secondeB = b.query(
      "insert into public.tracked_parcels (shop_id, tracking_number) values ($1, 'COURSEB')",
      [v.shopId],
    );
    const etat = await bloqueeOuFinie(pid, secondeB);
    await a.query("commit");
    const code = await codeDe(secondeB);
    await b.query(code === null ? "commit" : "rollback");

    expect(etat).toBe("bloquee");
    expect(code).toBe("DL070");
    expect(
      await nombre("select count(*) as n from public.tracked_parcels where shop_id = $1", [v.shopId]),
    ).toBe(plafond);
  }, 60_000);

  test("CONTRE-TEST : deux BOUTIQUES différentes ne s'attendent pas", async () => {
    // Un verrou global passerait les deux tests ci-dessus — en sérialisant
    // toutes les créations de commande du produit.
    const [v1, v2] = await Promise.all([compte("course-libre-1"), compte("course-libre-2")]);
    await ouvrir(a);
    await a.query("insert into public.orders (shop_id, customer_label) values ($1, 'a')", [v1.shopId]);
    const pid = await ouvrir(b);
    const autre = b.query("insert into public.orders (shop_id, customer_label) values ($1, 'b')", [v2.shopId]);
    const etat = await bloqueeOuFinie(pid, autre);
    await b.query("commit");
    await a.query("commit");
    expect(etat).toBe("finie");
  }, 60_000);
});

describe("Un vendeur suspendu n'écrit plus à ses clients", () => {
  let v: UtilisateurDeTest;
  let commande: { id: string; public_token: string };

  async function suspendre(statut: "suspended" | "active"): Promise<void> {
    await interroger(catalogue, "update public.profiles set status = $1 where id = $2", [statut, v.profilId]);
  }

  beforeAll(async () => {
    v = await compte("notif-suspendu");
    const l = await interroger<{ id: string; public_token: string }>(
      catalogue,
      "insert into public.orders (shop_id, customer_label) values ($1, 'suspendu') returning id, public_token",
      [v.shopId],
    );
    commande = l[0] as { id: string; public_token: string };
  }, 60_000);

  afterAll(async () => {
    await suspendre("active");
  });

  function hash(): string {
    return createHash("sha256").update(randomBytes(32)).digest("hex");
  }

  test("une INSCRIPTION est refusée — et acceptée une fois le compte rétabli", async () => {
    await suspendre("suspended");
    const refus = await service.rpc("demander_notification", {
      p_jeton_public: commande.public_token,
      p_email: "client@droplink-test.invalid",
      p_token_hash: hash(),
    });
    expect(refus.error).toBeNull();
    expect(refus.data).toEqual([]);

    await suspendre("active");
    const accord = await service.rpc("demander_notification", {
      p_jeton_public: commande.public_token,
      p_email: "client@droplink-test.invalid",
      p_token_hash: hash(),
    });
    expect(accord.error).toBeNull();
    expect(accord.data).toHaveLength(1);
  });

  test("une CONFIRMATION attend le rétablissement, sans être consommée", async () => {
    const h = hash();
    await service.rpc("demander_notification", {
      p_jeton_public: commande.public_token,
      p_email: "confirme@droplink-test.invalid",
      p_token_hash: h,
    });
    await suspendre("suspended");
    const refus = await service.rpc("confirmer_notification", { p_token_hash: h });
    expect(refus.data).toEqual([]);
    expect(
      await nombre("select count(*) as n from public.orders where id = $1 and notify_email is not null", [commande.id]),
    ).toBe(0);

    await suspendre("active");
    const accord = await service.rpc("confirmer_notification", { p_token_hash: h });
    expect(accord.data).toHaveLength(1);
  });

  test("aucun E-MAIL ne part — et il repart au rétablissement", async () => {
    await interroger(
      catalogue,
      "update public.orders set notify_email = 'envoi@droplink-test.invalid', status = 'expedie' where id = $1",
      [commande.id],
    );
    await interroger(catalogue, "delete from public.notifications_sent where order_id = $1", [commande.id]);

    const aEnvoyer = async (): Promise<boolean> => {
      const { data, error } = await service.rpc("notifications_a_envoyer", { p_limite: 200 });
      if (error !== null) throw new Error(error.message);
      return (data as { order_id: string }[]).some((l) => l.order_id === commande.id);
    };

    await suspendre("suspended");
    expect(await aEnvoyer()).toBe(false);
    await suspendre("active");
    expect(await aEnvoyer()).toBe(true);
  });
});

describe("Un nom de lien pris au même instant se dit « déjà pris »", () => {
  beforeEach(remettre);
  async function poser(c: Client, u: UtilisateurDeTest, slug: string): Promise<unknown> {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: u.userId, role: "authenticated" }),
    ]);
    return c.query("select public.definir_slug_boutique($1)", [slug]);
  }

  test("le second vendeur reçoit DL072, pas une erreur d'unicité", async () => {
    const [v1, v2] = await Promise.all([compte("slug-course-1"), compte("slug-course-2")]);
    await Promise.all([passerEnPro(v1), passerEnPro(v2)]);
    const slug = "course" + randomBytes(4).toString("hex");

    await ouvrir(a);
    await poser(a, v1, slug);
    const pid = await ouvrir(b);
    const second = poser(b, v2, slug);
    const etat = await bloqueeOuFinie(pid, second);
    await a.query("commit");
    const code = await codeDe(second);
    await b.query("rollback");

    expect(etat).toBe("bloquee");
    expect(code).toBe("DL072");
  }, 60_000);

  test("CONTRE-TEST : reprendre SON ancien nom reste permis", async () => {
    // Le conflit d'insertion est alors légitime : le nom est déjà à nous.
    const v = await compte("slug-reprise");
    await passerEnPro(v);
    const x = "reprise" + randomBytes(4).toString("hex");
    const y = "autre" + randomBytes(4).toString("hex");
    for (const slug of [x, y, x]) {
      await ouvrir(a);
      const code = await codeDe(poser(a, v, slug));
      await a.query(code === null ? "commit" : "rollback");
      expect(code, slug).toBeNull();
    }
    const l = await interroger<{ slug: string }>(catalogue, "select slug from public.shops where id = $1", [v.shopId]);
    expect(l[0]?.slug).toBe(x);
  }, 60_000);
});

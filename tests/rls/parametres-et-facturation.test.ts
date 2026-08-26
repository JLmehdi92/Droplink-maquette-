import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { PARAMETRES } from "../../src/lib/audit/parametres";

/**
 * DEUX RÈGLES QUI NE VIVAIENT QUE DANS TYPESCRIPT, ET UN DÉCLENCHEUR EN SURSIS.
 *
 * DÉFAUTS TROUVÉS À L'AUDIT DU 26/08/2026.
 *
 * 1. `ecrire_parametre` ne vérifiait que « administrateur » et « clé non vide ».
 *    L'inventaire fermé des paramètres et leurs bornes n'existaient QUE dans
 *    `lib/audit/parametres.ts`. Un administrateur appelant la RPC hors du
 *    formulaire écrivait n'importe quelle clé, n'importe quelle valeur. Aucune
 *    escalade — il faut déjà être admin — mais la phrase juste était « ce serait
 *    un problème si un futur écran lisait une clé écrite hors bornes », et la
 *    décision produit n° 10 prévoit d'ajouter des clés. Un sursis (L-029).
 *
 * 2. `compter_prise_en_charge` lisait `old` sur un déclencheur
 *    `after insert or update` sans ouvrir sur `tg_op`.
 *
 *    ⚠️ L'AUDIT ANNONÇAIT QUE L'INSERTION SERAIT ANNULÉE. VÉRIFIÉ PAR
 *    EXÉCUTION : ELLE NE L'EST PAS. Dans un déclencheur de LIGNE, `OLD` est un
 *    enregistrement NULL sur INSERT — pas un enregistrement « non assigné » —
 *    donc `old.registered_at is not null` vaut `false` et l'insertion réussit.
 *    Le comportement était déjà juste sur PostgreSQL 17.6.
 *
 *    Les deux tests ci-dessous ne PROUVENT donc pas une correction : ils
 *    CONSTATENT un comportement, et le fixent pour l'avenir. C'est utile — la
 *    justesse tenait à une sémantique implicite qu'un `plpgsql.extra_errors`
 *    ou une réécriture de la condition changerait — mais ce n'est pas la même
 *    chose, et le dire autrement serait maquiller.
 *
 * CES DEUX SUITES ÉCRIVENT EN BASE, avec de vrais utilisateurs authentifiés.
 * Un test qui simulerait la RLS ou le déclencheur ne prouverait rien de ce qui
 * précède : c'est précisément parce que ces règles vivaient hors de la base
 * qu'elles étaient fausses.
 */

let bd: Client;
let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;

/** Exécute une requête sous l'identité d'un utilisateur réel, RLS active. */
async function sousSession<T>(
  utilisateur: UtilisateurDeTest,
  sql: string,
  valeurs: readonly unknown[] = [],
): Promise<{ ok: true; lignes: T[] } | { ok: false; code: string; message: string }> {
  await bd.query("begin");
  try {
    await bd.query("set local role authenticated");
    await bd.query(`set local request.jwt.claims = '{"sub":"${utilisateur.userId}"}'`);
    const { rows } = await bd.query(sql, [...valeurs]);
    await bd.query("commit");
    return { ok: true, lignes: rows as T[] };
  } catch (erreur) {
    await bd.query("rollback");
    const e = erreur as { code?: string; message?: string };
    return { ok: false, code: e.code ?? "", message: e.message ?? "" };
  }
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("param-admin");
  vendeur = await creerUtilisateur("param-vendeur");
  // La promotion passe par le propriétaire de la base : c'est justement ce
  // qu'un vendeur ne peut pas faire, et une autre suite l'établit.
  await bd.query("update public.profiles set role = 'admin' where id = $1", [admin.profilId]);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await bd.end();
});

describe("les bornes des paramètres sont vérifiées EN BASE", () => {
  /*
   * CONTRE-TEST POSITIF, EN PREMIER.
   *
   * Une fonction qui refuserait TOUT passerait tous les cas de refus ci-dessous
   * à 100 %, en cassant l'écran des paramètres sans que rien ne le dise.
   */
  test("un administrateur écrit une valeur légitime", async () => {
    const resultat = await sousSession(admin, "select public.ecrire_parametre($1, $2)", [
      "seuil_colis_par_compte",
      "1500",
    ]);
    expect(resultat.ok, `écriture légitime refusée : ${JSON.stringify(resultat)}`).toBe(true);
  });

  test.each([
    ["clef_qui_nexiste_pas", "42", "DL045", "clé hors inventaire"],
    ["seuil_colis_par_compte", "0", "DL047", "sous le minimum"],
    ["seuil_colis_par_compte", "1000001", "DL047", "au-dessus du maximum"],
    ["retard_veilleur_minutes", "4", "DL047", "sous le minimum"],
    ["retard_veilleur_minutes", "10081", "DL047", "au-dessus du maximum"],
    ["seuil_colis_par_compte", '"1500"', "DL046", "valeur textuelle"],
    ["seuil_colis_par_compte", "12.5", "DL046", "valeur non entière"],
    ["seuil_colis_par_compte", "null", "DL046", "valeur nulle"],
    ["   ", "42", "DL044", "clé vide"],
  ])("« %s » = %s est refusé (%s — %s)", async (cle, valeur, code) => {
    const resultat = await sousSession(admin, "select public.ecrire_parametre($1, $2::jsonb)", [
      cle,
      valeur,
    ]);
    expect(resultat.ok, `écriture acceptée alors qu'elle devait être refusée`).toBe(false);
    if (!resultat.ok) expect(resultat.code).toBe(code);
  });

  test("un vendeur ordinaire ne peut rien écrire du tout", async () => {
    const resultat = await sousSession(vendeur, "select public.ecrire_parametre($1, $2)", [
      "seuil_colis_par_compte",
      "1500",
    ]);
    expect(resultat.ok).toBe(false);
    // Le même message que pour une ressource absente : on ne confirme pas
    // l'existence de la surface à qui n'y a pas droit.
    if (!resultat.ok) expect(resultat.code).toBe("DL031");
  });

  test("les deux inventaires sont d'accord, DANS LES DEUX SENS", async () => {
    /*
     * LE CONTRÔLE QUI COMPTE VRAIMENT.
     *
     * Deux listes disent la même chose — celle de TypeScript, qui donne au
     * vendeur un message utile, et celle de la base, qui fait autorité. Rien
     * dans le code ne peut les tenir d'accord : c'est ce test, et lui seul.
     *
     * Il échoue dans les deux sens. Une clé ajoutée d'un côté seulement produit
     * soit un formulaire qui propose ce que la base refuse, soit une clé
     * écrivable que l'écran ne montre pas — la seconde étant exactement le
     * défaut qu'on vient de corriger.
     */
    const { rows } = await bd.query<{ cle: string; minimum: string; maximum: string }>(
      "select cle, minimum::text, maximum::text from public.parametres_admis order by cle",
    );

    // UN ENSEMBLE VIDE PASSE TOUT : sans cette borne, une table vidée par
    // accident rendrait la comparaison triviale et verte.
    expect(rows.length, "l'inventaire en base est vide").toBeGreaterThan(0);
    expect(PARAMETRES.length, "l'inventaire TypeScript est vide").toBeGreaterThan(0);

    const enBase = rows.map((r) => `${r.cle}:${r.minimum}:${r.maximum}`).sort();
    const dansLeCode = [...PARAMETRES]
      .map((p) => `${p.cle}:${p.min}:${p.max}`)
      .sort();

    expect(
      enBase,
      "Les inventaires de paramètres divergent. Une borne qui n'existe que d'un " +
        "côté est une borne qu'un chemin de code contourne.",
    ).toEqual(dansLeCode);
  });
});

describe("le compteur facturable compte une prise en charge, et une seule", () => {
  /*
   * DEUX CHEMINS, DONT UN QUE LE PRODUIT N'EMPRUNTE PAS AUJOURD'HUI.
   *
   * `attacher_colis` insère toujours sans `registered_at` ; la pose vient d'un
   * UPDATE. L'insertion déjà prise en charge n'est donc atteignable que par une
   * reprise de données, un import ou une correction manuelle — un chemin
   * qu'aucun test n'exerçait, et que rien n'interdit.
   *
   * CE QUE CES DEUX TESTS ÉTABLISSENT, ET CE QU'ILS N'ÉTABLISSENT PAS : ils
   * fixent le comportement des deux chemins. Ils ne discriminent PAS l'ancienne
   * forme de la nouvelle, puisque les deux produisent le même résultat sur
   * PostgreSQL 17.6 — falsification faite, restée verte, et c'est ce qui a
   * révélé que le défaut annoncé n'existait pas.
   */
  test("insérer un colis déjà pris en charge n'annule pas l'insertion", async () => {
    const numero = "TESTINSERT" + Date.now().toString(36).toUpperCase();

    // Écrit par le propriétaire de la base : on éprouve le DÉCLENCHEUR, pas la
    // RLS. Mélanger les deux rendrait un échec ambigu.
    await expect(
      bd.query(
        `insert into public.tracked_parcels (shop_id, tracking_number, registered_at)
         values ($1, $2, now())`,
        [vendeur.shopId, numero],
      ),
      "L'insertion a été annulée : le déclencheur lit OLD sur un INSERT.",
    ).resolves.toBeDefined();

    const { rows } = await bd.query<{ n: string }>(
      `select parcels_registered::text as n from public.usage_counters
       where profile_id = $1 and period_month = date_trunc('month', now())::date`,
      [vendeur.profilId],
    );
    expect(
      Number(rows[0]?.n ?? 0),
      "Le colis inséré déjà pris en charge n'a pas été compté — or c'est une " +
        "prise en charge, et c'est le seul compteur qui corresponde à une facture.",
    ).toBeGreaterThanOrEqual(1);

    await bd.query("delete from public.tracked_parcels where tracking_number = $1", [numero]);
  });

  test("un colis pris en charge par UPDATE compte UNE seule fois", async () => {
    // CONTRE-TEST : le chemin normal du produit doit continuer de compter, et
    // ne pas compter deux fois. Une correction qui ferait compter chaque
    // modification ultérieure gonflerait le seul compteur facturé.
    const numero = "TESTUPDATE" + Date.now().toString(36).toUpperCase();

    const avant = await bd.query<{ n: string }>(
      `select coalesce(parcels_registered, 0)::text as n from public.usage_counters
       where profile_id = $1 and period_month = date_trunc('month', now())::date`,
      [vendeur.profilId],
    );
    const depart = Number(avant.rows[0]?.n ?? 0);

    await bd.query(
      "insert into public.tracked_parcels (shop_id, tracking_number) values ($1, $2)",
      [vendeur.shopId, numero],
    );
    await bd.query(
      "update public.tracked_parcels set registered_at = now() where tracking_number = $1",
      [numero],
    );
    // Une seconde modification de la même ligne : elle ne doit RIEN ajouter.
    await bd.query(
      "update public.tracked_parcels set registered_at = now() where tracking_number = $1",
      [numero],
    );

    const apres = await bd.query<{ n: string }>(
      `select parcels_registered::text as n from public.usage_counters
       where profile_id = $1 and period_month = date_trunc('month', now())::date`,
      [vendeur.profilId],
    );

    expect(
      Number(apres.rows[0]?.n ?? 0) - depart,
      "Une prise en charge doit compter exactement une fois, quelles que " +
        "soient les modifications ultérieures de la ligne.",
    ).toBe(1);

    await bd.query("delete from public.tracked_parcels where tracking_number = $1", [numero]);
  });
});

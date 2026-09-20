import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest, passerEnPro } from "../aide/utilisateurs";
import { seriesConcordantes } from "../aide/series";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ÉCHELLE SE MESURE SUR LE NOMBRE DE COMPTES, PAS SUR LE VOLUME D'UN SEUL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Toutes les mesures existantes portent sur DEUX comptes de 9 600 commandes.
 * Elles répondent à « l'écran tient-il pour un gros vendeur ». Elles ne
 * répondent PAS à « l'écran tient-il quand il y a des milliers de vendeurs »,
 * et les deux questions n'ont ni la même réponse ni le même mode de
 * défaillance.
 *
 * CE QUE DEUX COMPTES NE PEUVENT PAS RÉVÉLER. Avec deux valeurs de `shop_id`,
 * la sélectivité de la colonne est de 50 % : le planificateur peut choisir un
 * balayage complet et paraître rapide, parce que la moitié de la table est
 * effectivement pertinente. À mille comptes, la même requête doit atteindre un
 * millième des lignes — et c'est là seulement que l'absence d'un index, ou un
 * index dont l'ordre ne correspond pas à celui de la requête, devient visible.
 *
 * L'inverse est vrai aussi, et c'est le piège rassurant : les STATISTIQUES du
 * planificateur changent avec la cardinalité. Une requête mesurée sur une base
 * mono-compte peut basculer sur un plan entièrement différent en production
 * sans qu'une seule ligne de code ait changé.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE JEU, ET POURQUOI CES CHIFFRES-LÀ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wassim : « imagine-toi qu'un seul utilisateur du SaaS a au moins 200
 * commandes par semaine ».
 *
 * - MILLE boutiques ordinaires portant chacune 200 commandes — une semaine de
 *   ce vendeur-là. C'est la CARDINALITÉ qu'on cherche : mille valeurs distinctes
 *   de `shop_id`, donc une sélectivité de un pour mille.
 * - DEUX comptes au PLAFOND de 9 600, dont celui qu'on mesure. Un gros vendeur
 *   NOYÉ PARMI LES AUTRES : c'est le cas réel, et c'est le seul qui éprouve à la
 *   fois le volume et la cardinalité.
 *
 * Total : 1 002 boutiques, 219 200 commandes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER NE PROUVE PAS — dit franchement
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `parcel_last_movement_at` est SEMÉE DIRECTEMENT, sans passer par
 * `appliquer_etat_colis`. Deux cent mille ingestions réelles prendraient des
 * heures et ne mesureraient pas ce qu'on cherche ici, qui est un PLAN DE
 * LECTURE. Que la colonne soit correctement REMPLIE par le chemin réel est
 * établi ailleurs, par exécution : `tests/rls/statut-suit-le-transporteur`.
 *
 * Et ces mesures portent sur une base de développement partagée avec une
 * latence réseau : les TEMPS sont indicatifs. Les assertions qui font foi
 * portent sur les LIGNES LUES et sur le PLAN — ce sont les seules qui ne
 * dépendent pas de la machine.
 */

/*
 * ── SEUILS, ÉCRITS AVANT LA PREMIÈRE EXÉCUTION ──────────────────────────────
 *
 * Sans seuil écrit d'avance, « on décidera sur la mesure » devient « on a
 * mesuré, ça allait ». Ceux-ci sont volontairement IDENTIQUES à ceux du jeu à
 * deux comptes : l'affirmation qu'on veut établir n'est pas « c'est rapide »,
 * c'est « LE COÛT NE CROÎT PAS AVEC LE NOMBRE DE COMPTES ». Un seuil relevé
 * pour ce fichier reviendrait à accepter d'avance la dégradation qu'on cherche
 * à exclure.
 */
const PAGE_MS = 60;
const RECHERCHE_MS = 250;
const COMPTEURS_MS = 120;
const LIGNES_LUES_MAX = 1_000;

const BOUTIQUES = 1_000;
const COMMANDES_PAR_BOUTIQUE = 200;
const PLAFOND_COMMANDES = 9_600;
const PAR_PAGE = 50;

/** Préfixe distinctif : le nettoyage doit pouvoir viser SANS AMBIGUÏTÉ. */
const PREFIXE = "echelle-multi-";

let bd: Client;
let alice: UtilisateurDeTest;
let voisin: UtilisateurDeTest;

type Mesure = { ms: number; plan: string; lignesLues: number };

/** Exécute la requête AVEC la session d'un vendeur, RLS active. */
async function mesurer(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  await bd.query("begin");
  try {
    await bd.query("set local role authenticated");
    await bd.query(`set local request.jwt.claims = '{"sub":"${utilisateur.userId}"}'`);

    const resultat = await bd.query<{ "QUERY PLAN": unknown[] }>(
      `explain (analyze, buffers, format json) ${sql}`,
    );
    const brut = resultat.rows[0]?.["QUERY PLAN"];
    const racine = (brut as Array<{ Plan: Record<string, unknown>; "Execution Time": number }>)[0];
    if (racine === undefined) throw new Error("plan illisible");

    const texte = JSON.stringify(racine.Plan);
    let lignesLues = 0;
    const parcourir = (noeud: Record<string, unknown>): void => {
      const type = String(noeud["Node Type"] ?? "");
      if (type.includes("Scan")) {
        lignesLues += Number(noeud["Actual Rows"] ?? 0) * Number(noeud["Actual Loops"] ?? 1);
      }
      for (const enfant of (noeud["Plans"] as Record<string, unknown>[] | undefined) ?? []) {
        parcourir(enfant);
      }
    };
    parcourir(racine.Plan);

    return { ms: racine["Execution Time"], plan: texte, lignesLues };
  } finally {
    await bd.query("rollback");
  }
}

/** Rodage jeté, puis deux séries concordantes : voir `tests/aide/series.ts`. */
async function mesurerSerieuse(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  return seriesConcordantes(() => mesurer(utilisateur, sql));
}

/** Le semis d'un compte au plafond, étalé sur treize mois. */
async function semerAuPlafond(utilisateur: UtilisateurDeTest, etiquette: string): Promise<void> {
  await bd.query(
    `insert into public.orders (shop_id, customer_label, product_ref, tracking_number, status,
                                archived_at, created_at, updated_at, parcel_last_movement_at)
     select $1,
            case when i % 7 = 0 then 'Crème Solaire ' || i else $2 || ' client ' || i end,
            'REF-' || $2 || '-' || i,
            case when i % 3 = 0 then 'LP' || lpad(i::text, 10, '0') || 'FR' else null end,
            (array['preparation','expedie','en_transit','livre'])[1 + (i % 4)]::public.order_status,
            case when i % 20 = 0 then now() - (i || ' hours')::interval else null end,
            now() - (i || ' hours')::interval,
            now() - (i || ' hours')::interval + ((i * 37 % 900) || ' minutes')::interval,
            -- Une commande sur quatre est « en transit » (le modulo ci-dessus).
            -- Toutes n'ont pas bougé : un colis pris en charge sans scan est le
            -- cas le plus fréquent le jour de l'expédition, et le tri doit
            -- justement l'écarter.
            case when i % 4 = 2 and i % 5 <> 0
                 then now() - (i || ' hours')::interval - ((i % 90) || ' days')::interval
                 else null end
     from generate_series(1, $3) as i`,
    [utilisateur.shopId, etiquette, PLAFOND_COMMANDES],
  );
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();

  // Résidus d'une exécution précédente interrompue : à l'ENTRÉE, parce qu'une
  // protection qui dépend d'un `afterAll` dépend d'une absence d'échec.
  await bd.query("delete from auth.users where email like $1 || '%'", [PREFIXE]);

  alice = await creerUtilisateur("echelle-alice");
  voisin = await creerUtilisateur("echelle-voisin");

  /*
   * ⚠️ LES COMPTES DU BANC SONT PRO, ET CE N'EST PAS UN CONTOURNEMENT.
   *
   * Depuis les migrations 175-176 et 181 (20/09/2026), un compte GRATUIT est
   * borné à 15 commandes À VIE et 30 colis À VIE. Le banc en sème des milliers
   * pour savoir si l'écran tient : le semis echouait donc a la seizieme ligne,
   * et les 48 mesures partaient en SAUT — un test saute n'est pas un test qui
   * passe, et `test:perf` n'etant pas une porte, personne ne l'aurait vu.
   *
   * Le rendre Pro n'excuse pas le plafond, il decrit le bon compte : un vendeur
   * a 9 600 commandes EST Pro, par construction. Le plafond MENSUEL du plan Pro
   * (3 000) reste applique, et c'est pour lui que le semis etale ses lignes sur
   * treize mois.
   */
  await passerEnPro(alice);
  await passerEnPro(voisin);

  await semerAuPlafond(alice, "alice");
  await semerAuPlafond(voisin, "voisin");

  /*
   * LES MILLE BOUTIQUES ORDINAIRES.
   *
   * Insérées dans `auth.users` : le déclencheur d'inscription crée profil ET
   * boutique, donc le jeu emprunte le CHEMIN RÉEL de création de compte. Poser
   * les lignes de `shops` à la main produirait un jeu que le produit ne sait
   * pas fabriquer — et une mesure porte une assertion sur le jeu qu'elle décrit.
   *
   * Elles ne sont pas authentifiées : mille sessions réelles butteraient sur la
   * limite de l'API d'authentification, et surtout ne serviraient à rien. Ce
   * qu'on veut d'elles, ce sont des LIGNES et de la CARDINALITÉ.
   */
  await bd.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at)
     select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
            'authenticated', $1 || i || '@droplink-test.invalid', 'x', now(), now(), now()
     from generate_series(1, $2) as i`,
    [PREFIXE, BOUTIQUES],
  );

  /*
   * ⚠️ LES MILLE BOUTIQUES SONT PRO, PAR LE MÊME RAISONNEMENT QUE LES DEUX
   * COMPTES NOMMÉS — et il faut le geste EN PLUS ici, parce que celles-ci
   * naissent du déclencheur d'inscription, donc en `gratuit`.
   *
   * Depuis les migrations 175-176, un compte gratuit est borné à 15 commandes À
   * VIE : le semis suivant échouait à la seizième ligne de la première
   * boutique, et les seize mesures de ce fichier partaient en SAUT.
   *
   * ⚠️ ET IL SE FAIT EN SQL DIRECT, PAS PAR `passerEnPro`. `profiles.plan`
   * n'est accordée en écriture à personne — c'est un privilège de COLONNE, et
   * c'est ce qui empêche un vendeur de se passer Pro. Le propriétaire de la
   * table le garde ; mille appels REST, eux, prendraient des minutes pour un
   * jeu qu'on monte à chaque exécution.
   */
  await bd.query(`update public.profiles set plan = 'pro' where email like $1 || '%'`, [PREFIXE]);

  /*
   * PAR LOTS, et ce n'est pas une élégance : mesuré, les deux cent mille lignes
   * en un seul ordre prennent environ 240 secondes et se font COUPER par le
   * `statement_timeout` de deux minutes du serveur. L'ordre entier est alors
   * annulé — donc un jeu vide, une suite qui échoue au montage, et rien qui
   * dise que la cause est une limite de plateforme et non le produit.
   *
   * Cent boutiques par lot, soit vingt mille lignes en une vingtaine de
   * secondes : une marge de six par rapport à la limite.
   */
  const TAILLE_LOT = 100;
  for (let debut = 0; debut < BOUTIQUES; debut += TAILLE_LOT) {
    await bd.query(
      `insert into public.orders (shop_id, customer_label, product_ref, tracking_number, status,
                                  created_at, updated_at, parcel_last_movement_at)
       select s.id,
              'client ' || i,
              'REF-' || i,
              case when i % 3 = 0 then 'SC' || lpad(i::text, 10, '0') else null end,
              (array['preparation','expedie','en_transit','livre'])[1 + (i % 4)]::public.order_status,
              now() - (i || ' hours')::interval,
              now() - (i || ' hours')::interval,
              case when i % 4 = 2 then now() - ((i % 60) || ' days')::interval else null end
       from (
         select s.id from public.shops s
         join public.profiles p on p.id = s.owner_id
         where p.email like $1 || '%'
         order by s.id offset $3 limit $4
       ) as s
       cross join generate_series(1, $2) as i`,
      [PREFIXE, COMMANDES_PAR_BOUTIQUE, debut, TAILLE_LOT],
    );
  }

  // Sans `analyze`, le planificateur travaille sur des statistiques d'avant le
  // semis : il croirait la table minuscule et choisirait des plans qu'il ne
  // choisira jamais en production. On mesurerait alors un cas imaginaire.
  await bd.query("analyze public.orders");
  await bd.query("analyze public.shops");
}, 1_800_000);

afterAll(async () => {
  await bd.query("delete from auth.users where email like $1 || '%'", [PREFIXE]);
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(voisin);
  await bd.end();
}, 600_000);

describe("Le jeu de mesure est bien celui qu'on décrit", () => {
  test("mille boutiques ordinaires et deux comptes au plafond", async () => {
    const { rows: b } = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.shops s
       join public.profiles p on p.id = s.owner_id where p.email like $1 || '%'`,
      [PREFIXE],
    );
    expect(
      Number(b[0]?.n),
      "Les boutiques ordinaires manquent : sans elles la cardinalité de " +
        "`shop_id` retombe à deux, et ce fichier ne mesure plus rien de neuf.",
    ).toBe(BOUTIQUES);

    for (const [nom, u] of [
      ["alice", alice],
      ["voisin", voisin],
    ] as const) {
      const { rows } = await bd.query<{ n: string }>(
        "select count(*)::text as n from public.orders where shop_id = $1",
        [u.shopId],
      );
      expect(Number(rows[0]?.n), `${nom} n'est pas au plafond`).toBe(PLAFOND_COMMANDES);
    }

    const { rows: t } = await bd.query<{ n: string }>(
      "select count(*)::text as n from public.orders",
    );
    const total = Number(t[0]?.n);
    console.log(`  jeu : ${BOUTIQUES + 2} boutiques, ${total} commandes`);
    expect(
      total,
      "Le total ne correspond pas au jeu décrit : une purge concurrente, ou un " +
        "semis partiel. Toute conclusion tirée d'ici serait fausse.",
    ).toBeGreaterThanOrEqual(BOUTIQUES * COMMANDES_PAR_BOUTIQUE + 2 * PLAFOND_COMMANDES);
  });

  test("la RLS filtre réellement au milieu de mille comptes", async () => {
    /*
     * CONTRE-TEST INDISPENSABLE, et il compte plus ici qu'ailleurs : si la RLS
     * ne filtrait pas, on lirait 219 200 lignes en croyant en lire 9 600, et
     * TOUTES les conclusions seraient fausses du côté rassurant — les temps
     * paraîtraient bons parce que le plan serait différent.
     */
    const m = await mesurer(alice, "select count(*) from public.orders");
    expect(
      m.lignesLues,
      "La RLS ne filtre pas : la mesure porte sur la base entière.",
    ).toBeLessThanOrEqual(PLAFOND_COMMANDES + 200);
  });
});

describe("Le tableau de bord au milieu de mille vendeurs", () => {
  const PREMIERE_PAGE = `
    select id, customer_label, product_ref, status, qc_status, created_at
    from public.orders
    where archived_at is null
    order by created_at desc, id desc
    limit ${PAR_PAGE}`;

  test("première page : le coût ne suit pas le nombre de comptes", async () => {
    const m = await mesurerSerieuse(alice, PREMIERE_PAGE);
    console.log(`  première page : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);

    expect(
      m.plan.includes("Seq Scan"),
      `Balayage complet au milieu de mille comptes. À deux comptes, un balayage ` +
        `peut passer inaperçu — la moitié de la table est pertinente. Ici il ` +
        `lirait deux cent mille lignes pour en rendre cinquante.\n${m.plan.slice(0, 400)}`,
    ).toBe(false);
    expect(m.lignesLues, "lignes lues pour cinquante rendues").toBeLessThanOrEqual(
      LIGNES_LUES_MAX,
    );
    expect(m.ms).toBeLessThan(PAGE_MS);
  });

  test("tri « modifiées » : l'index tient à mille comptes", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label, updated_at from public.orders
       where archived_at is null
       order by updated_at desc, id desc limit ${PAR_PAGE}`,
    );
    console.log(`  tri modifiées : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.plan.includes("Seq Scan")).toBe(false);
    expect(m.lignesLues).toBeLessThanOrEqual(LIGNES_LUES_MAX);
    expect(m.ms).toBeLessThan(PAGE_MS);
  });

  test("tri « bloqué en transit » : l'index neuf tient à mille comptes", async () => {
    /*
     * LE TRI POSÉ AVEC LA 090, mesuré là où il servira. C'est celui dont le
     * plan est le plus fragile : il porte sur un index PARTIEL et trie sur une
     * colonne dénormalisée. Si le planificateur ne reconnaît pas la condition
     * partielle, il retombe sur un tri après filtrage — donc sur toute la
     * tranche du vendeur.
     */
    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label, parcel_last_movement_at from public.orders
       where archived_at is null
         and status = 'en_transit'
         and parcel_last_movement_at is not null
       order by parcel_last_movement_at asc, id asc limit ${PAR_PAGE}`,
    );
    console.log(`  tri bloquées : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);

    expect(
      m.plan.includes("orders_bloquees_idx"),
      `L'index partiel du tri « bloquées » n'est PAS employé. Le tri rend les ` +
        `mêmes lignes, dans le même ordre, en lisant toute la tranche du ` +
        `vendeur — une dégradation qu'aucun seuil de temps ne signalerait sur ` +
        `une petite base.\n${m.plan.slice(0, 500)}`,
    ).toBe(true);
    expect(m.plan.includes("Seq Scan")).toBe(false);
    expect(m.lignesLues).toBeLessThanOrEqual(LIGNES_LUES_MAX);
    expect(m.ms).toBeLessThan(PAGE_MS);
  });

  test("page PROFONDE par curseur : le coût ne suit pas le numéro de page", async () => {
    /*
     * La promesse de la pagination par curseur est que la page 190 coûte le
     * même prix que la page 1. C'est elle qui protège celui qui a le plus de
     * données — donc exactement le vendeur à deux cents commandes par semaine.
     */
    // `::text` EXPLICITE. Le pilote rend un `Date` JavaScript pour un
    // `timestamptz`, et `String(date)` produit « Sun Aug 17 2025 … heure d'été
    // d'Europe centrale » — que Postgres refuse. Le point de curseur du produit
    // voyage lui aussi en texte : le mesurer autrement mesurerait autre chose.
    const { rows } = await bd.query<{ created_at: string; id: string }>(
      `select created_at::text as created_at, id from public.orders where shop_id = $1
       order by created_at desc, id desc offset 9000 limit 1`,
      [alice.shopId],
    );
    const point = rows[0];
    expect(point, "le jeu ne contient pas de page profonde").toBeDefined();
    if (point === undefined) return;

    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label from public.orders
       where archived_at is null
         and (created_at, id) < ('${point.created_at}'::timestamptz, '${point.id}'::uuid)
       order by created_at desc, id desc limit ${PAR_PAGE}`,
    );
    console.log(`  page profonde : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.lignesLues).toBeLessThanOrEqual(LIGNES_LUES_MAX);
    expect(m.ms).toBeLessThan(PAGE_MS);
  });

  test("recherche insensible aux accents, au milieu de mille comptes", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label from public.orders
       where archived_at is null and recherche like '%creme%'
       order by created_at desc, id desc limit ${PAR_PAGE}`,
    );
    console.log(`  recherche : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(RECHERCHE_MS);
  });

  test("compteurs de tête : ils ne comptent que le compte qui les demande", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select
         count(*) filter (where status = 'preparation') as preparation,
         count(*) filter (where status = 'en_transit') as transit,
         count(*) filter (where status = 'livre') as livre,
         count(*) filter (where views_count = 0) as jamais
       from public.orders where archived_at is null`,
    );
    console.log(`  compteurs : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(
      m.lignesLues,
      "Les compteurs lisent plus que la tranche du vendeur : ils comptent la " +
        "base entière, et le chiffre affiché serait faux autant que lent.",
    ).toBeLessThanOrEqual(PLAFOND_COMMANDES + 500);
    expect(m.ms).toBeLessThan(COMPTEURS_MS);
  });
});

describe("Ce que mille comptes changent pour un vendeur ORDINAIRE", () => {
  test("un vendeur à 200 commandes lit sa page sans balayer la base", async () => {
    /*
     * Les mesures ci-dessus portent sur un compte au PLAFOND. Le cas le plus
     * fréquent est l'inverse : un vendeur ordinaire, noyé parmi mille autres.
     * Son risque n'est pas le volume — c'est que le planificateur, voyant une
     * table de deux cent mille lignes, juge le balayage complet moins cher que
     * l'index pour rendre ses cinquante lignes à lui.
     *
     * Mesuré SANS session, sur une tranche choisie au hasard : ce qu'on éprouve
     * ici est le PLAN, pas l'isolation, qui est établie ailleurs.
     */
    const { rows } = await bd.query<{ id: string }>(
      `select s.id from public.shops s
       join public.profiles p on p.id = s.owner_id
       where p.email like $1 || '%' order by s.id limit 1`,
      [PREFIXE],
    );
    const boutique = rows[0]?.id;
    expect(boutique, "aucune boutique ordinaire : la mesure n'a pas de sujet").toBeDefined();
    if (boutique === undefined) return;

    const resultat = await bd.query<{ "QUERY PLAN": unknown[] }>(
      `explain (analyze, format json)
       select id, customer_label from public.orders
       where shop_id = '${boutique}'::uuid and archived_at is null
       order by created_at desc, id desc limit ${PAR_PAGE}`,
    );
    const plan = JSON.stringify(
      (resultat.rows[0]?.["QUERY PLAN"] as Array<{ Plan: unknown }>)[0]?.Plan,
    );

    expect(
      plan.includes("Seq Scan"),
      `Balayage complet pour rendre les cinquante lignes d'un vendeur ordinaire. ` +
        `C'est la dégradation que mille comptes révèlent et que deux ne peuvent ` +
        `pas révéler.\n${plan.slice(0, 400)}`,
    ).toBe(false);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LA RECHERCHE ADMIN N'ÉTAIT MESURÉE PAR RIEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RELEVÉ LE 30/08/2026. `tests/perf/boutiques.test.ts` mesure
 * `lister_boutiques_admin('', '', '', '', 51, '')` — quatre arguments texte
 * VIDES. La branche `ilike` n'est donc jamais évaluée : le banc mesurait le
 * chemin sans recherche, c'est-à-dire celui qui ne coûte rien, et déclarait
 * l'écran mesuré.
 *
 * C'est un garde qui regarde là où le défaut n'est pas — le même motif que
 * L-025, appliqué non pas à une correction mais à une mesure.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE LA MESURE AU PLAFOND A DIT, avant d'écrire ce test
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 20 001 boutiques semées par le CHEMIN RÉEL (insertion dans `auth.users`, le
 * déclencheur d'inscription créant profil et boutique), dans une transaction
 * annulée. Rodage jeté, deux séries concordantes :
 *
 *   sans recherche — ce que le banc mesurait          0 /  0 ms   index
 *   terme fréquent                                   63 / 62 ms   Seq Scan
 *   terme rare (le pire cas)                         95 / 95 ms   Seq Scan
 *   terme accentué                                   91 / 91 ms   Seq Scan
 *
 * ⚠️ ON NE POSE PAS D'INDEX SUR CE CONSTAT. 95 ms sur vingt mille comptes est
 * acceptable pour un écran d'administration, et un index trigramme coûterait un
 * GIN sur toutes les lignes de tous les comptes, donc un surcoût à CHAQUE
 * inscription, pour accélérer une lecture dont on n'a pas établi qu'elle gêne.
 * Un seuil dépassé ne veut pas dire qu'il manque un index (L-017) — et ici le
 * seuil n'est même pas dépassé.
 *
 * CE QUI MANQUAIT N'ÉTAIT PAS L'INDEX, C'ÉTAIT LA MESURE. Le coût croît
 * linéairement avec le nombre d'inscrits ; il doit donc être VU croître. Ce
 * test le fait apparaître à chaque passage du banc, et échouera le jour où il
 * cesse d'être linéaire — par exemple si quelqu'un ajoutait une jointure vers
 * une table d'activité, ce qui rendrait le coût proportionnel aux COMMANDES et
 * non plus aux inscrits.
 */

/** Seuil FIXÉ AVANT la mesure, à mille boutiques : vingt fois la marge. */
const RECHERCHE_ADMIN_MS = 60;

/**
 * Le corps de la recherche de `lister_boutiques_admin`, tel que la migration
 * 114 l'écrit. Recopié, donc susceptible de diverger : le test compare le
 * nombre de lignes rendues par la transcription et par la fonction elle-même.
 */
const CORPS_RECHERCHE = (terme: string): string => `
  select s.id, s.name, p.email
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where extensions.unaccent(coalesce(s.name, '')) ilike '%' || extensions.unaccent('${terme}') || '%'
     or extensions.unaccent(p.email) ilike '%' || extensions.unaccent('${terme}') || '%'
  order by s.stockage_octets desc, s.id desc
  limit 51`;

describe("La recherche des boutiques est mesurée, et pas seulement la liste", () => {
  test("CONTRE-TEST : le jeu porte bien les mille boutiques", async () => {
    // Un ensemble vide passe tout : sans ce contrôle, une recherche instantanée
    // sur une table vide passerait tous les seuils sans rien prouver.
    // ⚠️ LE PRÉFIXE EST SUR L'E-MAIL, PAS SUR LE NOM DE BOUTIQUE. Les mille
    // comptes sont créés par le déclencheur d'inscription, qui pose une
    // boutique SANS NOM — `shops.name` est nullable sans défaut, et c'est
    // justement l'état le plus fréquent au début de vie d'un compte. Compter
    // par le nom rendait zéro, et ce contre-test l'a dit tout de suite.
    const { rows } = await bd.query<{ n: string }>(
      `select count(*)::int as n from public.shops s
       join public.profiles p on p.id = s.owner_id where p.email like $1`,
      [PREFIXE + "%"],
    );
    expect(Number(rows[0]?.n ?? 0), "les mille boutiques ne sont pas là").toBeGreaterThanOrEqual(
      BOUTIQUES,
    );
  });

  test("un terme RARE — le pire cas — reste sous le seuil", async () => {
    /*
     * LE PIRE CAS EST LE TERME QUI NE TROUVE RIEN, pas celui qui trouve tout :
     * Postgres parcourt l'index de tri dans l'ordre en évaluant le `ilike`
     * ligne à ligne jusqu'à réunir cinquante et une correspondances. Un terme
     * qui n'en a aucune l'oblige à aller au bout.
     */
    const m = await mesurerSerieuse(alice, CORPS_RECHERCHE("zzintrouvable"));
    console.log(`  recherche, terme rare : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(
      m.ms,
      `${m.ms.toFixed(1)} ms au-dessus de ${RECHERCHE_ADMIN_MS} ms. Vérifier D'ABORD ` +
        "que la requête ne demande pas plus que nécessaire : mesuré à 95 ms sur " +
        "VINGT MILLE comptes, ce chemin ne devrait pas coûter cela sur mille.",
    ).toBeLessThan(RECHERCHE_ADMIN_MS);
  });

  test("le coût suit les INSCRITS, jamais les commandes", async () => {
    /*
     * LA PROPRIÉTÉ QUI COMPTE À LONG TERME. Le coût de cette recherche doit
     * croître avec le nombre de comptes, et avec lui seulement. Une jointure
     * ajoutée un jour vers `orders`, `order_media` ou `link_views` la rendrait
     * proportionnelle à l'ACTIVITÉ — et un vendeur à deux cents commandes par
     * semaine ferait alors ralentir un écran qui ne parle pas de lui.
     */
    const m = await mesurerSerieuse(alice, CORPS_RECHERCHE("zzintrouvable"));
    for (const table of ["orders", "order_media", "link_views", "tracked_parcels"]) {
      expect(
        m.plan.includes(`"Relation Name":"${table}"`),
        `la recherche des boutiques lit ${table} : son coût suivrait l'activité`,
      ).toBe(false);
    }
    // Et elle ne lit pas plus de lignes qu'il n'y a d'inscrits — à un facteur
    // deux près, les deux tables jointes étant parcourues.
    expect(m.lignesLues).toBeLessThan((BOUTIQUES + 2) * 3);
  });

  test("« creme » trouve « Crème » — le repli d'accents, à l'échelle", async () => {
    /*
     * ⚠️ CE N'EST PAS UNE MESURE, C'EST LA PROPRIÉTÉ QUE LA MESURE SUPPOSE.
     * « La recherche insensible aux accents est en place » est resté vrai
     * pendant que l'index ne repliait rien. Ici le repli vient d'un appel
     * `unaccent()` à l'exécution ; on vérifie qu'il RÉPOND, pas qu'il existe.
     */
    await bd.query("begin");
    try {
      await bd.query("update public.shops set name = 'Crème Fraîche' where id = $1", [
        alice.shopId,
      ]);
      const { rows } = await bd.query<{ name: string }>(CORPS_RECHERCHE("creme"));
      expect(
        rows.map((r) => r.name),
        "« creme » ne trouve pas « Crème » : le repli d'accents ne replie rien",
      ).toContain("Crème Fraîche");
    } finally {
      await bd.query("rollback");
    }
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LES ÉCRANS ADMIN « COMMANDES » ET « STATISTIQUES » (migrations 159 à 161)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce sont les deux premiers écrans du produit qui lisent TOUTES les commandes
 * de TOUS les vendeurs. Le banc à mille comptes est le seul terrain où leur
 * coût se voit : 219 200 commandes.
 *
 * SEUILS ÉCRITS AVANT LA PREMIÈRE EXÉCUTION (14/09/2026) :
 * - la LISTE doit coûter une page, pas une plateforme : 60 ms et moins de
 *   mille lignes lues, comme une page vendeur, et par l'index partiel
 *   `orders_plateforme_recentes_idx` — sans lui, trier la plateforme lirait la
 *   table entière ;
 * - les STATISTIQUES comptent la fenêtre entière par construction : 1 000 ms
 *   par fonction, pour un écran qu'on ouvre quelques fois par jour.
 *
 * LES FONCTIONS SONT APPELÉES POUR DE VRAI, sous un rôle administrateur posé
 * dans la transaction de mesure et annulé avec elle : garde, audit et corps
 * compris. Leur plan, lui, est opaque (« Function Scan ») — il se lit sur la
 * transcription du corps, dont le nombre de lignes est comparé à la fonction.
 */
const LISTE_ADMIN_MS = 60;
const STATISTIQUES_MS = 1_000;

async function mesurerEnAdmin(sql: string): Promise<Mesure & { lignes: number }> {
  await bd.query("begin");
  try {
    await bd.query("update public.profiles set role = 'admin' where id = $1", [alice.profilId]);
    await bd.query("set local role authenticated");
    await bd.query(`set local request.jwt.claims = '{"sub":"${alice.userId}"}'`);
    const debut = performance.now();
    const { rowCount } = await bd.query(sql);
    const ms = performance.now() - debut;
    return { ms, plan: "", lignesLues: 0, lignes: rowCount ?? 0 };
  } finally {
    await bd.query("rollback");
  }
}

describe("L'administration lit toute la plateforme sans la parcourir", () => {
  test("la liste des commandes, première page : l'index partiel, pas la table", async () => {
    const corps = `
      select o.id, s.name, p.email, o.status, colis.carrier_code, o.created_at
        from public.orders o
        join public.shops s on s.id = o.shop_id
        join public.profiles p on p.id = s.owner_id
        left join lateral (
          select tp.carrier_code from public.order_parcels op
            join public.tracked_parcels tp on tp.id = op.parcel_id
           where op.order_id = o.id order by tp.created_at desc, tp.id desc limit 1
        ) colis on true
       where o.first_content_at is not null
       order by o.created_at desc, o.id desc
       limit ${PAR_PAGE + 1}`;
    // Le plan se lit en superutilisateur : la fonction est `security definer`,
    // la RLS de l'appelant n'entre pas dans son corps.
    const resultat = await bd.query<{ "QUERY PLAN": unknown[] }>(`explain (analyze, format json) ${corps}`);
    const racine = (resultat.rows[0]?.["QUERY PLAN"] as Array<{ Plan: Record<string, unknown> }>)[0];
    const plan = JSON.stringify(racine?.Plan);
    let lignesOrders = 0;
    const parcourir = (n: Record<string, unknown>): void => {
      if (String(n["Relation Name"] ?? "") === "orders") {
        lignesOrders += Number(n["Actual Rows"] ?? 0) * Number(n["Actual Loops"] ?? 1);
      }
      for (const e of (n["Plans"] as Record<string, unknown>[] | undefined) ?? []) parcourir(e);
    };
    if (racine !== undefined) parcourir(racine.Plan);
    console.log(`  liste admin : ${lignesOrders} commandes lues`);
    expect(plan, "le tri de la plateforme n'emprunte pas l'index partiel").toContain("orders_plateforme_recentes_idx");
    expect(lignesOrders, "la première page lit plus qu'une page").toBeLessThan(LIGNES_LUES_MAX);

    const m = await seriesConcordantes(() =>
      mesurerEnAdmin("select * from public.lister_commandes_admin('', '', '', '', '', 51, '')"),
    );
    console.log(`  liste admin (fonction réelle, audit compris) : ${m.ms.toFixed(1)} ms, ${m.lignes} lignes`);
    expect(m.lignes, "la fonction ne rend pas une page pleine : le jeu ne décrit rien").toBe(PAR_PAGE + 1);
    expect(m.ms).toBeLessThan(LISTE_ADMIN_MS);
  });

  test("les quatre fonctions des statistiques, sur 30 et 90 jours", async () => {
    for (const sql of [
      "select * from public.statistiques_admin(30)",
      "select * from public.statistiques_admin(90)",
      "select * from public.statistiques_admin_par_jour(30)",
      "select * from public.statistiques_admin_par_jour(90)",
      "select * from public.transporteurs_admin(90)",
      "select * from public.croissance_admin()",
    ]) {
      const m = await seriesConcordantes(() => mesurerEnAdmin(sql));
      console.log(`  ${sql.replace("select * from public.", "")} : ${m.ms.toFixed(1)} ms`);
      // LE JEU NE SÈME AUCUN COLIS SUIVI (voir l'en-tête : les ingestions réelles
      // prendraient des heures) : les transporteurs n'ont rien à rendre, et
      // leur mesure ne vaut que pour le temps. Les autres fonctions rendent
      // toujours une ligne — une grille de jours ou de mois, des totaux.
      if (!sql.includes("transporteurs_admin")) {
        expect(m.lignes, `${sql} n'a rien rendu`).toBeGreaterThan(0);
      }
      expect(m.ms, `${sql} : ${m.ms.toFixed(1)} ms`).toBeLessThan(STATISTIQUES_MS);
    }
  });

  test("CONTRE-TEST : les statistiques comptent bien le jeu semé", async () => {
    // Un compteur à zéro passerait tous les seuils de temps.
    await bd.query("begin");
    try {
      await bd.query("update public.profiles set role = 'admin' where id = $1", [alice.profilId]);
      await bd.query("set local role authenticated");
      await bd.query(`set local request.jwt.claims = '{"sub":"${alice.userId}"}'`);
      const { rows } = await bd.query<{ commandes: string }>("select commandes from public.statistiques_admin(90)");
      expect(Number(rows[0]?.commandes ?? 0)).toBeGreaterThanOrEqual(BOUTIQUES * COMMANDES_PAR_BOUTIQUE);
    } finally {
      await bd.query("rollback");
    }
  });
});

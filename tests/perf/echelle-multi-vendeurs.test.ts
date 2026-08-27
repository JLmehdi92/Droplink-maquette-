import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

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

/** Rodage JETÉ, puis deux séries CONCORDANTES, la pire retenue. */
async function mesurerSerieuse(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  await mesurer(utilisateur, sql);
  const a = await mesurer(utilisateur, sql);
  const b = await mesurer(utilisateur, sql);
  const ecart = Math.abs(a.ms - b.ms) / Math.max(a.ms, b.ms);
  if (ecart > 0.6 && Math.max(a.ms, b.ms) > 10) {
    throw new Error(
      `Séries discordantes : ${a.ms.toFixed(1)} ms puis ${b.ms.toFixed(1)} ms ` +
        `(${(ecart * 100).toFixed(0)} % d'écart). La mesure ne décrit rien de stable.`,
    );
  }
  return a.ms >= b.ms ? a : b;
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

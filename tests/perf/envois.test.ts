import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { SEUIL_SILENCE_JOURS } from "@/lib/tracking/silence";

/**
 * L'ÉCRAN DES ENVOIS, AU PLAFOND.
 *
 * `tracked_parcels` croît d'une ligne par NUMÉRO DE SUIVI et par vendeur. Un
 * fournisseur à 800 commandes par mois qui ne groupe pas ses envois y crée
 * autant de colis : 9 600 sur l'année, comme ses commandes.
 *
 * CE QUI REND CET ÉCRAN DIFFÉRENT DU TABLEAU DE BORD : son tri par défaut porte
 * sur l'IMMOBILITÉ, c'est-à-dire sur une colonne qui change à chaque mouvement
 * rapporté par le transporteur. C'est le tri le plus utile — le vendeur vient
 * voir ce qui est bloqué — et donc celui qu'il faut mesurer en premier.
 *
 * MESURÉ AVEC UN COMPTE VOISIN de même volumétrie : une requête peut sembler
 * rapide sur une base mono-compte, où l'isolation ne filtre rien et où l'index
 * n'a qu'un seul `shop_id` à distinguer.
 */

const COLIS = 9_600;
const PAR_PAGE = 50;

/*
 * SEUILS — écrits AVANT la première exécution, et avant de connaître le moindre
 * chiffre. Sans seuil écrit d'avance, « on décidera sur la mesure » devient
 * « on a mesuré, ça allait ».
 *
 * Les seuils de LIGNES LUES sont ceux qui protègent réellement. Un temps seul
 * certifie une performance qui n'existe qu'à la volumétrie de test : l'index
 * retiré, la requête resterait rapide sur 9 600 lignes et s'effondrerait sur
 * 100 000 sans que rien ne l'ait signalé entre les deux.
 */
const PAGE_MS = 60;
const COMPTEURS_MS = 120;
/** 50 lignes rendues, plus la marge d'un index qui en écarte quelques-unes. */
const LIGNES_LUES_PAGE = 200;
/**
 * Les compteurs lisent forcément TOUS les colis du vendeur — c'est un agrégat,
 * et aucun index ne rattrape un agrégat complet. Ce qui doit rester vrai, c'est
 * qu'ils ne lisent pas ceux du VOISIN : le seuil est donc le volume d'un compte,
 * pas celui de la table.
 */
const LIGNES_LUES_COMPTEURS = COLIS + 200;

let bd: Client;
let alice: UtilisateurDeTest;
let voisin: UtilisateurDeTest;

type Mesure = { ms: number; lignesLues: number; balayees: string[]; opaque: boolean };

/**
 * Les tables dont un balayage séquentiel est un DÉFAUT, parce qu'elles
 * grossissent avec l'usage. Chercher « Seq Scan » dans le plan entier ne
 * prouverait rien : le contrôle porterait sur un MOT présent dans un texte, pas
 * sur la table qui le subit.
 */
const TABLES_QUI_GROSSISSENT = ["tracked_parcels", "order_parcels", "orders"];

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

    let lignesLues = 0;
    let opaque = false;
    const balayees: string[] = [];

    const parcourir = (noeud: Record<string, unknown>): void => {
      const type = String(noeud["Node Type"] ?? "");
      if (type.includes("Scan")) {
        // CE QUE LA BASE A DÛ REGARDER, pas ce qu'elle a rendu. « Actual Rows »
        // ne compte que les lignes SORTIES du nœud ; celles lues puis jetées par
        // un filtre n'y figurent pas, et ce sont exactement celles qu'on borne.
        const boucles = Number(noeud["Actual Loops"] ?? 1);
        lignesLues +=
          (Number(noeud["Actual Rows"] ?? 0) +
            Number(noeud["Rows Removed by Filter"] ?? 0) +
            Number(noeud["Rows Removed by Index Recheck"] ?? 0)) *
          boucles;
      }
      if (type === "Seq Scan") balayees.push(String(noeud["Relation Name"] ?? "?"));
      /*
       * UN PLAN QUI NE MONTRE RIEN DOIT LE DIRE.
       *
       * `explain` d'un appel de fonction rend un `Function Scan` dont l'`Actual
       * Rows` vaut 1 : celui de la LIGNE RENDUE, pas des lignes agrégées. Sans
       * ce drapeau, la sonde annonçait « 1 ligne lue » pour un agrégat portant
       * sur 9 600 colis, et n'importe quel seuil passait — un ensemble vide
       * passe tout. Une mesure impossible se dit impossible.
       */
      if (type === "Function Scan") opaque = true;
      for (const enfant of (noeud["Plans"] as Array<Record<string, unknown>>) ?? []) {
        parcourir(enfant);
      }
    };
    parcourir(racine.Plan);

    return { ms: racine["Execution Time"], lignesLues, balayees, opaque };
  } finally {
    await bd.query("rollback");
  }
}

/**
 * Mesure SANS RLS, comme s'exécute une fonction `security definer`.
 *
 * LE HARNAIS ORDINAIRE POSE `set local role authenticated`, donc la RLS filtre :
 * il mesure ce que voit UN vendeur. Le panneau d'administration, lui, agrège
 * TOUT — c'est une fonction `security definer`. Mesurer le panneau avec le
 * harnais du vendeur sous-estimait son coût d'un facteur égal au NOMBRE DE
 * COMPTES : 9 600 lignes annoncées pour 19 200 réellement lues, avec deux
 * comptes seulement. À mille comptes, l'écart aurait été de mille.
 *
 * C'est exactement le genre de mesure qui rassure jusqu'au jour où le produit
 * marche.
 */
async function mesurerGlobal(sql: string): Promise<Mesure> {
  const resultat = await bd.query<{ "QUERY PLAN": unknown[] }>(
    `explain (analyze, buffers, format json) ${sql}`,
  );
  const racine = (
    resultat.rows[0]?.["QUERY PLAN"] as Array<{
      Plan: Record<string, unknown>;
      "Execution Time": number;
    }>
  )[0];
  if (racine === undefined) throw new Error("plan illisible");

  let lignesLues = 0;
  let opaque = false;
  const balayees: string[] = [];

  const parcourir = (noeud: Record<string, unknown>): void => {
    const type = String(noeud["Node Type"] ?? "");
    if (type.includes("Scan")) {
      const boucles = Number(noeud["Actual Loops"] ?? 1);
      lignesLues +=
        (Number(noeud["Actual Rows"] ?? 0) +
          Number(noeud["Rows Removed by Filter"] ?? 0) +
          Number(noeud["Rows Removed by Index Recheck"] ?? 0)) *
        boucles;
    }
    if (type === "Seq Scan") balayees.push(String(noeud["Relation Name"] ?? "?"));
    if (type === "Function Scan") opaque = true;
    for (const enfant of (noeud["Plans"] as Array<Record<string, unknown>>) ?? []) {
      parcourir(enfant);
    }
  };
  parcourir(racine.Plan);

  return { ms: racine["Execution Time"], lignesLues, balayees, opaque };
}

/** Rodage jeté, puis deux séries, sans RLS. Rend la PIRE. */
async function mesurerGlobalSerieuse(sql: string): Promise<Mesure> {
  await mesurerGlobal(sql);
  const a = await mesurerGlobal(sql);
  const b = await mesurerGlobal(sql);
  return a.ms >= b.ms ? a : b;
}

/** Rodage jeté, puis deux séries. Rend la PIRE — jamais la meilleure. */
async function mesurerSerieuse(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  await mesurer(utilisateur, sql);
  const a = await mesurer(utilisateur, sql);
  const b = await mesurer(utilisateur, sql);

  const ecart = Math.abs(a.ms - b.ms) / Math.max(a.ms, b.ms);
  if (ecart > 0.6 && Math.max(a.ms, b.ms) > 10) {
    throw new Error(
      `Séries discordantes : ${a.ms.toFixed(1)} ms puis ${b.ms.toFixed(1)} ms. ` +
        "La mesure ne décrit rien de stable.",
    );
  }
  return a.ms >= b.ms ? a : b;
}

function balayagesInterdits(mesure: Mesure): string[] {
  return mesure.balayees.filter((t) => TABLES_QUI_GROSSISSENT.includes(t));
}

/**
 * Sème des colis étalés dans le temps.
 *
 * Un dixième d'entre eux n'a JAMAIS bougé (`last_movement_at` nul) : c'est le
 * cas que la colonne générée doit absorber, et un jeu où tous les colis ont un
 * mouvement rendrait le tri trivial sans rien prouver.
 */
async function semer(utilisateur: UtilisateurDeTest, etiquette: string): Promise<void> {
  await bd.query(
    `insert into public.tracked_parcels
       (shop_id, tracking_number, carrier_code, normalized_status, last_movement_at, created_at)
     select
       $1,
       $2 || '-' || i,
       3011,
       (array['preparation','expedie','en_transit','livre'])[1 + (i % 4)]::public.parcel_status,
       case when i % 10 = 0 then null else now() - (i || ' hours')::interval end,
       now() - (i || ' minutes')::interval
     from generate_series(1, $3) as i`,
    [utilisateur.shopId, etiquette, COLIS],
  );
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("perf-envois-alice");
  voisin = await creerUtilisateur("perf-envois-voisin");

  await semer(alice, "AL");
  await semer(voisin, "VO");

  // LES PRISES EN CHARGE SONT DATÉES sur le mois courant : c'est ce que le
  // panneau d'administration agrège, et sans elles la mesure porterait sur zéro
  // ligne — un ensemble vide passe tout.
  await bd.query(
    `update public.tracked_parcels set registered_at = date_trunc('month', now()) + interval '1 hour'
     where shop_id = any($1)`,
    [[alice.shopId, voisin.shopId]],
  );

  /*
   * `VACUUM` SUR LES COMPTEURS, ET C'EST UN ARTEFACT DU SEED QU'IL FAUT NOMMER.
   *
   * L'`update` ci-dessus incrémente le compteur 19 200 fois sur DEUX lignes : le
   * déclencheur produit donc 19 200 versions mortes que le parcours relit
   * ensuite, et la mesure annonçait 19 213 lignes lues pour une table qui en
   * porte deux.
   *
   * En usage réel, ces incréments sont étalés — quelques centaines par compte et
   * par MOIS, au rythme où un vendeur colle ses numéros — et l'autovacuum suit
   * sans peine. Le seed les concentre en une seconde, ce qu'aucun vendeur ne
   * fera jamais. On nettoie donc explicitement pour que la mesure décrive le
   * régime permanent plutôt que le pire instant d'un remplissage artificiel.
   *
   * Ce n'est PAS un maquillage : la contention et le gonflement de cette table
   * sont réels et suivent le nombre de prises en charge. Ce que cette mesure ne
   * peut pas établir, elle ne l'établit pas — elle porte sur le COÛT DE LECTURE
   * du panneau, pas sur le coût d'écriture du compteur.
   */
  await bd.query("vacuum analyze public.usage_counters");
  await bd.query("analyze public.tracked_parcels");
}, 300_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(voisin);
  await bd.end();
  // Même cascade, même borne : voir vues-et-journal.
}, 300_000);

describe("Le jeu de mesure", () => {
  test("il porte bien la volumétrie qu'il prétend décrire", async () => {
    // TOUTE MESURE PORTE UNE ASSERTION SUR SON JEU. Sans elle, une purge
    // accidentelle ferait consigner une amélioration spectaculaire, et l'on
    // retirerait un index pour un problème inexistant.
    const { rows } = await bd.query<{ n: string }>(
      "select count(*) as n from public.tracked_parcels where shop_id = $1",
      [alice.shopId],
    );
    expect(Number(rows[0]?.n)).toBe(COLIS);

    const voisins = await bd.query<{ n: string }>(
      "select count(*) as n from public.tracked_parcels where shop_id = $1",
      [voisin.shopId],
    );
    // Le compte voisin n'est pas décoratif : sans lui, l'index n'a qu'un seul
    // `shop_id` à distinguer et l'isolation ne filtre rien.
    expect(Number(voisins.rows[0]?.n)).toBe(COLIS);
  });
});

describe("La liste des envois", () => {
  test(`le tri par défaut rend 50 lignes sans lire la table (< ${PAGE_MS} ms, < ${LIGNES_LUES_PAGE} lignes)`, async () => {
    const m = await mesurerSerieuse(
      alice,
      `select id, tracking_number, carrier_code, normalized_status, immobile_depuis,
              updated_at, first_movement_at, last_movement_at, abandoned_at, query_count
       from public.tracked_parcels
       order by immobile_depuis asc, id asc
       limit ${PAR_PAGE + 1}`,
    );

    console.log(`  envois, tri par défaut : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(PAGE_MS);
    expect(m.lignesLues).toBeLessThan(LIGNES_LUES_PAGE);
    expect(balayagesInterdits(m), "balayage séquentiel").toEqual([]);
  });

  test("la page 40 coûte le MÊME prix que la page 1", async () => {
    // C'est toute la raison du curseur. Avec un décalage, la page 40 d'un jeu de
    // 9 600 lit 2 000 lignes pour en rendre 50 : le coût croît avec le numéro de
    // page, donc l'inconfort arrive chez celui qui a le plus de données.
    const { rows } = await bd.query<{ immobile_depuis: Date; id: string }>(
      `select immobile_depuis, id from public.tracked_parcels
       where shop_id = $1 order by immobile_depuis asc, id asc
       offset $2 limit 1`,
      [alice.shopId, 40 * PAR_PAGE],
    );
    const point = rows[0];
    expect(point, "le jeu ne contient pas 40 pages").toBeDefined();
    if (point === undefined) return;

    const m = await mesurerSerieuse(
      alice,
      `select id, tracking_number, normalized_status, immobile_depuis
       from public.tracked_parcels
       where (immobile_depuis, id) > ('${point.immobile_depuis.toISOString()}'::timestamptz,
                                      '${point.id}'::uuid)
       order by immobile_depuis asc, id asc
       limit ${PAR_PAGE + 1}`,
    );

    console.log(`  envois, page 40 : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(PAGE_MS);
    expect(m.lignesLues).toBeLessThan(LIGNES_LUES_PAGE);
    expect(balayagesInterdits(m), "balayage séquentiel").toEqual([]);
  });

  test("le filtre « sans mouvement » ne lit pas la table entière", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select id, tracking_number, immobile_depuis
       from public.tracked_parcels
       where immobile_depuis < now() - interval '${SEUIL_SILENCE_JOURS} days'
         and normalized_status <> 'livre'
         and abandoned_at is null
       order by immobile_depuis asc, id asc
       limit ${PAR_PAGE + 1}`,
    );

    console.log(`  envois, silencieux : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(PAGE_MS);
    expect(m.lignesLues).toBeLessThan(LIGNES_LUES_PAGE);
    expect(balayagesInterdits(m), "balayage séquentiel").toEqual([]);
  });
});

describe("Le panneau d'administration, à l'échelle", () => {
  /*
   * SEUIL ÉCRIT AVANT LA PREMIÈRE EXÉCUTION : 300 ms.
   *
   * C'EST LE SEUL ENDROIT DU PRODUIT OÙ LE COÛT CROÎT AVEC LE NOMBRE TOTAL DE
   * COMPTES. Partout ailleurs la RLS borne chaque requête à une boutique ; ici
   * on agrège volontairement l'ensemble, et c'est donc le premier écran qui
   * ralentira quand le produit marchera.
   *
   * Ce qui le rend tenable : les compteurs de colis sont bornés AU MOIS. Leur
   * coût ne croît pas avec l'âge du produit, seulement avec son activité
   * courante — et un index partiel sur `registered_at` écarte les colis jamais
   * pris en charge, qui sont la majorité chez un vendeur qui débute.
   */
  const PANNEAU_MS = 300;

  test(`les alertes ne balaient pas la table des colis (< ${PANNEAU_MS} ms)`, async () => {
    const m = await mesurerGlobalSerieuse(
      `select p.email, u.parcels_registered
       from public.usage_counters u
       join public.profiles p on p.id = u.profile_id
       where u.period_month = date_trunc('month', now())::date
         and u.parcels_registered > 1200`,
    );

    console.log(`  panneau, alertes : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.opaque, "plan opaque : la mesure ne décrit rien").toBe(false);
    expect(m.ms).toBeLessThan(PANNEAU_MS);
    // La sonde doit avoir inspecté quelque chose : le jeu porte 19 200 colis
    // pris en charge ce mois, répartis sur deux comptes.
    /*
     * LE SEUIL QUI PROTÈGE CET ÉCRAN À L'ÉCHELLE.
     *
     * Le panneau doit lire UNE LIGNE PAR COMPTE, jamais une par colis. Mesuré
     * avant dénormalisation : 19 244 lignes pour deux comptes de 9 600 colis —
     * un coût linéaire dans l'activité TOTALE du produit, donc des millions de
     * lignes à mille vendeurs, exactement quand le produit marche.
     *
     * Le seuil est délibérément bas : il échouerait immédiatement si quelqu'un
     * refaisait passer cette requête par `tracked_parcels`.
     */
    expect(
      m.lignesLues,
      `${m.lignesLues} lignes lues : le panneau parcourt les colis au lieu des compteurs`,
    ).toBeLessThan(500);
  });

  test(`le compteur facturable est borné au mois (< ${PANNEAU_MS} ms)`, async () => {
    const m = await mesurerGlobalSerieuse(
      `select coalesce(sum(u.parcels_registered), 0) from public.usage_counters u
       where u.period_month = date_trunc('month', now())::date`,
    );

    console.log(`  panneau, facturable : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(PANNEAU_MS);
    expect(m.lignesLues, "le compteur facturable parcourt encore les colis").toBeLessThan(500);
  });

  test("contre-test positif : la sonde SAIT voir un parcours de colis", async () => {
    // Sans lui, « moins de 500 lignes » ci-dessus pourrait vouloir dire que la
    // sonde ne regarde rien. Un ensemble vide passe tout.
    const m = await mesurerGlobalSerieuse(
      `select count(*) from public.tracked_parcels
       where registered_at >= date_trunc('month', now())`,
    );
    expect(m.lignesLues, "la sonde ne voit pas un parcours de 19 200 colis").toBeGreaterThan(
      COLIS * 2 - 100,
    );
  });

  test("le comptage des comptes reste borné par le nombre d'inscrits", async () => {
    // Il est EXACT, et il peut l'être : `profiles` porte une ligne par compte,
    // soit quelques milliers. C'est la seule table du produit dont le volume ne
    // croît pas avec l'usage, seulement avec les inscriptions.
    const m = await mesurerGlobalSerieuse("select count(*) from public.profiles");
    console.log(`  panneau, comptes : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(PANNEAU_MS);
  });
});

describe("Les compteurs de l'en-tête", () => {
  test("la sonde REFUSE de mesurer un plan qu'elle ne voit pas", async () => {
    // `explain` d'un appel de fonction rend un `Function Scan` opaque : rien de
    // ce qui se passe à l'intérieur n'apparaît. La sonde doit le signaler, sinon
    // elle annonce « 1 ligne lue » pour un agrégat portant sur 9 600 colis — et
    // le seuil qui devait protéger l'isolation passe sans rien inspecter.
    const opaque = await mesurer(alice, `select * from public.compter_envois(${SEUIL_SILENCE_JOURS})`);
    expect(opaque.opaque, "la sonde ne reconnaît plus un plan opaque").toBe(true);
    expect(opaque.lignesLues, "un plan opaque ne peut pas rendre un compte crédible").toBeLessThan(
      10,
    );
  });

  test(`ils ne lisent que la boutique de l'appelant (< ${COMPTEURS_MS} ms)`, async () => {
    // ON MESURE LE CORPS DE LA FONCTION, pas son appel : c'est le seul moyen de
    // voir ce que la base lit réellement. Le corps est recopié ici, ce qui est
    // une duplication assumée — la falsification `compteurs-hors-rls` la vérifie
    // en cassant la fonction et en constatant que ce test le voit.
    const m = await mesurerSerieuse(
      alice,
      `select count(*),
              count(*) filter (where tp.normalized_status = 'preparation'),
              count(*) filter (where tp.normalized_status = 'livre'),
              count(*) filter (
                where tp.normalized_status <> 'livre'
                  and tp.abandoned_at is null
                  and tp.immobile_depuis < now() - make_interval(days => ${SEUIL_SILENCE_JOURS})
              )
       from public.tracked_parcels tp`,
    );

    console.log(`  envois, compteurs : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.opaque, "plan opaque : la mesure ne décrit rien").toBe(false);
    expect(
      m.lignesLues,
      "la sonde n'a rien inspecté : un agrégat sur 9 600 colis en lit forcément beaucoup",
    ).toBeGreaterThan(1_000);
    expect(m.ms).toBeLessThan(COMPTEURS_MS);
    // LE SEUIL QUI COMPTE : un agrégat lit forcément toutes les lignes du
    // vendeur, mais jamais celles du voisin. Dépasser ce seuil signifierait que
    // la RLS ne filtre plus en amont de l'agrégat, et le coût croîtrait alors
    // avec le NOMBRE DE VENDEURS — c'est-à-dire avec le succès du produit.
    expect(
      m.lignesLues,
      `${m.lignesLues} lignes lues : les colis du voisin sont comptés aussi`,
    ).toBeLessThan(LIGNES_LUES_COMPTEURS);
  });
});

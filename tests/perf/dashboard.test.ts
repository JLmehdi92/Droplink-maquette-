import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";

/**
 * MESURE DU TABLEAU DE BORD, AU PLAFOND.
 *
 * Protocole, appliqué à la lettre :
 *
 *   - LES SEUILS SONT ÉCRITS AVANT de connaître le moindre chiffre. Sans seuil
 *     fixé à l'avance, « on décidera sur la mesure » devient « on a mesuré, ça
 *     allait ».
 *   - ON MESURE LE PLAN, pas seulement le chronomètre. Un seuil de temps seul
 *     certifie une performance qui n'existe qu'à la volumétrie de test.
 *   - RODAGE JETÉ, puis DEUX SÉRIES CONCORDANTES. Une mesure isolée se trompe
 *     dans le sens rassurant : la première paie l'établissement de connexion et
 *     le remplissage du cache.
 *   - UN COMPTE VOISIN DE MÊME VOLUMÉTRIE est présent. Une requête peut sembler
 *     rapide sur une base mono-compte et s'effondrer dès que l'isolation filtre
 *     réellement.
 *   - CHAQUE MESURE PORTE UNE ASSERTION SUR LE JEU qu'elle décrit. Sans elle,
 *     une purge accidentelle ferait consigner une amélioration spectaculaire, et
 *     l'on retirerait un index pour un problème inexistant.
 *   - ON MESURE CE QUE L'ÉCRAN APPELLE, avec la RLS active, pas la requête
 *     brute : l'écart peut être d'un facteur dix.
 */

/** 800 commandes/mois pendant douze mois : le plafond annoncé du brief. */
const PLAFOND_COMMANDES = 9_600;
const PAR_PAGE = 50;

/*
 * SEUILS — écrits avant la première exécution.
 *
 * `PAGE_MS` vaut 60 : au-delà, l'écran le plus utilisé du produit cesse d'être
 * instantané pour quelqu'un qui y passe sa journée.
 *
 * `RATIO_PAGINATION` est le seuil qui compte VRAIMENT. Toute l'idée de la
 * pagination par curseur est que la page 200 coûte le même prix que la page 1.
 * Avec un décalage, le coût croît avec le NUMÉRO de page, donc l'inconfort
 * arrive chez celui qui a le plus de données. Un ratio supérieur à 2 signifierait
 * que le curseur ne remplit pas son office, même si le temps absolu passe.
 */
const PAGE_MS = 60;
const RECHERCHE_MS = 250;
const RATIO_PAGINATION = 2;
const LIGNES_LUES_MAX = 1_000;

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

    // Somme des lignes réellement produites par les nœuds de balayage : c'est
    // ce que la base a dû LIRE pour rendre cinquante lignes.
    let lignesLues = 0;
    const parcourir = (noeud: Record<string, unknown>): void => {
      const type = String(noeud["Node Type"] ?? "");
      if (type.includes("Scan")) {
        lignesLues += Number(noeud["Actual Rows"] ?? 0) * Number(noeud["Actual Loops"] ?? 1);
      }
      for (const enfant of (noeud["Plans"] as Array<Record<string, unknown>>) ?? []) {
        parcourir(enfant);
      }
    };
    parcourir(racine.Plan);

    return { ms: racine["Execution Time"], plan: texte, lignesLues };
  } finally {
    await bd.query("rollback");
  }
}

/** Rodage jeté, puis deux séries. Rend la PIRE des deux — jamais la meilleure. */
async function mesurerSerieuse(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  await mesurer(utilisateur, sql); // rodage, jeté
  const a = await mesurer(utilisateur, sql);
  const b = await mesurer(utilisateur, sql);

  // Deux séries CONCORDANTES : si elles divergent trop, la mesure ne décrit
  // rien de stable et il vaut mieux le dire que de retenir la plus flatteuse.
  const ecart = Math.abs(a.ms - b.ms) / Math.max(a.ms, b.ms);
  if (ecart > 0.6 && Math.max(a.ms, b.ms) > 10) {
    throw new Error(
      `Séries discordantes : ${a.ms.toFixed(1)} ms puis ${b.ms.toFixed(1)} ms ` +
        `(${(ecart * 100).toFixed(0)} % d'écart). La mesure ne décrit rien de stable.`,
    );
  }
  return a.ms >= b.ms ? a : b;
}

async function semer(utilisateur: UtilisateurDeTest, etiquette: string): Promise<void> {
  // Semé par le propriétaire : la RLS n'a rien à voir avec la constitution du
  // jeu, seulement avec sa lecture.
  await bd.query(
    `insert into public.orders (shop_id, customer_label, product_ref, tracking_number, status, archived_at, created_at)
     select $1,
            case when i % 7 = 0 then 'Crème Solaire ' || i else $2 || ' client ' || i end,
            'REF-' || $2 || '-' || i,
            case when i % 3 = 0 then 'LP' || lpad(i::text, 10, '0') || 'FR' else null end,
            (array['preparation','expedie','en_transit','livre'])[1 + (i % 4)]::public.order_status,
            case when i % 20 = 0 then now() - (i || ' minutes')::interval else null end,
            now() - (i || ' minutes')::interval
     from generate_series(1, $3) as i`,
    [utilisateur.shopId, etiquette, PLAFOND_COMMANDES],
  );
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("perf-alice");
  voisin = await creerUtilisateur("perf-voisin");

  await semer(alice, "alice");
  // LE COMPTE VOISIN, de même volumétrie. Sans lui, la mesure décrirait une base
  // mono-compte, où l'isolation ne filtre rien et où tout paraît rapide.
  await semer(voisin, "voisin");

  await bd.query("analyze public.orders");
}, 600_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(voisin);
  await bd.end();
});

describe("Le jeu de mesure est bien celui qu'on décrit", () => {
  test("chaque compte porte exactement le plafond annoncé", async () => {
    const { rows } = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.orders where shop_id = $1`,
      [alice.shopId],
    );
    expect(
      Number(rows[0]?.n),
      "Le jeu de mesure ne contient pas ce que la mesure prétend décrire.",
    ).toBe(PLAFOND_COMMANDES);

    const { rows: rowsVoisin } = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.orders where shop_id = $1`,
      [voisin.shopId],
    );
    expect(
      Number(rowsVoisin[0]?.n),
      "Le compte voisin est absent : la mesure décrirait une base mono-compte.",
    ).toBe(PLAFOND_COMMANDES);
  });

  test("la RLS filtre réellement pendant la mesure", async () => {
    // Contre-test indispensable : si la RLS ne s'appliquait pas, on mesurerait
    // 19 200 lignes en croyant en mesurer 9 600, et toutes les conclusions
    // seraient fausses dans le sens rassurant.
    const m = await mesurer(alice, `select count(*) from public.orders`);
    expect(m.lignesLues, "la RLS ne filtre pas : la mesure porte sur les deux comptes")
      .toBeLessThanOrEqual(PLAFOND_COMMANDES + 100);
  });
});

describe("Liste du tableau de bord", () => {
  const PREMIERE_PAGE = `
    select id, customer_label, product_ref, status, qc_status, created_at
    from public.orders
    where archived_at is null
    order by created_at desc, id desc
    limit ${PAR_PAGE}`;

  test("première page : plan indexé, sans balayage complet", async () => {
    const m = await mesurerSerieuse(alice, PREMIERE_PAGE);
    console.log(`  première page : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    const noeuds = [...m.plan.matchAll(/"Node Type":"([^"]+)"/g)].map((x) => x[1]);
    const index = [...m.plan.matchAll(/"Index Name":"([^"]+)"/g)].map((x) => x[1]);
    const cond = [...m.plan.matchAll(/"(?:Index|Filter|Recheck) Cond":"([^"]+)"/g)].map((x) => x[1]);
    console.log(`  noeuds : ${noeuds.join(" <- ")}`);
    console.log(`  index  : ${index.join(", ") || "aucun"}`);
    console.log(`  conds  : ${cond.join(" | ") || "aucune"}`);

    expect(
      m.plan.includes("Seq Scan"),
      `Balayage complet de la table sur le tri PAR DÉFAUT. C'est l'index le plus ` +
        `facile à oublier : son absence est invisible à faible volumétrie.\n${m.plan.slice(0, 400)}`,
    ).toBe(false);

    expect(m.lignesLues, "trop de lignes lues pour en rendre 50").toBeLessThan(LIGNES_LUES_MAX);
    expect(m.ms, `${m.ms.toFixed(1)} ms au-dessus du seuil de ${PAGE_MS} ms`).toBeLessThan(PAGE_MS);
  });

  test("page PROFONDE par curseur : même coût que la première", async () => {
    // LA PROPRIÉTÉ QUI COMPTE. Avec un décalage, la page 190 d'un jeu de 9 600
    // fait lire 9 500 lignes pour en rendre 50 : le coût croît avec le NUMÉRO de
    // page, donc l'inconfort arrive chez celui qui a le plus de données.
    const { rows } = await bd.query<{ created_at: string; id: string }>(
      `select created_at, id from public.orders
       where shop_id = $1 and archived_at is null
       order by created_at desc, id desc
       offset 9000 limit 1`,
      [alice.shopId],
    );
    const curseur = rows[0];
    expect(curseur, "curseur introuvable : le jeu est plus petit qu'annoncé").toBeDefined();

    // L'horodatage est réinjecté en ISO, pas via la représentation par défaut
    // d'une `Date` JavaScript : « Fri Aug 14 2026 ... GMT+0200 (heure d'été...) »
    // n'est pas un littéral que Postgres sait lire.
    const curseurIso = new Date(curseur?.created_at ?? "").toISOString();
    const pageProfonde = `
      select id, customer_label, product_ref, status, qc_status, created_at
      from public.orders
      where archived_at is null
        and (created_at, id) < ('${curseurIso}'::timestamptz, '${curseur?.id}'::uuid)
      order by created_at desc, id desc
      limit ${PAR_PAGE}`;

    const premiere = await mesurerSerieuse(alice, PREMIERE_PAGE);
    const profonde = await mesurerSerieuse(alice, pageProfonde);
    console.log(
      `  page profonde : ${profonde.ms.toFixed(1)} ms, ${profonde.lignesLues} lignes lues ` +
        `(première : ${premiere.ms.toFixed(1)} ms)`,
    );

    expect(profonde.plan.includes("Seq Scan"), "balayage complet sur la page profonde").toBe(false);
    expect(
      profonde.lignesLues,
      `${profonde.lignesLues} lignes lues pour en rendre ${PAR_PAGE} : le curseur ` +
        "ne remplit pas son office, le coût croît avec le numéro de page.",
    ).toBeLessThan(LIGNES_LUES_MAX);

    const ratio = profonde.ms / Math.max(premiere.ms, 0.1);
    expect(
      ratio,
      `La page profonde coûte ${ratio.toFixed(1)} fois la première. Une pagination ` +
        "par curseur doit rendre les deux équivalentes.",
    ).toBeLessThan(RATIO_PAGINATION);
  });

  test("filtre par statut : plan indexé", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label, created_at from public.orders
       where status = 'en_transit' and archived_at is null
       order by created_at desc, id desc limit ${PAR_PAGE}`,
    );
    console.log(`  filtre statut : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.plan.includes("Seq Scan"), "balayage complet sur le filtre de statut").toBe(false);
    // L'ASSERTION SUR LES LIGNES LUES, et pas seulement sur le temps. C'est
    // précisément ce qui a manqué au premier passage : le tri par défaut lisait
    // 9 120 lignes pour en rendre 50, en 5,4 ms — un temps qui n'aurait jamais
    // fait sonner un seuil de 60 ms. Un seuil de temps seul certifie une
    // performance qui n'existe qu'à la volumétrie de test.
    expect(
      m.lignesLues,
      `${m.lignesLues} lignes lues pour en rendre ${PAR_PAGE} : le filtre trie ` +
        "au lieu de parcourir l'index.",
    ).toBeLessThan(LIGNES_LUES_MAX);
    expect(m.ms).toBeLessThan(PAGE_MS);
  });

  test("recherche insensible aux accents, au plafond", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label from public.orders
       where recherche like '%creme%'
       order by created_at desc, id desc limit ${PAR_PAGE}`,
    );
    console.log(`  recherche : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    // Pas d'assertion sur les lignes lues ICI, et c'est délibéré : une recherche
    // par sous-chaîne DOIT visiter les lignes du vendeur, il n'existe pas de
    // façon de rendre le bon résultat sans les regarder. Ce qui est borné est le
    // TEMPS, et l'ensemble visité reste celui d'un seul vendeur grâce à la RLS.
    // Exiger ici un faible nombre de lignes reviendrait à exiger un index
    // trigramme sans avoir établi qu'il est nécessaire.
    expect(
      m.ms,
      `${m.ms.toFixed(1)} ms au-dessus du seuil de ${RECHERCHE_MS} ms. Vérifier ` +
        "D'ABORD que la requête ne demande pas plus que nécessaire : un seuil " +
        "dépassé ne veut pas dire qu'il manque un index.",
    ).toBeLessThan(RECHERCHE_MS);
  });

  test("le comptage EXACT est mesuré à part, parce qu'il ne s'indexe pas", async () => {
    // Un agrégat complet ne se rattrape par AUCUN index : il doit visiter chaque
    // ligne. Le mesurer séparément évite de croire que l'écran est lent à cause
    // d'un index manquant alors qu'il demande plus que nécessaire.
    const m = await mesurerSerieuse(
      alice,
      `select count(*) from public.orders where archived_at is null`,
    );
    console.log(`  comptage exact : ${m.ms.toFixed(1)} ms sur ${PLAFOND_COMMANDES} lignes`);
    expect(m.lignesLues, "le comptage lit forcément toutes les lignes du vendeur")
      .toBeGreaterThan(PLAFOND_COMMANDES / 2);
  });
});

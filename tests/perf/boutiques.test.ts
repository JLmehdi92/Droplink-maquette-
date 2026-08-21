import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * L'ÉCRAN DES BOUTIQUES — ce qui doit rester vrai À TOUT VOLUME.
 *
 * CE QU'ON MESURE ICI N'EST PAS UN TEMPS, ET C'EST DÉLIBÉRÉ. Il est impossible
 * de fabriquer mille comptes dans ce harnais : chaque compte exige un
 * utilisateur réellement authentifié, et l'API d'authentification les limite.
 * Une mesure impossible se dit impossible — plutôt que de mesurer trois
 * boutiques et d'appeler cela une preuve de tenue à mille.
 *
 * CE QU'ON MESURE À LA PLACE EST UNE PROPRIÉTÉ DE STRUCTURE, vraie à tout
 * volume : la requête NE LIT PAS les tables qui grossissent avec l'usage. Un
 * seuil de temps certifie une performance qui n'existe qu'à la volumétrie de
 * test ; « cette requête ne touche jamais `order_media` » reste vrai à mille
 * comptes comme à trois.
 *
 * ON MESURE LE CORPS, PAS L'APPEL. `explain` d'un appel de fonction rend un
 * `Function Scan` opaque, dont l'`Actual Rows` vaut 1 : celui de la ligne
 * rendue. N'importe quel seuil y passerait — un ensemble vide passe tout.
 *
 * ON MESURE SANS RLS, comme s'exécute une fonction `security definer`. Le
 * harnais du vendeur pose `set local role authenticated`, donc la RLS filtre :
 * il mesurerait ce que voit UN compte, alors que cet écran les agrège tous.
 */

let bd: Client;
let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;

/**
 * Les tables dont la lecture est un DÉFAUT sur cet écran, parce qu'elles
 * grossissent avec l'usage — donc avec le nombre de comptes MULTIPLIÉ par leur
 * activité. `shops` et `profiles`, elles, croissent avec le nombre d'inscrits :
 * les lire est la définition même de cet écran.
 */
const TABLES_INTERDITES = ["orders", "order_media", "tracked_parcels", "link_views"];

interface Mesure {
  readonly ms: number;
  readonly parRelation: ReadonlyMap<string, number>;
  readonly opaque: boolean;
}

async function mesurer(sql: string): Promise<Mesure> {
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

  const parRelation = new Map<string, number>();
  let opaque = false;

  const parcourir = (noeud: Record<string, unknown>): void => {
    const type = String(noeud["Node Type"] ?? "");
    if (type.includes("Scan")) {
      const relation = String(noeud["Relation Name"] ?? "");
      if (relation !== "") {
        const boucles = Number(noeud["Actual Loops"] ?? 1);
        // CE QUE LA BASE A DÛ REGARDER, pas ce qu'elle a rendu : les lignes lues
        // puis jetées par un filtre sont exactement celles qu'on borne.
        const lues =
          (Number(noeud["Actual Rows"] ?? 0) +
            Number(noeud["Rows Removed by Filter"] ?? 0) +
            Number(noeud["Rows Removed by Index Recheck"] ?? 0)) *
          boucles;
        parRelation.set(relation, (parRelation.get(relation) ?? 0) + lues);
      }
    }
    if (type === "Function Scan") opaque = true;
    for (const enfant of (noeud["Plans"] as Array<Record<string, unknown>>) ?? []) {
      parcourir(enfant);
    }
  };
  parcourir(racine.Plan);

  return { ms: racine["Execution Time"], parRelation, opaque };
}

/** Rodage jeté, puis deux séries. Rend la PIRE — jamais la meilleure. */
async function mesurerSerieuse(sql: string): Promise<Mesure> {
  await mesurer(sql);
  const a = await mesurer(sql);
  const b = await mesurer(sql);
  return a.ms >= b.ms ? a : b;
}

/**
 * Le CORPS de `lister_boutiques_admin`, sans son audit ni sa garde.
 *
 * Recopié, donc susceptible de diverger de la fonction : le contrôle ci-dessous
 * vérifie que les deux rendent le MÊME nombre de lignes. Sans cette
 * vérification, on mesurerait une requête qui n'est plus celle du produit — et
 * « elle répond » est la propriété que tous les résidus possèdent.
 */
const CORPS_BOUTIQUES = `
  select s.id, s.name, p.id, p.email, p.account_type, p.status,
         s.commandes_reelles, s.medias_count, s.stockage_octets,
         coalesce(u.parcels_registered, 0), s.created_at
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  left join public.usage_counters u
    on u.profile_id = p.id and u.period_month = date_trunc('month', now())::date
  order by s.stockage_octets desc, s.id desc
  limit 51`;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("perf-boutiques-a");
  bob = await creerUtilisateur("perf-boutiques-b");

  // Alice est administratrice : la fonction vérifie le rôle EN BASE, et on
  // l'appelle donc sous une vraie identité plutôt qu'en la contournant.
  await bd.query("update public.profiles set role = 'admin' where id = $1", [alice.profilId]);

  // Un peu de contenu chez les deux : sans lui, toutes les tables seraient vides
  // et « aucune lecture de `orders` » serait vrai sans rien prouver. Un ensemble
  // vide passe tout.
  for (const shop of [alice.shopId, bob.shopId]) {
    const commande = await bd.query<{ id: string }>(
      "insert into public.orders (shop_id, customer_label) values ($1, 'perf') returning id",
      [shop],
    );
    const id = commande.rows[0]?.id;
    await bd.query(
      `insert into public.order_media (order_id, type, cle, taille_octets, position)
       values ($1, 'photo', $2, 1000, 0)`,
      [id, `perf-${String(id)}`],
    );
  }

  // Les statistiques du planificateur doivent décrire les lignes présentes,
  // sinon le plan mesuré n'est pas celui que la base choisirait en service.
  await bd.query("vacuum analyze public.shops, public.profiles, public.orders");
}, 180_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await bd.end();
});

describe("La mesure décrit bien le jeu qu'elle prétend décrire", () => {
  test("les tables interdites ne sont PAS vides", async () => {
    // Sans cette assertion, « la requête ne lit pas `orders` » resterait vrai
    // après une purge accidentelle du jeu — et l'on consignerait une propriété
    // qu'on n'a jamais éprouvée. Toute mesure porte une assertion sur son jeu.
    const lignes = await bd.query<{ commandes: string; medias: string; boutiques: string }>(
      `select (select count(*) from public.orders) as commandes,
              (select count(*) from public.order_media) as medias,
              (select count(*) from public.shops) as boutiques`,
    );
    expect(Number(lignes.rows[0]?.commandes)).toBeGreaterThan(0);
    expect(Number(lignes.rows[0]?.medias)).toBeGreaterThan(0);
    expect(Number(lignes.rows[0]?.boutiques)).toBeGreaterThan(1);
  });

  test("le corps mesuré rend le même nombre de lignes que la fonction", async () => {
    // L'artefact mesuré doit CORRESPONDRE au code sous test. « Il répond » est
    // la propriété que tous les résidus possèdent.
    const corps = await bd.query(CORPS_BOUTIQUES);

    // La fonction vérifie le rôle en base : on l'appelle donc SOUS UNE VRAIE
    // IDENTITÉ d'administrateur, jamais en la contournant. L'appeler autrement
    // mesurerait un chemin que le produit n'emprunte pas.
    await bd.query("begin");
    let fonction;
    try {
      await bd.query("set local role authenticated");
      await bd.query(`set local request.jwt.claims = '{"sub":"${alice.userId}"}'`);
      fonction = await bd.query("select * from public.lister_boutiques_admin('', '', '', 51, '')");
    } finally {
      await bd.query("rollback");
    }

    expect(corps.rowCount).toBe(fonction.rowCount);
  });
});

describe("L'écran des boutiques ne lit que ce qui croît avec les INSCRITS", () => {
  test("aucune table d'activité n'est touchée", async () => {
    const mesure = await mesurerSerieuse(CORPS_BOUTIQUES);

    expect(mesure.opaque, "le plan est opaque : la mesure ne prouve rien").toBe(false);

    const touchees = TABLES_INTERDITES.filter((t) => (mesure.parRelation.get(t) ?? 0) > 0);
    expect(
      touchees,
      `l'écran lit des tables qui grossissent avec l'usage : ${touchees.join(", ")}. ` +
        "Le coût suivrait alors l'activité totale du produit, pas le nombre de comptes.",
    ).toEqual([]);
  });

  test("LA SONDE DÉTECTE la version naïve — sinon elle ne prouverait rien", async () => {
    // C'est la requête qu'on aurait écrite sans les compteurs : elle agrège
    // `orders` et `order_media` à la lecture. Elle est mesurée ICI, en
    // permanence, parce qu'un garde qui n'a jamais rien attrapé ne prouve pas
    // qu'il attraperait. Et celui-ci doit surtout attraper la réécriture que
    // quelqu'un fera dans six mois, en toute bonne foi.
    const naive = `
      select s.id, s.name,
             (select count(*) from public.orders o where o.shop_id = s.id),
             (select coalesce(sum(m.taille_octets), 0) from public.order_media m
                join public.orders o on o.id = m.order_id where o.shop_id = s.id)
      from public.shops s
      order by 4 desc, s.id desc
      limit 51`;

    const mesure = await mesurerSerieuse(naive);
    const touchees = TABLES_INTERDITES.filter((t) => (mesure.parRelation.get(t) ?? 0) > 0);
    expect(
      touchees.length,
      "la sonde ne voit pas la version naïve : elle ne prouve donc rien sur la bonne",
    ).toBeGreaterThan(0);
  });

  test("il lit `shops` et `profiles`, et c'est bien sa définition", async () => {
    // Contre-test : une requête qui ne lirait RIEN passerait le contrôle
    // précédent sans rien prouver.
    const mesure = await mesurerSerieuse(CORPS_BOUTIQUES);
    expect(mesure.parRelation.get("shops") ?? 0).toBeGreaterThan(0);
  });
});

describe("Le total de stockage suit le nombre de comptes, pas de fichiers", () => {
  test("il somme les compteurs, jamais les médias", async () => {
    const mesure = await mesurerSerieuse("select sum(s.stockage_octets) from public.shops s");
    expect(mesure.parRelation.get("order_media") ?? 0).toBe(0);
    expect(mesure.parRelation.get("shops") ?? 0).toBeGreaterThan(0);
  });
});

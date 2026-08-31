import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";

/**
 * LES DEUX TABLES QUI GROSSISSENT LE PLUS VITE.
 *
 * `orders` croît d'une ligne par commande. `link_views` croît d'une ligne par
 * VISITEUR ET PAR JOUR, et `order_events` d'une ligne par action. Ce sont donc
 * elles, et pas `orders`, qui décideront si le produit tient à quelques milliers
 * de vendeurs — et elles n'existaient pas quand le protocole de mesure du
 * tableau de bord a été écrit.
 *
 * CE QU'ON MESURE ICI EST CE QUE L'ÉCRAN APPELLERA. Le tableau de bord promet un
 * compteur de vues par commande et un tri « jamais ouvert par le client ». Les
 * mesurer AVANT d'écrire l'écran est le seul ordre qui permette de choisir la
 * forme de la requête ; les mesurer après revient à constater.
 *
 * MESURÉ AU PLAFOND, avec un COMPTE VOISIN de même volumétrie : une requête peut
 * sembler rapide sur une base mono-compte, où l'isolation ne filtre rien.
 */

const COMMANDES = 9_600;
/** Cinq visiteurs-jours par commande : un lien consulté par un client qui revient. */
const VUES_PAR_COMMANDE = 5;
/** Dix actions par commande : création, champs, médias, ordre, arbitrage. */
const EVENEMENTS_PAR_COMMANDE = 10;
const PAR_PAGE = 50;

/*
 * SEUILS — écrits AVANT la première exécution, et avant de connaître le moindre
 * chiffre. Sans seuil écrit d'avance, « on décidera sur la mesure » devient « on
 * a mesuré, ça allait ».
 *
 * `PAGE_MS` vaut 60 comme pour la liste : c'est le MÊME écran, et le compteur de
 * vues s'affiche sur la même ligne que le reste. Un budget séparé laisserait
 * croire que ce coût s'ajoute ailleurs.
 *
 * Les seuils de LIGNES LUES sont ceux qui comptent vraiment. Un temps seul
 * certifie une performance qui n'existe qu'à la volumétrie de test ; le nombre
 * de lignes lues, lui, dit comment le coût se comportera quand la table aura dix
 * fois cette taille.
 */
const PAGE_MS = 60;
const HISTORIQUE_MS = 30;
const JAMAIS_OUVERT_MS = 120;
const LIGNES_LUES_PAGE = 5_000;
const LIGNES_LUES_HISTORIQUE = 500;
/*
 * Le seuil qui protège vraiment le tri « jamais ouvert ». Sans lui, la suite ne
 * vérifierait qu'un CHRONOMÈTRE — et un chronomètre certifie une performance qui
 * n'existe qu'à la volumétrie de test. L'index partiel retiré, la requête
 * resterait rapide sur 9 600 lignes et s'effondrerait sur 100 000, sans que rien
 * ne l'ait signalé entre les deux.
 */
const LIGNES_LUES_JAMAIS_OUVERT = 200;

let bd: Client;
let alice: UtilisateurDeTest;
let voisin: UtilisateurDeTest;
/** Un vendeur dont TOUTES les commandes ont été ouvertes : le pire cas du tri. */
let assidu: UtilisateurDeTest;

type Mesure = { ms: number; lignesLues: number; balayees: string[] };

/**
 * Les tables dont un balayage séquentiel est un DÉFAUT, parce qu'elles
 * grossissent avec l'usage. `profiles` et `shops` n'y sont pas : elles comptent
 * une ligne par compte, les policies RLS les lisent à chaque requête, et les
 * balayer y est plus rapide que les indexer.
 *
 * Chercher la chaîne « Seq Scan » dans le plan entier ne prouverait rien : le
 * contrôle porterait sur un MOT présent dans un texte, pas sur la table qui le
 * subit.
 */
const TABLES_QUI_GROSSISSENT = ["orders", "link_views", "order_events", "order_media"];

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
    const balayees: string[] = [];

    const parcourir = (noeud: Record<string, unknown>): void => {
      const type = String(noeud["Node Type"] ?? "");
      if (type.includes("Scan")) {
        /*
         * CE QUE LA BASE A DÛ REGARDER, pas ce qu'elle a rendu.
         *
         * « Actual Rows » ne compte que les lignes SORTIES du nœud. Les lignes
         * lues puis JETÉES par un filtre n'y figurent pas — et ce sont
         * exactement celles qu'on cherche à borner. Défaut constaté par
         * falsification : l'index partiel du tri « jamais ouvert » retiré, la
         * mesure annonçait « 0 ligne lue » pendant que le temps passait de
         * 0,5 ms à 11,5 ms. La sonde regardait à côté et le disait avec aplomb.
         */
        const boucles = Number(noeud["Actual Loops"] ?? 1);
        lignesLues +=
          (Number(noeud["Actual Rows"] ?? 0) +
            Number(noeud["Rows Removed by Filter"] ?? 0) +
            Number(noeud["Rows Removed by Index Recheck"] ?? 0)) *
          boucles;
      }
      if (type === "Seq Scan") balayees.push(String(noeud["Relation Name"] ?? "?"));
      for (const enfant of (noeud["Plans"] as Array<Record<string, unknown>>) ?? []) {
        parcourir(enfant);
      }
    };
    parcourir(racine.Plan);

    return { ms: racine["Execution Time"], lignesLues, balayees };
  } finally {
    await bd.query("rollback");
  }
}

/** Rodage jeté, puis deux séries. Rend la PIRE — jamais la meilleure. */
async function mesurerSerieuse(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  /*
   * ⚠️ DEUX RODAGES, ET NON UN. MESURÉ LE 31/08/2026.
   *
   * Un passage du banc a échoué sur sa PROPRE garde de discordance :
   * « Séries discordantes : 18,5 ms puis 0,4 ms ». Le premier appel des deux
   * séries payait encore un accès disque que le rodage unique n'avait pas
   * absorbé — la seconde série, elle, rendait la vraie valeur.
   *
   * LA RÈGLE DU PROJET EST DE BORNER, PAS DE RELANCER JUSQU'AU VERT. On ne
   * touche donc NI au seuil de discordance, NI aux assertions : le seul
   * changement est un second rodage, jeté comme le premier. Ce qui est mesuré
   * et ce qui est exigé restent identiques ; c'est la mise en condition qui
   * était insuffisante.
   *
   * Si la discordance revient malgré cela, elle décrira autre chose qu'un cache
   * froid — et il faudra le chercher là, pas ici.
   */
  await mesurer(utilisateur, sql);
  await mesurer(utilisateur, sql); // second rodage, jeté lui aussi
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

/** Les tables qui grossissent, réellement balayées. */
function balayagesInterdits(mesure: Mesure): string[] {
  return mesure.balayees.filter((t) => TABLES_QUI_GROSSISSENT.includes(t));
}

async function semer(
  utilisateur: UtilisateurDeTest,
  etiquette: string,
  toutesVues = false,
): Promise<void> {
  await bd.query(
    `insert into public.orders (shop_id, customer_label, product_ref, created_at)
     select $1, $2 || ' client ' || i, 'REF-' || i, now() - (i || ' hours')::interval
     from generate_series(1, $3) as i`,
    [utilisateur.shopId, etiquette, COMMANDES],
  );

  // Une partie des commandes n'a JAMAIS été ouverte : c'est le cas que le tri
  // « jamais ouvert » doit trouver, et un jeu où toutes les commandes ont des
  // vues rendrait ce tri trivialement rapide sans rien prouver. Sauf pour le
  // compte « assidu », qui sert précisément à mesurer l'autre extrême.
  await bd.query(
    `insert into public.link_views (order_id, ip_hash, user_agent_hash, viewed_at)
     select o.id, 'ip-' || v, 'ua-' || v, now() - (v || ' days')::interval
     from public.orders o
     cross join generate_series(1, $2) as v
     where o.shop_id = $1
       and ($3 or (o.created_at::text || o.id::text) not like '%0')`,
    [utilisateur.shopId, VUES_PAR_COMMANDE, toutesVues],
  );

  await bd.query(
    `insert into public.order_events (order_id, type, actor, occurred_at)
     select o.id,
            (array['commande_creee','commande_modifiee','media_ajoute','medias_reordonnes',
                   'qc_approuve'])[1 + (e % 5)],
            case when e % 5 = 4 then 'client' else 'vendeur' end,
            now() - (e || ' hours')::interval
     from public.orders o
     cross join generate_series(1, $2) as e
     where o.shop_id = $1`,
    [utilisateur.shopId, EVENEMENTS_PAR_COMMANDE],
  );
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("perfv-alice");
  voisin = await creerUtilisateur("perfv-voisin");
  assidu = await creerUtilisateur("perfv-assidu");

  await semer(alice, "alice");
  // LE COMPTE VOISIN, de même volumétrie. Sans lui, la mesure décrirait une base
  // mono-compte, où l'isolation ne filtre rien et où tout paraît rapide.
  await semer(voisin, "voisin");
  await semer(assidu, "assidu", true);

  await bd.query("analyze public.orders");
  await bd.query("analyze public.link_views");
  await bd.query("analyze public.order_events");
}, 900_000);

afterAll(async () => {
  /*
   * LA BORNE EST EXPLICITE, ET ELLE A UNE RAISON CHIFFRÉE.
   *
   * Le défaut par défaut d'un crochet est de DIX SECONDES. Supprimer les
   * comptes de ce jeu fait tomber en cascade neuf mille six cents commandes,
   * leurs vues et leurs événements : mesuré, c'est plus long que dix secondes,
   * et la suite échouait au NETTOYAGE après que les quarante-cinq mesures
   * soient toutes passées.
   *
   * Un test qui échoue par intermittence se BORNE, il ne se relance pas jusqu'au
   * vert. Et un échec de nettoyage qui ressemble à un échec de mesure est le
   * genre de rouge auquel on s'habitue.
   */
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(voisin);
  await supprimerUtilisateur(assidu);
  await bd.end();
}, 300_000);

/**
 * TOUTE MESURE PORTE UNE ASSERTION SUR LE JEU QU'ELLE PRÉTEND DÉCRIRE.
 *
 * Sans elle, une purge accidentelle du jeu fait consigner une amélioration
 * spectaculaire, et l'on conclut sur une base qui n'existe plus.
 */
describe("Le jeu de mesure est bien celui qu'on décrit", () => {
  test("les volumes annoncés sont là, pour les DEUX comptes de référence", async () => {
    for (const compte of [alice, voisin]) {
      const { rows } = await bd.query<{ commandes: string; vues: string; evenements: string }>(
        `select
           (select count(*) from public.orders where shop_id = $1)::text as commandes,
           (select count(*) from public.link_views v
              join public.orders o on o.id = v.order_id where o.shop_id = $1)::text as vues,
           (select count(*) from public.order_events e
              join public.orders o on o.id = e.order_id where o.shop_id = $1)::text as evenements`,
        [compte.shopId],
      );
      const ligne = rows[0];
      expect(Number(ligne?.commandes)).toBe(COMMANDES);
      expect(Number(ligne?.evenements)).toBe(COMMANDES * EVENEMENTS_PAR_COMMANDE);
      // Les vues ne couvrent pas toutes les commandes, délibérément.
      expect(Number(ligne?.vues)).toBeGreaterThan(COMMANDES * 2);
      expect(Number(ligne?.vues)).toBeLessThan(COMMANDES * VUES_PAR_COMMANDE);
    }
  });

  test("le compteur dénormalisé dit la MÊME chose que les lignes de vues", async () => {
    // Un compteur tenu par déclencheur est une SECONDE source de vérité. La
    // seule question qui vaille est donc : dit-il la même chose que la première ?
    // Un écart ne casserait rien — il produirait simplement un tri qui ment.
    const { rows } = await bd.query<{ ecarts: string }>(
      `select count(*)::text as ecarts
       from public.orders o
       left join (
         select order_id, count(*) as n from public.link_views group by order_id
       ) v on v.order_id = o.id
       where o.shop_id = any($1) and o.views_count <> coalesce(v.n, 0)`,
      [[alice.shopId, voisin.shopId, assidu.shopId]],
    );
    expect(Number(rows[0]?.ecarts), "le compteur a divergé des vues réelles").toBe(0);
  });

  test("il existe bien des commandes JAMAIS ouvertes", async () => {
    const { rows } = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.orders o
       where o.shop_id = $1
         and o.views_count = 0`,
      [alice.shopId],
    );
    // Sans ce contre-test, le tri « jamais ouvert » pourrait être mesuré sur un
    // ensemble vide — et un ensemble vide passe tout.
    expect(Number(rows[0]?.n), "aucune commande jamais ouverte dans le jeu").toBeGreaterThan(100);
  });
});

describe("Le compteur de vues sur la liste", () => {
  /**
   * LA FORME QUI COMPTE. La première version agrégeait `link_views` par une
   * jointure latérale sur les cinquante commandes affichées : 11 ms et 1 021
   * lignes lues, ce qui passait. Le compteur porté par `orders` (027) supprime
   * la jointure — il n'y a plus qu'une seule table à lire, et c'est celle que le
   * tri indexe déjà.
   */
  const REQUETE = `
    select o.id, o.customer_label, o.views_count, o.last_viewed_at
    from public.orders o
    where o.shop_id = '@SHOP@' and o.archived_at is null
    order by o.created_at desc, o.id desc
    limit ${PAR_PAGE}`;

  test("cinquante lignes avec leur compteur : plan indexé", async () => {
    const mesure = await mesurerSerieuse(alice, REQUETE.replace("@SHOP@", alice.shopId));

    console.log(
      `compteur de vues (50 lignes) : ${mesure.ms.toFixed(1)} ms, ` +
        `${mesure.lignesLues} lignes lues`,
    );

    expect(
      balayagesInterdits(mesure),
      `balayage séquentiel : ${mesure.balayees.join(", ")}`,
    ).toEqual([]);
    expect(mesure.lignesLues, `${mesure.lignesLues} lignes lues`).toBeLessThan(LIGNES_LUES_PAGE);
    expect(mesure.ms, `${mesure.ms.toFixed(1)} ms`).toBeLessThan(PAGE_MS);
  });

  test("le voisin obtient les SIENNES, au même prix", async () => {
    // Contre-test d'isolation ET de mesure : si l'un des deux comptes était vide,
    // sa mesure serait flatteuse et ne décrirait rien.
    const mesure = await mesurerSerieuse(voisin, REQUETE.replace("@SHOP@", voisin.shopId));
    console.log(`compteur de vues, compte voisin : ${mesure.ms.toFixed(1)} ms`);
    expect(mesure.ms).toBeLessThan(PAGE_MS);
  });
});

describe("L'historique d'une commande", () => {
  test("les cinquante dernières entrées : plan indexé", async () => {
    const { rows } = await bd.query<{ id: string }>(
      "select id from public.orders where shop_id = $1 limit 1",
      [alice.shopId],
    );
    const commande = rows[0]?.id;
    expect(commande, "aucune commande : la sonde vise à côté").toBeDefined();

    const mesure = await mesurerSerieuse(
      alice,
      `select type, actor, payload, occurred_at
       from public.order_events
       where order_id = '${commande}'
       order by occurred_at desc
       limit ${PAR_PAGE}`,
    );

    console.log(
      `historique d'une commande : ${mesure.ms.toFixed(1)} ms, ${mesure.lignesLues} lignes lues`,
    );

    expect(
      balayagesInterdits(mesure),
      `balayage séquentiel : ${mesure.balayees.join(", ")}`,
    ).toEqual([]);
    expect(mesure.lignesLues).toBeLessThan(LIGNES_LUES_HISTORIQUE);
    expect(mesure.ms).toBeLessThan(HISTORIQUE_MS);
  });
});

describe("Le tri « jamais ouvert par le client »", () => {
  const REQUETE = `
    select o.id, o.customer_label
    from public.orders o
    where o.shop_id = '@SHOP@'
      and o.archived_at is null
      and o.views_count = 0
    order by o.created_at desc, o.id desc
    limit ${PAR_PAGE}`;

  /**
   * Le tri le plus utile du tableau de bord : celui qui dit au vendeur quels
   * clients n'ont pas encore vu leurs photos.
   *
   * Il portait sur une ABSENCE — une anti-jointure sur `link_views` — et rien ne
   * s'indexe du côté d'une absence. Le compteur de 027 en fait une VALEUR, et
   * une valeur s'indexe.
   */
  test("première page, sur un jeu réaliste", async () => {
    const mesure = await mesurerSerieuse(alice, REQUETE.replace("@SHOP@", alice.shopId));
    console.log(`jamais ouvert : ${mesure.ms.toFixed(1)} ms, ${mesure.lignesLues} lignes lues`);
    expect(
      balayagesInterdits(mesure),
      `balayage séquentiel : ${mesure.balayees.join(", ")}`,
    ).toEqual([]);
    expect(mesure.lignesLues, `${mesure.lignesLues} lignes lues`).toBeLessThan(
      LIGNES_LUES_JAMAIS_OUVERT,
    );
    expect(mesure.ms, `${mesure.ms.toFixed(1)} ms`).toBeLessThan(JAMAIS_OUVERT_MS);
  });

  /**
   * LE PIRE CAS, et il n'est pas hypothétique : c'est celui du vendeur dont tout
   * a été ouvert, donc du vendeur chez qui ça marche. Le tri porte sur une
   * ABSENCE ; plus l'absence est rare, plus il faut parcourir de commandes avant
   * de rendre cinquante lignes — et ici il n'y en a AUCUNE à rendre, donc tout
   * est parcouru.
   *
   * Mesurer le cas favorable et en conclure que ça passe serait mesurer à un
   * dixième du plafond.
   */
  test("pire cas : un vendeur dont TOUTES les commandes ont été ouvertes", async () => {
    const { rows } = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.orders o
       where o.shop_id = $1
         and o.views_count = 0`,
      [assidu.shopId],
    );
    // L'assertion sur le jeu : si ce compte avait des commandes non ouvertes, la
    // mesure décrirait le cas facile en prétendant décrire le pire.
    expect(Number(rows[0]?.n), "ce compte n'est pas le pire cas").toBe(0);

    const mesure = await mesurerSerieuse(assidu, REQUETE.replace("@SHOP@", assidu.shopId));

    console.log(
      `jamais ouvert, PIRE CAS : ${mesure.ms.toFixed(1)} ms, ${mesure.lignesLues} lignes lues`,
    );

    expect(
      balayagesInterdits(mesure),
      `balayage séquentiel : ${mesure.balayees.join(", ")}`,
    ).toEqual([]);
    // ZÉRO ligne attendue : le tri ne trouve rien, et l'index partiel doit le
    // dire sans parcourir les 9 600 commandes pour s'en apercevoir.
    expect(mesure.lignesLues, `${mesure.lignesLues} lignes lues`).toBeLessThan(
      LIGNES_LUES_JAMAIS_OUVERT,
    );
    expect(mesure.ms, `${mesure.ms.toFixed(1)} ms`).toBeLessThan(JAMAIS_OUVERT_MS);
  });
});

describe("Les analyses", () => {
  /*
   * SEUIL ÉCRIT AVANT LA PREMIÈRE EXÉCUTION : 150 ms.
   *
   * C'est un AGRÉGAT COMPLET sur la période, et aucun index ne rattrape un
   * agrégat complet — la seule question est donc de savoir sur COMBIEN de lignes
   * il porte. La réponse doit être : celles du vendeur, sur la période, et pas
   * une de plus.
   *
   * `views_count` étant dénormalisé sur `orders` depuis la migration 027, il n'y
   * a AUCUNE jointure vers `link_views`, la table qui grossit le plus vite du
   * produit — une ligne par visiteur ET par jour. C'est ce qui rend cet écran
   * possible : la même mesure par jointure lirait ici cinq fois plus de lignes.
   */
  const ANALYSES_MS = 150;
  const LIGNES_LUES_ANALYSES = COMMANDES + 500;

  test(`« depuis le début » n'agrège que le compte de l'appelant (< ${ANALYSES_MS} ms)`, async () => {
    const m = await mesurerSerieuse(
      alice,
      `select count(*),
              count(*) filter (where o.views_count > 0),
              coalesce(sum(o.views_count), 0),
              count(*) filter (where o.qc_status = 'approuve'),
              count(*) filter (where o.qc_status = 'refuse'),
              count(*) filter (where o.qc_status = 'en_attente')
       from public.orders o
       where o.created_at >= to_timestamp(0)`,
    );

    console.log(`  analyses, tout : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    expect(m.ms).toBeLessThan(ANALYSES_MS);
    // LE SEUIL QUI PROTÈGE VRAIMENT. Un agrégat lit forcément toutes les
    // commandes du vendeur ; dépasser ce compte signifierait qu'il lit aussi
    // celles du voisin, et le coût croîtrait alors avec le NOMBRE DE VENDEURS —
    // c'est-à-dire avec le succès du produit.
    expect(
      m.lignesLues,
      `${m.lignesLues} lignes lues : les commandes du voisin sont agrégées aussi`,
    ).toBeLessThan(LIGNES_LUES_ANALYSES);
    // Et la sonde doit avoir inspecté quelque chose : un ensemble vide passe tout.
    expect(m.lignesLues, "la sonde n'a rien inspecté").toBeGreaterThan(1_000);
  });

  test("une borne de période RESTREINT réellement ce que la base lit", async () => {
    /*
     * LA BORNE EST À UN JOUR, PAS À TRENTE. Le jeu sème une commande par minute,
     * donc 9 600 commandes couvrent 6,7 jours : « 30 jours » et « depuis le
     * début » y désignent exactement le même ensemble, et les comparer aurait
     * comparé deux fois la même chose. C'est le genre de test qui passe au vert
     * en ne prouvant rien — et qui aurait laissé passer une borne ignorée.
     *
     * Sans ce contrôle, une borne que l'optimiseur ne sait pas exploiter
     * resterait invisible : les deux mesures seraient rapides à cette
     * volumétrie, et l'écart n'apparaîtrait qu'à dix fois cette taille.
     */
    const unMois = await mesurerSerieuse(
      alice,
      `select count(*) from public.orders o
       where o.created_at >= now() - interval '30 days'`,
    );
    const tout = await mesurerSerieuse(
      alice,
      "select count(*) from public.orders o where o.created_at >= to_timestamp(0)",
    );

    console.log(
      `  analyses, 30 j : ${unMois.lignesLues} lignes / tout : ${tout.lignesLues} lignes`,
    );

    /*
     * TRENTE JOURS ET NON UN, PARCE QUE LE JEU A CHANGÉ SOUS LA SONDE.
     *
     * Le semis étalait une commande par MINUTE : une journée en valait 1 440, et
     * la borne d'un jour avait de quoi mordre. Il étale désormais une commande
     * par HEURE — les 9 600 couvrent treize mois au lieu de sept jours, parce
     * que le plafond par compte rend le jeu d'origine inatteignable.
     *
     * Une journée n'y vaut plus que 24 commandes, et la sonde l'a DIT : « la
     * sonde n'a rien inspecté, 23 au lieu de 100 ». C'est exactement son rôle —
     * sans cette borne basse, elle aurait continué de passer en comparant deux
     * poignées de lignes, et aurait certifié une pagination qu'elle n'éprouvait
     * plus. Un ensemble presque vide passe presque tout.
     *
     * La fenêtre suit donc le jeu : un mois vaut ~740 commandes, la borne écarte
     * les 8 800 autres au lieu de les lire pour les jeter ensuite.
     */
    expect(unMois.lignesLues).toBeLessThan(tout.lignesLues / 2);
    expect(unMois.lignesLues, "la sonde n'a rien inspecté").toBeGreaterThan(100);
  });
});

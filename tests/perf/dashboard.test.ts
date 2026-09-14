import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { seriesConcordantes } from "../aide/series";

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

/*
 * SEUILS DES QUATRE COMPTEURS DE TÊTE — écrits avant la première exécution.
 *
 * `COMPTEURS_MS` vaut 120. Deux fois le seuil de la page elle-même, et c'est
 * délibéré : ces quatre nombres parcourent l'index de TOUT le compte, là où la
 * liste n'en rend que cinquante lignes. Au-delà, la tête de l'écran coûterait
 * plus cher que son contenu, et il faudrait dénormaliser plutôt que compter.
 *
 * `LIGNES_COMPTEURS_MAX` ne mesure pas un temps : il mesure CE QUE LA RLS
 * FILTRE, par le plan. Le jeu contient deux comptes de même volumétrie ; une
 * requête qui lirait les deux ressortirait à 19 200 lignes au lieu de 9 600.
 *
 * CE QU'IL NE PROUVE PAS, et il faut le dire : il n'établit pas que la FONCTION
 * est restée `security invoker`. Elle est mesurée par son corps — voir
 * ci-dessous pourquoi l'appel n'est pas mesurable. Le jour où quelqu'un la
 * passerait en `security definer`, ce contrôle-ci resterait vert ; c'est
 * `tests/rls/reseaux-et-compteurs` qui le refuse, et cette falsification-là a
 * été constatée en rouge.
 */
const COMPTEURS_MS = 120;
const LIGNES_COMPTEURS_MAX = 12_000;

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

/** Rodage jeté, puis deux séries concordantes : voir `tests/aide/series.ts`. */
async function mesurerSerieuse(utilisateur: UtilisateurDeTest, sql: string): Promise<Mesure> {
  return seriesConcordantes(() => mesurer(utilisateur, sql));
}

async function semer(utilisateur: UtilisateurDeTest, etiquette: string): Promise<void> {
  // Semé par le propriétaire : la RLS n'a rien à voir avec la constitution du
  // jeu, seulement avec sa lecture.
  /*
   * ÉTALÉ SUR DES HEURES ET NON DES MINUTES, et ce n'est pas un détail de semis.
   *
   * À une commande par minute, les 9 600 du jeu tenaient dans SEPT JOURS —
   * c'est-à-dire un état que le produit rend désormais inatteignable, le
   * plafond par compte étant de 3 000 commandes par mois. Le jeu décrivait donc
   * un vendeur qui ne peut pas exister, et une mesure porte une assertion sur
   * le jeu qu'elle prétend décrire.
   *
   * Étalées sur des heures, les 9 600 couvrent treize mois, soit environ 740
   * par mois : très exactement le persona du brief, celui dont on veut savoir
   * si l'écran tient.
   */
  await bd.query(
    `insert into public.orders (shop_id, customer_label, product_ref, tracking_number, status, archived_at, created_at, updated_at)
     select $1,
            case when i % 7 = 0 then 'Crème Solaire ' || i else $2 || ' client ' || i end,
            'REF-' || $2 || '-' || i,
            case when i % 3 = 0 then 'LP' || lpad(i::text, 10, '0') || 'FR' else null end,
            (array['preparation','expedie','en_transit','livre'])[1 + (i % 4)]::public.order_status,
            case when i % 20 = 0 then now() - (i || ' hours')::interval else null end,
            now() - (i || ' hours')::interval,
            -- \`updated_at\` est semée SÉPARÉMENT de \`created_at\`, et décalée.
            -- Sans cela, toutes les lignes porteraient la même modification et
            -- le tri « modifiées » se réduirait à un tri par \`id\` : on
            -- mesurerait un cas que le produit ne rencontre jamais. Le décalage
            -- pseudo-aléatoire reproduit ce que fait la sauvegarde automatique,
            -- qui touche cette colonne à chaque frappe temporisée.
            now() - (i || ' hours')::interval + ((i * 37 % 900) || ' minutes')::interval
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
  // Même cascade, même borne : voir vues-et-journal.
}, 300_000);

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

  test("tri « modifiées » : plan indexé, et le curseur BORNE l'index", async () => {
    /*
     * LE TRI QUI N'AVAIT AUCUN INDEX — le piège nommé au brief.
     *
     * Les sept index d'`orders` portaient tous `created_at` ; aucun ne portait
     * `updated_at`. Le plan était `Limit ← Sort (top-N) ← Index Scan (shop_id)`,
     * c'est-à-dire 9 600 lignes lues pour en rendre 50, en quelques
     * millisecondes — un temps qui n'aurait JAMAIS fait sonner un seuil.
     *
     * Et surtout : la comparaison de couple du curseur restait un FILTRE au lieu
     * de devenir une BORNE. Le commentaire de `liste.ts` promet que le coût ne
     * croît pas avec le numéro de page ; c'était vrai pour trois tris sur
     * quatre. Une promesse tenue à 75 % est plus dangereuse qu'une promesse
     * absente, parce qu'on cesse de la vérifier.
     *
     * C'est donc la page PROFONDE qui est mesurée ici, pas la première : la
     * première page passe même sans index, l'absence ne se voit qu'au fond.
     */
    const { rows } = await bd.query<{ updated_at: string; id: string }>(
      `select updated_at, id from public.orders
       where shop_id = $1 and archived_at is null
       order by updated_at desc, id desc
       offset 9000 limit 1`,
      [alice.shopId],
    );
    const curseur = rows[0];
    expect(curseur, "curseur introuvable : le jeu est plus petit qu'annoncé").toBeDefined();
    const curseurIso = new Date(curseur?.updated_at ?? "").toISOString();

    const m = await mesurerSerieuse(
      alice,
      `select id, customer_label, product_ref, status, updated_at
       from public.orders
       where archived_at is null
         and (updated_at, id) < ('${curseurIso}'::timestamptz, '${curseur?.id}'::uuid)
       order by updated_at desc, id desc
       limit ${PAR_PAGE}`,
    );
    console.log(`  tri modifiées (page profonde) : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues`);
    const index = [...m.plan.matchAll(/"Index Name":"([^"]+)"/g)].map((x) => x[1]);
    console.log(`  index  : ${index.join(", ") || "aucun"}`);

    expect(m.plan.includes("Seq Scan"), "balayage complet sur le tri « modifiées »").toBe(false);
    expect(
      m.lignesLues,
      `${m.lignesLues} lignes lues pour en rendre ${PAR_PAGE} : le curseur ne ` +
        "borne pas l'index, le coût croît avec le numéro de page.",
    ).toBeLessThan(LIGNES_LUES_MAX);
    expect(m.ms, `${m.ms.toFixed(1)} ms au-dessus du seuil de ${PAGE_MS} ms`).toBeLessThan(PAGE_MS);
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

/*
 * LE CORPS DES COMPTEURS, RECOPIÉ ICI — et vérifié contre le catalogue.
 *
 * ON NE PEUT PAS MESURER L'APPEL. `explain` d'un appel de fonction rend un
 * `Function Scan` opaque dont l'`Actual Rows` vaut 1 : celui de la ligne
 * rendue. Constaté ici même — la première version de cette mesure a consigné
 * « 1 ligne lue » sur un jeu de 9 600, et seul le contre-test de borne basse
 * l'a signalé. Sans lui, elle aurait certifié une isolation qu'elle
 * n'inspectait pas.
 *
 * MAIS MESURER UNE COPIE NE PROUVE RIEN DE L'ORIGINAL (L-018). Le test compare
 * donc cette transcription au corps RÉEL lu dans `pg_proc`, avant de s'en
 * servir. Le jour où la fonction change sans que cette chaîne suive, c'est la
 * comparaison qui échoue — pas la mesure qui ment.
 */
const CORPS_COMPTEURS = `
  select
    count(*) filter (where o.status = 'preparation'),
    count(*) filter (where o.status = 'en_transit'),
    count(*) filter (where o.views_count = 0),
    count(*) filter (where o.status = 'livre'),
    count(*),
    count(*) filter (where o.created_at >= now() - interval '7 days')
  from public.orders o
  where o.archived_at is null`;

/*
 * LES COMMENTAIRES SQL SONT RETIRÉS AVANT LA COMPARAISON (L-031).
 *
 * La migration 102 a ajouté deux agrégats ET un commentaire qui explique
 * pourquoi la fenêtre glisse sur sept jours. Comparer le corps BRUT ferait
 * échouer la sonde chaque fois que quelqu'un explique son code, ce qui
 * apprendrait à recopier les commentaires dans la transcription — donc à
 * mesurer une chaîne choisie pour passer le test plutôt que pour dire ce
 * qui est exécuté.
 */
const sansCommentairesSql = (v: string): string => v.replace(/--[^\n]*/g, " ");

const normaliser = (v: string): string => v.replace(/\s+/g, " ").trim();

describe("Les compteurs de tête", () => {
  test("la transcription mesurée EST le corps de la fonction", async () => {
    const { rows } = await bd.query<{ corps: string }>(
      `select p.prosrc as corps from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'compter_commandes_par_etat'`,
    );
    const corps = rows[0]?.corps;
    expect(corps, "la fonction est introuvable dans le catalogue").toBeDefined();
    if (corps === undefined) return;

    expect(
      normaliser(sansCommentairesSql(corps)),
      "le corps de la fonction a changé sans que la mesure suive : elle mesurerait autre chose",
    ).toContain(normaliser(CORPS_COMPTEURS));
  });

  test("ils tiennent au plafond, et ne lisent QUE le compte qui les demande", async () => {
    const m = await mesurerSerieuse(alice, CORPS_COMPTEURS);

    console.log(
      `  compteurs : ${m.ms.toFixed(1)} ms, ${m.lignesLues} lignes lues ` +
        `(plafond ${PLAFOND_COMMANDES} par compte, deux comptes dans le jeu)`,
    );

    expect(m.ms, `les compteurs prennent ${m.ms.toFixed(1)} ms`).toBeLessThan(COMPTEURS_MS);

    // CE QUE LA RLS FILTRE, LU DANS LE PLAN. Deux comptes de même volumétrie
    // sont présents : dépasser ce seuil signifie que la requête lit aussi le
    // voisin.
    expect(
      m.lignesLues,
      `les compteurs lisent ${m.lignesLues} lignes : le compte voisin est dans le jeu, ` +
        "donc la RLS ne filtre plus",
    ).toBeLessThan(LIGNES_COMPTEURS_MAX);

    // ET LE CONTRE-TEST : un plan qui ne lit presque rien décrirait un jeu vide,
    // pas une requête rapide. Sans cette borne basse, une purge accidentelle du
    // jeu ferait consigner une performance spectaculaire.
    expect(
      m.lignesLues,
      "les compteurs ne lisent presque rien : le jeu de mesure a disparu",
    ).toBeGreaterThan(PLAFOND_COMMANDES / 2);
  });
});


/**
 * LES DEUX CHEMINS QUE PERSONNE N'AVAIT CHIFFRÉS.
 *
 * ⚠️ L'AUDIT DU 31/08/2026 a établi deux FAITS STRUCTURELS et n'a pas pu les
 * chiffrer : la base de développement ne portait que sept commandes, et à cette
 * volumétrie le planificateur choisit un parcours séquentiel — la mesure
 * n'aurait rien dit. *Une mesure impossible se dit impossible.* Le banc, lui,
 * sème déjà au plafond : c'est ici que la question se tranche.
 *
 * FAIT 1 — L'INDEX QUE TROIS MIGRATIONS INVOQUENT N'EXISTE PAS. La 011 a
 * SUPPRIMÉ `orders_tri_defaut_idx` et l'a remplacé par deux index PARTIELS
 * (`where archived_at is null` / `is not null`). Or `verifier_plafond_commandes`
 * compte les commandes du mois SANS prédicat sur `archived_at` : aucun des deux
 * partiels ne peut le servir, Postgres exigeant que le prédicat de l'index soit
 * impliqué par la requête. Les migrations 077, 095 et 096 affirment pourtant
 * toutes les trois s'appuyer sur « l'index (shop_id, created_at) posé pour le
 * dashboard ». C'est L-014 : trois documents affirment un état que personne n'a
 * exécuté.
 *
 * Le chemin s'exécute à CHAQUE insertion de commande, c'est-à-dire sur l'action
 * centrale du produit.
 *
 * FAIT 2 — L'ÉCRAN ANALYSES LANCE QUATRE AGRÉGATS et un seul est mesuré
 * (`compter_envois`, dans `envois.test.ts`). `analyser_activite` filtre sur
 * `created_at >= p_precedent`, soit DEUX FOIS la fenêtre demandée, et produit
 * neuf compteurs sur des colonnes qu'aucun index ne couvre.
 *
 * ⚠️ ON NE POSE AUCUN INDEX AVANT D'AVOIR LU LE PLAN (L-017) : « un seuil
 * dépassé ne veut pas dire qu'il manque un index — vérifier d'abord que la
 * requête ne demande pas plus que nécessaire ». Ces mesures existent pour
 * répondre à cette question-là, pas pour justifier une correction décidée
 * d'avance.
 */
describe("Les chemins que l'audit n'a pas pu chiffrer", () => {
  /*
   * SEUILS ÉCRITS AVANT LA PREMIÈRE EXÉCUTION.
   *
   * `PLAFOND_MS` vaut 40 : ce contrôle s'ajoute à CHAQUE création de commande,
   * et un fournisseur qui en crée deux cents par semaine le paie deux cents
   * fois. Au-delà, l'écriture cesse d'être instantanée.
   *
   * `AGREGAT_MS` vaut 400 : l'écran Analyses n'est pas ouvert en boucle, mais
   * au-delà d'une demi-seconde il donne l'impression de ne pas répondre.
   */
  const PLAFOND_MS = 40;
  const AGREGAT_MS = 400;

  test("le comptage du plafond mensuel, à chaque création de commande", async () => {
    const m = await mesurerSerieuse(
      alice,
      `select count(*) from public.orders
        where shop_id = '${alice.shopId}'
          and created_at >= date_trunc('month', now())`,
    );

    // TOUTE MESURE PORTE UNE ASSERTION SUR LE JEU QU'ELLE DÉCRIT : sans elle,
    // une purge accidentelle ferait consigner une amélioration spectaculaire.
    const total = await bd.query<{ n: string }>(
      `select count(*)::text as n from public.orders where shop_id = $1`,
      [alice.shopId],
    );
    expect(
      Number.parseInt(total.rows[0]?.n ?? "0", 10),
      "le jeu de mesure a disparu : la mesure ne décrit rien",
    ).toBeGreaterThan(PLAFOND_COMMANDES / 2);

    console.log(
      `  plafond mensuel : ${m.ms.toFixed(1)} ms, ${m.lignesLues} ligne(s) lue(s) ` +
        `sur ${PLAFOND_COMMANDES} au compte`,
    );
    console.log(`  index employé : ${/Index (Only )?Scan/.test(m.plan) ? "oui" : "NON"}`);

    expect(
      m.ms,
      `${m.ms.toFixed(1)} ms à chaque création de commande — au-dessus du seuil de ${PLAFOND_MS} ms`,
    ).toBeLessThan(PLAFOND_MS);
  });

  test("les trois agrégats de l'écran Analyses que le banc ignorait", async () => {
    const appels: ReadonlyArray<readonly [string, string]> = [
      [
        "analyser_activite",
        "select * from public.analyser_activite(now() - interval '90 days', now() - interval '180 days')",
      ],
      [
        "compter_commandes_par_semaine",
        "select * from public.compter_commandes_par_semaine(now(), 26)",
      ],
      ["compter_commandes_par_etat", "select * from public.compter_commandes_par_etat()"],
    ];

    for (const [nom, sql] of appels) {
      const m = await mesurerSerieuse(alice, sql);
      console.log(`  ${nom.padEnd(30)} ${m.ms.toFixed(1)} ms, ${m.lignesLues} ligne(s) lue(s)`);
      expect(
        m.ms,
        `${nom} : ${m.ms.toFixed(1)} ms au-dessus du seuil de ${AGREGAT_MS} ms`,
      ).toBeLessThan(AGREGAT_MS);
    }
  });
});

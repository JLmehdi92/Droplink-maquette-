import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ouvrirConnexionCatalogue, interroger } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur } from "../aide/utilisateurs";

/**
 * LIMITATION DE DÉBIT — ce que cette suite établit.
 *
 * Une limitation de débit qui se trompe se trompe EXACTEMENT quand elle sert :
 * sous concurrence. Un test séquentiel ne le verrait pas — dix appels à la file
 * donnent le bon compte même avec une implémentation « lire puis écrire »
 * parfaitement vulnérable. D'où le test à connexions PARALLÈLES, seul capable de
 * distinguer un incrément atomique d'une course.
 *
 * La suite vérifie aussi que le compteur est INATTEIGNABLE autrement que par sa
 * fonction. Un compteur lisible dit à l'attaquant combien il lui reste ; un
 * compteur écrivable lui permet d'épuiser le quota de quelqu'un d'autre. Un
 * veilleur dont le battement est écrivable anonymement est pire qu'un veilleur
 * absent, parce qu'on cesse de le chercher.
 */

let catalogue: Client;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await catalogue.query("delete from public.rate_limit where cle like 'test-%'");
  await catalogue.query("delete from public.rate_limit where cle like 'test-purge-%'");
  await catalogue.end();
});

describe("Le compteur est hors de portée", () => {
  test("la table n'a AUCUNE policy, et RLS est activée ET forcée", async () => {
    const lignes = await interroger<{
      rls: boolean;
      forcee: boolean;
      policies: string;
    }>(
      catalogue,
      `select c.relrowsecurity as rls, c.relforcerowsecurity as forcee,
              (select count(*) from pg_policy p where p.polrelid = c.oid)::text as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'rate_limit'`,
    );
    expect(lignes, "table rate_limit introuvable : la sonde vise à côté").toHaveLength(1);
    const ligne = lignes[0];
    expect(ligne?.rls, "RLS désactivée sur le compteur").toBe(true);
    expect(ligne?.forcee, "RLS non forcée : le propriétaire la contournerait").toBe(true);
    expect(
      ligne?.policies,
      "Une policy sur ce compteur le rendrait atteignable autrement que par sa " +
        "fonction, ce qui est tout ce qu'on cherche à empêcher.",
    ).toBe("0");
  });

  test("`anon` et `authenticated` n'ont AUCUN droit sur la table", async () => {
    // Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : sans
    // retrait explicite, la RLS serait la seule barrière — et une table sans
    // policy laisse quand même passer certains chemins.
    const lignes = await interroger<{ grantee: string; privilege_type: string }>(
      catalogue,
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'rate_limit'
         and grantee in ('anon', 'authenticated')`,
    );
    expect(
      lignes.map((l) => `${l.grantee}:${l.privilege_type}`),
      "Droits résiduels sur le compteur",
    ).toEqual([]);
  });

  test("la fonction n'est exécutable ni par PUBLIC, ni par anon, ni par authenticated", async () => {
    // Postgres accorde EXECUTE à PUBLIC par défaut, et ce droit ne s'écrit pas
    // dans le corps de la fonction : aucune relecture ne peut le voir.
    const lignes = await interroger<{ beneficiaire: string }>(
      catalogue,
      `select a.grantee::regrole::text as beneficiaire
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where n.nspname = 'public' and p.proname = 'consommer_quota'
         and a.privilege_type = 'EXECUTE'
         and a.grantee::regrole::text in ('public', '-', 'anon', 'authenticated')`,
    );
    expect(
      lignes.map((l) => l.beneficiaire),
      "Une fonction de quota exécutable par un client permet d'épuiser le quota " +
        "d'un tiers dont on connaît la clé.",
    ).toEqual([]);
  });

  test("la sonde inspecte réellement une fonction existante", async () => {
    // Un ensemble vide passe tout : si la fonction n'existait pas, les trois
    // assertions ci-dessus seraient vraies par vacuité.
    const lignes = await interroger<{ n: string }>(
      catalogue,
      `select count(*)::text as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'consommer_quota'`,
    );
    expect(lignes[0]?.n, "consommer_quota n'existe pas").toBe("1");
  });

  test("un utilisateur RÉELLEMENT authentifié ne peut ni lire ni appeler", async () => {
    // Un test qui simule les droits ne teste pas les droits.
    const alice = await creerUtilisateur("quota-alice");
    try {
      const lecture = await alice.client.from("rate_limit").select("*");
      expect(
        lecture.error,
        "Un utilisateur authentifié a pu LIRE le compteur : il sait combien il " +
          "lui reste avant d'être bloqué.",
      ).not.toBeNull();

      const appel = await alice.client.rpc("consommer_quota", {
        p_cle: "test-depuis-le-client",
        p_plafond: 1,
        p_fenetre_secondes: 60,
      });
      expect(
        appel.error,
        "Un utilisateur authentifié a pu APPELER la fonction de quota.",
      ).not.toBeNull();
    } finally {
      await supprimerUtilisateur(alice);
    }
  });
});

describe("Le compteur compte juste", () => {
  test("contre-test positif : sous le plafond, l'appel est AUTORISÉ", async () => {
    // Sans lui, une fonction qui refuserait TOUT passerait chaque test de refus
    // à 100 % sans rien prouver.
    const cle = `test-positif-${Date.now()}`;
    for (let i = 0; i < 3; i += 1) {
      const lignes = await interroger<{ ok: boolean }>(
        catalogue,
        `select public.consommer_quota('${cle}', 5, 60) as ok`,
      );
      expect(lignes[0]?.ok, `appel ${i + 1} sur un plafond de 5`).toBe(true);
    }
  });

  test("le plafond est appliqué exactement", async () => {
    const cle = `test-plafond-${Date.now()}`;
    const resultats: boolean[] = [];
    for (let i = 0; i < 8; i += 1) {
      const lignes = await interroger<{ ok: boolean }>(
        catalogue,
        `select public.consommer_quota('${cle}', 3, 60) as ok`,
      );
      resultats.push(lignes[0]?.ok ?? false);
    }
    expect(resultats).toEqual([true, true, true, false, false, false, false, false]);
  });

  /**
   * LE TEST QUI COMPTE.
   *
   * Vingt connexions DISTINCTES, en parallèle, sur un plafond de cinq. Une
   * implémentation « lire le compteur puis l'écrire » passerait tous les tests
   * séquentiels ci-dessus et laisserait ici passer bien plus de cinq appels —
   * une course qui DÉGRADE au lieu de casser, donc la plus difficile à
   * attribuer, et qui ne se manifeste que sous la charge qu'on prétend limiter.
   */
  test("sous CONCURRENCE RÉELLE, le plafond tient exactement", async () => {
    const cle = `test-concurrence-${Date.now()}`;
    const PLAFOND = 4;
    // DOUZE et non vingt : le pooler Supabase en mode session (port 5432)
    // plafonne à 15 clients, et le dépassement fait échouer le test sur
    // « EMAXCONNSESSION » — un échec qui ressemble à un défaut du compteur alors
    // qu'il vient du banc d'essai. Douze connexions contre un plafond de quatre
    // restent parfaitement discriminantes : une implémentation « lire puis
    // écrire » en laisserait passer bien plus de quatre.
    const APPELS = 12;

    const connexions = await Promise.all(
      Array.from({ length: APPELS }, () => ouvrirConnexionCatalogue()),
    );

    try {
      const resultats = await Promise.all(
        connexions.map(async (c) => {
          const r = await c.query<{ ok: boolean }>(
            `select public.consommer_quota($1, $2, 60) as ok`,
            [cle, PLAFOND],
          );
          return r.rows[0]?.ok ?? false;
        }),
      );

      const autorises = resultats.filter(Boolean).length;
      expect(
        autorises,
        `${autorises} appels autorisés sur un plafond de ${PLAFOND}, avec ` +
          `${APPELS} connexions parallèles. L'incrément n'est pas atomique : ` +
          "la limite cède précisément sous la charge qu'elle doit borner.",
      ).toBe(PLAFOND);
    } finally {
      await Promise.all(connexions.map((c) => c.end()));
    }
  });

  test("deux clés distinctes ne se partagent pas leur quota", async () => {
    const suffixe = Date.now();
    const a = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.consommer_quota('test-cle-a-${suffixe}', 1, 60) as ok`,
    );
    const encoreA = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.consommer_quota('test-cle-a-${suffixe}', 1, 60) as ok`,
    );
    const b = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.consommer_quota('test-cle-b-${suffixe}', 1, 60) as ok`,
    );
    expect(a[0]?.ok).toBe(true);
    expect(encoreA[0]?.ok, "la clé A devait être épuisée").toBe(false);
    expect(b[0]?.ok, "la clé B ne doit pas subir le quota de la clé A").toBe(true);
  });

  test("la fenêtre est calculée depuis l'horloge du SERVEUR", async () => {
    // Un décalage entre instances ferait chevaucher une fenêtre client sur deux
    // fenêtres serveur, et le plafond réel vaudrait le double.
    const cle = `test-fenetre-${Date.now()}`;
    await interroger(catalogue, `select public.consommer_quota('${cle}', 10, 60)`);
    const lignes = await interroger<{ ecart: string }>(
      catalogue,
      `select abs(extract(epoch from (now() - fenetre_debut)))::text as ecart
       from public.rate_limit where cle = '${cle}'`,
    );
    expect(lignes, "aucune ligne écrite").toHaveLength(1);
    expect(Number(lignes[0]?.ecart), "la fenêtre n'est pas ancrée sur l'heure serveur")
      .toBeLessThan(120);
  });

  test("des paramètres absurdes sont REFUSÉS, pas dégradés", () => {
    // Un plafond à zéro qui refuserait tout, ou une fenêtre nulle qui
    // diviserait par zéro, sont des erreurs de programmation : elles doivent
    // faire du bruit, pas produire un comportement plausible.
    return (async () => {
      for (const [plafond, fenetre] of [
        [0, 60],
        [-1, 60],
        [5, 0],
        [5, -60],
      ]) {
        await expect(
          interroger(catalogue, `select public.consommer_quota('test-absurde', ${plafond}, ${fenetre})`),
          `plafond=${plafond} fenetre=${fenetre} accepté`,
        ).rejects.toThrow();
      }
    })();
  });
});

/**
 * LA CONSULTATION SANS CONSOMMATION.
 *
 * `quota_depasse` existe parce que la page publique a deux seuils dont l'un —
 * celui des jetons inconnus — ne peut être évalué qu'APRÈS la lecture qu'il
 * protège. Consulter le compteur avant de lire permet de couper un balayage
 * qui a déjà brûlé son budget.
 *
 * Ce qui doit être vrai : elle ne crée rien, et elle calcule la MÊME fenêtre que
 * `consommer_quota`. Deux calculs de fenêtre divergents feraient consulter une
 * fenêtre et consommer l'autre — le plafond ne tiendrait alors rien, et rien ne
 * casserait.
 */
describe("Consulter un compteur sans le consommer", () => {
  test("elle ne crée aucune ligne, et n'en avance aucune", async () => {
    const cle = `test-peek-${Date.now()}`;

    const vide = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.quota_depasse('${cle}', 2, 60) as ok`,
    );
    expect(vide[0]?.ok, "un compteur inexistant est déjà dépassé").toBe(false);

    const lignes = await interroger<{ n: string }>(
      catalogue,
      `select count(*)::text as n from public.rate_limit where cle = '${cle}'`,
    );
    expect(lignes[0]?.n, "la consultation a créé une ligne : c'est une consommation déguisée").toBe(
      "0",
    );

    // Contre-test positif : elle DOIT passer à `true` une fois le plafond
    // atteint. Sans cette moitié, une fonction qui rend toujours `false` —
    // c'est-à-dire un seuil qui ne mord jamais — passerait le test précédent.
    await interroger(catalogue, `select public.consommer_quota('${cle}', 2, 60)`);
    const apresUn = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.quota_depasse('${cle}', 2, 60) as ok`,
    );
    expect(apresUn[0]?.ok, "un seul appel ne dépasse pas un plafond de deux").toBe(false);

    await interroger(catalogue, `select public.consommer_quota('${cle}', 2, 60)`);
    const apresDeux = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.quota_depasse('${cle}', 2, 60) as ok`,
    );
    expect(apresDeux[0]?.ok, "le plafond est atteint et la consultation ne le voit pas").toBe(true);
  });

  test("elle lit la MÊME fenêtre que celle que l'on consomme", async () => {
    // Le défaut visé n'est pas hypothétique : deux expressions de fenêtre
    // écrites séparément dérivent au premier changement de l'une des deux, et la
    // dérive est muette — la consultation regarde alors une fenêtre vide pendant
    // que la consommation en remplit une autre.
    const cle = `test-peek-fenetre-${Date.now()}`;
    await interroger(catalogue, `select public.consommer_quota('${cle}', 1, 60)`);

    const lignes = await interroger<{ ok: boolean }>(
      catalogue,
      `select public.quota_depasse('${cle}', 1, 60) as ok`,
    );
    expect(lignes[0]?.ok, "la consultation ne voit pas ce que la consommation vient d'écrire").toBe(
      true,
    );
  });

  test("elle n'est exécutable ni par `anon` ni par `authenticated`", async () => {
    // Un compteur qu'un client peut consulter lui dit combien il lui reste,
    // donc à quelle cadence balayer sans être vu.
    const lignes = await interroger<{ beneficiaire: string }>(
      catalogue,
      `select coalesce(a.grantee::regrole::text, 'PUBLIC') as beneficiaire
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace,
            aclexplode(p.proacl) a
       where n.nspname = 'public' and p.proname = 'quota_depasse'
         and a.privilege_type = 'EXECUTE'`,
    );
    expect(lignes.length, "quota_depasse est introuvable : la sonde vise à côté").toBeGreaterThan(0);
    const ouverts = lignes
      .map((l) => l.beneficiaire)
      .filter((r) => r === "PUBLIC" || r === "anon" || r === "authenticated");
    expect(ouverts, "le compteur est consultable par un client").toEqual([]);
  });
});

describe("La purge ne franchit pas la frontière des surfaces", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * LE DÉFAUT QUI A MOTIVÉ CETTE SUITE — ET QUI RENDAIT TOUS LES PLAFONDS
   * D'AUTHENTIFICATION INEXISTANTS EN PRODUCTION
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * `consommer_quota` purge les lignes périmées à son premier appel de fenêtre,
   * et c'est nécessaire — sans purge, le coût de chaque appel croîtrait avec le
   * trafic passé. Mais elle jugeait les lignes de TOUT LE MONDE avec la fenêtre
   * de L'APPELANT.
   *
   * Les surfaces n'ont pas la même fenêtre : la page publique compte par MINUTE,
   * l'authentification par HEURE. Un seul appel venu de la page publique posait
   * donc le seuil à « il y a deux minutes » et supprimait des compteurs
   * d'authentification vieux de cinquante minutes — c'est-à-dire parfaitement
   * vivants.
   *
   * ⚠️ CE QUE ÇA COÛTAIT : la page publique est le cœur du produit, ouverte en
   * permanence par de vrais clients. Chaque ouverture remettait à zéro les
   * plafonds d'authentification. Les 30 tentatives par heure et par adresse IP
   * N'EXISTAIENT PAS — et rien ne le disait, parce qu'éprouvés SEULS, en base
   * calme, les compteurs fonctionnaient parfaitement. C'est le trafic légitime
   * qui les effaçait.
   *
   * Aucune sonde ne pouvait le voir sans faire ce que fait celle-ci : mêler DEUX
   * surfaces de fenêtres différentes dans la même base, comme la production.
   */

  const AUTH = "test-purge-auth:temoin";
  const PUBLIQUE = "test-purge-publique:appelant";
  const VIEUX_PUBLIQUE = "test-purge-publique:perime";

  test("un appel à fenêtre COURTE n'efface pas un compteur à fenêtre LONGUE", async () => {
    await catalogue.query("delete from public.rate_limit where cle like 'test-purge-%'");

    // Une ligne d'authentification de la fenêtre horaire précédente : vieille de
    // 90 minutes, donc périmée POUR SA PROPRE SURFACE aussi. C'est le pire cas —
    // si même celle-là survit à un appel d'une autre surface, la frontière tient.
    await catalogue.query(
      "insert into public.rate_limit(cle, fenetre_debut, compte) values ($1, now() - interval '90 minutes', 5)",
      [AUTH],
    );

    // Un appel de la page publique : fenêtre de 60 s, premier de sa fenêtre,
    // donc il déclenche la purge.
    await catalogue.query("select public.consommer_quota($1, 120, 60)", [PUBLIQUE]);

    const restant = await interroger<{ cle: string }>(
      catalogue,
      "select cle from public.rate_limit where cle = $1",
      [AUTH],
    );

    expect(
      restant.length,
      "Un appel de la page publique a supprimé un compteur d'authentification. " +
        "Le trafic légitime efface donc les plafonds d'authentification, en " +
        "continu, sans que rien ne le signale.",
    ).toBe(1);
  });

  test("CONTRE-TEST : elle purge toujours DANS sa propre surface", async () => {
    /*
     * Sans ce contre-test, on refermerait le défaut en supprimant la purge — et
     * la suite ci-dessus passerait à 100 %. Le coût de chaque appel se mettrait
     * alors à croître avec tout le trafic passé, sur le chemin de CHAQUE requête
     * protégée du produit. Une protection qui casse ce qu'elle protège n'en est
     * pas une.
     */
    await catalogue.query("delete from public.rate_limit where cle like 'test-purge-%'");

    await catalogue.query(
      "insert into public.rate_limit(cle, fenetre_debut, compte) values ($1, now() - interval '10 minutes', 3)",
      [VIEUX_PUBLIQUE],
    );

    await catalogue.query("select public.consommer_quota($1, 120, 60)", [PUBLIQUE]);

    const restant = await interroger<{ cle: string }>(
      catalogue,
      "select cle from public.rate_limit where cle = $1",
      [VIEUX_PUBLIQUE],
    );

    expect(
      restant.length,
      "La purge ne purge plus rien : le compteur va grossir sans borne.",
    ).toBe(0);
  });
});

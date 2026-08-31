import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { ouvrirConnexionCatalogue } from "../aide/base";
import type { Expediteur, ResultatEnvoi } from "@/lib/email/port";
import { veillerSur } from "@/lib/veille/passer";
import { TACHE_CADENCE, TACHE_VEILLE, TACHES_ATTENDUES } from "@/lib/veille/taches";

/**
 * LA VEILLE MUTUELLE, ÉPROUVÉE EN BASE.
 *
 * Trois propriétés vivent ici et NULLE PART AILLEURS — aucune relecture de code
 * ne peut les établir, parce qu'elles sont des propriétés du catalogue et du
 * moteur, pas du texte (L-028) :
 *
 *   1. `etat_veille` part de l'INVENTAIRE, donc rend une tâche qui n'a jamais
 *      battu. C'est très exactement ce que l'ancienne alerte (`alertes_admin`,
 *      migration 058) ne pouvait pas faire : son `from scheduler_heartbeat`
 *      exige une ligne pour être en retard, et une tâche jamais déployée n'en a
 *      pas. Le défaut ne se voyait pas — la requête est correcte, c'est son
 *      point de départ qui était faux.
 *   2. `premier_battement` SURVIT aux battements suivants. Si `battre`
 *      l'écrasait, l'âge du veilleur vaudrait toujours zéro, la grâce ne
 *      serait jamais écoulée, et `jamais_deployee` ne partirait JAMAIS. Le
 *      mécanisme entier tiendrait, vert, sans jamais alerter.
 *   3. La réservation est un vrai verrou, et sa libération le rouvre.
 */

let bd: Client;

const SOURCE_TEST = "tache-de-test-veille";
const CLE_TEST = "veille:tache-de-test-veille:en_retard";

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterEach(async () => {
  // ⚠️ LES DEUX TABLES SONT GLOBALES. Une ligne oubliée ici ne casse pas cette
  // suite, elle en casse une autre — et le rouge tombe alors sur un fichier qui
  // n'y est pour rien.
  await bd.query("delete from public.scheduler_heartbeat where source = $1", [SOURCE_TEST]);
  await bd.query("delete from public.alertes_envoyees where cle = $1", [CLE_TEST]);
});

afterAll(async () => {
  await bd.end();
});

describe("etat_veille — l'inventaire mène la jointure", () => {
  test("la sonde inspecte quelque chose : l'inventaire n'est pas vide", () => {
    // Un ensemble vide passe tout. Sans cette assertion, une refonte qui vide
    // `TACHES_ATTENDUES` rendrait chaque test ci-dessous vert et vide.
    expect(TACHES_ATTENDUES.length).toBeGreaterThanOrEqual(2);
  });

  test("une source SANS battement ressort `jamais_vue`, au lieu d'être absente", async () => {
    const { rows } = await bd.query<{ source: string; etat: string; minutes: string | null }>(
      "select source, etat, minutes from public.etat_veille($1::text[], $2::int)",
      [[SOURCE_TEST], 90],
    );

    expect(rows.length, "l'inventaire mène : une ligne est rendue même sans battement").toBe(1);
    expect(rows[0]?.etat).toBe("jamais_vue");
    expect(rows[0]?.minutes, "aucun battement : aucune ancienneté à rapporter").toBeNull();
  });

  test("la MÊME question posée à la table seule ne rend RIEN — c'était le défaut", async () => {
    /*
     * LE CONTRE-TEST QUI DONNE SON SENS AU PRÉCÉDENT.
     *
     * Sans lui, « `etat_veille` rend une ligne » ne prouve pas qu'il fallait
     * une nouvelle fonction : on croirait que l'ancienne l'aurait fait aussi.
     * On rejoue donc ici la forme exacte de la migration 058, et on constate
     * qu'elle ne peut pas voir la tâche — quel que soit le seuil.
     */
    const { rows } = await bd.query(
      `select h.source from public.scheduler_heartbeat h
       where h.source = $1 and h.beat_at < now() - make_interval(mins => $2::int)`,
      [SOURCE_TEST, 1],
    );
    expect(
      rows.length,
      "une requête qui part de la TABLE ne peut pas signaler une tâche sans ligne",
    ).toBe(0);
  });

  test("un battement frais ressort `actif`, un vieux ressort `en_retard`", async () => {
    // Le contre-test positif : une suite où tout ressort `jamais_vue` passerait
    // les tests ci-dessus sans qu'aucun seuil ne soit appliqué.
    await bd.query("select public.battre($1, '{}'::jsonb)", [SOURCE_TEST]);

    const frais = await bd.query<{ etat: string }>(
      "select etat from public.etat_veille($1::text[], $2::int)",
      [[SOURCE_TEST], 90],
    );
    expect(frais.rows[0]?.etat).toBe("actif");

    await bd.query("update public.scheduler_heartbeat set beat_at = now() - interval '5 hours' where source = $1", [
      SOURCE_TEST,
    ]);
    const vieux = await bd.query<{ etat: string; minutes: string }>(
      "select etat, minutes from public.etat_veille($1::text[], $2::int)",
      [[SOURCE_TEST], 90],
    );
    expect(vieux.rows[0]?.etat).toBe("en_retard");
    expect(Number(vieux.rows[0]?.minutes)).toBeGreaterThanOrEqual(299);
  });

  test("le seuil est BORNÉ : une valeur absurde ne désarme pas la fonction", async () => {
    await bd.query("select public.battre($1, '{}'::jsonb)", [SOURCE_TEST]);
    await bd.query("update public.scheduler_heartbeat set beat_at = now() - interval '30 days' where source = $1", [
      SOURCE_TEST,
    ]);

    // Un seuil négatif ou nul rendrait tout `en_retard` ; un seuil démesuré
    // rendrait tout `actif`, donc un veilleur qui n'alerte jamais. Les deux
    // sont ramenés dans les bornes de `parametres_admis`.
    const nul = await bd.query<{ etat: string }>(
      "select etat from public.etat_veille($1::text[], $2::int)",
      [[SOURCE_TEST], 0],
    );
    expect(nul.rows[0]?.etat, "un seuil à 0 est remonté au minimum admis").toBe("en_retard");

    const enorme = await bd.query<{ etat: string }>(
      "select etat from public.etat_veille($1::text[], $2::int)",
      [[SOURCE_TEST], 999_999_999],
    );
    expect(
      enorme.rows[0]?.etat,
      "un seuil démesuré est ramené à une semaine : 30 jours restent un retard",
    ).toBe("en_retard");
  });
});

describe("premier_battement — l'âge du veilleur", () => {
  test("il SURVIT aux battements suivants", async () => {
    /*
     * ⚠️ SI CETTE PROPRIÉTÉ TOMBE, TOUT LE MÉCANISME RESTE VERT ET N'ALERTE
     * PLUS JAMAIS sur une tâche jamais déployée : l'âge du veilleur vaudrait
     * toujours zéro, donc la grâce ne serait jamais écoulée. C'est une panne
     * parfaitement silencieuse, et c'est pour elle que ce test existe.
     */
    await bd.query("select public.battre($1, '{}'::jsonb)", [SOURCE_TEST]);
    const { rows: avant } = await bd.query<{ premier: string; dernier: string }>(
      "select premier_battement as premier, beat_at as dernier from public.scheduler_heartbeat where source = $1",
      [SOURCE_TEST],
    );
    const premierInitial = avant[0]?.premier;
    expect(premierInitial).toBeDefined();

    // On recule le premier battement dans le passé, puis on rebat.
    await bd.query(
      "update public.scheduler_heartbeat set premier_battement = now() - interval '3 days' where source = $1",
      [SOURCE_TEST],
    );
    await bd.query("select public.battre($1, '{\"n\":1}'::jsonb)", [SOURCE_TEST]);

    const { rows: apres } = await bd.query<{ premier: string; dernier: string; detail: unknown }>(
      "select premier_battement as premier, beat_at as dernier, detail from public.scheduler_heartbeat where source = $1",
      [SOURCE_TEST],
    );
    const ageMinutes = (Date.now() - Date.parse(apres[0]?.premier ?? "")) / 60_000;
    expect(ageMinutes, "le premier battement a été écrasé par le second").toBeGreaterThan(60 * 24 * 2);

    // Et la preuve que `battre` a bien travaillé : le reste, lui, a bougé.
    expect(apres[0]?.detail).toEqual({ n: 1 });
    expect(Date.parse(apres[0]?.dernier ?? "")).toBeGreaterThanOrEqual(
      Date.parse(avant[0]?.dernier ?? ""),
    );
  });
});

describe("reserver_alerte — le repos entre deux alertes", () => {
  test("la première réservation est accordée, la seconde REFUSÉE", async () => {
    const un = await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [
      CLE_TEST,
      60,
    ]);
    expect(un.rows[0]?.ok, "la première alerte doit pouvoir partir").toBe(true);

    const deux = await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [
      CLE_TEST,
      60,
    ]);
    expect(deux.rows[0]?.ok, "sans repos, une panne d'une nuit produit des centaines d'emails").toBe(
      false,
    );
  });

  test("le repos ÉCOULÉ rouvre le droit d'alerter", async () => {
    // Sans ce sens-là, une panne longue serait signalée une seule fois, puis
    // plus jamais — et l'on croirait qu'elle est réglée.
    await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [CLE_TEST, 60]);
    await bd.query("update public.alertes_envoyees set envoye_at = now() - interval '2 hours' where cle = $1", [
      CLE_TEST,
    ]);
    const apres = await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [
      CLE_TEST,
      60,
    ]);
    expect(apres.rows[0]?.ok).toBe(true);
  });

  test("liberer_alerte rend le droit IMMÉDIATEMENT — l'alerte n'est pas perdue", async () => {
    /*
     * C'est le piège n°1 du brief : « un compteur incrémenté AVANT une
     * opération qui peut échouer perd des événements définitivement ». Ici
     * l'événement perdu serait l'alerte, tue pendant tout le repos —
     * c'est-à-dire pendant la panne qu'elle décrivait.
     */
    await bd.query("select public.reserver_alerte($1, $2) as ok", [CLE_TEST, 60]);
    const bloquee = await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [
      CLE_TEST,
      60,
    ]);
    expect(bloquee.rows[0]?.ok).toBe(false);

    await bd.query("select public.liberer_alerte($1)", [CLE_TEST]);

    const rouverte = await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [
      CLE_TEST,
      60,
    ]);
    expect(rouverte.rows[0]?.ok, "après un envoi en échec, le passage suivant doit réessayer").toBe(
      true,
    );
  });

  test("le repos est BORNÉ : zéro ne désarme pas le verrou", async () => {
    // À zéro, `now() - interval '0'` vaut `now()` et toute ligne serait
    // considérée reposée : le verrou ne verrouillerait plus rien.
    await bd.query("select public.reserver_alerte($1, $2) as ok", [CLE_TEST, 0]);
    const suivante = await bd.query<{ ok: boolean }>("select public.reserver_alerte($1, $2) as ok", [
      CLE_TEST,
      0,
    ]);
    expect(suivante.rows[0]?.ok, "un repos à 0 laisserait passer chaque tour").toBe(false);
  });
});

describe("Les droits — rien de tout cela n'est atteignable depuis dehors", () => {
  test("ni `anon` ni `authenticated` n'exécutent les fonctions de veille", async () => {
    /*
     * ⚠️ UN DROIT D'EXÉCUTION NE S'ÉCRIT PAS DANS LE CORPS D'UNE FONCTION
     * (L-027, L-028) : aucune relecture ne peut le voir, il faut interroger le
     * catalogue. Et Postgres accorde `EXECUTE` à `PUBLIC` par défaut — l'oubli
     * d'un `revoke` ne produit aucune erreur, juste une porte.
     */
    const fonctions = [
      "reserver_alerte(text, int)",
      "liberer_alerte(text)",
      "etat_veille(text[], int)",
      "lire_retard_veilleur_minutes()",
    ];

    const ouvertes: string[] = [];
    for (const signature of fonctions) {
      for (const role of ["anon", "authenticated", "public"]) {
        const { rows } = await bd.query<{ droit: boolean }>(
          "select has_function_privilege($1, $2, 'EXECUTE') as droit",
          [role, `public.${signature}`],
        );
        if (rows[0]?.droit === true) ouvertes.push(`${signature} → ${role}`);
      }
    }

    expect(
      ouvertes,
      `Fonctions de veille exécutables depuis dehors : ${ouvertes.join(", ")}. ` +
        "Un veilleur dont le battement ou le repos est écrivable par un tiers est " +
        "PIRE qu'un veilleur absent : on cesse de le chercher.",
    ).toEqual([]);

    // Contre-test positif : le rôle qui DOIT pouvoir, peut. Sans lui, un
    // `revoke` trop large passerait ce test à 100 % en cassant le produit.
    for (const signature of fonctions) {
      const { rows } = await bd.query<{ droit: boolean }>(
        "select has_function_privilege('service_role', $1, 'EXECUTE') as droit",
        [`public.${signature}`],
      );
      expect(rows[0]?.droit, `service_role ne peut pas exécuter ${signature}`).toBe(true);
    }
  });

  test("la table du repos n'a AUCUNE policy, et c'est le mécanisme", async () => {
    const { rows } = await bd.query<{ rls: boolean; forcee: boolean; n: string }>(
      `select c.relrowsecurity as rls, c.relforcerowsecurity as forcee,
              (select count(*) from pg_policy p where p.polrelid = c.oid)::text as n
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'alertes_envoyees'`,
    );
    expect(rows[0]?.rls).toBe(true);
    expect(rows[0]?.forcee).toBe(true);
    expect(Number(rows[0]?.n), "une policy ici rouvrirait les deux droits interdits").toBe(0);
  });
});

describe("veillerSur — l'ordre réserver, envoyer, libérer-si-échec", () => {
  /*
   * ⚠️ C'EST ICI QUE VIT LE PIÈGE N°1 DU BRIEF (§11).
   *
   * « Un compteur incrémenté AVANT une opération qui peut échouer perd des
   * événements définitivement. » La réservation DOIT venir avant l'envoi —
   * sinon deux passages concurrents envoient deux emails. Mais alors, si
   * l'envoi échoue, l'alerte est tue pour toute la durée du repos, c'est-à-dire
   * PENDANT LA PANNE QU'ELLE DÉCRIVAIT.
   *
   * Aucune relecture ne distingue les deux ordres : dans les deux cas le code
   * réserve puis envoie. Ce qui les sépare est ce qui se passe APRÈS un échec,
   * et cela ne s'observe qu'en faisant échouer un envoi.
   */

  /** Un expéditeur qui compte ses appels et rend ce qu'on lui dit. */
  function fauxExpediteur(reponse: ResultatEnvoi): Expediteur & { appels: number } {
    const faux = {
      appels: 0,
      envoyer(): Promise<ResultatEnvoi> {
        faux.appels += 1;
        return Promise.resolve(reponse);
      },
    };
    return faux;
  }

  const CLE_CADENCE = `veille:${TACHE_CADENCE}:en_retard`;
  let sauvegarde: { source: string; beat_at: Date; premier: Date; detail: unknown }[] = [];

  beforeAll(async () => {
    // ⚠️ `scheduler_heartbeat` EST GLOBALE et porte les VRAIES sources. On la
    // remet exactement comme on l'a trouvée : une autre suite lit ces lignes.
    const { rows } = await bd.query(
      "select source, beat_at, premier_battement as premier, detail from public.scheduler_heartbeat",
    );
    sauvegarde = rows;
  });

  afterEach(async () => {
    await bd.query("delete from public.alertes_envoyees where cle = $1", [CLE_CADENCE]);
  });

  afterAll(async () => {
    await bd.query("delete from public.scheduler_heartbeat");
    for (const l of sauvegarde) {
      await bd.query(
        "insert into public.scheduler_heartbeat (source, beat_at, premier_battement, detail) values ($1, $2, $3, $4)",
        [l.source, l.beat_at, l.premier, l.detail],
      );
    }
  });

  /** La cadence est en panne depuis 5 h ; le veilleur, lui, est vieux et vivant. */
  async function poserUnePanneDeCadence(): Promise<void> {
    await bd.query("delete from public.scheduler_heartbeat");
    await bd.query(
      `insert into public.scheduler_heartbeat (source, beat_at, premier_battement, detail)
       values ($1, now() - interval '5 hours', now() - interval '30 days', '{}'::jsonb),
              ($2, now(), now() - interval '30 days', '{}'::jsonb)`,
      [TACHE_CADENCE, TACHE_VEILLE],
    );
  }

  test("un envoi REFUSÉ libère la réservation : le passage suivant réessaie", async () => {
    await poserUnePanneDeCadence();

    const refuse = fauxExpediteur({ statut: "refuse", motif: "panne simulée du fournisseur" });
    const premier = await veillerSur(TACHE_VEILLE, new Date(), refuse);

    expect(premier.alertes, "la panne de cadence doit produire une alerte").toBe(1);
    expect(refuse.appels, "l'envoi doit avoir été tenté").toBe(1);
    expect(premier.envoyees).toBe(0);
    expect(premier.echecs).toBe(1);

    // LA PROPRIÉTÉ QUI COMPTE : la clé ne doit plus être réservée.
    const { rows } = await bd.query("select 1 from public.alertes_envoyees where cle = $1", [
      CLE_CADENCE,
    ]);
    expect(
      rows.length,
      "la réservation n'a pas été libérée : l'alerte est perdue pour toute la " +
        "durée du repos, c'est-à-dire pendant la panne qu'elle décrivait",
    ).toBe(0);

    // Et la preuve par l'exécution : le passage suivant retente vraiment.
    const reussi = fauxExpediteur({ statut: "envoye", id: "msg_test" });
    const second = await veillerSur(TACHE_VEILLE, new Date(), reussi);
    expect(reussi.appels).toBe(1);
    expect(second.envoyees).toBe(1);
  });

  test("un envoi RÉUSSI garde la réservation : on ne redit pas la même chose", async () => {
    await poserUnePanneDeCadence();

    const reussi = fauxExpediteur({ statut: "envoye", id: "msg_test" });
    const premier = await veillerSur(TACHE_VEILLE, new Date(), reussi);
    expect(premier.envoyees).toBe(1);

    // Le contre-test du précédent : sans lui, une implémentation qui libère
    // TOUJOURS passerait le test d'échec et enverrait un email par passage.
    const encore = fauxExpediteur({ statut: "envoye", id: "msg_test_2" });
    const second = await veillerSur(TACHE_VEILLE, new Date(), encore);
    expect(encore.appels, "un second email est parti pour la même panne").toBe(0);
    expect(second.enRepos).toBe(1);
    expect(second.envoyees).toBe(0);
  });

  test("un expéditeur NON CONFIGURÉ libère aussi, et le dit", async () => {
    /*
     * Le cas d'aujourd'hui, tant que `RESEND_API_KEY` est absente. Il ne doit
     * surtout pas consommer la réservation : le jour où la clé est posée, la
     * panne encore en cours doit être signalée au passage suivant, pas
     * silencieusement considérée comme déjà annoncée.
     */
    await poserUnePanneDeCadence();

    const muet = fauxExpediteur({ statut: "non_configure", manquant: ["RESEND_API_KEY"] });
    const bilan = await veillerSur(TACHE_VEILLE, new Date(), muet);

    expect(bilan.nonConfigure, "le silence doit être RAPPORTÉ, pas avalé").toBe(true);
    expect(bilan.echecs).toBe(1);
    const { rows } = await bd.query("select 1 from public.alertes_envoyees where cle = $1", [
      CLE_CADENCE,
    ]);
    expect(rows.length, "une alerte jamais partie ne doit pas consommer son repos").toBe(0);
  });

  test("contre-test : tout va bien, aucun envoi n'est tenté", async () => {
    // Sans lui, une implémentation qui alerte TOUJOURS passerait tout ce qui
    // précède. C'est le seul test du fichier qui prouve qu'on sait se taire.
    await bd.query("delete from public.scheduler_heartbeat");
    await bd.query(
      `insert into public.scheduler_heartbeat (source, beat_at, premier_battement, detail)
       values ($1, now(), now() - interval '30 days', '{}'::jsonb),
              ($2, now(), now() - interval '30 days', '{}'::jsonb)`,
      [TACHE_CADENCE, TACHE_VEILLE],
    );

    const jamais = fauxExpediteur({ statut: "envoye", id: "ne_doit_pas_partir" });
    const bilan = await veillerSur(TACHE_VEILLE, new Date(), jamais);

    expect(bilan.alertes).toBe(0);
    expect(jamais.appels).toBe(0);
    expect(bilan.observees, "le veilleur doit tout de même avoir REGARDÉ").toBeGreaterThan(0);
  });
});

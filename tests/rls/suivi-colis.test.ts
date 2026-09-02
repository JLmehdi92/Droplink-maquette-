import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LE LOT SUIVI DE COLIS — CE QUE L'AUDIT A FAIT LEVER.
 *
 * Sept défauts, un seul motif : LE SUIVI PARTAGE SON ÉTAT ENTRE VENDEURS, ET LE
 * PARTAGE AVAIT ÉTÉ ÉTENDU À CE QUI NE DOIT PAS L'ÊTRE. Que deux vendeurs
 * suivant le même colis en voient tous deux l'avancement est voulu et documenté.
 * Que le COÛT de l'appel, l'ancienneté des dates et la fenêtre d'abandon leur
 * soient également communs ne l'était pas — et rien ne le disait, parce que ces
 * trois-là ne s'observent qu'en comparant deux comptes.
 *
 * CHAQUE CONTRÔLE ICI A ÉTÉ VU ROUGE avant sa correction, sur la base réelle.
 * Les chiffres cités dans les commentaires sont ceux qui ont été MESURÉS, pas
 * ceux qu'on attendait.
 *
 * LA CONNEXION DE CATALOGUE est employée à dessein : ces fonctions sont
 * `security definer` et révoquées à `anon` comme à `authenticated`. Les éprouver
 * sous le rôle d'un vendeur ne prouverait que la révocation — c'est-à-dire une
 * ABSENCE — et pas ce qu'elles font quand elles sont légitimement appelées.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

/** Un numéro neuf par contrôle : deux contrôles qui le partageraient s'observeraient. */
let compteur = 0;
function numeroNeuf(): string {
  compteur += 1;
  return `SUIVI-${Date.now()}-${compteur}`;
}

async function enregistrerColis(u: UtilisateurDeTest, numero: string): Promise<string> {
  const l = await interroger<{ id: string }>(
    catalogue,
    "insert into public.tracked_parcels (shop_id, tracking_number) values ($1,$2) returning id",
    [u.shopId, numero],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("colis non enregistré");
  return id;
}

/** Ce que le compteur de coût du mois affiche pour un vendeur. */
async function appelsFactures(u: UtilisateurDeTest): Promise<number> {
  const l = await interroger<{ n: string | number | null }>(
    catalogue,
    `select tracking_api_calls as n from public.usage_counters
      where profile_id = $1 and period_month = date_trunc('month', now())::date`,
    [u.profilId],
  );
  return Number(l[0]?.n ?? 0);
}

async function colis(numero: string): Promise<
  {
    query_count: number;
    empty_count: number;
    first_movement_at: string | null;
    last_movement_at: string | null;
    estimated_from: string | null;
    raw_status: string | null;
    abandon_motif: string | null;
    snaps: string;
  }[]
> {
  return interroger(
    catalogue,
    `select tp.query_count, tp.empty_count, tp.first_movement_at, tp.last_movement_at,
            tp.estimated_from, tp.raw_status, tp.abandon_motif,
            (select count(*) from public.tracking_snapshots ts where ts.parcel_id = tp.id) as snaps
       from public.tracked_parcels tp
      where tp.tracking_number = $1
      order by tp.created_at asc, tp.id asc`,
    [numero],
  );
}

/** Une ingestion, telle que l'application l'émet. */
async function ingerer(
  numero: string,
  options: {
    points?: { instant: string; description: string }[];
    estimation?: string;
    premier?: string;
  } = {},
): Promise<number> {
  const points = (options.points ?? []).map((p) => ({ ...p, lieu: "", etape: "" }));
  const l = await interroger<{ n: number }>(
    catalogue,
    `select colis as n from public.appliquer_etat_colis(
       $1, 'expedie', 'In transit', '', $2::jsonb, $3, $3, '{}'::jsonb, $4
     )`,
    [numero, JSON.stringify(points), options.estimation ?? "", options.premier ?? ""],
  );
  return l[0]?.n ?? 0;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("suivi-alice");
  bob = await creerUtilisateur("suivi-bob");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Un appel payé n'est imputé qu'une fois", () => {
  test("deux vendeurs suivant le même numéro ne paient pas chacun l'appel", async () => {
    /*
     * MESURÉ AVANT CORRECTION : une ingestion, `tracking_api_calls` = 1 CHEZ
     * CHACUN DES DEUX. Le coût suivait le nombre de vendeurs qui regardent,
     * alors que le fournisseur facture à la prise en charge d'un NUMÉRO.
     *
     * Ce n'est pas qu'une erreur de comptabilité. Un numéro de suivi figure sur
     * l'étiquette : n'importe qui pouvait l'enregistrer chez lui et faire porter
     * à un vendeur le coût de son propre suivi. Le seul compteur du produit qui
     * corresponde à une facture était falsifiable À LA HAUSSE, par un tiers.
     */
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);
    await enregistrerColis(bob, numero);

    const avantAlice = await appelsFactures(alice);
    const avantBob = await appelsFactures(bob);

    const touches = await ingerer(numero);
    expect(touches, "l'état n'a pas été appliqué aux deux colis").toBe(2);

    // ALICE A ENREGISTRÉ LA PREMIÈRE : c'est son enregistrement qui a déclenché
    // la prise en charge facturée, c'est donc elle qui la porte.
    expect(await appelsFactures(alice), "le pionnier ne porte pas l'appel").toBe(avantAlice + 1);
    expect(
      await appelsFactures(bob),
      "un tiers s'est vu imputer un appel qu'il n'a pas déclenché",
    ).toBe(avantBob);
  });

  test("un seul instantané est écrit par appel", async () => {
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);
    await enregistrerColis(bob, numero);

    await ingerer(numero);

    const lignes = await colis(numero);
    const total = lignes.reduce((s, l) => s + Number(l.snaps), 0);
    expect(total, "la réponse brute a été copiée une fois par vendeur").toBe(1);
  });

  test("contre-test positif : l'ÉTAT, lui, est bien partagé", async () => {
    // Sans ce contrôle, une correction qui cesserait purement et simplement
    // d'écrire chez le second vendeur passerait les deux tests précédents. Or le
    // partage de l'état est la fonctionnalité, pas le défaut : un revendeur et
    // son fournisseur suivent légitimement le même colis.
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);
    await enregistrerColis(bob, numero);

    await ingerer(numero, {
      points: [{ instant: "2026-08-10T08:00:00Z", description: "Départ du centre" }],
    });

    const lignes = await colis(numero);
    expect(lignes).toHaveLength(2);
    for (const l of lignes) {
      expect(l.last_movement_at, "un vendeur ne voit pas l'avancement du colis").not.toBeNull();
    }
  });

  test("une interrogation VIDE est comptée elle aussi", async () => {
    /*
     * Elle ne l'était pas : le compteur ne bougeait que sur un instantané, et un
     * retour vide n'en écrit aucun. Or l'appel est payé quand même, et le retour
     * vide est le cas le PLUS FRÉQUENT — un numéro fraîchement collé n'est pas
     * encore scanné. Notre unique compteur de coût sous-estimait donc la
     * dépense, c'est-à-dire se trompait du côté rassurant.
     */
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);

    const avant = await appelsFactures(alice);
    await interroger(catalogue, "select public.compter_interrogation_vide($1)", [numero]);

    expect(await appelsFactures(alice), "une interrogation payée n'est pas comptée").toBe(avant + 1);
  });
});

describe("Une notification rejouée ne compte qu'une fois", () => {
  test("la seconde présentation de la même empreinte est reconnue", async () => {
    // MESURÉ AVANT CORRECTION : la même notification signée, renvoyée cinq fois,
    // faisait passer `query_count` de 1 à 6 et imputait cinq appels. Le rejeu
    // n'exige personne en face : le fournisseur lui-même réémet quand il n'a pas
    // de réponse assez vite.
    const cle = `empreinte-${Date.now()}`;

    const premiere = await interroger<{ v: boolean }>(
      catalogue,
      "select public.notification_deja_vue($1) as v",
      [cle],
    );
    expect(premiere[0]?.v, "une notification neuve est prise pour un rejeu").toBe(false);

    const seconde = await interroger<{ v: boolean }>(
      catalogue,
      "select public.notification_deja_vue($1) as v",
      [cle],
    );
    expect(seconde[0]?.v, "un rejeu à l'octet près est traité une seconde fois").toBe(true);
  });

  test("une empreinte absente ne prétend pas dédupliquer", async () => {
    // La chaîne vide vaut absence, comme partout dans ce dépôt. Rendre `true`
    // ici ferait IGNORER toute notification dont l'empreinte manque — c'est-à-
    // dire transformerait un défaut de calcul en panne totale du suivi.
    const l = await interroger<{ v: boolean }>(
      catalogue,
      "select public.notification_deja_vue('') as v",
    );
    expect(l[0]?.v, "une clé absente est traitée comme un rejeu").toBe(false);
  });
});

describe("Les dates d'un colis ne reculent pas", () => {
  test("le premier mouvement tient au-delà du plafond d'affichage", async () => {
    /*
     * MESURÉ AVANT CORRECTION sur quarante points : date affichée 11/06, date
     * réelle 01/06 — DIX JOURS d'écart, rendus au client.
     *
     * `assemblerPassages` bornait la liste à trente points et gardait les plus
     * RÉCENTS, donc coupait justement celui qui date le départ. Le module pur
     * calculait pourtant la bonne valeur ; c'est l'appelant qui la jetait.
     *
     * Le contrôle passe la borne SANS le point correspondant, exactement comme
     * l'application le fait après troncature.
     */
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);

    await ingerer(numero, {
      points: [{ instant: "2026-06-11T00:00:00Z", description: "Scan tardif" }],
      premier: "2026-06-01T00:00:00Z",
    });

    const [ligne] = await colis(numero);
    expect(
      ligne?.first_movement_at === null ? null : new Date(String(ligne?.first_movement_at)),
      "le départ du colis est daté après le premier scan réel",
    ).toEqual(new Date("2026-06-01T00:00:00Z"));
  });

  test("l'estimation de livraison ne revient pas dans le passé", async () => {
    // MESURÉ AVANT CORRECTION : estimation au 01/09, puis une notification
    // portant le 01/08 → la table lisait 01/08. Le client voyait s'afficher une
    // date de livraison DÉJÀ PASSÉE.
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);

    await ingerer(numero, { estimation: "2026-09-01T00:00:00Z" });
    await ingerer(numero, { estimation: "2026-08-01T00:00:00Z" });

    const [ligne] = await colis(numero);
    expect(
      ligne?.estimated_from === null ? null : new Date(String(ligne?.estimated_from)),
      "l'estimation de livraison a reculé",
    ).toEqual(new Date("2026-09-01T00:00:00Z"));
  });

  test("contre-test positif : une estimation POSTÉRIEURE est bien prise", async () => {
    // Sans lui, une correction qui refuserait toute mise à jour d'estimation
    // passerait le test précédent en ne faisant plus rien du tout.
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);

    await ingerer(numero, { estimation: "2026-09-01T00:00:00Z" });
    await ingerer(numero, { estimation: "2026-09-20T00:00:00Z" });

    const [ligne] = await colis(numero);
    expect(
      ligne?.estimated_from === null ? null : new Date(String(ligne?.estimated_from)),
      "un report annoncé par le transporteur est ignoré",
    ).toEqual(new Date("2026-09-20T00:00:00Z"));
  });
});

describe("Le motif d'abandon n'écrase pas ce que disait le transporteur", () => {
  test("`raw_status` survit à l'abandon", async () => {
    // La colonne existe pour qu'un statut qu'on n'a pas su traduire ne
    // disparaisse pas sans trace. L'abandon — le seul moment où l'on veut savoir
    // ce que le fournisseur disait juste avant — était la seule écriture qui la
    // détruisait.
    const numero = numeroNeuf();
    const id = await enregistrerColis(alice, numero);
    await ingerer(numero);

    await interroger(catalogue, "select public.abandonner_colis($1, 'abandon:trop-de-vides')", [id]);

    const [ligne] = await colis(numero);
    expect(ligne?.raw_status, "le statut du transporteur a été écrasé par notre motif").toBe(
      "In transit",
    );
    expect(ligne?.abandon_motif, "le motif d'abandon n'est nulle part").toBe(
      "abandon:trop-de-vides",
    );
  });
});

describe("Deux passages concurrents ne se servent pas deux fois", () => {
  test("la sélection réserve : un second appel ne rend plus le colis", async () => {
    /*
     * `colis_a_interroger` était `stable` et sans verrou : deux passages
     * simultanés rendaient EXACTEMENT la même liste, donc interrogeaient — donc
     * facturaient — deux fois chaque colis.
     *
     * La protection tenait à une ABSENCE : celle d'un second planificateur. Or
     * le brief en prévoit un, pour la veille mutuelle. « Ce serait doublement
     * facturé si quelqu'un ajoutait un deuxième planificateur » était donc la
     * phrase juste, et c'est ce qu'on est en train de planifier.
     */
    const numero = numeroNeuf();
    const id = await enregistrerColis(alice, numero);

    const premier = await interroger<{ id: string }>(
      catalogue,
      "select id from public.colis_a_interroger(200) where id = $1",
      [id],
    );
    expect(premier, "un colis neuf n'est pas proposé à l'interrogation").toHaveLength(1);

    const second = await interroger<{ id: string }>(
      catalogue,
      "select id from public.colis_a_interroger(200) where id = $1",
      [id],
    );
    expect(second, "le même colis a été servi deux fois, donc payé deux fois").toHaveLength(0);
  });

  test("la prise en charge ne se compte pas deux fois", async () => {
    // `marquer_prise_en_charge` incrémentait `query_count` sans condition :
    // rejouée, elle rapprochait le colis de sa fenêtre d'abandon (sept jours ou
    // seize interrogations) sans qu'aucune interrogation ait eu lieu. Un colis
    // pouvait être abandonné pour avoir été trop interrogé alors qu'il l'avait
    // été une fois.
    const numero = numeroNeuf();
    const id = await enregistrerColis(alice, numero);

    await interroger(catalogue, "select public.marquer_prise_en_charge($1, false)", [id]);
    const apresPremiere = (await colis(numero))[0]?.query_count;

    await interroger(catalogue, "select public.marquer_prise_en_charge($1, false)", [id]);
    const apresSeconde = (await colis(numero))[0]?.query_count;

    expect(apresSeconde, "un rejeu rapproche le colis de son abandon").toBe(apresPremiere);
  });
});

describe("La purge des réponses brutes existe et fait quelque chose", () => {
  test("elle supprime au-delà de 90 jours SANS MOUVEMENT", async () => {
    /*
     * Elle était promise en commentaire depuis la première migration du suivi.
     * Aucune fonction ne la faisait, aucune tâche ne l'appelait, et `pg_cron`
     * n'était même pas installé — vérifié au catalogue. L-014 pur : un document
     * affirme un état que personne n'a exécuté.
     */
    const numero = numeroNeuf();
    const id = await enregistrerColis(alice, numero);
    await ingerer(numero);

    await interroger(
      catalogue,
      `update public.tracked_parcels
          set last_movement_at = now() - interval '200 days',
              created_at = now() - interval '200 days'
        where id = $1`,
      [id],
    );

    const avant = Number((await colis(numero))[0]?.snaps);
    expect(avant, "la sonde n'a rien à purger : elle ne prouverait rien").toBeGreaterThan(0);

    await interroger(catalogue, "select * from public.purger_donnees_de_suivi(50000)");

    expect(Number((await colis(numero))[0]?.snaps), "la purge n'a rien supprimé").toBe(0);
  });

  test("contre-test positif : un colis RÉCENT garde ses réponses brutes", async () => {
    // Le critère est le DERNIER MOUVEMENT, pas la création : un colis bloqué en
    // douane depuis quatre mois est celui pour lequel la réponse brute sert le
    // plus. Une purge qui emporterait tout passerait le test précédent.
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);
    await ingerer(numero);

    await interroger(catalogue, "select * from public.purger_donnees_de_suivi(50000)");

    expect(
      Number((await colis(numero))[0]?.snaps),
      "la purge a emporté les réponses d'un colis actif",
    ).toBeGreaterThan(0);
  });
});


/**
 * L'IMMOBILITÉ NE SE SIGNALE QU'UNE FOIS.
 *
 * « Ce colis n'a pas bougé depuis plus de dix jours » est vrai à CHAQUE passage
 * de cadence, et le reste jusqu'à ce qu'il bouge — pour un colis bloqué en
 * douane, pendant des semaines. C'est un SEUIL FRANCHI, pas un état : l'émettre
 * là où on le constate produirait un événement par interrogation, sur
 * exactement la population qu'on veut compter.
 *
 * La marque est RÉCLAMÉE et non lue puis écrite. Une lecture suivie d'une
 * écriture laisserait deux passages concurrents émettre tous les deux : la
 * fenêtre est étroite, donc le défaut est rare, donc il est indébogable — il ne
 * produirait qu'un doublon occasionnel dans une métrique, jamais une erreur.
 */
describe("La marque d'immobilité", () => {
  const QUAND = "2026-08-27T10:00:00Z";

  async function reclamer(parcelId: string, quand = QUAND): Promise<boolean> {
    const l = await interroger<{ ok: boolean }>(
      catalogue,
      "select public.reclamer_immobilite($1, $2::timestamptz) as ok",
      [parcelId, quand],
    );
    return l[0]?.ok === true;
  }

  test("le PREMIER appel la pose et le dit", async () => {
    const colis = await enregistrerColis(alice, numeroNeuf());
    expect(await reclamer(colis), "la marque n'a pas été posée : rien n'est éprouvé").toBe(true);

    const l = await interroger<{ marque: string | null }>(
      catalogue,
      "select immobilite_signalee_at as marque from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(l[0]?.marque, "la colonne est restée nulle malgré un retour positif").not.toBeNull();
  });

  test("les appels SUIVANTS ne la reposent pas et le disent", async () => {
    const colis = await enregistrerColis(alice, numeroNeuf());
    expect(await reclamer(colis)).toBe(true);
    expect(await reclamer(colis), "l'immobilité a été signalée DEUX fois").toBe(false);
    expect(await reclamer(colis, "2026-09-15T10:00:00Z")).toBe(false);
  });

  test("la marque du premier appel n'est pas ÉCRASÉE par les suivants", async () => {
    /*
     * HORS du cas motivant. Un `update` sans la condition `is null` rendrait
     * peut-être faux au second appel — si le retour venait d'ailleurs — tout en
     * repoussant la date à chaque passage. On mesurerait alors l'ancienneté de
     * la dernière cadence au lieu de celle du franchissement, et la valeur
     * resterait parfaitement plausible.
     */
    const colis = await enregistrerColis(alice, numeroNeuf());
    await reclamer(colis, "2026-08-01T10:00:00Z");
    await reclamer(colis, "2026-09-30T10:00:00Z");

    const l = await interroger<{ marque: string }>(
      catalogue,
      "select immobilite_signalee_at::text as marque from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(
      (l[0]?.marque ?? "").startsWith("2026-08-01"),
      "la date du franchissement a été repoussée : « depuis quand » ment.",
    ).toBe(true);
  });

  test("deux colis DISTINCTS ne se volent pas leur marque", async () => {
    // CONTRE-TEST. Une fonction qui rendrait toujours faux passerait les
    // contrôles ci-dessus dès le second appel ; une fonction qui marquerait
    // TOUS les colis passerait le premier.
    const unA = await enregistrerColis(alice, numeroNeuf());
    const unB = await enregistrerColis(bob, numeroNeuf());
    expect(await reclamer(unA)).toBe(true);
    expect(await reclamer(unB), "le colis de Bob a été marqué par celui d'Alice").toBe(true);
  });
});

/**
 * LA COUTURE ENTRE LA RÉSERVATION ET LA DÉCISION.
 *
 * ⚠️ C'EST LE GARDE QUI MANQUAIT, ET SON ABSENCE A LAISSÉ LA CADENCE MORTE.
 *
 * DÉFAUT MESURÉ LE 02/09/2026 : `colis_a_interroger` réservait en écrivant
 * `last_query_at = now()`, puis rendait la valeur d'APRÈS. `decider` recevait
 * donc, pour chaque colis, une « dernière interrogation » vieille de zéro
 * seconde, et concluait « attendre » — toujours, pour tous les colis, y compris
 * pour celui dont le vendeur venait de coller le numéro et qui attendait devant
 * son écran. Aucun colis n'a jamais été interrogé par la cadence.
 *
 * ⚠️ LES DEUX MOITIÉS ÉTAIENT DÉJÀ ÉPROUVÉES, ET CHACUNE PASSAIT. Le test
 * au-dessus vérifie que la RÉSERVATION tient ; `tests/unit/tracking` vérifie
 * que `decider` décide bien — sur des dates FABRIQUÉES À LA MAIN. Personne ne
 * confrontait la ligne que la base REND à la fonction qui la consomme. C'est
 * L-018 : constater qu'une déclaration existe ne prouve jamais que son absence
 * bloque.
 *
 * CE TEST PREND LA LIGNE RENDUE, telle quelle, et la donne à `decider`. Il
 * échoue si l'on remet `returning p.last_query_at`.
 */
describe("Ce que la réservation rend doit rester décidable", () => {
  test("un colis jamais interrogé ressort avec une date NULLE, et se décide en « interroger »", async () => {
    const numero = numeroNeuf();
    const id = await enregistrerColis(alice, numero);

    const [ligne] = await interroger<{
      id: string;
      registered_at: string | null;
      last_movement_at: string | null;
      last_query_at: string | null;
      empty_count: number;
      normalized_status: string;
    }>(catalogue, "select * from public.colis_a_interroger(200) where id = $1", [id]);

    expect(ligne, "le colis neuf n'a pas été proposé à l'interrogation").toBeDefined();
    if (ligne === undefined) return;

    // LE CŒUR DU TEST. La réservation a bien eu lieu — le test au-dessus le
    // prouve — mais la valeur RENDUE doit être celle d'AVANT.
    expect(
      ligne.last_query_at,
      "la réservation a écrasé la date rendue : `decider` croira que le colis vient d'être interrogé",
    ).toBeNull();

    const { decider } = await import("@/lib/tracking/schedule");
    const decision = decider(
      {
        enregistreLe: ligne.registered_at === null ? null : new Date(ligne.registered_at),
        dernierMouvement:
          ligne.last_movement_at === null ? null : new Date(ligne.last_movement_at),
        derniereInterrogation:
          ligne.last_query_at === null ? null : new Date(ligne.last_query_at),
        interrogationsVides: ligne.empty_count,
        etape: ligne.normalized_status as "preparation",
        abandonneLe: null,
      },
      new Date(),
    );

    expect(
      decision.action,
      `la cadence n'interrogerait pas ce colis (décision « ${decision.action} »)`,
    ).toBe("interroger");
  });

  test("CONTRE-TEST : un colis interrogé il y a une minute se décide bien en « attendre »", async () => {
    /*
     * Sans lui, une fonction qui rendrait TOUJOURS `null` passerait le contrôle
     * ci-dessus à 100 % — et ferait interroger le fournisseur à chaque passage,
     * pour chaque colis, c'est-à-dire exactement le défaut inverse : celui qui
     * coûte de l'argent au lieu d'en faire perdre.
     */
    const { decider } = await import("@/lib/tracking/schedule");
    const ilYaUneMinute = new Date(Date.now() - 60_000);
    const decision = decider(
      {
        enregistreLe: new Date(Date.now() - 2 * 24 * 3600_000),
        dernierMouvement: new Date(Date.now() - 24 * 3600_000),
        derniereInterrogation: ilYaUneMinute,
        interrogationsVides: 0,
        etape: "en_transit",
        abandonneLe: null,
      },
      new Date(),
    );
    expect(decision.action, "un colis tout juste interrogé serait réinterrogé").toBe("attendre");
  });
});

/**
 * UNE COMMANDE ATTACHÉE À UN COLIS DÉJÀ SUIVI DOIT HÉRITER DE SON ÉTAT.
 *
 * DÉFAUT MESURÉ LE 02/09/2026 : `attacher_colis` posait le lien et rien
 * d'autre. La descente colis → commande vit sur le chemin de l'INGESTION, et un
 * colis `livre` n'est plus jamais interrogé — aucune ingestion ne venait donc,
 * et la page du client restait fausse DÉFINITIVEMENT : « aucun mouvement depuis
 * 32 jours, passage en douane, nous continuons », pour un colis livré depuis un
 * mois.
 *
 * ⚠️ CE N'EST PAS UN CAS LIMITE. Le brief fonde `tracked_parcels` sur le fait
 * qu'un même numéro porte plusieurs commandes : la DEUXIÈME commande d'un envoi
 * groupé tombe exactement ici, et toutes les suivantes.
 */
describe("Attacher une commande à un colis déjà suivi", () => {
  async function attacher(u: UtilisateurDeTest, commandeId: string, numero: string): Promise<void> {
    const { error } = await u.client.rpc("attacher_colis", {
      p_order_id: commandeId,
      p_numero: numero,
      p_transporteur: "",
    });
    if (error !== null) throw new Error("attache refusée : " + error.message);
  }

  async function creerCommande(u: UtilisateurDeTest, statut: string): Promise<string> {
    const l = await interroger<{ id: string }>(
      catalogue,
      "insert into public.orders (shop_id, customer_label, status) values ($1,$2,$3) returning id",
      [u.shopId, "@heritage", statut],
    );
    const id = l[0]?.id;
    if (id === undefined) throw new Error("commande non créée");
    return id;
  }

  async function etatCommande(id: string): Promise<{ statut: string; mouvement: string | null }> {
    const l = await interroger<{ status: string; parcel_last_movement_at: string | null }>(
      catalogue,
      "select status, parcel_last_movement_at from public.orders where id = $1",
      [id],
    );
    return {
      statut: l[0]?.status ?? "",
      mouvement: l[0]?.parcel_last_movement_at ?? null,
    };
  }

  test("l'état d'un colis DÉJÀ LIVRÉ descend dans la commande neuve", async () => {
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);
    // Le colis a vécu sa vie AVANT que cette commande n'existe : c'est le cas
    // du groupage, et c'est celui qu'aucune ingestion ne viendra rattraper.
    await interroger(
      catalogue,
      `update public.tracked_parcels
          set normalized_status = 'livre',
              last_movement_at = now() - interval '32 days'
        where tracking_number = $1`,
      [numero],
    );

    const commande = await creerCommande(alice, "preparation");
    expect((await etatCommande(commande)).statut, "état de départ inattendu").toBe("preparation");

    await attacher(alice, commande, numero);

    const apres = await etatCommande(commande);
    expect(apres.statut, "la commande n'a pas hérité de l'état du colis").toBe("livre");
    expect(apres.mouvement, "la date du dernier mouvement n'est pas descendue").not.toBeNull();
  });

  test("l'héritage est MONOTONE : un colis en préparation ne fait pas reculer une commande expédiée", async () => {
    /*
     * CONTRE-TEST ESSENTIEL. Une descente qui écraserait sans condition
     * passerait le test ci-dessus à 100 % — et ferait reculer le statut chez le
     * client, ce que la décision 2 du brief interdit formellement : le vendeur
     * prime AVANT la remise au transporteur, le transporteur après.
     */
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);

    const commande = await creerCommande(alice, "expedie");
    await attacher(alice, commande, numero);

    expect((await etatCommande(commande)).statut, "le statut du vendeur a reculé").toBe("expedie");
  });

  test("CONTRE-TEST : un colis neuf n'invente aucune date de mouvement", async () => {
    // Sans lui, une descente qui poserait `now()` par défaut passerait les deux
    // contrôles précédents en affirmant un mouvement que personne n'a observé.
    const numero = numeroNeuf();
    await enregistrerColis(alice, numero);
    const commande = await creerCommande(alice, "preparation");
    await attacher(alice, commande, numero);

    const apres = await etatCommande(commande);
    expect(apres.statut).toBe("preparation");
    expect(apres.mouvement, "une date de mouvement a été inventée").toBeNull();
  });
});

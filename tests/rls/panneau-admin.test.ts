import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, passerEnPro, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { lireCompte } from "@/lib/audit/comptes";
import {
  lirePanneau,
  lireSeuils,
  PLAFOND_COMMANDES_MENSUEL_DEFAUT,
  SEUIL_COLIS_DEFAUT,
} from "@/lib/audit/panneau";

/**
 * LE PANNEAU D'ADMINISTRATION.
 *
 * Trois propriétés portent tout le reste, et deux d'entre elles concernent ce
 * que le panneau ne dit PAS :
 *
 *  1. `never_ran` N'EST PAS UNE ALERTE. Une tâche posée ce matin n'a pas encore
 *     eu son premier passage ; la signaler enverrait chercher une panne
 *     inexistante. Une alerte qui se trompe est une alerte qu'on apprend à
 *     ignorer, et c'est ainsi qu'on rate la vraie.
 *  2. LE STOCKAGE EST « INDISPONIBLE », JAMAIS « 0 o ». Zéro affirme qu'on a
 *     mesuré. Et la décision vient de la CONFIGURATION, pas de la valeur —
 *     déduire « zéro donc indisponible » deviendrait faux pour tout compte neuf.
 *  3. LES SIGNALEMENTS PORTENT LEUR VALEUR, jamais un jugement.
 */

let admin: UtilisateurDeTest;
let gros: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;

const SEUILS = { colis: 5, retardMinutes: 60 };

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("panneau-admin");
  gros = await creerUtilisateur("panneau-gros");
  vendeur = await creerUtilisateur("panneau-vendeur");

  await promouvoirAdmin(catalogue, admin);

  // Le gros compte dépasse volontairement le seuil de test. Il est PRO : depuis la
  // 210, un compte gratuit ne peut faire suivre que 5 colis à vie, et la base
  // refusait le semis entier (le fichier sortait « 23 skipped »). Un vendeur à
  // neuf colis est Pro par construction — même règle que le banc de `test:perf`.
  await passerEnPro(gros);
  await interroger(
    catalogue,
    `insert into public.tracked_parcels (shop_id, tracking_number, registered_at)
     select $1, 'PAN-' || i, now() from generate_series(1, 9) as i`,
    [gros.shopId],
  );

  // Le petit reste dessous : sans lui, « le gros est signalé » serait vrai même
  // si la fonction signalait TOUT LE MONDE.
  await interroger(
    catalogue,
    `insert into public.tracked_parcels (shop_id, tracking_number, registered_at)
     select $1, 'PET-' || i, now() from generate_series(1, 2) as i`,
    [vendeur.shopId],
  );
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(gros);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

/**
 * LE PANNEAU LU, SES TROIS SECTIONS EXIGEES LISIBLES.
 *
 * Depuis le 04/09/2026 chaque section peut valoir `null` — « pas lisible en ce
 * moment » — pour qu'une coupure de transport n'emporte plus l'ecran entier.
 * Ici la base repond pour de vrai : `null` serait un defaut, et l'exiger
 * explicitement vaut mieux qu'un `!` qui ferait passer une regression pour un
 * detail de typage.
 */
async function panneauLisible(
  client: Parameters<typeof lirePanneau>[0],
  seuils: Parameters<typeof lirePanneau>[1],
) {
  const p = await lirePanneau(client, seuils);
  const { alertes, compteurs, taches } = p;
  if (alertes === null || compteurs === null || taches === null) {
    // On LEVE plutot que d assouplir le type : ici la base repond, donc une
    // section illisible est un defaut, pas un cas a absorber. L absorber ferait
    // passer toute cette suite au vert sur un panneau a moitie vide.
    throw new Error(
      "panneau partiellement illisible alors que la base repond — alertes:" +
        String(alertes === null) +
        " compteurs:" +
        String(compteurs === null) +
        " taches:" +
        String(taches === null),
    );
  }
  return { ...p, alertes, compteurs, taches };
}

describe("Qui peut lire le panneau", () => {
  test("un vendeur ordinaire ne lit rien, et n'apprend pas que la surface existe", async () => {
    await expect(lirePanneau(vendeur.client, SEUILS)).rejects.toThrow(/introuvable/i);
  });

  test("contre-test positif : l'administrateur le lit", async () => {
    const p = await panneauLisible(admin.client, SEUILS);
    expect(p.compteurs.comptes).toBeGreaterThan(0);
  });
});

describe("Les alertes portent leur VALEUR", () => {
  test("le compte au-dessus du seuil est signalé, avec le chiffre et le seuil", async () => {
    const p = await panneauLisible(admin.client, SEUILS);
    const alerte = p.alertes.find((a) => a.sujet === gros.email);

    expect(alerte, "le compte au-dessus du seuil n'est pas signalé").toBeDefined();
    // « 9 pour un seuil de 5 » se vérifie ; « ce compte dépasse » se discute, et
    // l'on finit par ne plus le lire.
    expect(alerte?.valeur).toBe(9);
    expect(alerte?.seuil).toBe(5);
  });

  test("le compte en dessous n'est PAS signalé", async () => {
    // Sans ce contrôle, une fonction qui signalerait tout le monde passerait le
    // test précédent sans rien prouver.
    const p = await panneauLisible(admin.client, SEUILS);
    expect(p.alertes.map((a) => a.sujet)).not.toContain(vendeur.email);
  });

  test("un seuil plus haut fait taire l'alerte", async () => {
    // Le seuil est bien LU, pas ignoré : sans ce contrôle, une fonction qui
    // signalerait sur une constante en dur passerait les deux tests précédents.
    const p = await panneauLisible(admin.client, { colis: 100, retardMinutes: 60 });
    expect(p.alertes.map((a) => a.sujet)).not.toContain(gros.email);
  });
});

describe("Le veilleur a TROIS états, pas deux", () => {
  test("aucune tâche déployée : ce n'est pas une alerte", async () => {
    await interroger(catalogue, "delete from public.scheduler_heartbeat");

    const p = await panneauLisible(admin.client, SEUILS);

    expect(p.aucuneTacheDeployee, "l'absence de tâche n'est pas reconnue").toBe(true);
    expect(p.taches.length).toBe(0);
    // LE POINT CENTRAL. Rien n'a été déployé : signaler un retard enverrait
    // chercher une panne dans un mécanisme inexistant.
    expect(
      p.alertes.filter((a) => a.genre === "veilleur_en_retard"),
      "« jamais déployé » est remonté comme une alerte",
    ).toEqual([]);
  });

  test("un battement récent : actif, et toujours pas d'alerte", async () => {
    await interroger(
      catalogue,
      "insert into public.scheduler_heartbeat (source, beat_at) values ('cadence', now())",
    );

    const p = await panneauLisible(admin.client, SEUILS);
    expect(p.aucuneTacheDeployee).toBe(false);
    expect(p.taches[0]?.etat).toBe("actif");
    expect(p.alertes.filter((a) => a.genre === "veilleur_en_retard")).toEqual([]);
  });

  test("un battement trop ancien : EN RETARD, et cette fois ça alerte", async () => {
    // Le contre-test des deux précédents : sans lui, une fonction qui
    // n'alerterait JAMAIS les passerait tous les deux.
    await interroger(
      catalogue,
      "update public.scheduler_heartbeat set beat_at = now() - interval '5 hours'",
    );

    const p = await panneauLisible(admin.client, SEUILS);
    expect(p.taches[0]?.etat).toBe("en_retard");

    const alerte = p.alertes.find((a) => a.genre === "veilleur_en_retard");
    expect(alerte, "un veilleur muet depuis 5 h n'alerte pas").toBeDefined();
    expect(alerte?.gravite).toBe("critique");
    // Elle porte l'ancienneté en minutes : « depuis 300 min » se vérifie.
    expect(alerte?.valeur).toBeGreaterThan(200);
  });
});

describe("Ce que le panneau refuse d'affirmer", () => {
  test("le stockage est MESURÉ, et cela vient de la configuration", async () => {
    // IL A LONGTEMPS ÉTÉ « INDISPONIBLE », ET C'ÉTAIT CORRECT : aucun mécanisme
    // ne le relevait, et « 0 o » aurait affirmé qu'on avait mesuré. La bascule
    // vient de l'EXISTENCE d'un mécanisme — les compteurs par boutique, tenus à
    // l'écriture — jamais d'une valeur observée. Déduire « zéro donc pas
    // mesuré » serait faux pour toute installation neuve, donc dès le premier
    // jour.
    const p = await panneauLisible(admin.client, SEUILS);
    expect(p.stockageMesurable).toBe(true);
    expect(p.stockageOctets, "mesurable mais sans valeur : l'écran n'aurait rien à écrire")
      .not.toBeNull();
  });

  test("le total est la somme réelle des boutiques, pas une estimation", async () => {
    const p = await panneauLisible(admin.client, SEUILS);
    const somme = await interroger<{ s: string | null }>(
      catalogue,
      "select sum(stockage_octets) as s from public.shops",
    );
    expect(p.stockageOctets).toBe(Number(somme[0]?.s ?? 0));
  });

  test("les compteurs de comptes sont exacts, jamais estimés", async () => {
    const p = await panneauLisible(admin.client, SEUILS);
    const reel = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.profiles",
    );
    expect(p.compteurs.comptes).toBe(Number(reel[0]?.n));
    expect(p.compteurs.comptesActifs + p.compteurs.comptesSuspendus).toBe(p.compteurs.comptes);
  });
});

describe("Les seuils sont configurables, et tracés", () => {
  test("sans paramètre écrit, les défauts s'appliquent", async () => {
    // Une ligne absente est un état NORMAL : le produit fonctionne sans qu'aucun
    // paramètre n'ait jamais été décidé. Insérer les défauts en base ferait
    // croire qu'ils ont été choisis.
    await interroger(catalogue, "delete from public.system_settings where key = $1", [
      "seuil_colis_par_compte",
    ]);
    const seuils = await lireSeuils(admin.client);
    expect(seuils.colis).toBe(SEUIL_COLIS_DEFAUT);
  });

  test("un paramètre écrit remplace le défaut, ET laisse une trace", async () => {
    const { error } = await admin.client.rpc("ecrire_parametre", {
      p_cle: "seuil_colis_par_compte",
      p_valeur: 42,
    });
    expect(error).toBeNull();

    expect((await lireSeuils(admin.client)).colis).toBe(42);

    // LA TRACE EST ÉCRITE PAR UN DÉCLENCHEUR, pas par l'appelant : un appel
    // explicite se contourne en écrivant directement dans la table, y compris
    // par inadvertance dans un script de maintenance.
    const trace = await interroger<{ payload: { apres?: number }; resource_id: string }>(
      catalogue,
      `select payload, resource_id from public.admin_audit_log
       where resource_type = 'system_settings' order by occurred_at desc limit 1`,
    );
    expect(trace[0]?.resource_id).toBe("seuil_colis_par_compte");
    expect(trace[0]?.payload.apres).toBe(42);
  });

  test("la trace porte l'ANCIENNE valeur, pas seulement la nouvelle", async () => {
    // Sans l'ancienne, l'entrée dit « le seuil vaut maintenant 7 » — ce que la
    // table dit déjà. Ce qu'on cherche six mois plus tard, c'est ce qu'il valait
    // AVANT qu'on le change.
    await admin.client.rpc("ecrire_parametre", {
      p_cle: "seuil_colis_par_compte",
      p_valeur: 7,
    });

    const trace = await interroger<{ payload: { avant?: number; apres?: number } }>(
      catalogue,
      `select payload from public.admin_audit_log
       where resource_type = 'system_settings' order by occurred_at desc limit 1`,
    );
    expect(trace[0]?.payload.avant).toBe(42);
    expect(trace[0]?.payload.apres).toBe(7);
  });

  test("un vendeur ne peut pas modifier un seuil", async () => {
    const { error } = await vendeur.client.rpc("ecrire_parametre", {
      p_cle: "seuil_colis_par_compte",
      p_valeur: 999_999,
    });
    expect(error, "un vendeur a modifié un seuil du produit").not.toBeNull();

    const lignes = await interroger<{ value: number }>(
      catalogue,
      "select value from public.system_settings where key = $1",
      ["seuil_colis_par_compte"],
    );
    expect(Number(lignes[0]?.value)).toBe(7);
  });
});

/**
 * LE COMPTEUR MENSUEL DE COMMANDES.
 *
 * ⚠️ IL N'ÉTAIT ALIMENTÉ PAR RIEN. `usage_counters.orders_created` est né avec
 * la migration 046, a reçu une contrainte de positivité en 064 — donc quelqu'un
 * l'a relu et l'a cru vivant — et aucune migration ne l'incrémentait. Il valait
 * zéro depuis le premier jour, sur la métrique de verdict de toute la phase de
 * validation. Un zéro crédible est pire qu'une absence : il ne fait chercher
 * personne.
 *
 * CES QUATRE CONTRÔLES ÉCHOUENT SI ON RETIRE LE DÉCLENCHEUR DE LA 110, et le
 * troisième échoue aussi si on retire seulement la condition de transition —
 * c'est celui-là qui distingue « compter les créations » de « compter les
 * modifications », deux chiffres qui se ressemblent assez pour qu'on ne
 * remarque rien.
 */
describe("Les commandes créées du mois sont comptées", () => {
  const moisCourant = async (profilId: string): Promise<number> => {
    const lignes = await interroger<{ n: number | null }>(
      catalogue,
      `select orders_created as n from public.usage_counters
        where profile_id = $1 and period_month = date_trunc('month', now())::date`,
      [profilId],
    );
    return Number(lignes[0]?.n ?? 0);
  };

  test("une commande SANS contenu réel ne compte pas", async () => {
    const avant = await moisCourant(vendeur.profilId);
    await interroger(catalogue, "insert into public.orders (shop_id) values ($1)", [
      vendeur.shopId,
    ]);
    // Un brouillon ouvert puis abandonné est exactement le cas « teste une ou
    // deux fois puis disparaît ». Le compter gonflerait la métrique du côté
    // rassurant, et une métrique fausse qui confirme ce qu'on espère ne se
    // remet jamais en question.
    expect(await moisCourant(vendeur.profilId), "un brouillon vide a été compté").toBe(avant);
  });

  test("contre-test positif : une commande AVEC contenu réel compte", async () => {
    const avant = await moisCourant(vendeur.profilId);
    await interroger(
      catalogue,
      "insert into public.orders (shop_id, customer_label) values ($1, 'Client compté')",
      [vendeur.shopId],
    );
    expect(await moisCourant(vendeur.profilId), "le déclencheur n'a rien compté").toBe(avant + 1);
  });

  test("une modification ultérieure ne recompte PAS la même commande", async () => {
    const lignes = await interroger<{ id: string }>(
      catalogue,
      `insert into public.orders (shop_id, customer_label) values ($1, 'Client modifié')
       returning id`,
      [vendeur.shopId],
    );
    const id = lignes[0]?.id;
    if (id === undefined) throw new Error("commande non créée");

    const apresCreation = await moisCourant(vendeur.profilId);
    // L'éditeur produit une écriture par frappe débattue : sans la condition de
    // transition, le compteur mesurerait les MODIFICATIONS.
    await interroger(catalogue, "update public.orders set product_ref = 'REF-2' where id = $1", [
      id,
    ]);
    await interroger(catalogue, "update public.orders set customer_label = 'Autre' where id = $1", [
      id,
    ]);
    expect(await moisCourant(vendeur.profilId), "une modification a été comptée").toBe(
      apresCreation,
    );
  });

  test("le panneau rend ce compteur, et c'est la somme réelle", async () => {
    const p = await panneauLisible(admin.client, SEUILS);
    const somme = await interroger<{ s: string | null }>(
      catalogue,
      `select sum(orders_created) as s from public.usage_counters
        where period_month = date_trunc('month', now())::date`,
    );
    expect(p.compteurs.commandesCreeesCeMois).toBe(Number(somme[0]?.s ?? 0));
    // Contre-test : un compteur resté à zéro passerait l'égalité ci-dessus sans
    // rien prouver, puisque la somme vaudrait zéro elle aussi.
    expect(
      p.compteurs.commandesCreeesCeMois,
      "le compteur vaut zéro alors que des commandes réelles viennent d'être créées",
    ).toBeGreaterThan(0);
  });
});

/**
 * LE MOT « DONT » DOIT ÊTRE VRAI.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026, écran et base à la même minute :
 *
 *   écran : « Comptes actifs | 12 | dont 2 suspendus, 10 sans type »
 *   base  : actifs 12 · suspendus 2 · sans_type 10 · dont ACTIFS 8
 *
 * Le mot « dont » était faux deux fois. Les 2 suspendus ne sont pas parmi les
 * 12 actifs — le total des inscrits est 14, et ce nombre n'apparaissait nulle
 * part. Et sur les 12 actifs, 8 seulement étaient sans type : le compteur
 * portait sur TOUTE la table, suspendus compris.
 *
 * ⚠️ CE SONT DEUX CHIFFRES DE LA PHASE DE VALIDATION. Le brief dit que la
 * segmentation d'usage EST le livrable de cette phase, et que `account_type` est
 * nullable SANS DÉFAUT pour rendre le manque visible plutôt que silencieux. Une
 * métrique de verdict légèrement faussée est pire qu'une métrique cassée, parce
 * qu'elle reste crédible.
 *
 * ⚠️ LE CONTRÔLE COMPARE LE COMPTEUR À LA POPULATION QU'IL PRÉTEND DÉCRIRE,
 * pas à un nombre écrit d'avance : un nombre attendu se périme à la première
 * exécution du banc, et se corrige alors en le réécrivant — c'est-à-dire en
 * effaçant le défaut au lieu de le voir.
 */
describe("Les compteurs de comptes décrivent la population qu'ils annoncent", () => {
  test("« sans type » porte sur les comptes ACTIFS, pas sur toute la table", async () => {
    // On fabrique l'écart : un compte SUSPENDU et SANS TYPE. Avant la
    // correction, il gonflait « sans type » sans entrer dans « actifs ».
    await interroger(
      catalogue,
      "update public.profiles set status = 'suspended', account_type = null where id = $1",
      [vendeur.profilId],
    );

    const [reel] = await interroger<{
      actifs: string;
      sans_type_actifs: string;
      sans_type_partout: string;
    }>(
      catalogue,
      `select (select count(*) from public.profiles where status = 'active') as actifs,
              (select count(*) from public.profiles
                where status = 'active' and account_type is null) as sans_type_actifs,
              (select count(*) from public.profiles where account_type is null) as sans_type_partout`,
    );

    const panneau = await panneauLisible(admin.client, SEUILS);

    // `noUncheckedIndexedAccess` : la ligne peut manquer, et une comparaison
    // faite sur `undefined` passerait sans rien mesurer.
    expect(reel, "la lecture des populations n a rien rendu").toBeDefined();
    if (reel === undefined) return;

    // CONTRE-TEST, EN PREMIER : l'écart existe-t-il vraiment dans le jeu ?
    // Sans lui, l'égalité ci-dessous serait vraie parce que les deux
    // populations coïncident — et ne prouverait rien.
    expect(
      Number(reel.sans_type_partout),
      "aucun compte suspendu sans type : le contrôle ne discriminerait rien",
    ).toBeGreaterThan(Number(reel.sans_type_actifs));

    expect(
      panneau.compteurs.comptesSansType,
      "« dont N sans type » compte des comptes qui ne sont pas dans le total annoncé",
    ).toBe(Number(reel.sans_type_actifs));

    expect(panneau.compteurs.comptesActifs).toBe(Number(reel.actifs));

    await interroger(
      catalogue,
      "update public.profiles set status = 'active', account_type = 'reseller' where id = $1",
      [vendeur.profilId],
    );
  }, 30_000);

  test("« suspendus » porte bien sur toute la table, lui", async () => {
    // L'AUTRE SENS : ce compteur-là ne doit PAS être restreint aux actifs, ce
    // qui le rendrait toujours nul. C'est le libellé qui dit qu'ils sont hors
    // du total, pas le chiffre qui doit se cacher.
    await interroger(catalogue, "update public.profiles set status = 'suspended' where id = $1", [
      vendeur.profilId,
    ]);

    const [reel] = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.profiles where status = 'suspended'",
    );
    const panneau = await panneauLisible(admin.client, SEUILS);

    expect(reel, "la lecture des suspendus n a rien rendu").toBeDefined();
    if (reel === undefined) return;

    expect(Number(reel.n), "aucun suspendu : le contrôle passerait à vide").toBeGreaterThan(0);
    expect(panneau.compteurs.comptesSuspendus).toBe(Number(reel.n));

    await interroger(catalogue, "update public.profiles set status = 'active' where id = $1", [
      vendeur.profilId,
    ]);
  }, 30_000);
});

/**
 * LE PLAFOND AFFICHÉ EST CELUI QUE LA BASE APPLIQUE.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026. La fiche de compte dessinait sa barre sur
 * `PLAFOND_COMMANDES_MENSUEL_DEFAUT`, une CONSTANTE, alors que l'application du
 * plafond passe par `lire_plafond_commandes()`, qui lit `system_settings`. Le
 * jour où un administrateur écrit `plafond_commandes_mensuel = 500` par l'écran
 * des paramètres — ce que `parametres_admis` autorise entre 100 et 100 000 — la
 * base refuse les commandes au-delà de 500 et la fiche continue de dessiner la
 * barre sur 3 000 : « 520 / 3 000 », soit 17 % d'une jauge, pour un compte dont
 * les écritures sont refusées.
 *
 * LE BRIEF POSE LA RÈGLE INVERSE : « les signalements portent leur valeur —
 * "1 840 colis sur un seuil de 1 200", pas "ce compte dépasse" ». Ici le chiffre
 * était porté ET faux, ce qui est strictement pire que l'absence : l'admin
 * cherche la panne du côté du vendeur, pas du côté du réglage qu'il vient
 * lui-même de poser.
 *
 * ET LE MODULE LE DIT DÉJÀ, dans son propre en-tête : « CHAQUE VALEUR EST LUE À
 * SA SOURCE, JAMAIS RECOPIÉE. Un écran qui réécrirait « 20 » de son côté
 * resterait juste tant que personne ne change la configuration, puis afficherait
 * un plafond que le produit n'applique plus — et c'est le pire état possible
 * pour un tableau de bord, PARCE QU'IL RASSURE. »
 */
/*
 * ⚠️ DEPUIS LA 200 (27/09/2026), LE PLAFOND AFFICHÉ VIENT DE `lire_compte_admin`,
 * à la règle du plan du compte, et non plus de `lireSeuils` : la jauge d'un compte
 * gratuit est son quota À VIE, celle d'un Pro son plafond du mois. La règle gardée
 * ici ne change pas — le chiffre affiché est celui que la base applique — mais elle
 * s'éprouve désormais sur la fiche d'un compte PRO, là où ce plafond s'affiche.
 */
describe("Le plafond de commandes affiché suit le réglage", () => {
  let pro: UtilisateurDeTest;

  beforeAll(async () => {
    pro = await creerUtilisateur("plafond-affiche");
    await passerEnPro(pro);
  }, 60_000);

  afterAll(async () => {
    await supprimerUtilisateur(pro);
  });

  test("la fiche d'un Pro rend la valeur ÉCRITE en base, pas la constante", async () => {
    const [avant] = await interroger<{ value: number | null }>(
      catalogue,
      "select value from public.system_settings where key = 'plafond_commandes_mensuel'",
    );

    // On écrit une valeur qui ne peut pas être confondue avec le défaut.
    await interroger(
      catalogue,
      `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb(512))
         on conflict (key) do update set value = excluded.value`,
    );

    const fiche = await lireCompte(admin.client, pro.profilId, "ip-test");
    expect(
      fiche?.quotaCommandes?.plafond,
      "l'écran afficherait un plafond que la base n'applique pas",
    ).toBe(512);

    // Restitution à l'identique : ce réglage est partagé, et le laisser à 512
    // ferait refuser des commandes à tout le monde.
    if (avant?.value == null) {
      await interroger(
        catalogue,
        "delete from public.system_settings where key = 'plafond_commandes_mensuel'",
      );
    } else {
      await interroger(
        catalogue,
        "update public.system_settings set value = to_jsonb($1::int) where key = 'plafond_commandes_mensuel'",
        [avant.value],
      );
    }
  }, 30_000);

  test("CONTRE-TEST : sans réglage écrit, c'est bien le défaut qui est rendu", async () => {
    /*
     * Sans lui, une implémentation qui rendrait TOUJOURS la valeur en base
     * passerait le contrôle ci-dessus — et rendrait `null` ou zéro le jour où
     * personne n'a rien réglé, c'est-à-dire aujourd'hui, en production.
     *
     * ⚠️ ET IL PROUVE LE COMPORTEMENT, PAS LE REPLI TYPESCRIPT. Mesuré en
     * falsifiant : remplacer le repli par zéro ne le fait PAS rougir, parce que
     * `lire_parametre_entier` rend elle-même le défaut qu'on lui passe — le
     * repli côté application n'est emprunté que si la RPC ÉCHOUE, ce qu'aucune
     * de ces deux épreuves ne provoque. Je le dis plutôt que de laisser croire
     * que ce contre-test garde une branche qu'il ne visite jamais.
     */
    const [avant] = await interroger<{ value: number | null }>(
      catalogue,
      "select value from public.system_settings where key = 'plafond_commandes_mensuel'",
    );
    await interroger(
      catalogue,
      "delete from public.system_settings where key = 'plafond_commandes_mensuel'",
    );

    const fiche = await lireCompte(admin.client, pro.profilId, "ip-test");
    expect(fiche?.quotaCommandes?.plafond).toBe(PLAFOND_COMMANDES_MENSUEL_DEFAUT);

    if (avant?.value != null) {
      await interroger(
        catalogue,
        `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb($1::int))
           on conflict (key) do update set value = excluded.value`,
        [avant.value],
      );
    }
  }, 30_000);
});

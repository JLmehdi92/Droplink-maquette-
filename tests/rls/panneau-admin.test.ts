import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { lirePanneau, lireSeuils, SEUIL_COLIS_DEFAUT } from "@/lib/audit/panneau";

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

  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [
    admin.profilId,
  ]);

  // Le gros compte dépasse volontairement le seuil de test.
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

describe("Qui peut lire le panneau", () => {
  test("un vendeur ordinaire ne lit rien, et n'apprend pas que la surface existe", async () => {
    await expect(lirePanneau(vendeur.client, SEUILS)).rejects.toThrow(/introuvable/i);
  });

  test("contre-test positif : l'administrateur le lit", async () => {
    const p = await lirePanneau(admin.client, SEUILS);
    expect(p.compteurs.comptes).toBeGreaterThan(0);
  });
});

describe("Les alertes portent leur VALEUR", () => {
  test("le compte au-dessus du seuil est signalé, avec le chiffre et le seuil", async () => {
    const p = await lirePanneau(admin.client, SEUILS);
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
    const p = await lirePanneau(admin.client, SEUILS);
    expect(p.alertes.map((a) => a.sujet)).not.toContain(vendeur.email);
  });

  test("un seuil plus haut fait taire l'alerte", async () => {
    // Le seuil est bien LU, pas ignoré : sans ce contrôle, une fonction qui
    // signalerait sur une constante en dur passerait les deux tests précédents.
    const p = await lirePanneau(admin.client, { colis: 100, retardMinutes: 60 });
    expect(p.alertes.map((a) => a.sujet)).not.toContain(gros.email);
  });
});

describe("Le veilleur a TROIS états, pas deux", () => {
  test("aucune tâche déployée : ce n'est pas une alerte", async () => {
    await interroger(catalogue, "delete from public.scheduler_heartbeat");

    const p = await lirePanneau(admin.client, SEUILS);

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

    const p = await lirePanneau(admin.client, SEUILS);
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

    const p = await lirePanneau(admin.client, SEUILS);
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
    const p = await lirePanneau(admin.client, SEUILS);
    expect(p.stockageMesurable).toBe(true);
    expect(p.stockageOctets, "mesurable mais sans valeur : l'écran n'aurait rien à écrire")
      .not.toBeNull();
  });

  test("le total est la somme réelle des boutiques, pas une estimation", async () => {
    const p = await lirePanneau(admin.client, SEUILS);
    const somme = await interroger<{ s: string | null }>(
      catalogue,
      "select sum(stockage_octets) as s from public.shops",
    );
    expect(p.stockageOctets).toBe(Number(somme[0]?.s ?? 0));
  });

  test("les compteurs de comptes sont exacts, jamais estimés", async () => {
    const p = await lirePanneau(admin.client, SEUILS);
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

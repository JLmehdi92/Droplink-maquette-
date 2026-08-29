import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { listerComptes, lireCompte, lireJournal, ParametresComptes } from "@/lib/audit/comptes";
import { listerBoutiques, ParametresBoutiques } from "@/lib/audit/boutiques";

/**
 * LE SOCLE DE L'ADMINISTRATION — SUITE JAMAIS DÉSACTIVABLE.
 *
 * C'est la surface la plus sensible du produit : un humain y lit les données de
 * quelqu'un d'autre. Quatre propriétés portent tout le reste, et aucune ne vit
 * dans du code applicatif :
 *
 *  1. LE RÔLE EST LU EN BASE, à chaque appel. Un jeton reste valide jusqu'à son
 *     expiration même après une rétrogradation.
 *  2. L'AUDIT EST LA MÊME OPÉRATION QUE LA LECTURE. Il n'existe aucun chemin qui
 *     fasse l'une sans l'autre.
 *  3. LE JOURNAL EST APPEND-ONLY, garanti par un déclencheur — donc y compris
 *     pour les fonctions `security definer`, qui ont pourtant le droit d'écrire.
 *  4. UN NON-ADMINISTRATEUR NE DISTINGUE PAS « interdit » de « inexistant ».
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let cible: UtilisateurDeTest;
let catalogue: Client;

const DEFAUTS = ParametresComptes.parse({});
const IP = "empreinte-de-test-0123456789abcdef";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("admin-socle-admin");
  vendeur = await creerUtilisateur("admin-socle-vendeur");
  cible = await creerUtilisateur("admin-socle-cible");

  // La promotion passe par le CATALOGUE, pas par l'application : `profiles.role`
  // n'est accordé en écriture à personne, et c'est exactement ce que le dernier
  // test de ce fichier vérifie.
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [
    admin.profilId,
  ]);

  await cible.client
    .from("orders")
    .insert({ shop_id: cible.shopId, customer_label: "Client de la cible" });
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(cible);
  await catalogue.end();
});

describe("Qui peut lire", () => {
  test("un administrateur lit la liste des comptes", async () => {
    const page = await listerComptes(admin.client, DEFAUTS, IP);
    const emails = page.lignes.map((l) => l.email);

    expect(emails.length, "la sonde n'inspecte aucun compte").toBeGreaterThan(0);
    expect(emails).toContain(cible.email);
  });

  test("un vendeur ordinaire ne lit RIEN, et n'apprend pas que la surface existe", async () => {
    // Le message est « introuvable », jamais « interdit » : distinguer les deux
    // apprendrait à un curieux qu'il y a un back-office ici, donc qu'il vaut la
    // peine d'y chercher une faille.
    await expect(listerComptes(vendeur.client, DEFAUTS, IP)).rejects.toThrow(/introuvable/i);
    await expect(lireCompte(vendeur.client, cible.profilId, IP)).rejects.toThrow(/introuvable/i);
    await expect(lireJournal(vendeur.client, null)).rejects.toThrow(/introuvable/i);
  });

  test("un anonyme non plus", async () => {
    const anon = clientAnonyme();
    const { error } = await anon.rpc("lister_comptes_admin", {
      p_recherche: "",
      p_curseur_date: "",
      p_curseur_id: "",
      p_limite: 50,
      p_ip_hash: IP,
    });
    expect(error, "un anonyme a pu lister les comptes").not.toBeNull();
  });

  test("`est_admin()` elle-même rend faux pour un administrateur suspendu", async () => {
    /*
     * CE TEST EXISTE PARCE QUE LE PRÉCÉDENT NE PROUVAIT PAS CE QU'IL ANNONÇAIT.
     *
     * Falsification : `and p.status = 'active'` retiré de `est_admin()`. La
     * suite est restée VERTE — parce que `journaliser_admin`, appelée juste
     * après, revérifie le statut de son côté et faisait échouer l'appel. Le test
     * mesurait donc la seconde vérification en croyant mesurer la première.
     *
     * La protection tenait à une redondance que PERSONNE n'avait voulue, et
     * elle aurait disparu au premier nettoyage de `journaliser_admin`. On
     * interroge donc l'unité elle-même, par son EFFET.
     */
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", admin.profilId);

    const suspendu = await admin.client.rpc("est_admin");
    expect(suspendu.data, "`est_admin()` accorde le rôle à un compte suspendu").toBe(false);

    // `lire_journal_admin` ne passe PAS par `journaliser_admin` — lire le
    // journal ne se journalise pas. Elle ne dépend donc que d'`est_admin()`,
    // et c'est le chemin qui aurait été ouvert.
    await expect(lireJournal(admin.client, null)).rejects.toThrow(/introuvable/i);

    await service.from("profiles").update({ status: "active" }).eq("id", admin.profilId);
    const actif = await admin.client.rpc("est_admin");
    expect(actif.data, "la réactivation n'a pas rétabli le rôle").toBe(true);
  });

  test("un administrateur SUSPENDU cesse d'être administrateur", async () => {
    // Sans cette règle, suspendre un compte lui retirerait l'accès vendeur tout
    // en lui laissant l'accès à TOUTES les données — l'inverse exact de
    // l'intention de la suspension.
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", admin.profilId);

    await expect(listerComptes(admin.client, DEFAUTS, IP)).rejects.toThrow(/introuvable/i);

    await service.from("profiles").update({ status: "active" }).eq("id", admin.profilId);
    // La moitié qui rétablit : sans elle, une fonction cassée passerait pour une
    // suspension qui fonctionne.
    await expect(listerComptes(admin.client, DEFAUTS, IP)).resolves.toBeTruthy();
  });
});

describe("L'audit est la même opération que la lecture", () => {
  async function compterEntrees(action: string): Promise<number> {
    const lignes = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where action = $1",
      [action],
    );
    return Number(lignes[0]?.n ?? 0);
  }

  test("une consultation de LISTE écrit UNE entrée, pas une par ligne", async () => {
    // Une entrée par ligne affichée noierait les consultations INDIVIDUELLES —
    // les seules réellement intéressantes en cas de litige. Cinquante lignes de
    // bruit rendraient le journal illisible au moment précis où on en a besoin.
    const avant = await compterEntrees("comptes.liste");
    const page = await listerComptes(admin.client, DEFAUTS, IP);
    const apres = await compterEntrees("comptes.liste");

    expect(page.lignes.length, "la sonde n'inspecte aucune ligne").toBeGreaterThan(1);
    expect(apres - avant, "l'audit compte les lignes au lieu de la consultation").toBe(1);
  });

  test("l'entrée porte les CRITÈRES, pas les résultats", async () => {
    await listerComptes(admin.client, ParametresComptes.parse({ q: "admin-socle-cible" }), IP);

    const lignes = await interroger<{ payload: unknown; admin_email: string }>(
      catalogue,
      `select payload, admin_email from public.admin_audit_log
       where action = 'comptes.liste' order by occurred_at desc limit 1`,
      [],
    );
    const entree = lignes[0];
    expect(entree).toBeDefined();

    const charge = JSON.stringify(entree?.payload ?? {});
    expect(charge).toContain("admin-socle-cible");
    // Les emails trouvés ne sont PAS recopiés dans le journal : un journal qui
    // étale ce qu'il a rendu devient une surface de fuite de plus, consultable
    // par tous les administrateurs.
    expect(charge).not.toContain(cible.email);
    // L'auteur est relu EN BASE, jamais reçu en argument : passé par l'appelant,
    // il permettrait d'attribuer une action à quelqu'un d'autre.
    expect(entree?.admin_email).toBe(admin.email);
  });

  test("une consultation de fiche est tracée AVEC sa cible", async () => {
    await lireCompte(admin.client, cible.profilId, IP);

    const lignes = await interroger<{ target_email: string; resource_id: string }>(
      catalogue,
      `select target_email, resource_id from public.admin_audit_log
       where action = 'comptes.detail' order by occurred_at desc limit 1`,
      [],
    );
    expect(lignes[0]?.target_email).toBe(cible.email);
    expect(lignes[0]?.resource_id).toBe(cible.profilId);
  });

  test("une consultation INFRUCTUEUSE est tracée elle aussi", async () => {
    // Ne tracer que les succès laisserait l'énumération d'identifiants
    // totalement invisible : c'est exactement le motif qu'on chercherait après
    // coup, et il n'apparaîtrait nulle part.
    const avant = await compterEntrees("comptes.detail");
    const fantome = "00000000-0000-4000-8000-000000000000";
    const resultat = await lireCompte(admin.client, fantome, IP);
    const apres = await compterEntrees("comptes.detail");

    expect(resultat).toBeNull();
    expect(apres - avant, "une recherche infructueuse ne laisse aucune trace").toBe(1);
  });

  test("LIRE LE JOURNAL N'ÉCRIT PAS DANS LE JOURNAL", async () => {
    // Sans cette règle, ouvrir la page d'audit y ajouterait une ligne, laquelle
    // apparaîtrait à la consultation suivante : le journal se remplirait de sa
    // propre consultation et noierait ce qu'il est censé conserver.
    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log",
    );
    const page = await lireJournal(admin.client, null);
    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log",
    );

    expect(page.lignes.length, "la sonde n'inspecte aucune entrée").toBeGreaterThan(0);
    expect(Number(apres[0]?.n)).toBe(Number(avant[0]?.n));
  });
});

describe("Le journal est append-only", () => {
  test("il refuse d'être modifié, même par le propriétaire de la table", async () => {
    // Le RETRAIT DES DROITS ne suffirait pas : les fonctions `security definer`
    // s'exécutent avec les droits du propriétaire, donc AVEC le droit de
    // modifier. Un déclencheur, lui, s'applique à tout le monde — y compris à
    // une fonction future qu'on écrirait sans y penser.
    await expect(
      interroger(catalogue, "update public.admin_audit_log set action = 'efface'"),
    ).rejects.toThrow(/append-only/i);

    await expect(interroger(catalogue, "delete from public.admin_audit_log")).rejects.toThrow(
      /append-only/i,
    );
  });

  test("contre-test positif : on peut toujours ÉCRIRE dedans", async () => {
    // Sans lui, un déclencheur qui refuserait TOUT — insertion comprise —
    // passerait le test précédent tout en rendant le journal inutilisable.
    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log",
    );
    await listerComptes(admin.client, DEFAUTS, IP);
    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log",
    );
    expect(Number(apres[0]?.n)).toBeGreaterThan(Number(avant[0]?.n));
  });
});

describe("Le journal survit à ce qu'il décrit", () => {
  test("supprimer un compte n'efface pas les entrées qui le concernent", async () => {
    // LA PROPRIÉTÉ QUI JUSTIFIE LES EMAILS DÉNORMALISÉS. C'est précisément quand
    // un compte disparaît qu'on a besoin de savoir qui y a touché ; une cascade
    // aurait effacé la trace en même temps que son sujet.
    //
    // Elle a failli être perdue de façon très indirecte : `ON DELETE SET NULL`
    // s'applique par un UPDATE, que le déclencheur append-only refusait. La clé
    // ne pouvait pas se dénouer, et c'est la SUPPRESSION DU COMPTE qui échouait
    // — sans que rien ne désigne le journal.
    const ephemere = await creerUtilisateur("admin-socle-ephemere");
    await lireCompte(admin.client, ephemere.profilId, IP);

    const avant = await interroger<{ target_email: string }>(
      catalogue,
      "select target_email from public.admin_audit_log where target_profile_id = $1",
      [ephemere.profilId],
    );
    expect(avant.length, "la consultation n'a pas été tracée").toBeGreaterThan(0);
    const emailTrace = avant[0]?.target_email;

    await supprimerUtilisateur(ephemere);

    const apres = await interroger<{ target_email: string; target_profile_id: string | null }>(
      catalogue,
      "select target_email, target_profile_id from public.admin_audit_log where target_email = $1",
      [emailTrace ?? ""],
    );

    expect(apres.length, "l'entrée a disparu avec le compte").toBeGreaterThan(0);
    // La clé est dénouée, l'email reste : sans lui, l'entrée deviendrait
    // « quelqu'un a consulté quelque chose ».
    expect(apres[0]?.target_profile_id).toBeNull();
    expect(apres[0]?.target_email).toBe(emailTrace);
  });

  test("une entrée ne peut pas être RÉAFFECTÉE à un autre compte", async () => {
    // Le déclencheur tolère qu'une clé se dénoue, jamais qu'elle change de
    // cible : autoriser une réaffectation permettrait d'attribuer après coup
    // l'action d'un administrateur à quelqu'un d'autre.
    //
    // ON S'ASSURE D'ABORD QU'IL Y A QUELQUE CHOSE À RÉAFFECTER. Un `update` qui
    // ne touche aucune ligne ne lève rien : sans cette borne, le test passerait
    // en n'inspectant rien — et il l'a fait, sous une falsification qui
    // empêchait justement les entrées d'être écrites.
    await lireCompte(admin.client, cible.profilId, IP);
    const cibles = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where target_profile_id is not null",
    );
    expect(Number(cibles[0]?.n), "aucune entrée à réaffecter : le test n'inspecte rien").toBeGreaterThan(0);

    await expect(
      interroger(
        catalogue,
        // VERS UN AUTRE COMPTE, et c'est le point : réécrire la même valeur
        // n'est pas une réaffectation, et le déclencheur a raison de la laisser
        // passer. La première rédaction de ce test visait `cible`, celui-là même
        // que les entrées désignaient déjà — elle ne changeait donc rien.
        "update public.admin_audit_log set target_profile_id = $1 where target_profile_id is not null",
        [vendeur.profilId],
      ),
    ).rejects.toThrow(/append-only/i);
  });

  test("l'email dénormalisé ne peut pas être réécrit", async () => {
    await expect(
      interroger(catalogue, "update public.admin_audit_log set admin_email = 'autre@exemple.test'"),
    ).rejects.toThrow(/append-only/i);
  });
});

describe("Le journal ne se laisse pas forger", () => {
  test("un vendeur ne peut pas écrire une entrée à son propre sujet", async () => {
    // Une fonction d'audit qui écrit ce qu'on lui dit accepterait une entrée
    // forgée par n'importe quel utilisateur authentifié, et le journal
    // deviendrait un endroit où l'on peut écrire des mensonges sur les autres.
    const { error } = await vendeur.client.rpc("journaliser_admin", {
      p_action: "comptes.detail",
      p_resource_type: "profiles",
      p_resource_id: cible.profilId,
      p_cible: cible.profilId,
      p_ip_hash: IP,
      p_payload: {},
    });
    expect(error, "un vendeur a pu écrire dans le journal d'audit").not.toBeNull();
  });
});

describe("Personne ne se promeut administrateur", () => {
  test("un vendeur ne peut pas s'accorder le rôle", async () => {
    // C'est un PRIVILÈGE DE COLONNE Postgres, pas une policy : une policy sur
    // `profiles` qui lit `profiles` produirait une récursion infinie, et les
    // privilèges de colonne sont évalués AVANT les policies — donc même une
    // policy future trop permissive ne rouvrirait pas ce chemin.
    const { error } = await vendeur.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", vendeur.profilId);
    expect(error, "un vendeur a pu se promouvoir administrateur").not.toBeNull();

    const lignes = await interroger<{ role: string }>(
      catalogue,
      "select role from public.profiles where id = $1",
      [vendeur.profilId],
    );
    expect(lignes[0]?.role).toBe("user");
  });

  test("il ne peut pas non plus se réactiver après suspension", async () => {
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", vendeur.profilId);

    await vendeur.client
      .from("profiles")
      .update({ status: "active" })
      .eq("id", vendeur.profilId);

    const lignes = await interroger<{ status: string }>(
      catalogue,
      "select status from public.profiles where id = $1",
      [vendeur.profilId],
    );
    expect(lignes[0]?.status, "un suspendu s'est réactivé lui-même").toBe("suspended");

    await service.from("profiles").update({ status: "active" }).eq("id", vendeur.profilId);
  });
});

/**
 * LES DEUX ÉCRANS D'ADMINISTRATION DISENT LA MÊME CHOSE.
 *
 * ⚠️ ILS NE LE DISAIENT PAS. `lister_boutiques_admin` rendait
 * `shops.commandes_reelles` — le compteur tenu par déclencheur, qui ne compte
 * que le contenu réel — pendant que `lister_comptes_admin` comptait les LIGNES
 * de `orders`, brouillons compris. Deux nombres pour le même compte, sur la
 * même surface, et aucun des deux ne mentait sur son calcul : il y avait deux
 * définitions du mot « commande » et rien pour le signaler.
 *
 * CE CONTRÔLE ÉCHOUE DANS LES DEUX SENS. Si l'une des deux fonctions repasse à
 * un comptage de lignes, l'égalité tombe ; si les deux comptent les brouillons,
 * le second test tombe. Une seule des deux assertions laisserait passer la
 * moitié des régressions.
 */
describe("La liste des comptes et celle des boutiques comptent pareil", () => {
  test("contre-test d'abord : le compte inspecté porte bien des commandes", async () => {
    await interroger(
      catalogue,
      `insert into public.orders (shop_id, customer_label)
       select $1, 'Client ' || i from generate_series(1, 3) as i`,
      [cible.shopId],
    );
    // ⚠️ LE BROUILLON EST ICI, ET IL EST INDISPENSABLE. Les deux définitions du
    // mot « commande » ne divergent QUE s'il en existe un : sans lui, une liste
    // remise à `count(*)` rendrait exactement le même nombre que le compteur, et
    // le test d'égalité qui suit passerait au vert sur un produit cassé.
    // Constaté en falsifiant, pas déduit.
    await interroger(catalogue, "insert into public.orders (shop_id) values ($1)", [cible.shopId]);

    const page = await listerComptes(admin.client, DEFAUTS, IP);
    const ligne = page.lignes.find((l) => l.email === cible.email);
    expect(ligne, "le compte inspecté n'est pas dans la liste").toBeDefined();
    expect(ligne?.commandes, "la sonde compare deux zéros").toBeGreaterThan(0);
  });

  test("les deux écrans rendent le MÊME nombre pour le même compte", async () => {
    const comptes = await listerComptes(admin.client, DEFAUTS, IP);
    const boutiques = await listerBoutiques(
      admin.client,
      ParametresBoutiques.parse({ q: "", curseur: null }),
      IP,
    );

    const c = comptes.lignes.find((l) => l.email === cible.email);
    const b = boutiques.lignes.find((l) => l.email === cible.email);
    expect(b, "le compte inspecté n'est pas dans la liste des boutiques").toBeDefined();
    expect(c?.commandes).toBe(b?.commandes);
  });

  test("un brouillon sans contenu réel n'est compté NULLE PART", async () => {
    const avant = (await listerComptes(admin.client, DEFAUTS, IP)).lignes.find(
      (l) => l.email === cible.email,
    )?.commandes;

    // Aucune colonne de contenu : la commande existe, mais elle n'est pas
    // « créée » au sens du produit. La compter gonflerait la seule métrique sur
    // laquelle on décidera.
    await interroger(catalogue, "insert into public.orders (shop_id) values ($1)", [cible.shopId]);

    const apres = (await listerComptes(admin.client, DEFAUTS, IP)).lignes.find(
      (l) => l.email === cible.email,
    )?.commandes;
    expect(apres, "un brouillon vide a été compté comme une commande").toBe(avant);
  });

  test("les colis du mois viennent du compteur, et valent 0 plutôt que rien", async () => {
    const page = await listerComptes(admin.client, DEFAUTS, IP);
    const ligne = page.lignes.find((l) => l.email === cible.email);

    // ZÉRO, PAS `null` : la colonne est un nombre sur tout l'écran, et un compte
    // sans colis en a zéro. Rendre `null` obligerait chaque appelant à décider
    // quoi afficher, et l'un d'eux finirait par écrire « — ».
    expect(ligne?.colisCeMois).toBe(0);

    await interroger(
      catalogue,
      `insert into public.usage_counters (profile_id, period_month, parcels_registered)
       values ($1, date_trunc('month', now())::date, 7)
       on conflict (profile_id, period_month) do update set parcels_registered = 7`,
      [cible.profilId],
    );

    const apres = await listerComptes(admin.client, DEFAUTS, IP);
    expect(
      apres.lignes.find((l) => l.email === cible.email)?.colisCeMois,
      "la liste ne lit pas le compteur de colis",
    ).toBe(7);
  });
});

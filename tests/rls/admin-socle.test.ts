import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  compterJournal,
  listerComptes,
  lireCompte,
  lireJournal,
  ParametresComptes,
} from "@/lib/audit/comptes";
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

/** Le journal, sans famille ni fenêtre : tout, du plus récent au plus ancien. */
const SANS_FILTRE_JOURNAL = { famille: "" as const, jours: 0, curseur: null };

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("admin-socle-admin");
  vendeur = await creerUtilisateur("admin-socle-vendeur");
  cible = await creerUtilisateur("admin-socle-cible");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; la cible en reçoit 7 au fil du fichier, et ce test mesure
  // ce que l'administration lit et compte, pas le quota.
  await passerEnPro(cible);

  // La promotion passe par le CATALOGUE, pas par l'application : `profiles.role`
  // n'est accordé en écriture à personne, et c'est exactement ce que le dernier
  // test de ce fichier vérifie.
  await promouvoirAdmin(catalogue, admin);

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
    await expect(lireJournal(vendeur.client, SANS_FILTRE_JOURNAL)).rejects.toThrow(/introuvable/i);
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
    await expect(lireJournal(admin.client, SANS_FILTRE_JOURNAL)).rejects.toThrow(/introuvable/i);

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
    const page = await lireJournal(admin.client, SANS_FILTRE_JOURNAL);
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
      ParametresBoutiques.parse({ q: "", type: "", curseur: null }),
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

/**
 * LA FICHE D'UN COMPTE NE REND QUE DES VOLUMES.
 *
 * CONTRÔLE PAR VALEUR, PAS PAR NOM. Une valeur voyage sous n'importe quel nom :
 * un pseudo de client republié sous `meta`, `debug` ou `diagnostic` survivrait
 * intégralement à une vérification de la liste des colonnes. On injecte donc des
 * SENTINELLES uniques en base et on les cherche dans la réponse ENTIÈRE,
 * sérialisée — c'est le seul contrôle qui ne dépende pas de ce que son auteur a
 * pensé à inspecter.
 *
 * LA SENTINELLE DE JETON COMPTE LE PLUS : les autres exposent une donnée,
 * celle-là transfère une CAPACITÉ, définitivement, puisque le jeton est immuable
 * à vie.
 */
describe("La fiche rend des volumes, jamais du contenu", () => {
  const PSEUDO = "ZZSENTINELLE-pseudo-de-client";
  const REFERENCE = "ZZSENTINELLE-reference-produit";
  const RESEAU = "https://instagram.com/ZZSENTINELLE-adresse";
  let jeton = "";

  beforeAll(async () => {
    const lignes = await interroger<{ public_token: string }>(
      catalogue,
      `insert into public.orders (shop_id, customer_label, product_ref)
       values ($1, $2, $3) returning public_token`,
      [cible.shopId, PSEUDO, REFERENCE],
    );
    jeton = lignes[0]?.public_token ?? "";
    if (jeton === "") throw new Error("commande sentinelle non créée");

    await interroger(catalogue, "update public.shops set instagram_url = $2 where id = $1", [
      cible.shopId,
      RESEAU,
    ]);

    // LES ÉVÉNEMENTS SONT ÉCRITS PAR LES SERVER ACTIONS, pas par un déclencheur :
    // une insertion SQL directe n'en produit aucun. On les pose donc à la main,
    // AVEC une charge utile qui porte une sentinelle — c'est tout l'intérêt, la
    // frise ne doit jamais la laisser sortir.
    await interroger(
      catalogue,
      `insert into public.order_events (order_id, type, actor, payload)
       select o.id, t.type, 'vendeur', jsonb_build_object('client', $2::text)
         from public.orders o
        cross join (values ('commande_creee'), ('media_ajoute')) as t(type)
        where o.shop_id = $1`,
      [cible.shopId, PSEUDO],
    );
  }, 60_000);

  test("contre-test d'abord : la sonde lit bien une fiche remplie", async () => {
    const fiche = await lireCompte(admin.client, cible.profilId, IP);
    expect(fiche, "la fiche est introuvable").not.toBeNull();
    // Sans ces deux-là, « aucune sentinelle trouvée » serait vrai sur une fiche
    // vide et ne prouverait rien du tout.
    expect(fiche?.commandes, "la fiche ne porte aucune commande").toBeGreaterThan(0);
    expect(fiche?.reseaux, "le réseau posé n'est pas vu").toContain("instagram");
  });

  test("aucune sentinelle ne franchit la fiche, sous AUCUN nom", async () => {
    const fiche = await lireCompte(admin.client, cible.profilId, IP);
    const rendu = JSON.stringify(fiche);

    for (const [quoi, sentinelle] of [
      ["le pseudo du client", PSEUDO],
      ["la référence produit", REFERENCE],
      ["l'adresse du réseau", RESEAU],
      ["LE JETON PUBLIC", jeton],
    ] as const) {
      expect(rendu.includes(sentinelle), `${quoi} est rendu par la fiche d'administration`).toBe(
        false,
      );
    }
  });

  test("LA BASE elle-même ne rend que des agrégats", async () => {
    // ⚠️ ON INTERROGE LA RPC, PAS `lireCompte`. Le mappeur TypeScript
    // reconstruit chaque entrée champ par champ : il JETAIT la colonne en trop
    // avant que la sonde ne la voie, et une falsification qui republiait
    // `payload` sous le nom `meta` est passée au vert. Le mappeur est une vraie
    // frontière — il a son propre test juste en dessous — mais il ne dit rien de
    // ce que la base accepte de rendre.
    const { data, error } = await admin.client.rpc("lire_compte_admin", {
      p_profil: cible.profilId,
      p_ip_hash: IP,
    });
    expect(error).toBeNull();

    const brut = (data ?? [])[0] as { evenements?: unknown } | undefined;
    const evenements = Array.isArray(brut?.evenements) ? brut.evenements : [];
    expect(evenements.length, "la frise est vide : la sonde n'inspecte rien").toBeGreaterThan(0);

    for (const e of evenements) {
      // INVENTAIRE, PAS SÉLECTION : on énumère les clés rendues et on refuse
      // tout ce qui n'est pas déclaré, plutôt que de chercher `payload` — un
      // champ ajouté demain sous un autre nom passerait la seconde forme.
      expect(Object.keys(e as object).sort()).toEqual(["jour", "n", "type"]);
    }

    // ET PAR VALEUR, sur la réponse entière : une sentinelle ne voyage pas
    // seulement dans les champs qu'on a pensé à énumérer.
    const rendu = JSON.stringify(brut);
    for (const [quoi, sentinelle] of [
      ["le pseudo du client", PSEUDO],
      ["la référence produit", REFERENCE],
      ["l'adresse du réseau", RESEAU],
      ["LE JETON PUBLIC", jeton],
    ] as const) {
      expect(rendu.includes(sentinelle), `${quoi} sort de la base`).toBe(false);
    }
  });

  test("et le mappeur ne laisse passer que ce qu'il déclare", async () => {
    // La seconde frontière, celle qui a effectivement arrêté la falsification.
    const fiche = await lireCompte(admin.client, cible.profilId, IP);
    expect(fiche?.activite.length, "la frise est vide : la sonde n'inspecte rien").toBeGreaterThan(
      0,
    );
    for (const a of fiche?.activite ?? []) {
      expect(Object.keys(a).sort()).toEqual(["jour", "n", "type"]);
      expect(a.n).toBeGreaterThan(0);
    }
  });

  test("la fiche compte comme les DEUX listes, pas comme une troisième", async () => {
    const fiche = await lireCompte(admin.client, cible.profilId, IP);
    const comptes = await listerComptes(admin.client, DEFAUTS, IP);
    const ligne = comptes.lignes.find((l) => l.email === cible.email);

    // ⚠️ TROISIÈME ENDROIT OÙ « COMMANDE » NE VOULAIT PAS DIRE LA MÊME CHOSE.
    // Un administrateur qui ouvre une fiche depuis la liste voyait le nombre
    // CHANGER en un clic, sans que rien ne bouge en base.
    expect(fiche?.commandes).toBe(ligne?.commandes);
  });
});

/**
 * LES FILTRES DU JOURNAL.
 *
 * LA PROPRIÉTÉ QUI PORTE TOUT : les trois familles PARTITIONNENT le journal.
 * Leur somme égale le total, donc aucune action ne tombe hors de tous les
 * filtres. C'est ce qui justifie de définir `consultation` PAR EXCLUSION en
 * base : une liste positive aurait laissé la prochaine action introuvable par
 * tous les filtres, et personne ne l'aurait remarqué — un filtre qui rend zéro
 * ligne ressemble à un filtre qui n'a rien trouvé.
 *
 * C'est un contrôle d'INVENTAIRE : il ne dépend pas de ce que son auteur a pensé
 * à énumérer, et il échouera le jour où une action naîtra sans famille.
 */
describe("Le journal se filtre sans rien perdre", () => {
  const sansFiltre = { famille: "" as const, jours: 0 };

  /*
   * ⚠️ CE FICHIER COMPTE SANS PLAFOND, ET C'EST DÉLIBÉRÉ.
   *
   * La migration 118 a borné le comptage du journal à 10 001 lignes, sur
   * mesure : le comptage exact coûtait 313 à 511 ms au plafond de 517 031
   * lignes, pour une page qui en coûte 0. L'écran paie donc 4 à 10 ms.
   *
   * Mais ce plafond aurait CASSÉ la preuve ci-dessous. La partition des trois
   * familles se vérifie par une somme ; au-delà du plafond, la somme compare
   * trois bornes à une quatrième borne et ne prouve plus rien — silencieusement,
   * puisque la base de test porte déjà plus de 17 000 entrées.
   *
   * La migration 119 en a donc fait un ARGUMENT plutôt qu'un défaut subi :
   * l'écran demande une borne, ce test demande l'exactitude et paie le temps
   * qu'il faut. On n'échange pas une correction de performance contre une
   * preuve perdue.
   */
  const EXACT = null;

  test("contre-test d'abord : le journal n'est pas vide", async () => {
    const total = await compterJournal(admin.client, sansFiltre, EXACT);
    expect(total.total, "la sonde compte un journal vide").toBeGreaterThan(0);
  });

  test("LE PLAFOND BORNE VRAIMENT, et le dit", async () => {
    /*
     * SANS CE CONTRÔLE, LA CORRECTION DE PERFORMANCE N'EST GARDÉE PAR RIEN.
     *
     * Le plafond ne se mesure pas ici — mesurer un temps dans une suite
     * fonctionnelle certifierait une performance qui n'existe qu'à la
     * volumétrie du moment. Ce qui se vérifie, c'est le CONTRAT : la valeur
     * rendue s'arrête au plafond demandé, et l'appelant apprend qu'elle s'y est
     * arrêtée — sans quoi il afficherait un nombre plafonné comme s'il était
     * exact.
     *
     * On demande un plafond ABSURDEMENT BAS plutôt que le vrai : le contrat se
     * prouve alors sans dépendre du volume du journal, donc sans devenir
     * intermittent le jour où la base grossit.
     */
    const borne = await compterJournal(admin.client, sansFiltre, 5);
    expect(borne.total, "le comptage a dépassé le plafond demandé").toBe(5);
    expect(borne.depasse, "le plafond a mordu sans que l'appelant l'apprenne").toBe(true);

    // CONTRE-TEST : sans plafond, le même appel rend davantage. Sans lui, une
    // fonction qui rendrait toujours 5 passerait le contrôle ci-dessus.
    const exact = await compterJournal(admin.client, sansFiltre, EXACT);
    expect(exact.total, "le journal ne contient pas plus de 5 entrées : le contre-test ne prouve rien").toBeGreaterThan(5);
    expect(exact.depasse, "un comptage sans plafond ne peut pas se déclarer plafonné").toBe(false);

    // ET LE PLAFOND NE MENT PAS QUAND IL NE MORD PAS : au-dessus du volume
    // réel, la valeur rendue redevient exacte et `depasse` retombe à faux.
    const large = await compterJournal(admin.client, sansFiltre, exact.total + 1);
    expect(large.total).toBe(exact.total);
    expect(large.depasse).toBe(false);
  });

  test("LES TROIS FAMILLES PARTITIONNENT LE JOURNAL", async () => {
    const [total, suspensions, consultations, parametres] = await Promise.all([
      compterJournal(admin.client, sansFiltre, EXACT),
      compterJournal(admin.client, { famille: "suspension", jours: 0 }, EXACT),
      compterJournal(admin.client, { famille: "consultation", jours: 0 }, EXACT),
      compterJournal(admin.client, { famille: "parametre", jours: 0 }, EXACT),
    ]);
    expect(suspensions.total + consultations.total + parametres.total).toBe(total.total);
    // Et chacune est NON VIDE : trois zéros et un total nul passeraient
    // l'égalité ci-dessus sans rien prouver.
    expect(consultations.total, "aucune consultation dans le journal").toBeGreaterThan(0);
  });

  test("le filtre porte sur la LECTURE, pas seulement sur le décompte", async () => {
    const page = await lireJournal(admin.client, {
      famille: "consultation",
      jours: 0,
      curseur: null,
    });
    expect(page.lignes.length, "la sonde n'inspecte aucune ligne").toBeGreaterThan(0);
    for (const l of page.lignes) {
      expect(l.action.startsWith("compte."), `« ${l.action} » n'est pas une consultation`).toBe(
        false,
      );
      expect(l.action.startsWith("parametre."), `« ${l.action} » n'est pas une consultation`).toBe(
        false,
      );
    }
  });

  test("une fenêtre BORNE réellement dans le temps", async () => {
    // ⚠️ LA PREMIÈRE VERSION DE CE TEST NE PROUVAIT RIEN : elle affirmait
    // « la semaine ≤ le tout », ce qui reste vrai quand la fenêtre est IGNORÉE —
    // les deux valent alors la même chose. Falsifié, il est resté vert.
    //
    // On sème donc une entrée DATÉE D'IL Y A UN AN et on exige qu'elle soit
    // comptée sans fenêtre et PAS avec. C'est la seule forme qui distingue une
    // fenêtre appliquée d'une fenêtre absente.
    await interroger(
      catalogue,
      `insert into public.admin_audit_log
         (admin_id, admin_email, action, resource_type, occurred_at)
       values ($1, $2, 'comptes.liste', 'profiles', now() - interval '365 days')`,
      [admin.profilId, admin.email],
    );

    const [tout, semaine] = await Promise.all([
      compterJournal(admin.client, sansFiltre, EXACT),
      compterJournal(admin.client, { famille: "", jours: 7 }, EXACT),
    ]);

    expect(
      tout.total - semaine.total,
      "l'entrée d'il y a un an est comptée dans les 7 jours",
    ).toBeGreaterThan(0);

    // Et la lecture applique la MÊME borne que le décompte : un total filtré
    // au-dessus d'une liste qui ne l'est pas ferait chercher des lignes absentes.
    const page = await lireJournal(admin.client, { famille: "", jours: 7, curseur: null });
    const limite = Date.now() - 7 * 24 * 3_600_000;
    for (const l of page.lignes) {
      expect(Date.parse(l.quand), `« ${l.quand} » est hors de la fenêtre`).toBeGreaterThanOrEqual(
        limite,
      );
    }
  });

  test("une famille INCONNUE est refusée, jamais ignorée", async () => {
    // Ignorée, elle rendrait le journal ENTIER — et sur CE journal, « tout » veut
    // dire les milliers de lignes qui masquent la seule qu'on cherchait.
    const { error } = await admin.client.rpc("compter_journal_admin", {
      p_famille: "tout-ce-qui-brille",
      p_depuis_jours: 0,
    });
    expect(error, "une famille inconnue a été acceptée").not.toBeNull();
  });

  test("lire le journal N'ÉCRIT PAS dans le journal", async () => {
    const avant = await compterJournal(admin.client, sansFiltre, EXACT);
    await lireJournal(admin.client, { famille: "", jours: 0, curseur: null });
    await compterJournal(admin.client, sansFiltre, EXACT);
    const apres = await compterJournal(admin.client, sansFiltre, EXACT);
    // La garantie ne vit pas dans le code applicatif : les deux fonctions sont
    // `stable`, donc PostgREST les exécute en transaction lecture seule et le
    // moteur refuserait toute écriture qu'on y ajouterait.
    expect(apres).toEqual(avant);
  });
});

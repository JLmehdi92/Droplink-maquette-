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
import { bloquerLienCommande, debloquerLienCommande, liensBloquesParmi } from "@/lib/audit/blocage-lien";
import { lireCommandePublique } from "@/lib/page-publique/lecture";

/**
 * LE BLOCAGE D'UN LIEN PAR L'ADMINISTRATION — décision de Wassim, 19/09/2026.
 *
 * L'administrateur ne voit pas la commande (décision 9), mais doit pouvoir couper sa
 * page publique « si y'a une galère ». Même mode de défaillance que la suspension :
 * SILENCIEUX. La colonne serait écrite, l'audit consigné, l'écran dirait « bloqué »,
 * et la page continuerait d'être servie si une seule des fonctions par jeton oubliait
 * le filtre. Le contrôle porte donc sur ce que la page RÉPOND, et sur les chemins
 * qui acceptent un jeton, pas seulement sur la lecture principale.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;
let commandeId: string;
let jeton: string;

const IP = "empreinte-blocage-0123456789abcdef";
const MOTIF = "Signalement d un ayant droit, dossier 2026-221";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("bloc-admin");
  vendeur = await creerUtilisateur("bloc-vendeur");
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [admin.profilId]);

  const { data } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId, customer_label: "Client du blocage" })
    .select("id, public_token")
    .single();
  const ligne = data as { id: string; public_token: string };
  commandeId = ligne.id;
  jeton = ligne.public_token;

  // UNE PHOTO, sans quoi « aucun média servi » serait vrai bloqué ou non : la revue de
  // sécurité du 19/09 a relevé que retirer le filtre de lire_medias_publics ne faisait
  // rien rougir. La clé porte le préfixe et la forme que la base exige (089).
  const prefixe = await interroger<{ p: string }>(catalogue, "select public.prefixe_media_attendu($1) as p", [
    commandeId,
  ]);
  await interroger(
    catalogue,
    `insert into public.order_media (order_id, type, cle, taille_octets, position)
     values ($1, 'photo', $2, 1000, 0)`,
    [commandeId, `${prefixe[0]?.p ?? ""}aaaaaaaa-0000-4000-8000-000000000001.jpg`],
  );

  /*
   * UN COLIS AVEC UN PASSAGE (audit du 20/09/2026). `lire_suivi_public` et
   * `lire_passages_publics` portent le même filtre que les quatre autres fonctions par jeton,
   * mais rien ne l'exerçait : sans colis attaché, elles rendent vide qu'un lien soit bloqué ou
   * non — et « vide » aurait certifié un filtre absent.
   */
  const colis = await interroger<{ id: string }>(
    catalogue,
    `insert into public.tracked_parcels (shop_id, tracking_number, registered_at, normalized_status)
     values ($1, 'BLOCAGE-SUIVI-0001', now(), 'en_transit') returning id`,
    [vendeur.shopId],
  );
  await interroger(catalogue, "insert into public.order_parcels (order_id, parcel_id) values ($1, $2)", [
    commandeId,
    colis[0]?.id,
  ]);
  await interroger(
    catalogue,
    `insert into public.parcel_checkpoints (parcel_id, occurred_at, location, description, stage)
     values ($1, now() - interval '1 day', 'Roissy', 'Départ du centre de tri', 'en_transit')`,
    [colis[0]?.id],
  );
}, 120_000);

/** Ce que la page publique sert du suivi : la ligne du colis, et ses passages. */
async function suiviServi(): Promise<{ colis: number; passages: number }> {
  const anon = clientAnonyme();
  const suivi = await anon.rpc("lire_suivi_public", { p_jeton: jeton });
  const passages = await anon.rpc("lire_passages_publics", { p_jeton: jeton });
  if (suivi.error !== null) throw new Error(`lire_suivi_public : ${suivi.error.message}`);
  if (passages.error !== null) throw new Error(`lire_passages_publics : ${passages.error.message}`);
  return {
    colis: Array.isArray(suivi.data) ? suivi.data.length : 0,
    passages: Array.isArray(passages.data) ? passages.data.length : 0,
  };
}

/** Combien de médias la page publique sert, vue d'un anonyme. */
async function mediasServis(): Promise<number> {
  const { data, error } = await clientAnonyme().rpc("lire_medias_publics", { p_jeton: jeton });
  if (error !== null) throw new Error(`lire_medias_publics : ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

async function compterVues(): Promise<number> {
  const lignes = await interroger<{ n: string }>(
    catalogue,
    "select count(*) as n from public.link_views where order_id = $1",
    [commandeId],
  );
  return Number(lignes[0]?.n);
}

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

describe("Le blocage coupe vraiment", () => {
  test("CONTRE-TEST D'ABORD : la page répond AVANT tout blocage", async () => {
    const avant = await lireCommandePublique(jeton);
    expect(avant, "la page ne répondait pas AVANT le blocage").not.toBeNull();
    expect(avant?.client).toBe("Client du blocage");
    expect(await mediasServis(), "la photo n'était pas servie AVANT le blocage").toBe(1);
    const avantSuivi = await suiviServi();
    expect(avantSuivi.colis, "le suivi n'était pas servi AVANT le blocage").toBe(1);
    expect(avantSuivi.passages, "les passages n'étaient pas servis AVANT le blocage").toBe(1);
  });

  test("après blocage, la page cesse d'être servie", async () => {
    const r = await bloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP);
    expect(r.statut, "le blocage a échoué").toBe("ok");
    expect(await lireCommandePublique(jeton), "la page répond encore").toBeNull();
  });

  test("et ses photos cessent d'être servies", async () => {
    // lire_medias_publics sert aussi la photo pleine du visionneur (signerMediaPlein) :
    // sans le filtre, le lien bloqué laisserait passer les images une à une.
    expect(await mediasServis(), "une photo d'un lien bloqué est encore servie").toBe(0);
  });

  test("et son suivi aussi : ni le colis, ni ses passages", async () => {
    const pendant = await suiviServi();
    expect(pendant.colis, "le suivi d'un lien bloqué est encore servi").toBe(0);
    expect(pendant.passages, "les passages d'un lien bloqué sont encore servis").toBe(0);
  });

  test("un client ne peut plus arbitrer les photos d'une commande bloquée", async () => {
    // arbitrer_qc accepte le jeton : sans le filtre, un lien coupé resterait un lien
    // qui ÉCRIT dans la commande.
    await clientAnonyme().rpc("arbitrer_qc", {
      p_jeton: jeton,
      p_decision: "approuve",
      p_commentaire: "",
    });
    const etat = await interroger<{ qc_status: string }>(
      catalogue,
      "select qc_status::text as qc_status from public.orders where id = $1",
      [commandeId],
    );
    expect(etat[0]?.qc_status, "l'arbitrage a écrit dans une commande bloquée").not.toBe("approuve");
  });

  test("une page bloquée ne compte pas de vue", async () => {
    // Le client SYSTÈME, comme le serveur : `enregistrer_vue` n est exécutable par
    // personne d autre (076).
    // ⚠️ DES EMPREINTES VALIDES, sinon ce test ne prouve rien : la première version
    // passait une empreinte hors format, `enregistrer_vue` la refusait AVANT de lire
    // le jeton (076), et le test restait vert même le filtre de blocage retiré —
    // constaté par la cible « vue-comptee-sur-lien-bloque » du falsificateur.
    const { data } = await clientService().rpc("enregistrer_vue", {
      p_jeton: jeton,
      p_ip_hash: "0123456789abcdef0123456789abcdef",
      p_ua_hash: "fedcba9876543210fedcba9876543210",
      p_pays: "",
      p_profil: "",
    });
    expect(data, "une vue a été comptée sur un lien bloqué").toBe(false);
    expect(await compterVues(), "une vue a été comptée sur un lien bloqué").toBe(0);
  });

  test("l'administration voit lesquelles sont bloquées", async () => {
    const r = await liensBloquesParmi(admin.client, [commandeId]);
    expect(r).toEqual({ statut: "ok", bloques: new Set([commandeId]) });
  });

  test("et le déblocage la rétablit SUR LE MÊME LIEN", async () => {
    // Contrainte 5 : le public_token est immuable. Sans cette moitié, une fonction qui
    // casserait tout passerait pour un blocage qui fonctionne.
    const r = await debloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP);
    expect(r.statut).toBe("ok");

    const apres = await lireCommandePublique(jeton);
    expect(apres, "le déblocage n'a pas rétabli la page").not.toBeNull();
    expect(apres?.jeton, "le jeton a changé : le lien envoyé au client est mort").toBe(jeton);
    expect(await mediasServis(), "la photo n'est pas revenue").toBe(1);
    const apresSuivi = await suiviServi();
    expect(apresSuivi.colis, "le suivi n'est pas revenu").toBe(1);
    expect(apresSuivi.passages, "les passages ne sont pas revenus").toBe(1);
    expect(await liensBloquesParmi(admin.client, [commandeId])).toEqual({ statut: "ok", bloques: new Set() });
  });

  test("CONTRE-TEST : débloquée, la même page compte de nouveau ses vues", async () => {
    // Sans lui, une fonction qui ne compterait JAMAIS rien passerait le test « une page
    // bloquée ne compte pas de vue ».
    const { data } = await clientService().rpc("enregistrer_vue", {
      p_jeton: jeton,
      p_ip_hash: "abcdef0123456789abcdef0123456789",
      p_ua_hash: "fedcba9876543210fedcba9876543210",
      p_pays: "",
      p_profil: "",
    });
    expect(data, "la vue d'une page active n'a pas été comptée").toBe(true);
    expect(await compterVues()).toBe(1);
  });
});

describe("Ce que le blocage exige", () => {
  test("un motif vide ou trop court est refusé par le module", async () => {
    for (const motif of ["", "   ", "ok"]) {
      const r = await bloquerLienCommande(admin.client, { commandeId, motif }, IP);
      expect(r.statut, `motif « ${motif} » accepté`).toBe("erreur");
    }
    expect(await lireCommandePublique(jeton), "un refus a bloqué quand même").not.toBeNull();
  });

  test("LA BASE refuse aussi le motif vide, sans passer par le module", async () => {
    const { error } = await admin.client.rpc("bloquer_lien_commande", {
      p_commande: commandeId,
      p_motif: "   ",
      p_ip_hash: IP,
    });
    expect(error?.code, "la base accepte un blocage sans motif").toBe("DL032");
    expect(await lireCommandePublique(jeton)).not.toBeNull();
  });

  test("bloquer deux fois est refusé, et débloquer un lien actif aussi", async () => {
    await bloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP);
    const second = await admin.client.rpc("bloquer_lien_commande", {
      p_commande: commandeId,
      p_motif: MOTIF,
      p_ip_hash: IP,
    });
    expect(second.error?.code).toBe("DL057");
    await debloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP);

    const encore = await admin.client.rpc("debloquer_lien_commande", {
      p_commande: commandeId,
      p_motif: MOTIF,
      p_ip_hash: IP,
    });
    expect(encore.error?.code).toBe("DL057");
  });

  test("un vendeur ne peut ni bloquer, ni lister, ni SE DÉBLOQUER", async () => {
    const r = await bloquerLienCommande(vendeur.client, { commandeId, motif: MOTIF }, IP);
    expect(r).toEqual({ statut: "erreur", motif: "introuvable" });
    expect(await liensBloquesParmi(vendeur.client, [commandeId])).toEqual({ statut: "erreur" });

    // L'écriture directe par PostgREST : la colonne n'est accordée en écriture à
    // PERSONNE. Une protection qui tiendrait au seul formulaire tomberait ici.
    await bloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP);
    await vendeur.client.from("orders").update({ admin_blocked_at: null } as never).eq("id", commandeId);
    const etat = await interroger<{ bloque: boolean }>(
      catalogue,
      "select admin_blocked_at is not null as bloque from public.orders where id = $1",
      [commandeId],
    );
    expect(etat[0]?.bloque, "le vendeur s'est débloqué lui-même").toBe(true);
    await debloquerLienCommande(admin.client, { commandeId, motif: MOTIF }, IP);
  });
});

describe("Ce que le blocage laisse dans le journal", () => {
  test("le motif est consigné EN CLAIR, avec le vendeur visé", async () => {
    const marqueur = "Motif distinctif du blocage " + Date.now();
    await bloquerLienCommande(admin.client, { commandeId, motif: marqueur }, IP);

    const lignes = await interroger<{ payload: { motif?: string }; target_email: string; resource_id: string }>(
      catalogue,
      `select payload, target_email, resource_id from public.admin_audit_log
       where action = 'compte.blocage_lien' order by occurred_at desc limit 1`,
    );
    expect(lignes[0]?.payload.motif).toBe(marqueur);
    expect(lignes[0]?.target_email).toBe(vendeur.email);
    expect(lignes[0]?.resource_id).toBe(commandeId);

    await debloquerLienCommande(admin.client, { commandeId, motif: "Signalement retiré, dossier clos" }, IP);
    const deblocage = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where action = 'compte.deblocage_lien' and resource_id = $1",
      [commandeId],
    );
    expect(Number(deblocage[0]?.n), "le déblocage n'est pas tracé").toBeGreaterThan(0);
  });

  test("un blocage REFUSÉ ne laisse aucune trace", async () => {
    const compter = async () =>
      Number(
        (
          await interroger<{ n: string }>(
            catalogue,
            "select count(*) as n from public.admin_audit_log where action = 'compte.blocage_lien'",
          )
        )[0]?.n,
      );
    const avant = await compter();
    await bloquerLienCommande(vendeur.client, { commandeId, motif: MOTIF }, IP);
    await admin.client.rpc("bloquer_lien_commande", { p_commande: commandeId, p_motif: " ", p_ip_hash: IP });
    expect(await compter()).toBe(avant);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import { reactiverCompte, suspendreCompte } from "@/lib/audit/suspension";
import { lireCommandePublique } from "@/lib/page-publique/lecture";

/**
 * LA SUSPENSION — SUITE JAMAIS DÉSACTIVABLE.
 *
 * C'est la capacité technique qui fonde notre statut d'hébergeur : tout le reste
 * du produit peut être refait, celle-ci est la seule dont l'absence nous expose
 * directement.
 *
 * SON MODE DE DÉFAILLANCE EST SILENCIEUX. La chaîne est « suspension en base →
 * la lecture publique filtre → la page cesse de répondre ». Si un maillon
 * manquait, rien n'échouerait : le statut serait écrit, l'audit consigné,
 * l'écran afficherait « suspendu », et la page publique continuerait d'être
 * servie. TOUT dirait que le compte est coupé. Il ne le serait pas.
 *
 * C'est pourquoi le contrôle porte sur ce que la page RÉPOND, jamais sur ce que
 * la colonne contient.
 */

let admin: UtilisateurDeTest;
let autreAdmin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;
let jeton: string;

const IP = "empreinte-suspension-0123456789ab";
const MOTIF = "Contenu signale par un ayant droit, dossier 2026-114";

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("susp-admin");
  autreAdmin = await creerUtilisateur("susp-autre-admin");
  vendeur = await creerUtilisateur("susp-vendeur");

  await interroger(catalogue, "update public.profiles set role = 'admin' where id = any($1)", [
    [admin.profilId, autreAdmin.profilId],
  ]);

  const { data } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId, customer_label: "Client du vendeur" })
    .select("public_token")
    .single();
  jeton = (data as { public_token: string }).public_token;
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(autreAdmin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

describe("La coupure coupe vraiment", () => {
  test("CONTRE-TEST D'ABORD : la page publique répond AVANT toute suspension", async () => {
    // IL VIENT EN PREMIER, ET CE N'EST PAS UN DÉTAIL D'ORDRE. Sans lui,
    // « la page ne répond plus » serait vrai pour n'importe quelle raison — un
    // jeton mal recopié, une commande jamais créée, une fonction cassée. On
    // prouverait une coupure qui n'a jamais eu lieu.
    const avant = await lireCommandePublique(jeton);
    expect(avant, "la page ne répondait pas AVANT la suspension").not.toBeNull();
    expect(avant?.client).toBe("Client du vendeur");
  });

  test("après suspension, la page cesse d'être servie", async () => {
    const r = await suspendreCompte(
      admin.client,
      { profilId: vendeur.profilId, motif: MOTIF, confirmation: vendeur.email },
      vendeur.email,
      IP,
    );
    expect(r.statut, "la suspension a échoué").toBe("ok");

    expect(await lireCommandePublique(jeton), "la page répond encore").toBeNull();
  });

  test("et la réactivation la rétablit SUR LE MÊME LIEN", async () => {
    // Le `public_token` est immuable à vie : rien dans la suspension ne le
    // touche. Sans cette moitié, une fonction qui casserait tout passerait pour
    // une suspension qui fonctionne.
    const r = await reactiverCompte(admin.client, vendeur.profilId, MOTIF, IP);
    expect(r.statut).toBe("ok");

    const apres = await lireCommandePublique(jeton);
    expect(apres, "la réactivation n'a pas rétabli la page").not.toBeNull();
    expect(apres?.jeton, "le jeton a changé : le lien envoyé au client est mort").toBe(jeton);
  });
});

describe("Ce que la suspension exige", () => {
  test("un motif vide ou trop court est refusé", async () => {
    for (const motif of ["", "   ", "ok"]) {
      const r = await suspendreCompte(
        admin.client,
        { profilId: vendeur.profilId, motif, confirmation: vendeur.email },
        vendeur.email,
        IP,
      );
      expect(r.statut, `motif « ${motif} » accepté`).toBe("erreur");
    }
    // Et le compte n'a PAS été suspendu au passage : un refus doit tout annuler.
    expect(await lireCommandePublique(jeton)).not.toBeNull();
  });

  test("LA BASE refuse aussi le motif vide, sans passer par le module", async () => {
    /*
     * CE TEST EXISTE PARCE QUE LE PRÉCÉDENT NE PROUVAIT QU'UNE DES DEUX COUCHES.
     *
     * Falsification : le refus du motif vide retiré de `suspendre_compte`. La
     * suite est restée VERTE — la validation Zod du module refusait déjà en
     * amont, donc l'appel n'atteignait jamais la base. Le test mesurait la
     * couche applicative en croyant mesurer les deux.
     *
     * Or personne d'hostile n'appelle notre module TypeScript : on appelle
     * PostgREST. C'est donc le chemin qu'il faut éprouver, en contournant
     * délibérément la validation qui protège les appels honnêtes.
     */
    const { error } = await admin.client.rpc("suspendre_compte", {
      p_profil: vendeur.profilId,
      p_motif: "   ",
      p_ip_hash: IP,
    });

    expect(error, "la BASE accepte une suspension sans motif").not.toBeNull();
    expect(error?.code, "le code d'erreur fait partie du contrat").toBe("DL032");

    // Et le compte n'a PAS été suspendu au passage.
    expect(await lireCommandePublique(jeton)).not.toBeNull();
  });

  test("contre-test positif : LA BASE accepte un motif réel", async () => {
    // Sans lui, une fonction qui refuserait TOUT passerait le test précédent
    // tout en rendant la suspension impossible.
    const { error } = await admin.client.rpc("suspendre_compte", {
      p_profil: vendeur.profilId,
      p_motif: MOTIF,
      p_ip_hash: IP,
    });
    expect(error).toBeNull();
    expect(await lireCommandePublique(jeton), "la coupure n'a pas eu lieu").toBeNull();

    await reactiverCompte(admin.client, vendeur.profilId, MOTIF, IP);
  });

  test("un email de confirmation qui ne correspond pas bloque le geste", async () => {
    // LA GÊNE EST LE MÉCANISME. Cette confirmation n'existe pas pour rattraper
    // une faute de frappe mais pour FORCER À LIRE quel compte on suspend : une
    // case à cocher se coche sans regarder, un email se recopie en le regardant.
    const r = await suspendreCompte(
      admin.client,
      { profilId: vendeur.profilId, motif: MOTIF, confirmation: "quelqu-un-dautre@exemple.test" },
      vendeur.email,
      IP,
    );
    expect(r.statut).toBe("erreur");
    if (r.statut === "erreur") expect(r.motif).toBe("confirmation");
    expect(await lireCommandePublique(jeton)).not.toBeNull();
  });

  test("contre-test positif : la casse et les espaces ne bloquent pas", async () => {
    // Refuser « Alice@ » pour « alice@ » ferait douter de l'outil au lieu de
    // faire relire le compte — et un contrôle qu'on apprend à contourner par
    // agacement ne protège plus rien.
    const r = await suspendreCompte(
      admin.client,
      {
        profilId: vendeur.profilId,
        motif: MOTIF,
        confirmation: "  " + vendeur.email.toUpperCase() + "  ",
      },
      vendeur.email,
      IP,
    );
    expect(r.statut).toBe("ok");
    await reactiverCompte(admin.client, vendeur.profilId, MOTIF, IP);
  });
});

describe("Ce que la suspension refuse", () => {
  test("un administrateur ne se suspend pas lui-même", async () => {
    // Le geste serait irréversible depuis l'intérieur : il perdrait son propre
    // accès, et plus personne ne pourrait le lui rendre.
    const r = await suspendreCompte(
      admin.client,
      { profilId: admin.profilId, motif: MOTIF, confirmation: admin.email },
      admin.email,
      IP,
    );
    expect(r.statut).toBe("erreur");
    if (r.statut === "erreur") expect(r.motif).toBe("refuse");
  });

  test("un administrateur ne suspend pas un autre administrateur", async () => {
    // Un compte d'administration compromis pourrait sinon couper tous les autres
    // en quelques secondes, sans qu'il reste de chemin de récupération.
    const r = await suspendreCompte(
      admin.client,
      { profilId: autreAdmin.profilId, motif: MOTIF, confirmation: autreAdmin.email },
      autreAdmin.email,
      IP,
    );
    expect(r.statut).toBe("erreur");
    if (r.statut === "erreur") expect(r.motif).toBe("refuse");

    const lignes = await interroger<{ status: string }>(
      catalogue,
      "select status from public.profiles where id = $1",
      [autreAdmin.profilId],
    );
    expect(lignes[0]?.status).toBe("active");
  });

  test("un vendeur ne suspend personne, et n'apprend pas que la surface existe", async () => {
    const r = await suspendreCompte(
      vendeur.client,
      { profilId: admin.profilId, motif: MOTIF, confirmation: admin.email },
      admin.email,
      IP,
    );
    expect(r.statut).toBe("erreur");
    // « introuvable », jamais « interdit » : la distinction apprendrait qu'il y a
    // quelque chose ici.
    if (r.statut === "erreur") expect(r.motif).toBe("introuvable");
  });

  test("un vendeur ne peut pas non plus se réactiver après coup", async () => {
    await suspendreCompte(
      admin.client,
      { profilId: vendeur.profilId, motif: MOTIF, confirmation: vendeur.email },
      vendeur.email,
      IP,
    );

    const r = await reactiverCompte(vendeur.client, vendeur.profilId, MOTIF, IP);
    expect(r.statut).toBe("erreur");

    const lignes = await interroger<{ status: string }>(
      catalogue,
      "select status from public.profiles where id = $1",
      [vendeur.profilId],
    );
    expect(lignes[0]?.status, "un suspendu s'est réactivé lui-même").toBe("suspended");

    await reactiverCompte(admin.client, vendeur.profilId, MOTIF, IP);
  });
});

describe("Ce que la suspension laisse dans le journal", () => {
  test("le motif est consigné EN CLAIR, avec le compte visé", async () => {
    const marqueur = "Motif distinctif " + Date.now();
    await suspendreCompte(
      admin.client,
      { profilId: vendeur.profilId, motif: marqueur, confirmation: vendeur.email },
      vendeur.email,
      IP,
    );

    const lignes = await interroger<{ payload: { motif?: string }; target_email: string }>(
      catalogue,
      `select payload, target_email from public.admin_audit_log
       where action = 'compte.suspension' order by occurred_at desc limit 1`,
    );

    // C'est la pièce qu'on demanderait en cas de litige : la replier derrière un
    // détail que personne n'ouvre reviendrait à ne pas l'avoir.
    expect(lignes[0]?.payload.motif).toBe(marqueur);
    expect(lignes[0]?.target_email).toBe(vendeur.email);

    await reactiverCompte(admin.client, vendeur.profilId, MOTIF, IP);
  });

  test("une suspension REFUSÉE ne laisse aucune trace de suspension", async () => {
    // L'audit précède l'écriture mais suit les refus : consigner une suspension
    // qui n'a pas eu lieu ferait chercher un effet inexistant, et le journal
    // cesserait de décrire la réalité.
    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where action = 'compte.suspension'",
    );

    await suspendreCompte(
      admin.client,
      { profilId: admin.profilId, motif: MOTIF, confirmation: admin.email },
      admin.email,
      IP,
    );

    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*) as n from public.admin_audit_log where action = 'compte.suspension'",
    );
    expect(Number(apres[0]?.n)).toBe(Number(avant[0]?.n));
  });

  test("la réactivation est tracée elle aussi", async () => {
    // Sans elle, un compte reviendrait en service sans que rien ne dise qui l'a
    // décidé — et c'est la moitié de l'histoire qu'on chercherait justement.
    await suspendreCompte(
      admin.client,
      { profilId: vendeur.profilId, motif: MOTIF, confirmation: vendeur.email },
      vendeur.email,
      IP,
    );
    await reactiverCompte(admin.client, vendeur.profilId, "Retrait du signalement, dossier clos", IP);

    const lignes = await interroger<{ payload: { motif?: string } }>(
      catalogue,
      `select payload from public.admin_audit_log
       where action = 'compte.reactivation' order by occurred_at desc limit 1`,
    );
    expect(lignes[0]?.payload.motif).toBe("Retrait du signalement, dossier clos");
  });
});

import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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

/**
 * LES E-MAILS DE SUIVI DU CLIENT FINAL, EN BASE (migration 188).
 *
 * Décision de Wassim du 23/09/2026 : le CLIENT s'inscrit lui-même sur sa page et
 * confirme par e-mail ; trois e-mails au plus (expédié, en transit, livré). Ce
 * que la base doit tenir, quoi que fasse l'application :
 *
 * - l'adresse n'entre QUE par la confirmation du client — plus jamais par le
 *   vendeur, qui pouvait l'écrire pour n'importe qui (relais de spam) ;
 * - un lien archivé, bloqué ou inconnu ne sert à rien, et rend le même vide ;
 * - chaque étape n'est annoncée qu'une fois, même sous deux passages concurrents ;
 * - la désinscription passe par un jeton DISTINCT du jeton public.
 */

let vendeur: UtilisateurDeTest;
let catalogue: Client;
const service = clientService();

type Commande = { id: string; public_token: string; unsubscribe_token: string };
let commande: Commande;
let archivee: Commande;
let bloquee: Commande;

function nouveauJeton(): { jeton: string; hash: string } {
  const jeton = randomBytes(32).toString("base64url");
  return { jeton, hash: createHash("sha256").update(jeton).digest("hex") };
}

async function creerCommande(etiquette: string): Promise<Commande> {
  const { data, error } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId, customer_label: etiquette })
    .select("id")
    .single();
  if (error !== null) throw new Error("commande : " + error.message);
  const lignes = await interroger<Commande>(
    catalogue,
    "select id, public_token, unsubscribe_token from public.orders where id = $1",
    [data.id],
  );
  return lignes[0] as Commande;
}

async function adresseDe(id: string): Promise<string | null> {
  const l = await interroger<{ notify_email: string | null }>(
    catalogue,
    "select notify_email from public.orders where id = $1",
    [id],
  );
  return l[0]?.notify_email ?? null;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("notif-vendeur");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; ce vendeur en crée 8, et ce test mesure les demandes
  // d'e-mail du client final (bornes par commande et par boutique, qui ne
  // dépendent pas du plan), pas le quota.
  await passerEnPro(vendeur);
  commande = await creerCommande("notif principale");
  archivee = await creerCommande("notif archivee");
  bloquee = await creerCommande("notif bloquee");
  await interroger(catalogue, "update public.orders set archived_at = now() where id = $1", [archivee.id]);
  await interroger(catalogue, "update public.orders set admin_blocked_at = now() where id = $1", [bloquee.id]);
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
}, 60_000);

describe("L'adresse du client n'entre que par sa confirmation", () => {
  test("⚠️ LE VENDEUR NE PEUT PLUS POSER L'ADRESSE À LA CRÉATION", async () => {
    const { error } = await vendeur.client
      .from("orders")
      .insert({ shop_id: vendeur.shopId, customer_label: "spam", notify_email: "victime@exemple.test" });
    expect(error, "un vendeur a posé l'adresse d'un tiers").not.toBeNull();
  });

  test("⚠️ NI PAR UNE MISE À JOUR", async () => {
    await vendeur.client.from("orders").update({ notify_email: "victime@exemple.test" }).eq("id", commande.id);
    expect(await adresseDe(commande.id)).toBeNull();
  });

  test("⚠️ AUCUNE FONCTION N'EST APPELABLE PAR anon NI PAR UN VENDEUR", async () => {
    const { hash } = nouveauJeton();
    for (const client of [clientAnonyme(), vendeur.client]) {
      const r = await client.rpc("demander_notification", {
        p_jeton_public: commande.public_token,
        p_email: "a@exemple.test",
        p_token_hash: hash,
      });
      expect(r.error, "demander_notification ouverte hors du serveur").not.toBeNull();
      expect((await client.rpc("confirmer_notification", { p_token_hash: hash })).error).not.toBeNull();
      expect((await client.rpc("desabonner_notification", { p_jeton: commande.unsubscribe_token })).error).not.toBeNull();
      expect((await client.rpc("notifications_a_envoyer", { p_limite: 10 })).error).not.toBeNull();
    }
  });
});

describe("La demande, la confirmation, la désinscription", () => {
  test("CONTRE-TEST : une demande sur un lien valide rend la langue de la page", async () => {
    const { hash } = nouveauJeton();
    const { data, error } = await service.rpc("demander_notification", {
      p_jeton_public: commande.public_token,
      p_email: "  Client@Exemple.test ",
      p_token_hash: hash,
    });
    expect(error, error?.message).toBeNull();
    expect((data as { langue: string }[])[0]?.langue).toMatch(/^(fr|en|zh-CN)$/);
    // Rien n'est posé tant que le client n'a pas confirmé.
    expect(await adresseDe(commande.id)).toBeNull();
  });

  test("⚠️ UN LIEN INCONNU, ARCHIVÉ OU BLOQUÉ REND LE MÊME VIDE", async () => {
    for (const jeton of ["jeton-qui-n-existe-pas-du-tout", archivee.public_token, bloquee.public_token]) {
      const { data, error } = await service.rpc("demander_notification", {
        p_jeton_public: jeton,
        p_email: "a@exemple.test",
        p_token_hash: nouveauJeton().hash,
      });
      expect(error).toBeNull();
      expect(data, jeton.slice(0, 6)).toEqual([]);
    }
  });

  test("la confirmation pose l'adresse (normalisée) et marque l'étape COURANTE comme annoncée", async () => {
    await interroger(catalogue, "update public.orders set status = 'expedie' where id = $1", [commande.id]);
    const { hash } = nouveauJeton();
    await service.rpc("demander_notification", {
      p_jeton_public: commande.public_token,
      p_email: "client@exemple.test",
      p_token_hash: hash,
    });
    const { data } = await service.rpc("confirmer_notification", { p_token_hash: hash });
    expect((data as unknown[]).length).toBe(1);
    expect(await adresseDe(commande.id)).toBe("client@exemple.test");
    // S'inscrire sur un colis déjà expédié n'envoie pas « expédié » dans la minute.
    const { data: aEnvoyer } = await service.rpc("notifications_a_envoyer", { p_limite: 200 });
    expect((aEnvoyer as { order_id: string }[]).map((l) => l.order_id)).not.toContain(commande.id);
  });

  test("⚠️ UN JETON DE CONFIRMATION NE SERT QU'UNE FOIS, ET EXPIRE", async () => {
    const { hash } = nouveauJeton();
    await service.rpc("demander_notification", {
      p_jeton_public: commande.public_token,
      p_email: "autre@exemple.test",
      p_token_hash: hash,
    });
    await interroger(catalogue, "update public.notification_requests set expires_at = now() - interval '1 minute' where token_hash = $1", [hash]);
    const { data } = await service.rpc("confirmer_notification", { p_token_hash: hash });
    expect(data).toEqual([]);
    expect(await adresseDe(commande.id), "un jeton expiré a changé l'adresse").toBe("client@exemple.test");
  });

  test("l'étape SUIVANTE est à annoncer, UNE fois — la réservation est un verrou", async () => {
    await interroger(catalogue, "update public.orders set status = 'en_transit' where id = $1", [commande.id]);
    const { data } = await service.rpc("notifications_a_envoyer", { p_limite: 200 });
    const ligne = (data as { order_id: string; etape: string; email: string; jeton_desinscription: string }[]).find(
      (l) => l.order_id === commande.id,
    );
    expect(ligne?.etape).toBe("en_transit");
    expect(ligne?.email).toBe("client@exemple.test");
    expect(ligne?.jeton_desinscription).toBe(commande.unsubscribe_token);

    const premiere = await service.rpc("reserver_notification", { p_order: commande.id, p_etape: "en_transit" });
    const seconde = await service.rpc("reserver_notification", { p_order: commande.id, p_etape: "en_transit" });
    expect(premiere.data).toBe(true);
    expect(seconde.data, "deux passages ont réservé la même étape").toBe(false);

    // Un envoi échoué REND la réservation : l'e-mail repartira au passage suivant.
    await service.rpc("rendre_notification", { p_order: commande.id, p_etape: "en_transit" });
    expect((await service.rpc("reserver_notification", { p_order: commande.id, p_etape: "en_transit" })).data).toBe(true);
  });

  test("⚠️ TROIS DEMANDES PAR HEURE ET PAR COMMANDE, PAS UNE DE PLUS", async () => {
    const fraiche = await creerCommande("notif quota");
    const resultats: (string | null)[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { error } = await service.rpc("demander_notification", {
        p_jeton_public: fraiche.public_token,
        p_email: "q@exemple.test",
        p_token_hash: nouveauJeton().hash,
      });
      resultats.push(error?.code ?? null);
    }
    expect(resultats).toEqual([null, null, null, "DL074"]);
  });

  /*
   * ⚠️ UN RELAIS DE SPAM — audit ECC du 24/09/2026. Trois demandes par HEURE et
   * par commande laissaient 72 e-mails de confirmation par jour et par lien, vers
   * des adresses au choix de qui détient le lien — et le NOM DE BOUTIQUE, choisi
   * par le vendeur, est dans l'e-mail. Un compte gratuit a quinze liens : ~1 000
   * e-mails par jour depuis NOTRE domaine d'envoi. La migration 194 compte sur
   * 24 h, et borne aussi la boutique entière.
   */
  test("⚠️ LES TROIS DEMANDES D'UNE COMMANDE SE COMPTENT SUR 24 H, PAS SUR UNE HEURE", async () => {
    const fraiche = await creerCommande("notif 24h");
    for (let i = 0; i < 3; i += 1) {
      await interroger(
        catalogue,
        "insert into public.notification_requests (order_id, email, token_hash, created_at) values ($1, 'v@exemple.test', $2, now() - interval '5 hours')",
        [fraiche.id, nouveauJeton().hash],
      );
    }
    const { error } = await service.rpc("demander_notification", {
      p_jeton_public: fraiche.public_token,
      p_email: "q@exemple.test",
      p_token_hash: nouveauJeton().hash,
    });
    expect(error?.code).toBe("DL074");
  });

  test("CONTRE-TEST : des demandes de plus de 24 h ne comptent plus", async () => {
    const fraiche = await creerCommande("notif 25h");
    for (let i = 0; i < 3; i += 1) {
      await interroger(
        catalogue,
        "insert into public.notification_requests (order_id, email, token_hash, created_at) values ($1, 'v@exemple.test', $2, now() - interval '25 hours')",
        [fraiche.id, nouveauJeton().hash],
      );
    }
    const { error } = await service.rpc("demander_notification", {
      p_jeton_public: fraiche.public_token,
      p_email: "q@exemple.test",
      p_token_hash: nouveauJeton().hash,
    });
    expect(error).toBeNull();
  });

  test("⚠️ LA BOUTIQUE ENTIÈRE EST BORNÉE : multiplier les commandes ne multiplie pas le spam", async () => {
    // Soixante demandes récentes sur une commande de la boutique : une commande
    // NEUVE, jamais sollicitée, doit être refusée quand même.
    const seme = await creerCommande("notif boutique");
    await interroger(
      catalogue,
      `insert into public.notification_requests (order_id, email, token_hash, created_at)
       select $1, 'v@exemple.test', encode(extensions.gen_random_bytes(32), 'hex'), now() - interval '2 hours'
       from generate_series(1, 60)`,
      [seme.id],
    );
    const neuve = await creerCommande("notif boutique neuve");
    const { error } = await service.rpc("demander_notification", {
      p_jeton_public: neuve.public_token,
      p_email: "q@exemple.test",
      p_token_hash: nouveauJeton().hash,
    });
    await interroger(catalogue, "delete from public.notification_requests where order_id = $1", [seme.id]);
    expect(error?.code).toBe("DL075");
  });

  test("la désinscription efface l'adresse, et la commande n'écrit plus à personne", async () => {
    const { data } = await service.rpc("desabonner_notification", { p_jeton: commande.unsubscribe_token });
    expect((data as unknown[]).length).toBe(1);
    expect(await adresseDe(commande.id)).toBeNull();
    await interroger(catalogue, "update public.orders set status = 'livre' where id = $1", [commande.id]);
    const { data: aEnvoyer } = await service.rpc("notifications_a_envoyer", { p_limite: 200 });
    expect((aEnvoyer as { order_id: string }[]).map((l) => l.order_id)).not.toContain(commande.id);
  });

  test("⚠️ LE JETON PUBLIC NE DÉSINSCRIT PERSONNE", async () => {
    // Deux pouvoirs distincts : avoir le lien de la page ne donne pas celui de
    // couper les e-mails du client, et inversement.
    const { data } = await service.rpc("desabonner_notification", { p_jeton: commande.public_token });
    expect(data).toEqual([]);
  });
});

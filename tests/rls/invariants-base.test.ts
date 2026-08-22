import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LES INVARIANTS QUI NE TENAIENT QU'À L'INSERT.
 *
 * Un audit par exécution a éprouvé un par un les invariants que le brief déclare
 * « vivant dans la base ». La plupart tenaient. Ceux qui ne tenaient pas
 * partageaient tous le même motif, et il vaut d'être nommé :
 *
 *   LÀ OÙ LA BASE TIENT, ELLE TIENT À L'INSERT ET À LA LIGNE.
 *   Les trous étaient à l'UPDATE, à la relation inverse, et au niveau
 *   instruction.
 *
 * Et chacun était bouché par une ABSENCE — un droit qu'on n'avait pas accordé,
 * un chemin de code qu'on n'avait pas encore écrit. C'est la définition de
 * L-029 : si la phrase juste est « ce serait ouvert si quelqu'un ajoutait X »,
 * la protection est en sursis.
 *
 * CES CONTRÔLES EMPLOIENT LA CONNEXION DE CATALOGUE, donc les pleins droits.
 * C'est délibéré : éprouver ces règles sous le rôle du vendeur ne prouverait
 * que l'existence du privilège de colonne — c'est-à-dire l'absence qu'on
 * cherche justement à ne plus faire porter la protection.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

async function creerCommande(u: UtilisateurDeTest): Promise<string> {
  const l = await interroger<{ id: string }>(
    catalogue,
    "insert into public.orders (shop_id) values ($1) returning id",
    [u.shopId],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

async function ajouterMedia(commande: string, position: number): Promise<string> {
  const prefixe = await interroger<{ p: string }>(
    catalogue,
    "select public.prefixe_media_attendu($1) as p",
    [commande],
  );
  const l = await interroger<{ id: string }>(
    catalogue,
    `insert into public.order_media (order_id, type, cle, taille_octets, position)
     values ($1, 'photo', $2, 100, $3) returning id`,
    [commande, `${String(prefixe[0]?.p)}${position}.jpg`, position],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("média non créé");
  return id;
}

/** Rend le code SQLSTATE d'un refus, ou `null` si la base a accepté. */
async function refus(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await interroger(catalogue, sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "inconnu";
  }
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("inv-alice");
  bob = await creerUtilisateur("inv-bob");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Un média est ancré à sa commande", () => {
  test("il ne peut pas changer de commande, même vers une des siennes", async () => {
    // MESURÉ AVANT CORRECTION : un `update order_id` déplaçait un média vers
    // une commande déjà pleine (21 médias) et lui faisait franchir la frontière
    // du vendeur EN GARDANT une clé sous le préfixe de l'ancien. La page
    // publique du destinataire aurait servi un objet du préfixe d'un autre.
    const source = await creerCommande(alice);
    const cible = await creerCommande(alice);
    const media = await ajouterMedia(source, 0);

    expect(
      await refus("update public.order_media set order_id = $2 where id = $1", [media, cible]),
      "un média a changé de commande",
    ).toBe("DL029");
  });

  test("il ne peut pas changer de type", async () => {
    // Le plafond de 3 vidéos était contournable en insérant des photos puis en
    // les basculant : mesuré à 6 vidéos sur une commande plafonnée à 3.
    const commande = await creerCommande(alice);
    const media = await ajouterMedia(commande, 0);

    expect(
      await refus("update public.order_media set type = 'video' where id = $1", [media]),
      "un média a changé de type",
    ).toBe("DL029");
  });

  test("contre-test positif : ce qui doit rester modifiable l'est", async () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. La position
    // et la vignette changent légitimement — le réordonnancement et l'arrivée
    // différée de la vignette en dépendent.
    const commande = await creerCommande(alice);
    const media = await ajouterMedia(commande, 0);

    expect(
      await refus("update public.order_media set position = 5 where id = $1", [media]),
      "le réordonnancement est cassé",
    ).toBeNull();
  });
});

describe("La couverture ne survit pas au média qu'elle désigne", () => {
  test("supprimer le média de couverture dénoue le pointeur", async () => {
    // MESURÉ AVANT CORRECTION, sous le rôle et les droits RÉELS du vendeur :
    // `pointeur_reste = true, cible_existe = 0`. C'était le seul défaut
    // d'invariant atteignable sans privilège particulier.
    const commande = await creerCommande(alice);
    const media = await ajouterMedia(commande, 0);

    await interroger(catalogue, "update public.orders set cover_media_id = $2 where id = $1", [
      commande,
      media,
    ]);
    await interroger(catalogue, "delete from public.order_media where id = $1", [media]);

    const apres = await interroger<{ cover: string | null }>(
      catalogue,
      "select cover_media_id as cover from public.orders where id = $1",
      [commande],
    );
    expect(apres[0]?.cover, "la commande garde un pointeur vers un média inexistant").toBeNull();
  });
});

describe("Le journal d'audit résiste aussi au TRUNCATE", () => {
  test("vider la table est refusé", async () => {
    // MESURÉ AVANT CORRECTION : `truncate` a effacé 1 330 lignes sans un mot,
    // sous `postgres` comme sous `service_role`. Le déclencheur append-only est
    // `FOR EACH ROW` — `TRUNCATE` ne déclenche aucun déclencheur de ligne.
    expect(
      await refus("truncate public.admin_audit_log"),
      "le journal d'audit a été vidé : c'est la pièce qui fonde notre statut d'hébergeur",
    ).toBe("DL030");
  });
});

describe("Un colis et sa commande appartiennent au même vendeur", () => {
  test("le croisement est refusé", async () => {
    const commandeAlice = await creerCommande(alice);
    const colisBob = await interroger<{ id: string }>(
      catalogue,
      `insert into public.tracked_parcels (shop_id, tracking_number)
       values ($1, $2) returning id`,
      [bob.shopId, `CROISE-${Date.now()}`],
    );

    expect(
      await refus("insert into public.order_parcels (order_id, parcel_id) values ($1, $2)", [
        commandeAlice,
        colisBob[0]?.id,
      ]),
      "une commande a été reliée au colis d'un autre vendeur",
    ).toBe("DL043");
  });

  test("contre-test positif : le rattachement légitime passe", async () => {
    const commande = await creerCommande(alice);
    const colis = await interroger<{ id: string }>(
      catalogue,
      `insert into public.tracked_parcels (shop_id, tracking_number)
       values ($1, $2) returning id`,
      [alice.shopId, `LEGIT-${Date.now()}`],
    );

    expect(
      await refus("insert into public.order_parcels (order_id, parcel_id) values ($1, $2)", [
        commande,
        colis[0]?.id,
      ]),
      "le rattachement légitime est refusé",
    ).toBeNull();
  });
});

describe("Un jeton, un pouvoir", () => {
  test("les deux jetons ne peuvent pas devenir égaux", async () => {
    // Le jeton de désinscription circule dans des EMAILS. L'égaler au jeton
    // public transformerait un lien « je ne veux plus de messages » en accès
    // complet à la commande — définitivement, le jeton public étant immuable.
    const commande = await creerCommande(alice);

    const code = await refus(
      `select set_config('droplink.rotation_jeton', 'oui', true);
       update public.orders set unsubscribe_token = public_token where id = $1`,
      [commande],
    );
    expect(code, "les deux jetons ont pu être égalisés").not.toBeNull();
  });
});

describe("Toute rotation de jeton laisse sa trace", () => {
  test("même par un chemin détourné, la révocation est écrite", async () => {
    /*
     * MESURÉ AVANT CORRECTION : `set_config('droplink.rotation_jeton','oui')`
     * suivi d'un `update` réécrivait le jeton SANS écrire le moindre
     * `lien_revoque`. Le lien du client cessait de fonctionner, et rien nulle
     * part ne disait pourquoi ni quand.
     *
     * Ce chemin n'est pas atteignable par PostgREST — les clients n'exécutent
     * pas de SQL libre. Il passe donc par une connexion directe, c'est-à-dire
     * par NOUS. Et c'est pour cela qu'il fallait le fermer : la trace sert à
     * répondre « pourquoi ce lien ne marche plus », et la réponse la plus
     * probable est « quelqu'un chez nous a lancé quelque chose ».
     *
     * On ne ferme pas la porte, on la trace : chercher à empêcher `set_config`
     * reviendrait à courir après tous les moyens de le poser.
     */
    const commande = await creerCommande(alice);

    const avant = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.order_events where order_id = $1 and type = 'lien_revoque'",
      [commande],
    );
    expect(Number(avant[0]?.n), "la commande porte déjà une révocation").toBe(0);

    // Deux ordres séparés : `set_config(..., true)` est local à la TRANSACTION,
    // et une requête paramétrée n'en accepte qu'un. On ouvre donc la transaction
    // à la main — c'est aussi ce que ferait un script de maintenance.
    await interroger(catalogue, "begin");
    await interroger(catalogue, "select set_config('droplink.rotation_jeton', 'oui', true)");
    await interroger(
      catalogue,
      "update public.orders set public_token = public.generer_jeton_public() where id = $1",
      [commande],
    );
    await interroger(catalogue, "commit");

    const apres = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.order_events where order_id = $1 and type = 'lien_revoque'",
      [commande],
    );
    expect(
      Number(apres[0]?.n),
      "un jeton a tourné sans laisser de trace : le client perd son lien sans explication",
    ).toBe(1);
  });

  test("contre-test positif : une écriture qui NE touche pas le jeton n'écrit rien", async () => {
    // Sans lui, un déclencheur qui tracerait à chaque `update` passerait le test
    // précédent — et l'historique d'une commande se remplirait de révocations
    // imaginaires, ce qui est pire qu'un historique vide.
    const commande = await creerCommande(alice);
    await interroger(catalogue, "update public.orders set product_ref = 'x' where id = $1", [
      commande,
    ]);

    const l = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.order_events where order_id = $1 and type = 'lien_revoque'",
      [commande],
    );
    expect(Number(l[0]?.n), "une modification anodine a produit une révocation").toBe(0);
  });

  test("la révocation n'est PAS écrite deux fois par le chemin normal", async () => {
    // `regenerer_jeton_public` écrivait la trace elle-même. Deux points
    // d'émission pour un seul fait rendent le double comptage inévitable, et
    // l'historique est précisément l'endroit où une ligne en double se lit comme
    // deux révocations.
    const commande = await creerCommande(alice);
    // Par le CLIENT D'ALICE : `regenerer_jeton_public` lit `mon_shop_id()`, donc
    // exige une session réelle. L'appeler depuis la connexion de catalogue
    // n'éprouverait pas le chemin que le vendeur emprunte.
    const { error } = await alice.client.rpc("regenerer_jeton_public", { p_order_id: commande });
    expect(error, `rotation refusée : ${error?.message}`).toBeNull();

    const l = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.order_events where order_id = $1 and type = 'lien_revoque'",
      [commande],
    );
    expect(Number(l[0]?.n), "la révocation est écrite deux fois").toBe(1);
  });
});

describe("Une commande ne s'efface pas", () => {
  test("le vendeur ne peut pas supprimer les siennes", async () => {
    /*
     * Le produit n'a jamais supprimé de commande : il ARCHIVE. Le droit était
     * donc accordé à personne — au sens où aucun code ne s'en sert — mais
     * accordé quand même.
     *
     * Ce qu'il permettait : un compte pouvait faire redescendre sa propre courbe
     * d'usage. Les commandes créées sont une MÉTRIQUE DE VERDICT de la phase de
     * validation ; les rendre effaçables par celui qu'elles mesurent, c'est
     * rendre le verdict négociable. Et la disparition ne laisserait aucune
     * trace : `order_events` part en cascade avec la commande.
     *
     * Une protection qui tient à ce que personne n'ait encore écrit l'appel n'est
     * pas une protection — et un bouton « supprimer » est ce qu'on ajoute sans y
     * penser.
     */
    const commande = await creerCommande(alice);

    const { error } = await alice.client.from("orders").delete().eq("id", commande);

    const { data: reste } = await alice.client.from("orders").select("id").eq("id", commande);
    expect(
      (reste ?? []).length,
      `la commande a été supprimée par son vendeur (erreur : ${error?.message ?? "aucune"})`,
    ).toBe(1);
  });

  test("le droit est retiré DANS LE CATALOGUE, pas seulement par une policy", async () => {
    // Une policy retirée laisse le droit de table : PostgREST répondrait alors
    // « 0 ligne supprimée » au lieu d'un refus, ce qui se lit comme un succès.
    // Le droit lui-même ne s'écrit nulle part dans le code — il faut interroger
    // le catalogue.
    const l = await interroger<{ n: string }>(
      catalogue,
      `select count(*)::text as n from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'orders'
          and grantee = 'authenticated' and privilege_type = 'DELETE'`,
    );
    expect(Number(l[0]?.n), "`authenticated` détient encore DELETE sur orders").toBe(0);
  });

  test("contre-test positif : le vendeur peut toujours ARCHIVER", async () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. Archiver est
    // le geste réel du produit : le casser en fermant la suppression serait
    // remplacer un défaut par une panne.
    const commande = await creerCommande(alice);
    const { error } = await alice.client
      .from("orders")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", commande);

    expect(error, `l'archivage est cassé : ${error?.message}`).toBeNull();
  });
});

describe("Un média EST du contenu réel", () => {
  test("déposer un média marque le premier contenu de la commande", async () => {
    /*
     * DÉFAUT CRITIQUE MESURÉ AVANT CORRECTION. La migration 006 affirmait « les
     * médias sont traités par leur propre déclencheur » — ce déclencheur
     * n'existait pas. Une commande portant une photo restait à
     * `first_content_at = null`, donc `commandes_reelles = 0`.
     *
     * Autrement dit : le fournisseur qui dépose vingt photos QC et envoie son
     * lien — c'est-à-dire qui fait exactement ce que le produit promet — ne
     * comptait pas dans le « signal roi » de la phase de validation.
     */
    const commande = await creerCommande(alice);

    const avant = await interroger<{ c: string | null }>(
      catalogue,
      "select first_content_at as c from public.orders where id = $1",
      [commande],
    );
    expect(avant[0]?.c, "un brouillon vide compte déjà comme du contenu").toBeNull();

    await ajouterMedia(commande, 0);

    const apres = await interroger<{ c: string | null }>(
      catalogue,
      "select first_content_at as c from public.orders where id = $1",
      [commande],
    );
    expect(apres[0]?.c, "un média déposé ne compte pas comme du contenu réel").not.toBeNull();
  });

  test("le premier contenu ne se repose pas au second média", async () => {
    // Sans la condition `is null`, chaque média redaterait la commande, et
    // l'écart entre ouverture de l'éditeur et création — l'information qu'on
    // cherche — disparaîtrait.
    const commande = await creerCommande(alice);
    await ajouterMedia(commande, 0);

    const premier = await interroger<{ c: string }>(
      catalogue,
      "select first_content_at as c from public.orders where id = $1",
      [commande],
    );

    await ajouterMedia(commande, 1);

    const second = await interroger<{ c: string }>(
      catalogue,
      "select first_content_at as c from public.orders where id = $1",
      [commande],
    );
    expect(second[0]?.c, "le premier contenu a été redaté").toEqual(premier[0]?.c);
  });
});

describe("Qui a arbitré le contrôle qualité", () => {
  test("une écriture directe du vendeur est attribuée au VENDEUR", async () => {
    const commande = await creerCommande(alice);
    await interroger(catalogue, "update public.orders set qc_status = 'approuve' where id = $1", [
      commande,
    ]);

    const l = await interroger<{ par: string | null }>(
      catalogue,
      "select qc_decide_par as par from public.orders where id = $1",
      [commande],
    );
    expect(l[0]?.par, "l'auteur de l'arbitrage n'est pas enregistré").toBe("vendeur");
  });

  test("l'arbitrage du client, lui, est attribué au CLIENT", async () => {
    // Contre-test positif : sans lui, un déclencheur qui écrirait « vendeur »
    // dans TOUS les cas passerait le test précédent sans rien prouver.
    const commande = await creerCommande(alice);
    const jeton = await interroger<{ j: string }>(
      catalogue,
      "select public_token as j from public.orders where id = $1",
      [commande],
    );

    await interroger(catalogue, "select public.arbitrer_qc($1, 'approuve', null)", [
      jeton[0]?.j ?? "",
    ]);

    const l = await interroger<{ par: string | null }>(
      catalogue,
      "select qc_decide_par as par from public.orders where id = $1",
      [commande],
    );
    expect(l[0]?.par, "la décision du client est attribuée au vendeur").toBe("client");
  });
});

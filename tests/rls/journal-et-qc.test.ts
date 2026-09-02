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
import { TYPES_EVENEMENT, TYPES_VENDEUR } from "@/lib/commandes/journal";
import { revoquerLien, type ClientCycle } from "@/lib/commandes/cycle";

/**
 * LE JOURNAL ET L'ARBITRAGE QC — ce que cette suite établit.
 *
 * Le journal est la pièce qu'on produirait en cas de désaccord : à quelle date
 * un lien a cessé de fonctionner, ce que le client a répondu sur ses photos. Ce
 * qui compte n'est donc pas seulement qu'il s'écrive, mais que PERSONNE ne
 * puisse y écrire ce qu'il n'a pas fait — et le seul cas qui puisse être
 * contesté est l'arbitrage QC, c'est-à-dire précisément celui qu'un vendeur
 * aurait intérêt à fabriquer.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commande: string;
let jeton: string;

async function evenements(orderId = commande): Promise<{ type: string; actor: string }[]> {
  return interroger<{ type: string; actor: string }>(
    catalogue,
    "select type, actor from public.order_events where order_id = $1 order by occurred_at",
    [orderId],
  );
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("journal-alice");
  bob = await creerUtilisateur("journal-bob");

  const { data, error } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId, customer_label: "Yanis" })
    .select("id, public_token")
    .single();

  expect(error, `création impossible : ${error?.message}`).toBeNull();
  commande = (data as { id: string }).id;
  jeton = (data as { public_token: string }).public_token;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Le vocabulaire du journal", () => {
  /**
   * INVENTORIER PLUTÔT QUE SÉLECTIONNER, et échouer DANS LES DEUX SENS.
   *
   * Un type présent côté code mais absent en base fait échouer l'écriture — et
   * la transaction étant partagée, annule la mutation entière. Un type présent
   * en base mais absent du code est une valeur que plus personne n'écrit : le
   * journal promet alors une information qu'il ne contiendra jamais.
   */
  test("le catalogue TypeScript et la contrainte en base disent la MÊME chose", async () => {
    const lignes = await interroger<{ definition: string }>(
      catalogue,
      `select pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = 'order_events'
         and c.conname = 'order_events_type_connu'`,
    );
    expect(lignes, "la contrainte de type est absente : la sonde vise à côté").toHaveLength(1);

    const definition = lignes[0]?.definition ?? "";
    const enBase = [...definition.matchAll(/'([a-z_]+)'::text/g)]
      .map((m) => m[1] ?? "")
      .sort();

    expect(enBase.length, "aucun type extrait : la sonde n'inspecte rien").toBeGreaterThan(0);
    expect(enBase).toEqual([...TYPES_EVENEMENT].sort());
  });

  test("ce qu'un vendeur peut écrire est STRICTEMENT inclus dans ce qui existe", () => {
    const tous = new Set<string>(TYPES_EVENEMENT);
    for (const type of TYPES_VENDEUR) {
      expect(tous.has(type), `${type} n'existe pas au journal`).toBe(true);
    }
    // Et l'inclusion est STRICTE : si les deux listes devenaient égales, un
    // vendeur pourrait écrire l'arbitrage de son client.
    expect(TYPES_VENDEUR.length).toBeLessThan(TYPES_EVENEMENT.length);
  });
});

describe("Ce qu'un vendeur peut écrire", () => {
  test("il journalise ses propres actions, et l'acteur est « vendeur »", async () => {
    const { error } = await alice.client.rpc("journaliser_vendeur", {
      p_order_id: commande,
      p_type: "commande_modifiee",
      p_payload: { champ: "customer_label" },
    });
    expect(error, `écriture refusée : ${error?.message}`).toBeNull();

    const lignes = await evenements();
    expect(lignes.length, "rien n'a été écrit : la sonde n'inspecte rien").toBeGreaterThan(0);
    expect(lignes.at(-1)?.type).toBe("commande_modifiee");
    // L'acteur n'est pas un argument : il est écrit en dur par la base. Un
    // acteur fourni par l'appelant est un acteur que l'appelant choisit.
    expect(lignes.at(-1)?.actor).toBe("vendeur");
  });

  test("il NE PEUT PAS écrire l'arbitrage de son client", async () => {
    // Le point qui compte de toute la suite : l'arbitrage QC est la seule ligne
    // contestable du journal, donc la seule qu'un vendeur aurait intérêt à
    // fabriquer.
    for (const type of ["qc_approuve", "qc_refuse", "lien_revoque"] as const) {
      const { error } = await alice.client.rpc("journaliser_vendeur", {
        p_order_id: commande,
        p_type: type,
        p_payload: {},
      });
      expect(error, `un vendeur a pu écrire « ${type} »`).not.toBeNull();
    }
  });

  test("il ne peut pas écrire dans le journal d'un autre vendeur", async () => {
    const { error } = await bob.client.rpc("journaliser_vendeur", {
      p_order_id: commande,
      p_type: "commande_modifiee",
      p_payload: {},
    });
    expect(error, "un vendeur a écrit dans le journal d'un autre").not.toBeNull();
  });

  test("il ne peut pas écrire dans la table directement, ni corriger le passé", async () => {
    // Append-only : un journal qu'on peut corriger n'est pas un journal.
    const insertion = await alice.client
      .from("order_events")
      .insert({ order_id: commande, type: "qc_approuve", actor: "client" });
    expect(insertion.error, "insertion directe autorisée").not.toBeNull();

    const suppression = await alice.client.from("order_events").delete().eq("order_id", commande);
    const { data: restantes } = await alice.client
      .from("order_events")
      .select("id")
      .eq("order_id", commande);
    expect(
      (restantes ?? []).length,
      `la suppression a effacé le journal (erreur : ${suppression.error?.message ?? "aucune"})`,
    ).toBeGreaterThan(0);
  });

  test("un vendeur ne lit QUE son propre journal", async () => {
    const sien = await alice.client.from("order_events").select("id").eq("order_id", commande);
    expect((sien.data ?? []).length, "le vendeur ne voit pas son journal").toBeGreaterThan(0);

    const autre = await bob.client.from("order_events").select("id").eq("order_id", commande);
    expect((autre.data ?? []).length, "un vendeur lit le journal d'un autre").toBe(0);
  });
});

describe("L'arbitrage QC par le porteur du jeton", () => {
  async function arbitrer(
    jetonAppele: string,
    decision: string,
    commentaire = "",
  ): Promise<string | null> {
    const anonyme = clientAnonyme();
    const { data, error } = await anonyme.rpc("arbitrer_qc", {
      p_jeton: jetonAppele,
      p_decision: decision,
      p_commentaire: commentaire,
    });
    if (error !== null) return null;
    return (data as string | null) ?? null;
  }

  test("un visiteur SANS COMPTE approuve, et la commande le retient", async () => {
    expect(await arbitrer(jeton, "approuve", "Nickel, merci")).toBe("approuve");

    const { data } = await alice.client
      .from("orders")
      .select("qc_status")
      .eq("id", commande)
      .single();
    expect((data as { qc_status: string }).qc_status).toBe("approuve");

    const lignes = await evenements();
    expect(lignes.at(-1)?.type).toBe("qc_approuve");
    expect(lignes.at(-1)?.actor, "l'arbitrage n'est pas attribué au client").toBe("client");
  });

  test("il peut se raviser, et les DEUX décisions restent au journal", async () => {
    const avant = (await evenements()).length;
    expect(await arbitrer(jeton, "refuse", "Finalement la couture est de travers")).toBe("refuse");

    const apres = await evenements();
    expect(apres.length, "la seconde décision a écrasé la première").toBe(avant + 1);
    expect(apres.at(-1)?.type).toBe("qc_refuse");
  });

  test("le commentaire est retenu, et il est TRONQUÉ en base", async () => {
    // Borné en base et pas seulement à la saisie : la charge utile du journal
    // est contrainte, et un commentaire trop long ferait échouer l'arbitrage
    // ENTIER au lieu d'être raccourci.
    await arbitrer(jeton, "approuve", "x".repeat(5000));

    const lignes = await interroger<{ commentaire: string | null }>(
      catalogue,
      `select payload->>'commentaire' as commentaire
       from public.order_events
       where order_id = $1 order by occurred_at desc limit 1`,
      [commande],
    );
    expect(lignes[0]?.commentaire?.length, "le commentaire n'a pas été tronqué").toBe(1000);
  });

  test("une décision inventée est refusée", async () => {
    expect(await arbitrer(jeton, "peut_etre")).toBeNull();
    // Contre-test : la même mécanique accepte bien une décision valide.
    expect(await arbitrer(jeton, "approuve")).toBe("approuve");
  });

  test("un jeton inconnu n'arbitre rien, et n'écrit rien", async () => {
    const avant = (await evenements()).length;
    expect(await arbitrer("jeton-qui-nexiste-pas", "approuve")).toBeNull();
    expect((await evenements()).length).toBe(avant);
  });

  /**
   * LA COUPURE DE SUSPENSION, sur le chemin d'ÉCRITURE. Une coupure qui arrête
   * la lecture mais laisse écrire est une coupure à moitié faite.
   */
  test("un compte suspendu n'est plus arbitrable", async () => {
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", alice.profilId);

    const avant = (await evenements()).length;
    expect(await arbitrer(jeton, "refuse")).toBeNull();
    expect((await evenements()).length).toBe(avant);

    await service.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
    expect(await arbitrer(jeton, "refuse"), "la réactivation n'a pas rétabli l'arbitrage").toBe(
      "refuse",
    );
  });

  test("`anon` ne peut pas écrire `qc_status` autrement que par la fonction", async () => {
    const anonyme = clientAnonyme();
    const { error } = await anonyme
      .from("orders")
      .update({ qc_status: "approuve" })
      .eq("public_token", jeton);
    const { data } = await alice.client
      .from("orders")
      .select("qc_status")
      .eq("id", commande)
      .single();
    // Ce qui compte n'est pas le code d'erreur mais l'EFFET : la valeur ne doit
    // pas avoir changé. Un `update` filtré par la RLS ne rend pas toujours une
    // erreur — il ne touche simplement aucune ligne.
    expect(
      (data as { qc_status: string }).qc_status,
      `anon a modifié le statut QC (erreur : ${error?.message ?? "aucune"})`,
    ).toBe("refuse");
  });
});

describe("La révocation écrit son événement", () => {
  /**
   * PRINCIPE V. « Seule l'action explicite révoquer et régénérer change le
   * jeton, ET ELLE ÉCRIT UN ÉVÉNEMENT. » La rotation existait depuis la
   * migration 007, l'événement non — une exigence à moitié tenue, dont la moitié
   * manquante ne se voyait pas : rien ne se comporte différemment quand une
   * trace n'est pas écrite.
   */
  test("révoquer laisse une ligne au journal, attribuée au vendeur", async () => {
    const avant = (await evenements()).length;

    const revocation = await revoquerLien(
      alice.client as unknown as ClientCycle,
      alice.profilId,
      commande,
    );
    expect(revocation.statut).toBe("ok");

    const apres = await evenements();
    expect(apres.length, "la révocation n'a laissé aucune trace").toBe(avant + 1);
    expect(apres.at(-1)?.type).toBe("lien_revoque");
    expect(apres.at(-1)?.actor).toBe("vendeur");
  });

  test("le jeton n'apparaît PAS dans la charge utile", async () => {
    // Un jeton ne transporte pas une donnée mais une CAPACITÉ, définitivement.
    // L'écrire dans un journal que d'autres écrans afficheront reviendrait à le
    // republier sous un autre nom — le défaut exact que le contrôle par VALEUR
    // cherche.
    const { data } = await alice.client
      .from("orders")
      .select("public_token, unsubscribe_token")
      .eq("id", commande)
      .single();
    const actuels = data as { public_token: string; unsubscribe_token: string };

    const lignes = await interroger<{ charge: string }>(
      catalogue,
      "select payload::text as charge from public.order_events where order_id = $1",
      [commande],
    );
    expect(lignes.length, "journal vide : la sonde n'inspecte rien").toBeGreaterThan(0);

    for (const ligne of lignes) {
      expect(ligne.charge).not.toContain(actuels.public_token);
      expect(ligne.charge).not.toContain(actuels.unsubscribe_token);
    }
  });
});

/**
 * UN COMMENTAIRE HOSTILE NE DOIT PAS FAIRE PERDRE LA DÉCISION DU CLIENT.
 *
 * DÉFAUT MESURÉ LE 02/09/2026. La troncature du commentaire compte des
 * CARACTÈRES ; la contrainte du journal compte le JSON RENDU. Un caractère de
 * contrôle s'échappe en six caractères — mille d'entre eux rendaient 6 019 pour
 * un plafond de 4 000. `journaliser()` étant appelée DANS la transaction
 * d'`arbitrer_qc`, son refus emportait l'`update orders` : la décision était
 * annulée et le client recevait le message réservé au lien mort.
 *
 * ⚠️ ET IL ÉTAIT COMPTÉ COMME BALAYEUR DE JETONS. Ce 404-là sort par la branche
 * des jetons inconnus, donc le compteur `publique-inconnu` s'armait. À vingt
 * armements, sa PROPRE page de commande devenait un 404 pour lui.
 *
 * ⚠️ CE TEST N'INTERROGE PAS LE TEXTE DE LA FONCTION, IL INTERROGE L'EFFET :
 * il appelle l'arbitrage avec chaque charge et regarde ce que la commande
 * retient. Un contrôle qui chercherait `regexp_replace` dans le corps prouverait
 * qu'une expression existe, jamais qu'elle décide.
 */
describe("Le commentaire du client ne peut pas annuler sa décision", () => {
  async function arbitrerAvec(commentaire: string): Promise<{
    rendu: string | null;
    qc: string;
    stocke: string | null;
  }> {
    // On repart d'un état neutre : sans changement de décision, le journal
    // n'écrit rien, et le test ne mesurerait plus la charge utile.
    await alice.client.from("orders").update({ qc_status: "en_attente" }).eq("id", commande);

    // ⚠️ LE JETON EST RELU, PAS REPRIS DE LA VARIABLE DU MODULE : un describe
    // precedent de ce meme fichier revoque le lien, et la valeur d origine ne
    // vaut plus rien. Un test qui echoue pour cette raison-la ferait conclure a
    // un defaut du produit qui n existe pas.
    const { data: courant } = await alice.client
      .from("orders")
      .select("public_token")
      .eq("id", commande)
      .single();

    const anonyme = clientAnonyme();
    const { data, error } = await anonyme.rpc("arbitrer_qc", {
      p_jeton: (courant as { public_token: string }).public_token,
      p_decision: "approuve",
      p_commentaire: commentaire,
    });

    const { data: apres } = await alice.client
      .from("orders")
      .select("qc_status")
      .eq("id", commande)
      .single();

    const lignes = await interroger<{ c: string | null }>(
      catalogue,
      "select payload->>'commentaire' as c from public.order_events" +
        " where order_id = $1 order by occurred_at desc limit 1",
      [commande],
    );

    return {
      rendu: error !== null ? null : ((data as string | null) ?? null),
      qc: (apres as { qc_status: string }).qc_status,
      stocke: lignes[0]?.c ?? null,
    };
  }

  const HOSTILES: ReadonlyArray<readonly [string, string]> = [
    ["mille caractères de contrôle U+0001", "\u0001".repeat(1000)],
    ["mille caractères de contrôle U+0007", "\u0007".repeat(1000)],
    ["mille guillemets", '"'.repeat(1000)],
    ["mille antislashs", "\\".repeat(1000)],
    ["mélange guillemet + antislash + contrôle", ('"' + "\\" + "\u0001").repeat(400)],
  ];

  test("la liste des charges hostiles n'est pas vide", () => {
    // Un ensemble vide passe tout : on dit ce qu'on éprouve avant de l'éprouver.
    expect(HOSTILES.length).toBeGreaterThanOrEqual(5);
  });

  test.each(HOSTILES)("%s : la décision est quand même enregistrée", async (_nom, charge) => {
    const r = await arbitrerAvec(charge);
    expect(r.rendu, "l'arbitrage a été refusé").toBe("approuve");
    expect(r.qc, "la décision du client n'a pas été retenue").toBe("approuve");
  });

  test("CONTRE-TEST : un commentaire ordinaire est stocké tel quel, accents et emoji compris", async () => {
    /*
     * Sans lui, une correction qui viderait TOUS les commentaires passerait les
     * cas ci-dessus à 100 % — en supprimant la seule chose que le client avait
     * à dire à son vendeur.
     */
    const r = await arbitrerAvec("Reçu 👍 nickel\nmerci beaucoup");
    expect(r.rendu).toBe("approuve");
    expect(r.stocke, "le commentaire légitime n'a pas survécu").toBe("Reçu 👍 nickel\nmerci beaucoup");
  });

  test("les caractères de contrôle sont RETIRÉS, pas remplacés par du bruit", async () => {
    const r = await arbitrerAvec("bon\u0001jour\u0007 tout va bien");
    expect(r.stocke).toBe("bonjour tout va bien");
  });
});

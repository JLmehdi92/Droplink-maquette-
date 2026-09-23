import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue, interroger } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LES COMMANDES — isolation, immuabilité du jeton, recherche.
 *
 * Deux utilisateurs RÉELLEMENT authentifiés, jamais de mock : un test qui simule
 * la RLS ne teste pas la RLS. Chaque refus attendu est doublé d'un contre-test
 * positif, sans quoi une implémentation qui refuserait TOUT passerait la suite à
 * cent pour cent sans rien prouver.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commandeAlice: string;
let jetonAlice: string;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("cmd-alice");
  bob = await creerUtilisateur("cmd-bob");

  const { data, error } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId, customer_label: "Crème du Marché", product_ref: "REF-Été-01" })
    .select("id, public_token")
    .single();

  expect(error, `création de commande impossible : ${error?.message}`).toBeNull();
  commandeAlice = (data as { id: string }).id;
  jetonAlice = (data as { public_token: string }).public_token;
}, 60_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Le jeton public", () => {
  test("est long, en base 62, et distinct du jeton de désabonnement", async () => {
    const { data } = await alice.client
      .from("orders")
      .select("public_token, unsubscribe_token")
      .eq("id", commandeAlice)
      .single();

    const ligne = data as { public_token: string; unsubscribe_token: string };
    expect(ligne.public_token.length, "jeton trop court pour résister au balayage").toBeGreaterThanOrEqual(16);
    expect(ligne.public_token).toMatch(/^[0-9A-Za-z]+$/);
    // Un jeton, un pouvoir : celui qui se désabonne ne doit pas, par ce seul
    // geste, détenir de quoi ouvrir la page.
    expect(
      ligne.unsubscribe_token,
      "les deux jetons sont identiques : se désabonner donnerait l'accès à la page",
    ).not.toBe(ligne.public_token);
  });

  test("deux commandes ne partagent jamais un jeton", async () => {
    const jetons = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const { data } = await alice.client
        .from("orders")
        .insert({ shop_id: alice.shopId, product_ref: `unicite-${i}` })
        .select("public_token")
        .single();
      jetons.add((data as { public_token: string }).public_token);
    }
    expect(jetons.size, "collision de jetons").toBe(5);
  });

  test("NE PEUT PAS être modifié par le vendeur, même sur sa propre commande", async () => {
    const { error } = await alice.client
      .from("orders")
      .update({ public_token: "jeton-choisi-a-la-main" })
      .eq("id", commandeAlice);

    expect(
      error,
      "Le jeton a été modifié. Il transfère une CAPACITÉ définitive : le lien " +
        "déjà envoyé au client cesserait de fonctionner sans que personne ne " +
        "l'ait décidé.",
    ).not.toBeNull();

    const { data } = await alice.client
      .from("orders")
      .select("public_token")
      .eq("id", commandeAlice)
      .single();
    expect((data as { public_token: string }).public_token).toBe(jetonAlice);
  });

  test("NE PEUT PAS être modifié même en contournant le droit de colonne", async () => {
    // Le retrait du droit d'écriture n'est PAS la protection : une protection
    // qui tient à une absence n'est pas une protection. On force donc l'écriture
    // depuis une connexion propriétaire, où aucun privilège de colonne ne
    // s'applique — seul le déclencheur peut encore refuser.
    await expect(
      interroger(
        catalogue,
        `update public.orders set public_token = 'force-par-le-proprietaire' where id = '${commandeAlice}'`,
      ),
      "Le déclencheur n'a pas bloqué une écriture directe : la seule protection " +
        "était le privilège de colonne, qu'un simple `grant` ferait disparaître.",
    ).rejects.toThrow();
  });

  test("le refus porte un code NON réessayable", async () => {
    // Un refus métier qui porterait « 40001 » serait lu comme un conflit de
    // sérialisation, et la couche de reprise le rejouerait en boucle : un refus
    // DÉFINITIF deviendrait une tempête de requêtes. Le code d'erreur fait
    // partie du contrat, au même titre que le message.
    let code = "";
    try {
      await catalogue.query(
        `update public.orders set public_token = 'tentative' where id = $1`,
        [commandeAlice],
      );
    } catch (erreur) {
      code = (erreur as { code?: string }).code ?? "";
    }

    expect(code, "aucune erreur levée : le déclencheur n'a pas refusé").not.toBe("");
    expect(
      code,
      "Un refus métier ne doit JAMAIS porter un SQLSTATE réessayable.",
    ).not.toBe("40001");
    expect(code, "code de refus attendu").toBe("DL010");
  });

  test("`regenerer_jeton_public` change les DEUX jetons", async () => {
    const { data: avant } = await alice.client
      .from("orders")
      .select("public_token, unsubscribe_token")
      .eq("id", commandeAlice)
      .single();
    const a = avant as { public_token: string; unsubscribe_token: string };

    const { data: nouveau, error } = await alice.client.rpc("regenerer_jeton_public", {
      p_order_id: commandeAlice,
    });
    expect(error, `rotation refusée : ${error?.message}`).toBeNull();

    const { data: apres } = await alice.client
      .from("orders")
      .select("public_token, unsubscribe_token")
      .eq("id", commandeAlice)
      .single();
    const b = apres as { public_token: string; unsubscribe_token: string };

    expect(b.public_token).not.toBe(a.public_token);
    expect(b.public_token).toBe(nouveau);
    // Ne renouveler que le jeton public laisserait au détenteur du lien fuité de
    // quoi agir par l'autre porte.
    expect(
      b.unsubscribe_token,
      "le jeton de désabonnement a survécu à la révocation",
    ).not.toBe(a.unsubscribe_token);

    jetonAlice = b.public_token;
  });

  test("la rotation est REFUSÉE sur la commande d'un autre vendeur", async () => {
    // `regenerer_jeton_public` est en `security definer`, donc la RLS ne la
    // protège pas : c'est la vérification de propriété DANS son corps qui
    // empêche de couper l'accès aux clients de quelqu'un d'autre.
    const { error } = await bob.client.rpc("regenerer_jeton_public", {
      p_order_id: commandeAlice,
    });
    expect(
      error,
      "Bob a fait tourner le jeton d'une commande d'Alice : il vient de couper " +
        "le lien qu'elle avait envoyé à son client.",
    ).not.toBeNull();
  });

  test("le drapeau de rotation ne survit pas à la transaction", async () => {
    // Un drapeau qui resterait posé laisserait la porte ouverte pour tout le
    // reste de la session — c'est-à-dire pour toutes les requêtes suivantes.
    const lignes = await interroger<{ valeur: string }>(
      catalogue,
      `select coalesce(current_setting('droplink.rotation_jeton', true), '') as valeur`,
    );
    expect(lignes[0]?.valeur).toBe("");
  });
});

describe("Isolation entre vendeurs", () => {
  test("Bob ne voit AUCUNE commande d'Alice", async () => {
    const { data, error } = await bob.client.from("orders").select("id");
    expect(error).toBeNull();
    expect(
      (data ?? []).map((l) => (l as { id: string }).id),
      "Bob lit les commandes d'Alice",
    ).not.toContain(commandeAlice);
  });

  test("contre-test positif : Alice voit bien ses propres commandes", async () => {
    // Sans lui, une policy qui refuserait TOUT passerait le test précédent.
    const { data, error } = await alice.client.from("orders").select("id");
    expect(error).toBeNull();
    expect((data ?? []).map((l) => (l as { id: string }).id)).toContain(commandeAlice);
  });

  test("Bob ne peut ni modifier ni supprimer une commande d'Alice", async () => {
    const { error: erreurMaj, count: modifiees } = await bob.client
      .from("orders")
      .update({ customer_label: "detourne" }, { count: "exact" })
      .eq("id", commandeAlice);
    expect(erreurMaj).toBeNull();
    expect(modifiees ?? 0, "Bob a modifié une commande d'Alice").toBe(0);

    const { count: supprimees } = await bob.client
      .from("orders")
      .delete({ count: "exact" })
      .eq("id", commandeAlice);
    expect(supprimees ?? 0, "Bob a supprimé une commande d'Alice").toBe(0);

    const { data } = await alice.client
      .from("orders")
      .select("customer_label")
      .eq("id", commandeAlice)
      .single();
    expect((data as { customer_label: string }).customer_label).not.toBe("detourne");
  });

  test("Bob ne peut pas créer une commande DANS la boutique d'Alice", async () => {
    const { error } = await bob.client
      .from("orders")
      .insert({ shop_id: alice.shopId, product_ref: "intrusion" });
    expect(error, "Bob a déposé une commande chez Alice").not.toBeNull();
  });

  test("une commande ne peut pas être TRANSFÉRÉE à un autre compte", async () => {
    // Chacun est propriétaire de ses commandes et de ses destinataires : aucun
    // transfert de lien entre comptes. `shop_id` n'est pas dans les colonnes
    // modifiables, et le contrôle porte sur l'EFFET, pas sur la déclaration.
    const { error } = await alice.client
      .from("orders")
      .update({ shop_id: bob.shopId })
      .eq("id", commandeAlice);
    expect(error, "le transfert de commande a été accepté").not.toBeNull();
  });

  test("un anonyme ne lit rien et n'écrit rien", async () => {
    const { clientAnonyme } = await import("../aide/utilisateurs");
    const anon = clientAnonyme();
    const { data } = await anon.from("orders").select("id");
    expect(data ?? [], "un anonyme lit les commandes").toEqual([]);
    const { error } = await anon.from("orders").insert({ shop_id: alice.shopId });
    expect(error, "un anonyme a inséré une commande").not.toBeNull();
  });
});

describe("Ce que le vendeur peut écrire", () => {
  test("les colonnes modifiables sont exactement celles déclarées", async () => {
    const lignes = await interroger<{ colonne: string }>(
      catalogue,
      `select column_name as colonne from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'orders'
         and grantee = 'authenticated' and privilege_type = 'UPDATE'
       order by column_name`,
    );
    const observees = lignes.map((l) => l.colonne);

    // Inventaire, pas sélection : la sonde rend TOUT, le test déclare ses
    // exceptions. Il échoue dans les deux sens.
    const ATTENDUES = [
      "archived_at",
      "carrier_code",
      "cover_media_id",
      "customer_label",
      "internal_notes",
      "product_ref",
      "qc_status",
      "status",
      "tracking_number",
    ];

    expect(observees, "la sonde n'a trouvé aucune colonne modifiable").not.toEqual([]);
    expect(observees.sort()).toEqual([...ATTENDUES].sort());

    // Les absences qui comptent, nommées pour que leur retour soit lisible.
    for (const interdite of [
      "public_token",
      "unsubscribe_token",
      "shop_id",
      "created_at",
      "updated_at",
      "first_content_at",
    ]) {
      expect(observees, `${interdite} est devenue modifiable par le vendeur`).not.toContain(
        interdite,
      );
    }
  });

  test("`first_content_at` est posée par la BASE, pas par le vendeur", async () => {
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId, customer_label: "Contenu réel" })
      .select("first_content_at")
      .single();
    expect(
      (data as { first_content_at: string | null }).first_content_at,
      "la marque de premier contenu n'a pas été posée",
    ).not.toBeNull();
  });

  test("les NOTES INTERNES seules ne comptent pas comme contenu", async () => {
    // Elles sont pour le vendeur, pas pour son client : une commande qui ne
    // porte qu'une note n'a rien à montrer. Compter là gonflerait la métrique
    // de création du côté rassurant.
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId, internal_notes: "payé 14 euros" })
      .select("first_content_at")
      .single();
    expect(
      (data as { first_content_at: string | null }).first_content_at,
      "une note interne a été comptée comme contenu réel",
    ).toBeNull();
  });
});

describe("Recherche insensible aux accents", () => {
  test("« creme » trouve « Crème »", async () => {
    const { data, error } = await alice.client
      .from("orders")
      .select("id, customer_label")
      .like("recherche", "%creme%");

    expect(error).toBeNull();
    expect(
      (data ?? []).length,
      "« creme » ne trouve pas « Crème » : le repli d'accents est inopérant, et " +
        "c'est le cas MAJORITAIRE puisqu'on tape vite dans une barre de recherche.",
    ).toBeGreaterThan(0);
  });

  test("l'accent tapé fonctionne aussi", async () => {
    const { data } = await alice.client
      .from("orders")
      .select("id")
      .like("recherche", "%ete-01%");
    expect((data ?? []).length, "« ete-01 » ne trouve pas « Été-01 »").toBeGreaterThan(0);
  });

  test("contre-test : un terme absent ne trouve rien", async () => {
    // Sans lui, une colonne qui contiendrait n'importe quoi ferait passer les
    // deux tests précédents.
    const { data } = await alice.client
      .from("orders")
      .select("id")
      .like("recherche", "%zzzintrouvablezzz%");
    expect(data ?? []).toEqual([]);
  });

  test("la recherche ne franchit PAS la frontière du vendeur", async () => {
    await bob.client
      .from("orders")
      .insert({ shop_id: bob.shopId, customer_label: "Crème de Bob" });
    const { data } = await alice.client
      .from("orders")
      .select("customer_label")
      .like("recherche", "%creme%");
    const libelles = (data ?? []).map((l) => (l as { customer_label: string }).customer_label);
    expect(libelles, "la recherche d'Alice remonte une commande de Bob").not.toContain(
      "Crème de Bob",
    );
  });
});

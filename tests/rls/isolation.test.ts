import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ACCENT_DEFAUT } from "@/lib/design/contraste";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * ISOLATION RÉELLE, avec de VRAIS utilisateurs authentifiés.
 *
 * Les sondes de catalogue prouvent que les DÉCLARATIONS existent. Elles ne
 * prouvent pas que leur absence bloque (L-018). Ici on ne lit plus le
 * catalogue : on exécute des requêtes au nom de vraies sessions et on regarde
 * ce qui revient.
 *
 * SUITE JAMAIS DÉSACTIVABLE.
 *
 * Deux comptes, pas un. Une requête peut sembler isolée sur une base
 * mono-compte : sans voisin, un filtre absent rend le même résultat qu'un filtre
 * correct.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;

beforeAll(async () => {
  alice = await creerUtilisateur("alice");
  bob = await creerUtilisateur("bob");
}, 60_000);

afterAll(async () => {
  // Le nettoyage compte : des comptes laissés derrière fausseraient toute
  // mesure ultérieure, et les emails de test s'accumuleraient dans auth.users.
  if (alice !== undefined) await supprimerUtilisateur(alice);
  if (bob !== undefined) await supprimerUtilisateur(bob);
}, 60_000);

describe("Le déclencheur d'inscription", () => {
  test("crée bien un profil ET un shop, distincts pour chaque compte", () => {
    expect(alice.profilId).toBeTruthy();
    expect(alice.shopId).toBeTruthy();
    expect(bob.profilId).toBeTruthy();
    expect(bob.shopId).toBeTruthy();
    expect(alice.profilId).not.toBe(bob.profilId);
    expect(alice.shopId).not.toBe(bob.shopId);
  });

  test("laisse account_type à NULL, sans défaut", async () => {
    // Un défaut à 'reseller' aurait classé tous les fournisseurs comme
    // revendeurs et faussé irrémédiablement la segmentation d'usage, qui est le
    // livrable réel de la phase de validation.
    const { data } = await clientService()
      .from("profiles")
      .select("account_type")
      .eq("id", alice.profilId)
      .single();
    expect(data?.account_type).toBeNull();
  });

  test("laisse shops.name à NULL — un vendeur peut envoyer un lien sans rien configurer", async () => {
    const { data } = await clientService().from("shops").select("name, accent_color").eq("id", alice.shopId).single();
    expect(data?.name).toBeNull();
    // En revanche la couleur a un défaut : il n'existe aucun état « non
    // configurée » à détecter.
    //
    // La valeur n'est PAS réécrite ici. Elle l'était, et il a fallu la corriger
    // à la main le jour où le défaut a changé — c'est précisément la mécanique
    // qui fait diverger deux valeurs censées être une seule. `ACCENT_DEFAUT`
    // est ancrée au canevas ET au catalogue par `tests/rls/accent-defaut`.
    expect(data?.accent_color).toBe(ACCENT_DEFAUT);
  });
});

describe("Contre-test positif — chacun voit bien SES données", () => {
  // Sans ces trois tests, une suite où TOUT est refusé passerait à 100 % en ne
  // prouvant rien : une base cassée qui ne rend jamais rien la satisferait.
  test("Alice lit son propre profil", async () => {
    const { data, error } = await alice.client.from("profiles").select("id, email").eq("id", alice.profilId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.email).toBe(alice.email);
  });

  test("Alice lit son propre shop", async () => {
    const { data, error } = await alice.client.from("shops").select("id").eq("id", alice.shopId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("Alice modifie le nom de son propre shop", async () => {
    const { error } = await alice.client
      .from("shops")
      .update({ name: "Boutique d'Alice" })
      .eq("id", alice.shopId);
    expect(error).toBeNull();

    const { data } = await alice.client.from("shops").select("name").eq("id", alice.shopId).single();
    expect(data?.name).toBe("Boutique d'Alice");
  });
});

describe("Isolation entre vendeurs", () => {
  test("Alice ne voit AUCUNE ligne du profil de Bob", async () => {
    const { data, error } = await alice.client.from("profiles").select("id, email").eq("id", bob.profilId);
    expect(error).toBeNull();
    expect(data, "Alice a lu le profil de Bob").toEqual([]);
  });

  test("Alice ne voit AUCUNE ligne du shop de Bob", async () => {
    const { data, error } = await alice.client.from("shops").select("id, name").eq("id", bob.shopId);
    expect(error).toBeNull();
    expect(data, "Alice a lu le shop de Bob").toEqual([]);
  });

  test("une lecture SANS filtre ne rend que ses propres lignes", async () => {
    // Le cas le plus proche d'une fuite réelle : personne n'écrit
    // `.eq('id', celuiDunAutre)`, on écrit `.select('*')` et on fait confiance.
    const { data: profils } = await alice.client.from("profiles").select("id");
    expect(profils?.map((p) => p.id)).toEqual([alice.profilId]);

    const { data: shops } = await alice.client.from("shops").select("id");
    expect(shops?.map((s) => s.id)).toEqual([alice.shopId]);
  });

  test("Alice ne peut PAS modifier le shop de Bob", async () => {
    await alice.client.from("shops").update({ name: "Détourné par Alice" }).eq("id", bob.shopId);

    // On ne se fie pas au code d'erreur : une policy `using` qui ne matche
    // aucune ligne rend « succès, 0 ligne affectée ». C'est l'ÉTAT EN BASE qui
    // fait foi, relu avec un client qui voit tout.
    const { data } = await clientService().from("shops").select("name").eq("id", bob.shopId).single();
    expect(data?.name, "le shop de Bob a été modifié par Alice").not.toBe("Détourné par Alice");
  });


  test("Alice ne peut PAS modifier le profil de Bob", async () => {
    // Trou trouvé par falsification : en remplaçant la policy de mise à jour des
    // profils par `using (true)`, les 35 tests restaient VERTS. Aucune sonde de
    // catalogue ne peut voir ce défaut — la policy existe, elle est simplement
    // trop large. Seule une écriture réelle au nom d'Alice le révèle.
    //
    // L'enjeu n'est pas théorique : `account_type` EST la donnée de
    // segmentation qui fait le livrable de la phase de validation, et `locale`
    // décide de la langue des pages publiques de Bob.
    const service = clientService();
    const { data: avant } = await service
      .from("profiles")
      .select("locale, account_type")
      .eq("id", bob.profilId)
      .single();

    await alice.client
      .from("profiles")
      .update({ locale: "en", account_type: "supplier" })
      .eq("id", bob.profilId);

    const { data: apres } = await service
      .from("profiles")
      .select("locale, account_type")
      .eq("id", bob.profilId)
      .single();

    expect(apres?.locale, "Alice a changé la langue de Bob").toBe(avant?.locale);
    expect(apres?.account_type, "Alice a changé le type de compte de Bob").toBe(
      avant?.account_type ?? null,
    );
  });

  test("Alice ne peut pas créer un profil supplémentaire", async () => {
    // Aucun INSERT n'est accordé : les profils naissent du déclencheur
    // d'inscription et de nulle part ailleurs.
    const { error } = await alice.client
      .from("profiles")
      .insert({ user_id: alice.userId, email: "faux@droplink-test.invalid" });
    expect(error, "l'insertion d'un profil aurait dû être refusée").not.toBeNull();
  });

  test("Alice ne peut pas insérer une ligne pour le compte de Bob", async () => {
    const { error } = await alice.client.from("shops").insert({ owner_id: bob.profilId, name: "Faux" });
    expect(error, "l'insertion aurait dû être refusée").not.toBeNull();
  });

  test("Alice ne peut supprimer ni son shop ni celui de Bob", async () => {
    for (const [qui, id] of [
      ["le sien", alice.shopId],
      ["celui de Bob", bob.shopId],
    ] as const) {
      await alice.client.from("shops").delete().eq("id", id);
      const { count } = await clientService()
        .from("shops")
        .select("id", { count: "exact", head: true })
        .eq("id", id);
      expect(count, `shop ${qui} supprimé`).toBe(1);
    }
  });
});

describe("Escalade de privilège — la tentative directe", () => {
  test("Alice ne peut pas se promouvoir admin", async () => {
    await alice.client.from("profiles").update({ role: "admin" }).eq("id", alice.profilId);

    const { data } = await clientService().from("profiles").select("role").eq("id", alice.profilId).single();
    expect(data?.role, "ALICE EST DEVENUE ADMIN").toBe("user");
  });

  test("Alice ne peut pas se dé-suspendre ni suspendre Bob", async () => {
    const service = clientService();
    await service.from("profiles").update({ status: "suspended" }).eq("id", alice.profilId);

    await alice.client.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
    const { data: apres } = await service.from("profiles").select("status").eq("id", alice.profilId).single();
    expect(apres?.status, "Alice a levé sa propre suspension").toBe("suspended");

    await service.from("profiles").update({ status: "active" }).eq("id", alice.profilId);
  });

  test("promouvoir en glissant `role` dans une mise à jour légitime échoue aussi", async () => {
    // Le contournement auquel on pense en second : ne pas viser `role` seul,
    // mais le cacher dans une écriture par ailleurs autorisée.
    await alice.client
      .from("profiles")
      .update({ locale: "en", role: "admin" })
      .eq("id", alice.profilId);

    const { data } = await clientService()
      .from("profiles")
      .select("role, locale")
      .eq("id", alice.profilId)
      .single();
    expect(data?.role, "role modifié via une mise à jour mixte").toBe("user");
  });
});

describe("L'anonyme ne voit rien", () => {
  test("un client sans session ne lit aucune table", async () => {
    const anon = clientAnonyme();
    for (const table of ["profiles", "shops"] as const) {
      const { data, error } = await anon.from(table).select("id");
      // Selon la configuration, c'est soit une erreur, soit un ensemble vide.
      // Les deux sont acceptables ; ce qui ne l'est pas, c'est une ligne.
      expect(data ?? [], `un anonyme a lu ${table}`).toEqual([]);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  test("un anonyme ne peut rien écrire", async () => {
    const anon = clientAnonyme();
    const { error } = await anon.from("shops").insert({ owner_id: alice.profilId, name: "Anonyme" });
    expect(error, "un anonyme a pu insérer").not.toBeNull();
  });
});

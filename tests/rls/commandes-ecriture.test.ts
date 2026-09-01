import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appliquerChamp, type ClientEcriture } from "@/lib/commandes/ecriture";

/**
 * LES CHAMPS ÉDITABLES, LUS DANS LE PRODUIT — jamais recopiés.
 *
 * ⚠️ CE TEST COMPTAIT SON PROPRE TABLEAU. Il jouait sept mutations puis
 * vérifiait `mutations.length === 7`, ce qui est vrai par construction : le
 * nombre venait de la liste elle-même, pas du produit. Il détectait donc le
 * RETRAIT d'un champ, jamais son AJOUT — et le brief exige précisément que le
 * test de non-régression du jeton soit « étendu à chaque nouvelle mutation ».
 * L'extension reposait sur la mémoire du prochain rédacteur.
 *
 * `CHAMPS` n'est pas exporté — et il ne doit pas l'être : chaque export d'un
 * module atteignable est une surface. On lit donc la SOURCE, comme le font les
 * autres gardes de ce dépôt, et l'on exige la couverture DANS LES DEUX SENS.
 */
function champsEditablesDuProduit(): readonly string[] {
  const source = readFileSync(
    join(process.cwd(), "src", "lib", "commandes", "ecriture.ts"),
    "utf8",
  );
  const bloc = /const CHAMPS = \{([\s\S]*?)\n\} as const;/.exec(source);
  if (bloc === null) {
    throw new Error(
      "Le bloc `const CHAMPS = { … } as const;` est introuvable dans " +
        "`ecriture.ts`. La sonde ne peut plus inventorier les champs éditables, " +
        "et un inventaire vide passerait tout.",
    );
  }
  return [...(bloc[1] ?? "").matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1] as string);
}

/**
 * LES ÉCRITURES DE L'ÉDITEUR, éprouvées sur la fonction que la Server Action
 * appelle, avec des utilisateurs RÉELLEMENT authentifiés.
 *
 * Le point le plus important de cette suite est le jeton public : c'est la seule
 * chose qui protège la page d'un client, il est immuable à vie, et le test de
 * non-régression doit être ÉTENDU À CHAQUE NOUVELLE MUTATION. L'éditeur en
 * ajoute sept d'un coup.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let commande: string;
let jetonInitial: string;

const ecrire = (u: UtilisateurDeTest, id: string, champ: string, valeur: string) =>
  appliquerChamp(u.client as unknown as ClientEcriture, u.profilId, id, champ, valeur);

async function lire(u: UtilisateurDeTest, id: string, colonnes: string) {
  const { data } = await u.client.from("orders").select(colonnes).eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

beforeAll(async () => {
  alice = await creerUtilisateur("ecr-alice");
  bob = await creerUtilisateur("ecr-bob");

  const { data, error } = await alice.client
    .from("orders")
    .insert({ shop_id: alice.shopId })
    .select("id, public_token")
    .single();

  expect(error, `création impossible : ${error?.message}`).toBeNull();
  commande = (data as { id: string }).id;
  jetonInitial = (data as { public_token: string }).public_token;
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
});

describe("Le jeton public survit à TOUTES les mutations de l'éditeur", () => {
  test("aucun champ éditable du produit ne le change", async () => {
    const mutations: ReadonlyArray<readonly [string, string]> = [
      ["customer_label", "Yanis"],
      ["product_ref", "REF-9"],
      ["tracking_number", "LX123456789FR"],
      ["carrier_code", "dhl"],
      ["internal_notes", "acheté 38 €"],
      ["status", "en_transit"],
      ["qc_status", "approuve"],
    ];

    /*
     * LA COUVERTURE EST EXIGÉE DANS LES DEUX SENS, contre la liste du PRODUIT :
     * un champ éditable que ce test ne joue pas, et un champ joué ici qui
     * n'existe plus. Sans cela, la borne `length === 7` se contentait de
     * recompter le tableau qu'on venait d'écrire.
     */
    const duProduit = champsEditablesDuProduit();
    expect(
      duProduit.length,
      "Aucun champ éditable inventorié : un ensemble vide passe tout.",
    ).toBeGreaterThan(0);

    const joues = mutations.map(([champ]) => champ);
    const oublies = duProduit.filter((c) => !joues.includes(c));
    expect(
      oublies,
      `Champs éditables du produit que ce test NE JOUE PAS : ${oublies.join(", ")}. ` +
        "Le jeton est immuable à vie : toute nouvelle mutation doit être " +
        "éprouvée contre lui, sans quoi la promesse ne tient que par habitude.",
    ).toEqual([]);

    const disparus = joues.filter((c) => !duProduit.includes(c));
    expect(
      disparus,
      `Champs joués ici qui ne sont plus éditables : ${disparus.join(", ")}. ` +
        "Un test qui exerce un champ mort occupe la place sans rien prouver.",
    ).toEqual([]);

    for (const [champ, valeur] of mutations) {
      const resultat = await ecrire(alice, commande, champ, valeur);
      expect(resultat.statut, `écriture refusée sur ${champ}`).toBe("ok");

      const ligne = await lire(alice, commande, "public_token");
      expect(ligne?.["public_token"], `le jeton a changé après ${champ}`).toBe(jetonInitial);
    }
  });

  test("contre-test positif : les valeurs écrites SONT bien arrivées", async () => {
    // Sans lui, « le jeton n'a pas bougé » resterait vrai si aucune écriture
    // n'avait abouti.
    const ligne = await lire(alice, commande, "customer_label, status, qc_status");
    expect(ligne?.["customer_label"]).toBe("Yanis");
    expect(ligne?.["status"]).toBe("en_transit");
    expect(ligne?.["qc_status"]).toBe("approuve");
  });
});

describe("Isolation", () => {
  test("Bob ne peut pas écrire dans la commande d'Alice", async () => {
    const resultat = await ecrire(bob, commande, "customer_label", "détourné");
    expect(resultat.statut).toBe("echec");
    // « Introuvable » et non « interdit » : distinguer les deux confirmerait
    // l'existence d'une commande que Bob n'a pas le droit de connaître.
    if (resultat.statut === "echec") expect(resultat.motif).toBe("introuvable");

    const ligne = await lire(alice, commande, "customer_label");
    expect(ligne?.["customer_label"]).toBe("Yanis");
  });

  test("contre-test positif : Bob écrit sans problème dans SA commande", async () => {
    // Une implémentation qui refuserait TOUTE écriture passerait le test
    // ci-dessus à cent pour cent sans rien prouver.
    const { data } = await bob.client
      .from("orders")
      .insert({ shop_id: bob.shopId })
      .select("id")
      .single();

    const id = (data as { id: string }).id;
    const resultat = await ecrire(bob, id, "customer_label", "Client de Bob");
    expect(resultat.statut).toBe("ok");
  });
});

describe("Ce que l'éditeur accepte d'écrire", () => {
  test("une colonne hors de la liste est refusée", async () => {
    // `shop_id` la transférerait à un autre compte, `public_token` en changerait
    // la capacité. Aucune des deux n'est éditable, et le refus vient de la
    // validation, avant même que la base ait à trancher.
    for (const champ of ["shop_id", "public_token", "unsubscribe_token", "archived_at", "id"]) {
      const resultat = await ecrire(alice, commande, champ, "n'importe quoi");
      expect(resultat.statut, `${champ} a été accepté`).toBe("echec");
      if (resultat.statut === "echec") expect(resultat.motif).toBe("saisie");
    }
  });

  test("un statut inventé est refusé", async () => {
    const resultat = await ecrire(alice, commande, "status", "perdu_en_mer");
    expect(resultat.statut).toBe("echec");
  });

  test("un champ de texte vidé redevient NULL, pas une chaîne vide", async () => {
    // Deux façons de dire « rien » finiraient par diverger : la page publique
    // OMET une information absente, et « omis » se lit en base comme NULL.
    await ecrire(alice, commande, "product_ref", "");
    const ligne = await lire(alice, commande, "product_ref");
    expect(ligne?.["product_ref"]).toBeNull();
  });
});

describe("Le premier contenu réel", () => {
  test("des notes internes SEULES ne marquent pas la commande comme créée", async () => {
    // Les notes sont pour le vendeur, pas pour son client : une commande qui n'a
    // qu'une note n'a rien à montrer. La compter comme une création gonflerait
    // la métrique de verdict du côté rassurant.
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    await ecrire(alice, id, "internal_notes", "acheté 38 €");
    expect((await lire(alice, id, "first_content_at"))?.["first_content_at"]).toBeNull();

    // ... alors qu'un nom de client, lui, compte.
    await ecrire(alice, id, "customer_label", "Yanis");
    expect((await lire(alice, id, "first_content_at"))?.["first_content_at"]).not.toBeNull();
  });

  /**
   * LE TEST QUI MANQUAIT. Les précédents vérifiaient `first_content_at` — un
   * FAIT posé par un déclencheur depuis la migration 006. Ils restaient donc
   * verts alors que l'ÉVÉNEMENT `order_created`, lui, n'était jamais émis : la
   * fonction censée le réclamer arrivait après le déclencheur et rendait
   * toujours `false`.
   *
   * On interroge donc la réclamation elle-même, qui est ce que le code émetteur
   * consulte réellement.
   */
  test("l'événement de création est réclamable UNE fois, et une seule", async () => {
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    // Sans contenu réel, il n'y a rien à réclamer.
    const avant = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(avant.data, "réclamé alors que la commande est vide").toBe(false);

    // On écrit SANS passer par `appliquerChamp` : celui-ci réclame déjà
    // l'événement, et c'est bien son rôle. Le consommer ici masquerait ce qu'on
    // cherche à établir.
    await alice.client.from("orders").update({ customer_label: "Yanis" }).eq("id", id);

    const premiere = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(premiere.data, "l'événement n'a PAS pu être réclamé").toBe(true);

    const seconde = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(seconde.data, "l'événement a été réclamé deux fois").toBe(false);
  });

  /**
   * ET LE LIEN AVEC LE CODE ÉMETTEUR. Le test précédent établit que la
   * réclamation fonctionne ; celui-ci établit que le chemin du produit
   * l'emprunte réellement — sans quoi la fonction serait correcte et l'événement
   * toujours perdu, ce qui est exactement ce qui vient d'arriver.
   */
  test("une écriture de contenu réel emprunte le chemin de réclamation", async () => {
    /*
     * CE TEST A CHANGÉ DE CONTRAT, PARCE QUE LE PRODUIT A CHANGÉ.
     *
     * Il exigeait auparavant que la réclamation soit CONSOMMÉE après une
     * écriture de contenu. C'était l'ancien comportement — et c'était le défaut :
     * la marque était consommée AVANT l'émission, et `emettre` rend `false`
     * sans lever quand le collecteur n'est pas configuré. L'événement n'était
     * alors jamais réémis. Avec la clé d'analytics vide — l'état actuel du
     * dépôt, et celui de ce harnais — cela signifiait 100 % de pertes
     * définitives sur le NUMÉRATEUR de la métrique de verdict.
     *
     * Le produit REND désormais la marque quand l'émission n'est pas partie.
     *
     * ⚠️ ET L'ANALYTICS EST DÉBRANCHÉ PAR LE HARNAIS, PAS PAR HASARD. Cette
     * ligne disait « l'analytics n'étant pas configuré », en décrivant l'état
     * d'une machine où la clé était vide. Le 01/09/2026 la clé a été posée, et
     * ce test est parti en rouge : la suite venait d'émettre 648 tests de
     * VRAIS événements dans le projet d'analytics de production, `order_created`
     * compris — c'est-à-dire qu'elle faussait la métrique de verdict de la
     * phase avec ses propres tests. `charger-env.ts` débranche désormais les
     * tiers payants, et le transport refuse tout appel vers eux.
     *
     * La marque doit donc être encore disponible : c'est la preuve que rien
     * n'a été perdu en silence.
     *
     * CE QUE LE TEST ÉTABLIT MALGRÉ TOUT — et c'était sa vraie raison d'être :
     * que le chemin d'écriture emprunte bien la réclamation, au lieu de laisser
     * la fonction correcte et l'événement jamais émis.
     */
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    await ecrire(alice, id, "product_ref", "REF-emission");

    // Le premier contenu, lui, EST posé : c'est ce qui prouve que l'écriture a
    // traversé le chemin instrumenté et non un raccourci.
    const { data: marque } = await alice.client
      .from("orders")
      .select("first_content_at")
      .eq("id", id)
      .single();
    expect(
      (marque as { first_content_at: string | null } | null)?.first_content_at,
      "le premier contenu n'a pas été posé",
    ).not.toBeNull();

    const restant = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(
      restant.data,
      "la marque a été consommée alors que l'événement n'est pas parti : la perte serait définitive",
    ).toBe(true);
  });

  test("Bob ne peut pas réclamer l'événement d'une commande d'Alice", async () => {
    const { error } = await bob.client.rpc("reclamer_evenement_creation", {
      p_order_id: commande,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("DL027");
  });

  test("la marque n'est posée QU'UNE FOIS", async () => {
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (data as { id: string }).id;

    await ecrire(alice, id, "customer_label", "Premier");
    const premiere = (await lire(alice, id, "first_content_at"))?.["first_content_at"];

    await ecrire(alice, id, "product_ref", "REF-2");
    const seconde = (await lire(alice, id, "first_content_at"))?.["first_content_at"];

    expect(seconde).toBe(premiere);
  });
});

describe("La marque d'événement se rend, et une seule fois", () => {
  /*
   * L'audit avait laissé un point en suspens : `liberer_evenement_creation`
   * finit par `return found`, et `FOUND` porte sur le DERNIER ordre exécuté. La
   * fonction en exécute plusieurs — un `perform` de contrôle, puis un `update`
   * conditionnel. Si `found` reflétait le `perform`, elle rendrait « marque
   * rendue » à chaque appel, y compris quand elle n'a rien rendu.
   *
   * L'ENJEU N'EST PAS COSMÉTIQUE. Ce retour dit à l'appelant si la marque est
   * de nouveau disponible. Un « oui » de trop ferait réémettre `order_created`
   * pour une commande déjà comptée — et cet événement est le DÉNOMINATEUR du
   * taux d'activation.
   *
   * On l'établit par EXÉCUTION, pas par lecture : `FOUND` après un `UPDATE` est
   * exactement le genre de détail qu'on croit connaître.
   *
   * LE CYCLE ÉPROUVÉ EST CELUI DU PRODUIT. `appliquerChamp` réclame la marque
   * lui-même dès la première sauvegarde de contenu réel — c'est la décision
   * produit : `order_created` est émis au premier CONTENU, jamais à l'ouverture
   * de l'éditeur. On part donc d'une marque déjà posée, comme dans la vraie vie.
   */
  test("elle se rend une fois, et le second appel ne prétend rien", async () => {
    const { data: creee } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (creee as { id: string }).id;

    // Le contenu réel rend la commande éligible : la marque ne se réclame que
    // sur une commande qui porte du contenu.
    await ecrire(alice, id, "customer_label", "Yanis");

    /*
     * ON RÉCLAME EXPLICITEMENT ICI, et le détour mérite d'être dit : dans cet
     * environnement, `appliquerChamp` réclame la marque puis la REND aussitôt,
     * parce que l'émission vers l'analytique n'aboutit pas — il n'y a pas de
     * clé. C'est exactement le comportement que la migration 066 a installé, et
     * le constater au passage vaut mieux que de l'écrire quelque part.
     *
     * On repart donc d'une marque posée, sans dépendre de la réussite d'un envoi
     * réseau : une sonde qui en dépendrait échouerait par intermittence, et un
     * test qu'on relance jusqu'au vert n'est plus bloquant.
     */
    const posee = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(
      posee.data,
      "aucune marque posée : la sonde n'a rien à rendre, elle ne prouverait rien",
    ).toBe(true);

    const rendue = await alice.client.rpc("liberer_evenement_creation", { p_order_id: id });
    expect(rendue.error, `libération refusée : ${rendue.error?.message}`).toBeNull();
    expect(rendue.data, "la libération d'une marque posée n'est pas signalée").toBe(true);

    // LE CONTRÔLE QUI COMPTE : le second appel ne doit pas prétendre avoir rendu
    // quelque chose. C'est lui qui distingue un `FOUND` correct d'un `FOUND`
    // hérité de l'ordre précédent.
    const encore = await alice.client.rpc("liberer_evenement_creation", { p_order_id: id });
    expect(
      encore.data,
      "la fonction prétend avoir rendu une marque qui n'existait plus : une réémission de trop fausserait le dénominateur du taux d'activation",
    ).toBe(false);
  });

  test("contre-test positif : la marque rendue est réellement réclamable", async () => {
    // Sans lui, une fonction qui ne rendrait JAMAIS rien passerait le contrôle
    // précédent en répondant `false` partout — et l'événement serait perdu
    // définitivement au lieu d'être réémis.
    const { data: creee } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (creee as { id: string }).id;
    await ecrire(alice, id, "customer_label", "Chen");

    await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    await alice.client.rpc("liberer_evenement_creation", { p_order_id: id });

    const seconde = await alice.client.rpc("reclamer_evenement_creation", { p_order_id: id });
    expect(seconde.data, "la marque rendue n'est pas réclamable : l'événement est perdu").toBe(true);
  });
});


/**
 * QUAND L'ÉCRITURE ÉCHOUE, LE SERVEUR REND LA VALEUR QUE LA BASE PORTE.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. `valeurConfirmee` était
 * déclarée dans le type, promise DEUX FOIS en commentaire — « en cas d'échec,
 * cette action rend la valeur RÉELLEMENT en base, pour que l'écran y revienne »
 * — et renseignée NULLE PART. `grep` n'en trouvait qu'une occurrence : la
 * déclaration elle-même. C'est L-014 dans un contrat de fonction.
 *
 * CE QUE L'ABSENCE COÛTAIT : l'éditeur revenait à SA dernière valeur confirmée,
 * qui est locale à l'onglet. Avec deux onglets — un vendeur qui compare deux
 * commandes, cas ordinaire à 200 commandes par semaine — l'onglet B revenait à
 * une valeur que l'onglet A avait déjà remplacée. L'interface affirmait alors un
 * état que la base n'avait pas : le principe XII exactement à l'envers.
 *
 * POUR L'ÉPROUVER, IL FAUT UNE ÉCRITURE QUI ÉCHOUE POUR DE VRAI. On retire donc
 * le DROIT D'ÉCRITURE sur la colonne, le temps du contrôle, par la connexion de
 * catalogue — c'est-à-dire en cassant le PRODUIT et non le test. Un `finally`
 * le repose quoi qu'il arrive : une suite qui laisserait une colonne fermée
 * derrière elle ferait échouer tout ce qui suit, sans rapport apparent.
 */
describe("L'échec d'écriture rend l'état confirmé", () => {
  let catalogue: Client;

  beforeAll(async () => {
    catalogue = await ouvrirConnexionCatalogue();
  }, 60_000);

  afterAll(async () => {
    await catalogue.end();
  });

  test("le motif « ecriture » porte la valeur réellement en base", async () => {
    // On pose une valeur connue, PAR LE CHEMIN NORMAL : c'est elle que le
    // serveur devra rendre quand l'écriture suivante échouera.
    const posee = await ecrire(alice, commande, "customer_label", "Valeur en base");
    expect(posee.statut, "la mise en place a échoué : la sonde ne mesure rien").toBe("ok");

    await interroger(
      catalogue,
      "revoke update (customer_label) on public.orders from authenticated",
    );
    try {
      const echec = await ecrire(alice, commande, "customer_label", "Valeur qui ne passera pas");

      expect(echec.statut, "l'écriture a réussi alors que le droit est retiré").toBe("echec");
      if (echec.statut !== "echec") return;
      expect(echec.motif).toBe("ecriture");
      expect(
        echec.valeurConfirmee,
        "l'échec ne rend pas la valeur en base : l'écran reviendrait à ce que CET onglet a vu en dernier",
      ).toBe("Valeur en base");
    } finally {
      await interroger(
        catalogue,
        "grant update (customer_label) on public.orders to authenticated",
      );
    }
  });

  test("contre-test : le droit est bien rendu, l'écriture repasse", async () => {
    // Sans lui, un `finally` qui aurait échoué laisserait la colonne fermée et
    // toutes les suites suivantes échoueraient sans qu'on sache pourquoi.
    const apres = await ecrire(alice, commande, "customer_label", "Après restitution");
    expect(apres.statut, "le droit d'écriture n'a pas été rendu").toBe("ok");
  });
});

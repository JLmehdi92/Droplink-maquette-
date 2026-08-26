import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  confirmerDepot,
  preparerDepot,
  preparerDepotVignette,
  reordonnerMedias,
  supprimerMedia,
  type ClientMedias,
} from "@/lib/commandes/medias";
import { cleVignette } from "@/lib/storage/cles";
import { limites } from "@/lib/storage/limites";
import { lireTaille, supprimer } from "@/lib/storage/r2";

/**
 * LES MÉDIAS — isolation, plafonds, et la taille RELUE.
 *
 * Ces tests parlent au VRAI bucket et à la VRAIE base. Un dépôt simulé
 * prouverait que notre imitation du stockage est cohérente, pas que le stockage
 * accepte ce qu'on croit lui envoyer.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let commandeAlice: string;
let commandeBob: string;

/** Objets réellement déposés, retirés en fin de suite quoi qu'il arrive. */
const clesCreees: string[] = [];

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const clientDe = (u: UtilisateurDeTest) => u.client as unknown as ClientMedias;

/** Dépose un fichier de bout en bout, comme le fait le navigateur. */
async function deposer(
  u: UtilisateurDeTest,
  orderId: string,
  corps: Buffer,
  typeMime = "image/jpeg",
) {
  const preparation = await preparerDepot(clientDe(u), u.profilId, u.shopId, {
    orderId,
    typeMime,
    tailleAnnoncee: corps.byteLength,
  });

  if (preparation.statut !== "ok") return { preparation, confirmation: null };

  clesCreees.push(preparation.cle);
  const reponse = await fetch(preparation.url, {
    method: "PUT",
    headers: preparation.enTetes,
    body: new Uint8Array(corps),
  });
  expect(reponse.ok, `dépôt refusé par le stockage : ${reponse.status}`).toBe(true);

  const confirmation = await confirmerDepot(clientDe(u), u.profilId, u.shopId, {
    orderId,
    mediaId: preparation.mediaId,
    typeMime,
  });

  return { preparation, confirmation };
}

beforeAll(async () => {
  alice = await creerUtilisateur("med-alice");
  bob = await creerUtilisateur("med-bob");

  const creer = async (u: UtilisateurDeTest): Promise<string> => {
    const { data, error } = await u.client
      .from("orders")
      .insert({ shop_id: u.shopId })
      .select("id")
      .single();
    expect(error, `création impossible : ${error?.message}`).toBeNull();
    return (data as { id: string }).id;
  };

  commandeAlice = await creer(alice);
  commandeBob = await creer(bob);
}, 90_000);

afterAll(async () => {
  // Retrait INCONDITIONNEL : un chemin d'échec qui laisse des objets derrière
  // lui fait grossir la facture sans que personne ne le voie.
  for (const cle of clesCreees) await supprimer(cle).catch(() => undefined);
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
}, 60_000);

/**
 * Un UUID déterministe par position.
 *
 * Les jeux de plafond forgeaient `plafond-3.jpg` : une clé qu'aucun chemin du
 * produit ne fabrique, et que la base refuse depuis la migration 089. On garde
 * le déterminisme — utile pour relire un échec — en donnant une forme réelle.
 */
function uuidDeposition(n: number): string {
  return "aaaaaaaa-0000-4000-8000-" + String(n).padStart(12, "0");
}

describe("Le dépôt de bout en bout", () => {
  test("un média déposé est enregistré avec la taille RELUE, pas l'annoncée", async () => {
    const { preparation, confirmation } = await deposer(alice, commandeAlice, PIXEL);

    expect(preparation.statut).toBe("ok");
    expect(confirmation?.statut).toBe("ok");
    if (confirmation?.statut !== "ok") return;

    expect(confirmation.tailleOctets).toBe(PIXEL.byteLength);

    const { data } = await alice.client
      .from("order_media")
      .select("taille_octets, cle, position, type")
      .eq("id", confirmation.mediaId)
      .single();

    const ligne = data as { taille_octets: number; cle: string; position: number; type: string };
    expect(ligne.taille_octets).toBe(PIXEL.byteLength);
    expect(ligne.type).toBe("photo");
    expect(ligne.position).toBe(0);
  });

  /**
   * LA CLÉ EST GÉNÉRÉE PAR LE SERVEUR. Le contrôle porte sur sa FORME réelle :
   * elle doit contenir la boutique et la commande, et donc ne peut pas désigner
   * l'objet d'un autre vendeur.
   */
  test("la clé est préfixée par la boutique et la commande de l'appelant", async () => {
    const { data } = await alice.client
      .from("order_media")
      .select("cle")
      .eq("order_id", commandeAlice)
      .limit(1)
      .single();

    const cle = (data as { cle: string }).cle;
    expect(cle.startsWith("medias/" + alice.shopId + "/" + commandeAlice + "/")).toBe(true);
    expect(cle).not.toContain(bob.shopId);
  });

  /**
   * LE DÉFAUT LE PLUS TROMPEUR : une ligne qui désigne un objet absent. L'écran
   * l'affiche, le fichier n'existe pas, et le client voit une image cassée sur la
   * page qu'on lui a promise.
   */
  test("confirmer sans avoir déposé n'écrit AUCUNE ligne", async () => {
    const preparation = await preparerDepot(clientDe(alice), alice.profilId, alice.shopId, {
      orderId: commandeAlice,
      typeMime: "image/jpeg",
      tailleAnnoncee: 1234,
    });
    expect(preparation.statut).toBe("ok");
    if (preparation.statut !== "ok") return;

    const avant = await compterMedias(alice, commandeAlice);

    const confirmation = await confirmerDepot(clientDe(alice), alice.profilId, alice.shopId, {
      orderId: commandeAlice,
      mediaId: preparation.mediaId,
      typeMime: "image/jpeg",
    });

    expect(confirmation.statut).toBe("echec");
    if (confirmation.statut === "echec") expect(confirmation.motif).toBe("absent");
    expect(await compterMedias(alice, commandeAlice)).toBe(avant);
  });
});

describe("Isolation", () => {
  test("Bob ne peut pas préparer un dépôt dans la commande d'Alice", async () => {
    const preparation = await preparerDepot(clientDe(bob), bob.profilId, bob.shopId, {
      orderId: commandeAlice,
      typeMime: "image/jpeg",
      tailleAnnoncee: 100,
    });

    expect(preparation.statut).toBe("echec");
    if (preparation.statut === "echec") expect(preparation.motif).toBe("introuvable");
  });

  test("contre-test positif : Bob dépose sans problème dans SA commande", async () => {
    // Une implémentation qui refuserait TOUT passerait le test ci-dessus à cent
    // pour cent sans rien prouver.
    const { confirmation } = await deposer(bob, commandeBob, PIXEL);
    expect(confirmation?.statut).toBe("ok");
  });

  test("Bob ne voit ni ne supprime les médias d'Alice", async () => {
    const { data } = await bob.client.from("order_media").select("id, order_id");
    const visibles = (data ?? []) as Array<{ order_id: string }>;

    expect(visibles.length).toBeGreaterThan(0);
    for (const m of visibles) expect(m.order_id).toBe(commandeBob);

    const { data: chezAlice } = await alice.client
      .from("order_media")
      .select("id")
      .eq("order_id", commandeAlice)
      .limit(1)
      .single();

    const cible = (chezAlice as { id: string }).id;
    const resultat = await supprimerMedia(clientDe(bob), commandeAlice, cible);
    expect(resultat.statut).toBe("echec");

    // Et la ligne est toujours là.
    const { data: apres } = await alice.client
      .from("order_media")
      .select("id")
      .eq("id", cible)
      .maybeSingle();
    expect(apres).not.toBeNull();
  });
});

describe("Le réordonnancement", () => {
  test("une liste partielle est refusée", async () => {
    // Un tableau partiel laisserait des lignes à leur ancienne position et
    // produirait des doublons.
    const ids = await idsDe(alice, commandeAlice);
    expect(ids.length).toBeGreaterThan(0);

    const resultat = await reordonnerMedias(clientDe(alice), commandeAlice, ids.slice(0, -1));
    expect(resultat.statut).toBe("echec");
  });

  test("un média étranger à la commande est refusé", async () => {
    const idsAlice = await idsDe(alice, commandeAlice);
    const idsBob = await idsDe(bob, commandeBob);
    expect(idsBob.length).toBeGreaterThan(0);

    const melange = [...idsAlice.slice(0, -1), idsBob[0] as string];
    const resultat = await reordonnerMedias(clientDe(alice), commandeAlice, melange);
    expect(resultat.statut).toBe("echec");
  });

  test("contre-test positif : l'ordre inverse est bien appliqué, en une écriture", async () => {
    // Deux médias suffisent, et il en faut au moins deux pour que « inverser »
    // veuille dire quelque chose.
    await deposer(alice, commandeAlice, PIXEL);
    const ids = await idsDe(alice, commandeAlice);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    const inverse = [...ids].reverse();
    const resultat = await reordonnerMedias(clientDe(alice), commandeAlice, inverse);
    expect(resultat.statut).toBe("ok");

    expect(await idsDe(alice, commandeAlice)).toEqual(inverse);
  });
});

describe("Les plafonds tiennent EN BASE", () => {
  /**
   * Le contrôle applicatif de `preparerDepot` est doublé d'un déclencheur. Ce
   * test le contourne DÉLIBÉRÉMENT — insertion directe dans la table, avec le
   * client du vendeur — parce que c'est la seule façon de savoir si le plafond
   * est une règle ou une politesse.
   *
   * Une règle applicative peut être oubliée dans un nouveau chemin de code : un
   * import depuis un lien d'agent, une reprise, une duplication. Une règle en
   * base ne peut pas l'être. Et les vidéos sont le seul poste de coût du produit
   * qui puisse réellement déraper.
   */
  test("le vingt-et-unième média est refusé par la base, pas par le code", async () => {
    const { data: commande } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (commande as { id: string }).id;

    const inserer = (position: number, type: "photo" | "video") =>
      alice.client.from("order_media").insert({
        order_id: id,
        type,
        cle:
          "medias/" + alice.shopId + "/" + id + "/" + uuidDeposition(position) + ".jpg",
        taille_octets: 1,
        position,
      });

    for (let i = 0; i < 20; i += 1) {
      const { error } = await inserer(i, "photo");
      expect(error, `insertion ${i} refusée : ${error?.message}`).toBeNull();
    }

    const { error } = await inserer(20, "photo");
    expect(error, "le vingt-et-unième média est passé").not.toBeNull();
    expect(error?.code).toBe("DL020");
  }, 60_000);

  test("la quatrième vidéo est refusée par la base", async () => {
    const { data: commande } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId })
      .select("id")
      .single();
    const id = (commande as { id: string }).id;

    const inserer = (position: number) =>
      alice.client.from("order_media").insert({
        order_id: id,
        type: "video",
        cle:
          "medias/" + alice.shopId + "/" + id + "/" + uuidDeposition(position) + ".mp4",
        taille_octets: 1,
        position,
      });

    for (let i = 0; i < 3; i += 1) {
      const { error } = await inserer(i);
      expect(error, `vidéo ${i} refusée : ${error?.message}`).toBeNull();
    }

    const { error } = await inserer(3);
    expect(error, "la quatrième vidéo est passée").not.toBeNull();
    expect(error?.code).toBe("DL021");
  }, 60_000);

  test("la taille et la clé ne sont pas modifiables après coup", async () => {
    // `taille_octets` fonde le modèle de coût : la laisser modifiable
    // permettrait de déclarer un média de 80 Mo comme pesant 1 Ko sans jamais
    // toucher au fichier. `cle` la ferait pointer sur l'objet d'un autre.
    const { data } = await alice.client
      .from("order_media")
      .select("id, taille_octets")
      .eq("order_id", commandeAlice)
      .limit(1)
      .single();
    const media = data as { id: string; taille_octets: number };

    const { error: erreurTaille } = await alice.client
      .from("order_media")
      .update({ taille_octets: 1 })
      .eq("id", media.id);
    expect(erreurTaille, "la taille a pu être réécrite").not.toBeNull();

    const { error: erreurCle } = await alice.client
      .from("order_media")
      .update({
        cle:
          "medias/" + bob.shopId + "/" + commandeAlice + "/aaaaaaaa-0000-4000-8000-0000000000ff.jpg",
      })
      .eq("id", media.id);
    expect(erreurCle, "la clé a pu être réécrite").not.toBeNull();

    const { data: apres } = await alice.client
      .from("order_media")
      .select("taille_octets")
      .eq("id", media.id)
      .single();
    expect((apres as { taille_octets: number }).taille_octets).toBe(media.taille_octets);
  });

  test("contre-test positif : la position, elle, EST modifiable", async () => {
    // Sans lui, « tout est refusé » passerait les trois tests ci-dessus sans
    // rien prouver — y compris si `authenticated` n'avait aucun droit du tout.
    const { data } = await alice.client
      .from("order_media")
      .select("id, position")
      .eq("order_id", commandeAlice)
      .limit(1)
      .single();
    const media = data as { id: string; position: number };

    const { error } = await alice.client
      .from("order_media")
      .update({ position: media.position })
      .eq("id", media.id);
    expect(error, `la position n'est pas modifiable : ${error?.message}`).toBeNull();
  });
});

describe("La vignette", () => {
  test("son emplacement est DÉRIVÉ de celui du média, jamais choisi", async () => {
    const signature = await preparerDepotVignette(clientDe(alice), alice.shopId, {
      orderId: commandeAlice,
      mediaId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      typeMime: "image/jpeg",
      tailleAnnoncee: 4096,
    });

    expect(signature.statut).toBe("ok");
    if (signature.statut !== "ok") return;

    // L'URL signée doit porter le chemin dérivé, sous la boutique de l'appelant.
    const attendu = cleVignette(
      "medias/" + alice.shopId + "/" + commandeAlice + "/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg",
    );
    expect(decodeURIComponent(new URL(signature.url).pathname)).toContain(attendu);
    expect(signature.url).not.toContain(bob.shopId);
  });

  test("au-delà du plafond dur, elle est refusée AVANT d'être signée", async () => {
    // Le plafond vient du budget de page : 20 Ko de vignette maximum, sans quoi
    // cinquante lignes de liste dépassent le poids autorisé — ce qui ne se
    // verrait qu'une fois la volumétrie installée.
    const signature = await preparerDepotVignette(clientDe(alice), alice.shopId, {
      orderId: commandeAlice,
      mediaId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      typeMime: "image/jpeg",
      tailleAnnoncee: limites().vignetteOctets + 1,
    });

    expect(signature.statut).toBe("echec");
    if (signature.statut === "echec") expect(signature.motif).toBe("trop_lourde");
  });

  test("Bob ne peut pas signer de vignette dans la commande d'Alice", async () => {
    const signature = await preparerDepotVignette(clientDe(bob), bob.shopId, {
      orderId: commandeAlice,
      mediaId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      typeMime: "image/jpeg",
      tailleAnnoncee: 4096,
    });
    expect(signature.statut).toBe("echec");
  });
});

describe("La photo de couverture", () => {
  /**
   * La vérification existe AUSSI dans la Server Action. Ce test la contourne
   * délibérément — écriture directe avec le client du vendeur — parce que c'est
   * la seule façon de savoir si la règle tient quand un nouveau chemin de code
   * oublie de la poser.
   */
  test("un média d'une AUTRE commande est refusé par la base", async () => {
    const idsBob = await idsDe(bob, commandeBob);
    expect(idsBob.length).toBeGreaterThan(0);

    // Alice désigne le média de Bob. Elle n'a pas le droit de le LIRE, mais elle
    // écrit dans SA propre commande : la RLS ne voit rien à redire, c'est la
    // VALEUR qui désigne autre chose.
    const { error } = await alice.client
      .from("orders")
      .update({ cover_media_id: idsBob[0] as string })
      .eq("id", commandeAlice);

    expect(error, "la couverture a pu désigner le média d'un autre vendeur").not.toBeNull();
    expect(error?.code).toBe("DL028");
  });

  test("contre-test positif : un média de LA commande est accepté", async () => {
    // Sans lui, « tout est refusé » passerait le test ci-dessus sans rien
    // prouver — et la couverture ne serait jamais réglable.
    const idsAlice = await idsDe(alice, commandeAlice);
    expect(idsAlice.length).toBeGreaterThan(0);

    const { error } = await alice.client
      .from("orders")
      .update({ cover_media_id: idsAlice[0] as string })
      .eq("id", commandeAlice);

    expect(error, `couverture légitime refusée : ${error?.message}`).toBeNull();
  });

  test("la retirer reste possible", async () => {
    const { error } = await alice.client
      .from("orders")
      .update({ cover_media_id: null })
      .eq("id", commandeAlice);
    expect(error).toBeNull();
  });
});

describe("La suppression", () => {
  test("la ligne part, et l'objet aussi", async () => {
    const { preparation, confirmation } = await deposer(alice, commandeAlice, PIXEL);
    expect(confirmation?.statut).toBe("ok");
    if (preparation.statut !== "ok" || confirmation?.statut !== "ok") return;

    expect(await lireTaille(preparation.cle)).not.toBeNull();

    const resultat = await supprimerMedia(clientDe(alice), commandeAlice, confirmation.mediaId);
    expect(resultat.statut).toBe("ok");

    const { data } = await alice.client
      .from("order_media")
      .select("id")
      .eq("id", confirmation.mediaId)
      .maybeSingle();
    expect(data).toBeNull();
    expect(await lireTaille(preparation.cle)).toBeNull();
  });
});

async function compterMedias(u: UtilisateurDeTest, orderId: string): Promise<number> {
  const { data } = await u.client.from("order_media").select("id").eq("order_id", orderId);
  return (data ?? []).length;
}

async function idsDe(u: UtilisateurDeTest, orderId: string): Promise<string[]> {
  const { data } = await u.client
    .from("order_media")
    .select("id")
    .eq("order_id", orderId)
    .order("position", { ascending: true });
  return ((data ?? []) as Array<{ id: string }>).map((m) => m.id);
}

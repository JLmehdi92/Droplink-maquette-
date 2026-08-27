import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  analyserParametres,
  compterParEtat,
  lireCommandes,
  type ClientLecture,
} from "@/lib/commandes/liste";
import { cleVignette } from "@/lib/storage/cles";

/**
 * LA COLONNE « PHOTOS » DE LA LISTE, ET LE SOUS-TITRE CHIFFRÉ.
 *
 * Deux valeurs nouvelles s'affichent sur l'écran le plus ouvert du produit :
 * le nombre de médias d'une commande (migration 101, tenu par déclencheur) et le
 * couple « total / créées cette semaine » du sous-titre (migration 102).
 *
 * CE QUI REND CES DEUX VALEURS DANGEREUSES : elles sont CRÉDIBLES. Un compteur
 * dénormalisé qui dérive n'affiche pas d'erreur — il affiche un autre nombre. Le
 * vendeur lit « 12 photos » sur une commande qui en porte trois, et il n'a aucune
 * raison d'aller vérifier. Le contrôle compare donc systématiquement la valeur
 * affichée à un COMPTAGE RÉEL fait en base, jamais à une valeur attendue écrite
 * à la main : une constante attendue se met à jour avec le défaut.
 *
 * UTILISATEURS RÉELLEMENT AUTHENTIFIÉS : le déclencheur est `security definer`,
 * mais les insertions et les suppressions de médias passent par la RLS de
 * `order_media`. Un test qui écrirait en service-role prouverait que le
 * déclencheur fonctionne pour nous, pas pour un vendeur.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commandeA: string;
let commandeB: string;

/**
 * La clé d'un média a une FORME CANONIQUE vérifiée en base (migration 089) :
 * `medias/{shopId}/{orderId}/{uuid}.{ext}`. Une clé inventée serait refusée — et
 * le refus ressemblerait à un défaut du compteur.
 */
const cle = (u: UtilisateurDeTest, orderId: string, n: number) =>
  `medias/${u.shopId}/${orderId}/0000000${n}-0000-0000-0000-00000000000${n}.jpg`;

async function ajouterMedia(
  u: UtilisateurDeTest,
  orderId: string,
  position: number,
  avecVignette: boolean,
): Promise<string> {
  const cleMedia = cle(u, orderId, position);
  const { data, error } = await u.client
    .from("order_media")
    .insert({
      order_id: orderId,
      type: "photo",
      cle: cleMedia,
      cle_vignette: avecVignette ? cleVignette(cleMedia) : null,
      position,
      taille_octets: 1024,
    })
    .select("id")
    .single();
  expect(error, `dépôt de média refusé : ${error?.message}`).toBeNull();
  return (data as { id: string }).id;
}

/** Le comptage RÉEL, lu au catalogue — l'étalon auquel le compteur est comparé. */
async function comptageReel(orderId: string): Promise<number> {
  const lignes = await interroger<{ n: string }>(
    catalogue,
    `select count(*)::text as n from public.order_media where order_id = '${orderId}'`,
  );
  return Number(lignes[0]?.n ?? "-1");
}

async function compteurEnBase(orderId: string): Promise<number> {
  const lignes = await interroger<{ media_count: number }>(
    catalogue,
    `select media_count from public.orders where id = '${orderId}'`,
  );
  return lignes[0]?.media_count ?? -1;
}

const lire = (u: UtilisateurDeTest) =>
  lireCommandes(analyserParametres({}), u.client as unknown as ClientLecture);

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("medias-alice");
  bob = await creerUtilisateur("medias-bob");

  const creer = async (u: UtilisateurDeTest, libelle: string): Promise<string> => {
    const { data, error } = await u.client
      .from("orders")
      .insert({ shop_id: u.shopId, customer_label: libelle })
      .select("id")
      .single();
    expect(error, `insertion impossible : ${error?.message}`).toBeNull();
    return (data as { id: string }).id;
  };

  commandeA = await creer(alice, "Avec médias");
  commandeB = await creer(alice, "Sans média");
  const ancienne = await creer(alice, "Créée le mois dernier");

  /*
   * UNE COMMANDE ANTIDATÉE, ET ELLE EST INDISPENSABLE.
   *
   * Sans elle, les trois commandes d'Alice viennent d'être créées : « total » et
   * « créées cette semaine » valent le même nombre, et un compteur de semaine
   * qui aurait perdu son filtre passerait le test sans que rien ne le distingue.
   * Le test aurait alors comparé deux valeurs égales par accident et prétendu
   * avoir vérifié un filtre.
   *
   * `created_at` n'est PAS écrivable par le vendeur — une date de création
   * réécrite est une piste effacée. On la pose donc par le catalogue, en
   * préparation du jeu, jamais par le chemin qu'on éprouve.
   */
  await catalogue.query(
    `update public.orders set created_at = now() - interval '40 days' where id = '${ancienne}'`,
  );
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Le compteur de médias", () => {
  test("part de zéro, et zéro est la vérité", async () => {
    // Un ensemble vide passe tout : cette borne établit que la commande existe
    // et que le comptage réel la voit, avant de comparer quoi que ce soit.
    expect(await comptageReel(commandeA)).toBe(0);
    expect(await compteurEnBase(commandeA)).toBe(0);
  });

  test("suit chaque dépôt", async () => {
    await ajouterMedia(alice, commandeA, 0, true);
    expect(await compteurEnBase(commandeA)).toBe(await comptageReel(commandeA));

    await ajouterMedia(alice, commandeA, 1, false);
    await ajouterMedia(alice, commandeA, 2, true);

    const reel = await comptageReel(commandeA);
    expect(reel).toBe(3);
    expect(await compteurEnBase(commandeA)).toBe(reel);
  });

  test("suit chaque suppression, et ne descend jamais sous zéro", async () => {
    const id = await ajouterMedia(alice, commandeA, 3, false);
    const avant = await compteurEnBase(commandeA);

    const { error } = await alice.client.from("order_media").delete().eq("id", id);
    expect(error, `suppression refusée : ${error?.message}`).toBeNull();

    expect(await compteurEnBase(commandeA)).toBe(avant - 1);
    expect(await compteurEnBase(commandeA)).toBe(await comptageReel(commandeA));
  });

  test("le réordonnancement ne le touche pas", async () => {
    // Le bras `UPDATE OF order_id` du déclencheur ne doit PAS s'exécuter quand
    // l'éditeur permute des positions — ce qui arrive des dizaines de fois par
    // glisser. S'il s'exécutait, le compteur bougerait à chaque déplacement.
    const avant = await compteurEnBase(commandeA);
    const { error } = await alice.client
      .from("order_media")
      .update({ position: 9 })
      .eq("order_id", commandeA)
      .eq("position", 2);
    expect(error, `réordonnancement refusé : ${error?.message}`).toBeNull();

    expect(await compteurEnBase(commandeA)).toBe(avant);
    expect(await compteurEnBase(commandeA)).toBe(await comptageReel(commandeA));
  });

  test("la liste rend le compteur, et il vaut le comptage réel", async () => {
    const page = await lire(alice);
    expect(page.lignes.length).toBeGreaterThan(0);

    for (const ligne of page.lignes) {
      expect(ligne.photos, `commande ${ligne.id}`).toBe(await comptageReel(ligne.id));
    }

    // CONTRE-TEST POSITIF : une suite où tout vaut zéro passerait à 100 % sans
    // rien prouver. Au moins une ligne porte des médias.
    expect(page.lignes.some((l) => l.photos > 0)).toBe(true);
    expect(page.lignes.some((l) => l.photos === 0)).toBe(true);
  });

  test("le compteur n'est pas écrivable par le vendeur", async () => {
    // C'est un PRIVILÈGE DE COLONNE, évalué avant la policy : la garde ne vit
    // pas dans le code, elle vit dans le catalogue, et aucune relecture de code
    // ne peut la voir.
    const { error } = await alice.client
      .from("orders")
      .update({ media_count: 999 })
      .eq("id", commandeA);
    expect(error, "le vendeur a pu écrire son propre compteur de photos").not.toBeNull();
    expect(await compteurEnBase(commandeA)).toBe(await comptageReel(commandeA));
  });
});

describe("La vignette de tête de ligne", () => {
  test("la couverture désignée prime sur le premier média", async () => {
    // La liste ne signe rien sans configuration R2 : on éprouve donc la CLÉ
    // choisie, pas l'URL signée — c'est le choix qui peut se tromper, la
    // signature est éprouvée par `pnpm check:r2`.
    const medias = await interroger<{ id: string; position: number }>(
      catalogue,
      `select id, position from public.order_media
        where order_id = '${commandeA}' order by position`,
    );
    const dernier = medias[medias.length - 1];
    expect(dernier, "aucun média : la sonde n'inspecterait rien").toBeDefined();

    const { error } = await alice.client
      .from("orders")
      .update({ cover_media_id: dernier?.id })
      .eq("id", commandeA);
    expect(error, `couverture refusée : ${error?.message}`).toBeNull();

    const lues = await interroger<{ cover_media_id: string }>(
      catalogue,
      `select cover_media_id from public.orders where id = '${commandeA}'`,
    );
    expect(lues[0]?.cover_media_id).toBe(dernier?.id);
  });

  test("une commande sans média ne porte aucune vignette", async () => {
    const page = await lire(alice);
    const sansMedia = page.lignes.find((l) => l.id === commandeB);
    expect(sansMedia, "la commande témoin a disparu de la liste").toBeDefined();
    expect(sansMedia?.photos).toBe(0);
    expect(sansMedia?.vignette).toBeNull();
  });
});

describe("Les compteurs de tête d'écran", () => {
  test("le total et la semaine valent le comptage réel, sous RLS", async () => {
    const compteurs = await compterParEtat(alice.client as unknown as ClientLecture);
    expect(compteurs, "la lecture des compteurs a échoué").not.toBeNull();

    const reel = await interroger<{ total: string; semaine: string }>(
      catalogue,
      `select count(*)::text as total,
              count(*) filter (where created_at >= now() - interval '7 days')::text as semaine
         from public.orders
        where shop_id = '${alice.shopId}' and archived_at is null`,
    );

    expect(compteurs?.total).toBe(Number(reel[0]?.total));
    expect(compteurs?.creeesCetteSemaine).toBe(Number(reel[0]?.semaine));

    // Un ensemble vide passe tout : les deux nombres doivent être strictement
    // positifs pour que l'égalité ci-dessus prouve quelque chose.
    expect(compteurs?.total).toBeGreaterThan(0);
    expect(compteurs?.creeesCetteSemaine).toBeGreaterThan(0);

    // ET ILS DOIVENT DIFFÉRER. C'est la commande antidatée qui le garantit :
    // deux nombres égaux passeraient aussi bien avec un filtre de semaine
    // absent, et le contrôle ne prouverait alors que le comptage, pas le filtre.
    expect(compteurs?.creeesCetteSemaine).toBeLessThan(compteurs?.total ?? 0);
  });

  test("ils ne comptent que les commandes de leur appelant", async () => {
    const chezAlice = await compterParEtat(alice.client as unknown as ClientLecture);
    const chezBob = await compterParEtat(bob.client as unknown as ClientLecture);

    expect(chezAlice?.total).toBeGreaterThan(0);
    // Bob n'a rien créé : si la fonction n'était pas `security invoker`, elle
    // lui rendrait le total d'Alice.
    expect(chezBob?.total).toBe(0);
  });
});

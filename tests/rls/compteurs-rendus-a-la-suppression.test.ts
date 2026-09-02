import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";

/**
 * SUPPRIMER UNE COMMANDE DOIT RENDRE SES OCTETS À LA BOUTIQUE.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026, ET DÉJÀ PRÉSENT DANS LES DONNÉES RÉELLES.
 * `compter_media` (migration 049) décrémente `shops.medias_count` et
 * `shops.stockage_octets` à la suppression d'un média — sa propre en-tête
 * explique pourquoi : « un chiffre qui ne redescend pas finit par n'avoir aucun
 * rapport avec la facture, et il aurait l'air parfaitement crédible tout du
 * long ».
 *
 * Mais il commence par lire `orders` pour retrouver la boutique. À la
 * suppression d'une COMMANDE, la cascade détruit d'abord la ligne `orders`,
 * puis les `order_media` : quand le déclencheur s'exécute, la commande n'existe
 * plus, `v_shop` est nul, et il sort sans rien rendre. La commande est bien
 * supprimée, les médias aussi, et le compteur garde leurs octets POUR TOUJOURS.
 *
 * MESURE AVANT CORRECTION, sur la base réelle :
 *
 *   dépôt d'un média de 7 654 321 o  →  compteur 1 / 7 654 321
 *   suppression du MÉDIA seul        →  compteur 0 / 0            (correct)
 *   redépôt puis suppression de la COMMANDE  →  compteur 1 / 7 654 321
 *
 * Et l'écart existait déjà sur le compte de Wassim : +1 média et +100 octets
 * que rien ne pouvait plus rendre.
 *
 * ⚠️ CE N'EST PAS UN CHEMIN THÉORIQUE. Aucun écran ne supprime de commande — le
 * geste produit est l'archivage — et le catalogue confirme qu'`authenticated`
 * n'a AUCUN droit `DELETE` sur `orders`. Mais notre propre outillage en
 * supprime à chaque exécution : `scripts/fumee.mjs` détruit sa commande et son
 * brouillon dans son `finally`, donc CHAQUE passage des portes gonflait un
 * compteur d'un cran. Une dérive qui se produit à chaque mesure est la pire
 * espèce : elle grandit exactement au rythme où l'on regarde.
 *
 * CE QUE CE FICHIER TIENT : après un aller-retour complet, les deux compteurs
 * reviennent à leur valeur de départ. Il échoue DANS LES DEUX SENS — un
 * compteur qui ne descend pas, comme un compteur qui descendrait deux fois.
 */
let bd: Client;
let vendeur: UtilisateurDeTest;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("compteurs-rendus");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
  await bd.end();
});

type Compteurs = { readonly medias: number; readonly octets: number };

async function compteurs(): Promise<Compteurs> {
  const [ligne] = await interroger<{ m: number; o: string }>(
    bd,
    "select medias_count as m, stockage_octets as o from public.shops where id = $1",
    [vendeur.shopId],
  );
  if (ligne === undefined) throw new Error("boutique introuvable : la mesure ne porte sur rien");
  return { medias: Number(ligne.m), octets: Number(ligne.o) };
}

/** Une commande portant un média de `taille` octets. Rend l'identifiant. */
async function commandeAvecMedia(taille: number): Promise<string> {
  const [cmd] = await interroger<{ id: string }>(
    bd,
    "insert into public.orders (shop_id, customer_label) values ($1, $2) returning id",
    [vendeur.shopId, "compteurs-rendus"],
  );
  if (cmd === undefined) throw new Error("commande non créée");
  const media = randomUUID();
  await interroger(
    bd,
    `insert into public.order_media (id, order_id, type, cle, taille_octets, position)
       values ($1, $2, 'photo', $3, $4, 0)`,
    [media, cmd.id, `medias/${vendeur.shopId}/${cmd.id}/${media}.jpg`, taille],
  );
  return cmd.id;
}

describe("Les compteurs de la boutique reviennent à leur état", () => {
  /*
   * DES TAILLES DISTINCTES ET NON RONDES, à dessein : avec deux médias de même
   * poids, un compteur qui rendrait le mauvais des deux passerait sans qu'on le
   * voie. Et 999 983 est premier — aucune somme de sous-ensembles ne le
   * reproduit par accident.
   */
  const TAILLE_A = 999_983;
  const TAILLE_B = 4_206_907;

  test("CONTRE-TEST : le dépôt fait bien monter les deux compteurs", async () => {
    /*
     * IL VIENT EN PREMIER, ET IL N'EST PAS DÉCORATIF. Si le déclencheur d'INSERT
     * ne comptait rien, tout ce fichier passerait à 100 % — zéro plus zéro fait
     * zéro dans les deux sens — en n'ayant rien éprouvé.
     */
    const avant = await compteurs();
    const id = await commandeAvecMedia(TAILLE_A);
    const apres = await compteurs();

    expect(apres.medias - avant.medias).toBe(1);
    expect(apres.octets - avant.octets).toBe(TAILLE_A);

    await interroger(bd, "delete from public.orders where id = $1", [id]);
  });

  test("supprimer le MÉDIA rend ses octets", async () => {
    // Le cas que `compter_media` couvrait déjà. Il reste ici parce qu'une
    // correction sur la commande pourrait le casser sans qu'on le remarque.
    const avant = await compteurs();
    const id = await commandeAvecMedia(TAILLE_A);
    await interroger(bd, "delete from public.order_media where order_id = $1", [id]);

    expect(await compteurs()).toEqual(avant);
    await interroger(bd, "delete from public.orders where id = $1", [id]);
  });

  test("supprimer la COMMANDE rend les octets de ses médias", async () => {
    const avant = await compteurs();
    const id = await commandeAvecMedia(TAILLE_B);
    await interroger(bd, "delete from public.orders where id = $1", [id]);

    // ÉCHOUE DANS LES DEUX SENS : `toEqual` refuse aussi bien un compteur resté
    // en haut qu'un compteur descendu deux fois.
    expect(await compteurs()).toEqual(avant);
  });

  test("une commande à PLUSIEURS médias les rend tous, et une seule fois", async () => {
    /*
     * HORS DU CAS MOTIVANT. Le défaut a été trouvé sur une commande à un média ;
     * une correction qui déduirait « une commande, un média » — ou qui
     * décrémenterait d'une unité au lieu du compte réel — passerait le contrôle
     * précédent et rien d'autre.
     */
    const avant = await compteurs();
    const [cmd] = await interroger<{ id: string }>(
      bd,
      "insert into public.orders (shop_id, customer_label) values ($1, $2) returning id",
      [vendeur.shopId, "compteurs-rendus-multi"],
    );
    if (cmd === undefined) throw new Error("commande non créée");
    const tailles = [TAILLE_A, TAILLE_B, 77_003];
    for (const [position, taille] of tailles.entries()) {
      const media = randomUUID();
      await interroger(
        bd,
        `insert into public.order_media (id, order_id, type, cle, taille_octets, position)
           values ($1, $2, 'photo', $3, $4, $5)`,
        [media, cmd.id, `medias/${vendeur.shopId}/${cmd.id}/${media}.jpg`, taille, position],
      );
    }

    const pleine = await compteurs();
    expect(pleine.medias - avant.medias).toBe(3);
    expect(pleine.octets - avant.octets).toBe(tailles.reduce((a, b) => a + b, 0));

    await interroger(bd, "delete from public.orders where id = $1", [cmd.id]);
    expect(await compteurs()).toEqual(avant);
  });

  test("une commande SANS média ne bouge aucun compteur", async () => {
    // Le cas le plus fréquent — un brouillon abandonné. Une correction qui
    // décrémenterait à l'aveugle le ferait passer sous zéro, et `greatest`
    // masquerait l'erreur en la rendant invisible.
    const avant = await compteurs();
    const [cmd] = await interroger<{ id: string }>(
      bd,
      "insert into public.orders (shop_id, customer_label) values ($1, $2) returning id",
      [vendeur.shopId, "compteurs-rendus-vide"],
    );
    await interroger(bd, "delete from public.orders where id = $1", [cmd?.id]);

    expect(await compteurs()).toEqual(avant);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";

/**
 * `usage_counters.media_count` NE COMPTAIT RIEN, ET DISAIT ZÉRO.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026, PAR LE CATALOGUE. Aucune fonction de la base
 * n'écrit cette colonne, aucune ligne de `src/` ne la lit, et les trois lignes
 * existantes valent toutes `0`. C'est la même mort silencieuse que
 * `orders_created` avant la migration 110 — sauf que celle-ci a survécu plus
 * longtemps, parce qu'une colonne homonyme (`orders.media_count`) est, elle,
 * parfaitement tenue : chercher le nom donnait des résultats rassurants.
 *
 * POURQUOI C'EST UN DÉFAUT ET PAS UNE COLONNE INUTILISÉE. Elle est
 * `not null default 0` : elle n'est pas vide, elle AFFIRME zéro. Un compte qui
 * a déposé vingt photos ce mois-ci est décrit comme n'en ayant déposé aucune.
 * Le brief le dit du côté admin — afficher « 0 o » ferait croire qu'on a
 * mesuré — et le principe VII l'exige : « un compteur branché après coup
 * démarre vide, donc inexploitable au moment précis où il faut décider ».
 *
 * ⚠️ SA VOISINE `storage_bytes` EST LAISSÉE TELLE QUELLE, ET CE N'EST PAS UN
 * OUBLI. Elle est NULLABLE : sans écrivain elle vaut `null`, ce qui se lit
 * « non mesuré », ce qui est VRAI. Le stock d'octets vit sur
 * `shops.stockage_octets`, tenu par `compter_media` depuis la 049, et c'est lui
 * que le panneau admin affiche. Écrire un FLUX mensuel sous un nom de STOCK
 * remplacerait un silence honnête par un chiffre ambigu.
 *
 * UN FLUX, PAS UN STOCK — comme `orders_created`. La suppression d'un média ne
 * décrémente pas : un dépôt a bien eu lieu ce mois-là. C'est `shops` qui porte
 * ce qui est OCCUPÉ maintenant.
 */
let bd: Client;
let vendeur: UtilisateurDeTest;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("compteur-medias-mois");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
  await bd.end();
});

/** Le compteur du mois courant pour ce vendeur, 0 si la ligne n'existe pas. */
async function compteurDuMois(): Promise<number> {
  const [ligne] = await interroger<{ n: number }>(
    bd,
    `select coalesce(media_count, 0) as n from public.usage_counters
      where profile_id = $1 and period_month = date_trunc('month', now())::date`,
    [vendeur.profilId],
  );
  return ligne === undefined ? 0 : Number(ligne.n);
}

async function commande(etiquette: string): Promise<string> {
  const [c] = await interroger<{ id: string }>(
    bd,
    "insert into public.orders (shop_id, customer_label) values ($1, $2) returning id",
    [vendeur.shopId, etiquette],
  );
  if (c === undefined) throw new Error("commande non créée");
  return c.id;
}

async function deposer(idCommande: string, position: number): Promise<string> {
  const media = randomUUID();
  await interroger(
    bd,
    `insert into public.order_media (id, order_id, type, cle, taille_octets, position)
       values ($1, $2, 'photo', $3, 12345, $4)`,
    [media, idCommande, `medias/${vendeur.shopId}/${idCommande}/${media}.jpg`, position],
  );
  return media;
}

describe("Le compteur mensuel de médias", () => {
  test("CONTRE-TEST : le vendeur neuf part bien de zéro", async () => {
    /*
     * IL VIENT EN PREMIER. Sans lui, un compteur qui vaudrait déjà quelque
     * chose ferait passer les contrôles suivants par accident — et une suite
     * qui mesure des écarts sans connaître son point de départ ne mesure rien.
     */
    expect(await compteurDuMois()).toBe(0);
  });

  test("chaque dépôt compte pour un", async () => {
    const avant = await compteurDuMois();
    const id = await commande("compteur-medias-un");
    await deposer(id, 0);
    expect(await compteurDuMois()).toBe(avant + 1);

    await deposer(id, 1);
    await deposer(id, 2);
    expect(await compteurDuMois()).toBe(avant + 3);
  });

  test("supprimer un média NE décrémente pas — c'est un flux, pas un stock", async () => {
    /*
     * HORS DU CAS MOTIVANT, et c'est la moitié qui distingue ce compteur de
     * celui de `shops`. Une correction qui recopierait `compter_media` par
     * symétrie ferait redescendre le chiffre, et le mois dirait alors « aucun
     * dépôt » pour un mois où il y en a eu vingt puis vingt suppressions.
     */
    const id = await commande("compteur-medias-flux");
    const media = await deposer(id, 0);
    const apresDepot = await compteurDuMois();

    await interroger(bd, "delete from public.order_media where id = $1", [media]);
    expect(await compteurDuMois()).toBe(apresDepot);

    // Et la suppression de la commande entière ne le fait pas redescendre non
    // plus, alors qu'elle rend bien les octets à `shops` (migration 139).
    await interroger(bd, "delete from public.orders where id = $1", [id]);
    expect(await compteurDuMois()).toBe(apresDepot);
  });

  test("le stock de la boutique, lui, redescend — les deux compteurs disent des choses différentes", async () => {
    /*
     * LE CONTRE-TEST DU PRÉCÉDENT. Sans lui, « le compteur ne redescend pas »
     * serait aussi vrai d'un compteur qui ne compte rien du tout.
     */
    const id = await commande("compteur-medias-stock");
    await deposer(id, 0);
    const [avant] = await interroger<{ o: string }>(
      bd,
      "select stockage_octets as o from public.shops where id = $1",
      [vendeur.shopId],
    );
    await interroger(bd, "delete from public.orders where id = $1", [id]);
    const [apres] = await interroger<{ o: string }>(
      bd,
      "select stockage_octets as o from public.shops where id = $1",
      [vendeur.shopId],
    );
    expect(Number(apres?.o)).toBe(Number(avant?.o) - 12345);
  });

  test("`storage_bytes` reste NULL, et c'est la réponse juste", async () => {
    /*
     * Un `null` se lit « non mesuré ». Un zéro affirmerait qu'on a mesuré et
     * trouvé zéro. Le jour où quelqu'un voudra ce chiffre, il devra décider ce
     * qu'il mesure — et ce test le forcera à le décider plutôt qu'à hériter
     * d'une valeur par défaut.
     */
    const [ligne] = await interroger<{ s: number | null }>(
      bd,
      `select storage_bytes as s from public.usage_counters
        where profile_id = $1 and period_month = date_trunc('month', now())::date`,
      [vendeur.profilId],
    );
    expect(ligne, "aucune ligne de compteur : le contrôle ne porte sur rien").toBeDefined();
    expect(ligne?.s).toBeNull();
  });
});

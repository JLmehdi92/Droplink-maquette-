import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { limites } from "@/lib/storage/limites";

/**
 * LE PLAFOND DE MÉDIAS EST ÉCRIT DEUX FOIS. IL DOIT DIRE LA MÊME CHOSE.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026. `limites()` lit `DEPOT_MEDIAS_PAR_COMMANDE`
 * avec 20 pour défaut, et le déclencheur `verifier_plafonds_media` porte `20`
 * EN DUR. Le module qui expose ces seuils interdit pourtant ce cas dans son
 * propre en-tête : « ils sont EN CONFIGURATION et non en dur, parce qu'ils sont
 * provisoires… un seuil en configuration se corrige le jour où on découvre
 * qu'il est faux ».
 *
 * ⚠️ ET LE GESTE QUE CE COMMENTAIRE ANNONCE COMME LE REMÈDE PRODUIT UN DÉFAUT
 * COÛTEUX. Poser `DEPOT_MEDIAS_PAR_COMMANDE=30` donne : l'écran affiche
 * « 0/30 », `limites()` laisse passer, le navigateur dépose le 21ᵉ objet
 * DIRECTEMENT dans R2 par URL présignée — et l'`INSERT` qui suit est refusé par
 * le déclencheur avec `DL020`. Trois conséquences, toutes silencieuses :
 *
 *   1. un OBJET ORPHELIN reste dans R2. Il est payé, stocké, et aucune ligne
 *      `order_media` ne le référence — donc aucune interface ne peut le
 *      supprimer ;
 *   2. `shops.stockage_octets` et `medias_count` sont tenus par le déclencheur
 *      `compter_media` sur l'INSERT, celui-là même qui vient d'échouer : l'octet
 *      est facturé par Cloudflare et invisible du panneau admin ;
 *   3. le panneau admin affiche le plafond lu par `limites()`, c'est-à-dire un
 *      plafond que le produit n'applique pas.
 *
 * ⚠️ ET AUCUNE SUITE NE POUVAIT LE VOIR. `commandes-medias` insère 20 puis 21
 * lignes en dur, en passant PAR-DESSUS la couche applicative : elle resterait
 * verte avec `DEPOT_MEDIAS_PAR_COMMANDE=30`, en éprouvant un déclencheur que
 * personne n'a changé.
 *
 * CE GARDE NE SUPPRIME PAS LA DUPLICATION — il la rend INCAPABLE DE DIVERGER EN
 * SILENCE. Le jour où quelqu'un pose la variable d'environnement, la porte
 * rougit et dit pourquoi, au lieu de laisser des octets orphelins chez
 * Cloudflare.
 *
 * ⚠️ IL INTERROGE LE CORPS DE LA FONCTION EN BASE, pas le fichier de migration :
 * c'est la fonction qui refuse, et c'est elle qui peut avoir été remplacée par
 * une migration ultérieure ou une main directe.
 */
let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  await bd.end();
});

/** Les seuils que le déclencheur applique VRAIMENT, lus dans son corps. */
async function seuilsDuDeclencheur(): Promise<{ medias: number | null; videos: number | null }> {
  const lignes = await interroger<{ prosrc: string }>(
    bd,
    `select p.prosrc from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'verifier_plafonds_media'`,
  );
  const src = lignes[0]?.prosrc ?? "";
  const medias = /v_medias\s*>=\s*(\d+)/.exec(src);
  const videos = /v_videos\s*>=\s*(\d+)/.exec(src);
  return {
    medias: medias === null ? null : Number(medias[1]),
    videos: videos === null ? null : Number(videos[1]),
  };
}

describe("Les plafonds de médias disent la même chose des deux côtés", () => {
  test("le déclencheur existe et porte bien deux seuils", async () => {
    // UN ENSEMBLE VIDE PASSE TOUT : si la fonction disparaissait ou changeait de
    // forme, les deux comparaisons ci-dessous seraient vertes à vide — et le
    // plafond ne serait plus appliqué DU TOUT.
    const s = await seuilsDuDeclencheur();
    expect(s.medias, "seuil de médias introuvable dans le déclencheur").not.toBeNull();
    expect(s.videos, "seuil de vidéos introuvable dans le déclencheur").not.toBeNull();

    const attache = await interroger<{ tgname: string }>(
      bd,
      `select t.tgname from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
        where c.relname = 'order_media' and not t.tgisinternal
          and pg_get_triggerdef(t.oid) ilike '%verifier_plafonds_media%'`,
    );
    expect(attache.length, "le déclencheur n'est attaché à aucune table").toBeGreaterThan(0);
  });

  test("le plafond de médias appliqué EN BASE est celui que l'application annonce", async () => {
    const s = await seuilsDuDeclencheur();
    expect(
      s.medias,
      `L'application annonce ${limites().mediasParCommande} médias par commande, la base en ` +
        `refuse au-delà de ${s.medias}. Un média déposé entre les deux est payé dans R2 et ` +
        "n'a aucune ligne qui le référence : personne ne peut plus le supprimer.",
    ).toBe(limites().mediasParCommande);
  });

  test("le plafond de vidéos appliqué EN BASE est celui que l'application annonce", async () => {
    const s = await seuilsDuDeclencheur();
    expect(s.videos, "même écart, sur les vidéos — le poste de coût qui peut déraper").toBe(
      limites().videosParCommande,
    );
  });
});

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LES PLAFONDS PAR COMPTE.
 *
 * Les plafonds existants — vingt médias, trois vidéos — sont posés PAR COMMANDE.
 * Rien ne bornait donc un COMPTE : mesuré, cinq mille commandes insérées en
 * 533 ms. Un compte pouvait remplir le stockage sans jamais franchir aucune
 * limite, puisque chaque commande prise séparément restait dans les clous.
 *
 * ÉPROUVER UN PLAFOND DE 3 000 EN Y INSÉRANT 3 000 LIGNES serait un test lent et
 * fragile, et surtout un test qui mesurerait la vitesse d'insertion plutôt que
 * la borne. On abaisse donc le plafond LE TEMPS DU CONTRÔLE.
 *
 * ⚠️ CE CONTRÔLE RÉÉCRIVAIT LA FONCTION, ET SON `afterAll` LA RESTAURAIT DEPUIS
 * LA MIGRATION 077. Il aurait donc ANNULÉ la 095 — silencieusement, à la fin
 * d'une suite verte, et la remise en état aurait ressemblé à un succès. C'est
 * exactement le motif déjà rencontré sur le falsificateur : une réparation qui
 * vise une migration périmée réinstalle le défaut qu'on vient de corriger.
 *
 * Depuis la 095, le plafond n'est plus dans le corps de la fonction : il vient
 * de `system_settings`. On ÉCRIT DONC LE PARAMÈTRE, ce qui est à la fois plus
 * simple et strictement plus fort — le test éprouve désormais la chaîne
 * ENTIÈRE, du réglage jusqu'au refus, au lieu d'une copie du déclencheur.
 *
 * L'écriture est faite DIRECTEMENT dans la table et non par `ecrire_parametre` :
 * les bornes admises commencent à 100, et insérer cent commandes ferait de ce
 * contrôle une mesure de vitesse d'insertion. C'est le déclencheur qu'on
 * éprouve ici, pas les bornes — celles-ci ont leur propre suite.
 */

let alice: UtilisateurDeTest;
let catalogue: Client;

/** Rend le SQLSTATE d'un refus, ou `null` si la base a accepté. */
async function refus(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await interroger(catalogue, sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "inconnu";
  }
}

async function creerCommande(u: UtilisateurDeTest): Promise<string | null> {
  return refus("insert into public.orders (shop_id) values ($1)", [u.shopId]);
}

/** Abaisse le plafond de commandes au niveau du RÉGLAGE, pas de la fonction. */
async function abaisserPlafondCommandes(valeur: number): Promise<void> {
  await interroger(
    catalogue,
    `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb($1::int))
       on conflict (key) do update set value = excluded.value`,
    [valeur],
  );
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("plafond-alice");

  /*
   * ⚠️ ALICE EST PASSÉE EN `pro`, ET CE N'EST PAS UN CONTOURNEMENT.
   *
   * Depuis la migration 176, le plafond MENSUEL est celui des comptes payants :
   * un compte gratuit relève d'un quota À VIE (15), qui est une autre règle,
   * avec un autre code d'erreur. Laisser Alice gratuite ferait mesurer à ce
   * fichier la règle qu'il ne décrit pas — il rougirait sur `DL067` en croyant
   * parler du plafond mensuel, ou pire, il passerait pour la mauvaise raison.
   *
   * Le quota à vie a sa propre suite, `quota-gratuit.test.ts`.
   */
  await interroger(catalogue, "update public.profiles set plan = 'pro' where id = $1", [
    alice.profilId,
  ]);
}, 120_000);

afterAll(async () => {
  /*
   * ON RETIRE LA LIGNE, ON N'Y REMET PAS 3 000.
   *
   * Ce sont deux états DIFFÉRENTS, et c'est toute la raison d'être de la table :
   * une clé absente signifie « personne n'a jamais décidé », une ligne à 3 000
   * signifie « quelqu'un a choisi 3 000 ». Y réécrire le défaut ferait afficher
   * à l'écran d'administration une décision que ce test aurait prise à la place
   * de l'administrateur.
   *
   * Et il n'y a plus rien d'autre à défaire : la fonction n'a pas été touchée.
   * L'ancienne version de ce fichier la réécrivait puis la restaurait depuis la
   * migration 077 — ce qui, depuis la 095, aurait réinstallé le plafond en dur
   * à la fin d'une suite verte.
   */
  await interroger(
    catalogue,
    "delete from public.system_settings where key = 'plafond_commandes_mensuel'",
  );

  await supprimerUtilisateur(alice);
  await catalogue.end();
});

describe("Le nombre de commandes par mois est borné", () => {
  test("au-delà du plafond, la base refuse", async () => {
    await abaisserPlafondCommandes(3);

    // La sonde doit d'abord prouver qu'elle inspecte quelque chose : si les trois
    // premières étaient refusées, le quatrième refus ne dirait rien.
    for (let i = 0; i < 3; i += 1) {
      expect(await creerCommande(alice), `la commande ${i + 1} a été refusée à tort`).toBeNull();
    }

    expect(
      await creerCommande(alice),
      "un compte a dépassé son plafond mensuel de commandes",
    ).toBe("DL035");
  });

  test("contre-test positif : sous le plafond, rien n'est refusé", async () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. Le plafond
    // doit laisser travailler le vendeur qui travaille — c'est le cas normal, et
    // le seul qui compte pour lui.
    await abaisserPlafondCommandes(50);
    expect(await creerCommande(alice), "une commande légitime est refusée").toBeNull();
  });

  test("SANS AUCUN RÉGLAGE, le plafond vaut quand même 3 000", async () => {
    /*
     * LE CAS DU PREMIER DÉPLOIEMENT, et celui qu'aucun autre contrôle ici ne
     * couvre : les deux précédents ÉCRIVENT un réglage, donc ils passeraient
     * tous les deux si le défaut avait disparu.
     *
     * Sans défaut, `lire_plafond_commandes()` rendrait NULL sur une base où
     * personne n'a jamais rien décidé — c'est-à-dire en production, au premier
     * jour. La comparaison `v_ce_mois >= NULL` rend NULL, le `if` ne se
     * déclenche jamais, et le plafond est désactivé sans qu'une seule ligne
     * n'échoue. Une protection qui tient à la présence d'une ligne de
     * configuration n'est pas une protection.
     *
     * ⚠️ ON INTERROGE LA FONCTION, ON N'INSÈRE PAS 3 000 COMMANDES. Insérer
     * trois mille lignes mesurerait la vitesse d'insertion, pas la borne. Ce que
     * ce contrôle établit est le DÉFAUT ; que le déclencheur passe bien par
     * cette fonction est établi par les deux contrôles ci-dessus, qui échouent
     * dès qu'il cesse de la lire.
     */
    await interroger(
      catalogue,
      "delete from public.system_settings where key = 'plafond_commandes_mensuel'",
    );
    const l = await interroger<{ v: number | null }>(
      catalogue,
      "select public.lire_plafond_commandes() as v",
    );
    expect(l[0]?.v, "le plafond est NULL en l'absence de réglage : il ne borne plus rien").toBe(
      3000,
    );
  });
});

/**
 * LE NOMBRE DE COLIS PRIS EN CHARGE PAR MOIS EST BORNÉ.
 *
 * ⚠️ DÉFAUT RÉEL, RELEVÉ LE 31/08/2026 : `tracked_parcels` ne portait AUCUN
 * plafond. Or la prise en charge est la seule opération PAYANTE du produit, et
 * le palier gratuit du fournisseur n'est plus mensuel — 200 prises en charge,
 * une seule fois, COMMUNES à tous les comptes.
 *
 * LE VECTEUR N'EST PAS LE VOLUME, C'EST LE BATTEMENT. `attacher_colis` détache
 * l'ancien colis puis insère le nouveau : changer le numéro de suivi N fois sur
 * UNE SEULE commande crée N colis, chacun avec `registered_at is null`, donc
 * chacun repris par la cadence. Un compte, une commande, et la sauvegarde
 * automatique toutes les 800 ms suffisaient à épuiser le budget de tout le
 * monde. La fonction étant accordée à `authenticated`, elle est de surcroît
 * appelable directement en PostgREST, hors de toute limitation de débit.
 *
 * Le plafond vaut DEUX FOIS celui des commandes (migration 125) : un colis
 * correspond à une commande, et le facteur 2 laisse une correction de numéro sur
 * chacune. On abaisse donc le réglage des commandes pour éprouver la borne, plutôt
 * que d'insérer six mille lignes — ce qui mesurerait la vitesse d'insertion.
 */
describe("Le nombre de colis pris en charge est borné", () => {
  async function creerColis(u: UtilisateurDeTest, numero: string): Promise<string | null> {
    return refus(
      "insert into public.tracked_parcels (shop_id, tracking_number) values ($1, $2)",
      [u.shopId, numero],
    );
  }

  test("au-delà du plafond, la base refuse la prise en charge", async () => {
    // Plafond de commandes à 1 ⇒ plafond de colis à 2.
    await abaisserPlafondCommandes(1);

    // LA SONDE PROUVE D'ABORD QU'ELLE INSPECTE QUELQUE CHOSE : si les deux
    // premiers étaient refusés, le troisième refus ne dirait rien.
    for (let i = 0; i < 2; i += 1) {
      expect(
        await creerColis(alice, `SONDE-PLAFOND-${Date.now()}-${i}`),
        `le colis ${i + 1} a été refusé à tort`,
      ).toBeNull();
    }

    expect(
      await creerColis(alice, `SONDE-PLAFOND-${Date.now()}-trop`),
      "un compte a dépassé son plafond mensuel de colis : il peut épuiser le budget de suivi de tout le produit",
    ).toBe("DL051");
  });

  test("contre-test positif : sous le plafond, une prise en charge passe", async () => {
    // Sans lui, un déclencheur qui refuserait TOUT passerait le test ci-dessus.
    await abaisserPlafondCommandes(50);
    expect(
      await creerColis(alice, `SONDE-PLAFOND-OK-${Date.now()}`),
      "une prise en charge légitime a été refusée",
    ).toBeNull();
  });
});

describe("Le stockage par compte est borné", () => {
  test("un dépôt qui ferait franchir le plafond est refusé", async () => {
    /*
     * Le plafond réel est de 100 Go. Plutôt que de le déplacer, on porte le
     * COMPTEUR juste sous la borne : c'est le même chemin de décision, avec la
     * fonction du dépôt, non modifiée.
     *
     * Le compteur est celui que la migration 049 tient à l'écriture. Le lire
     * plutôt que de sommer `order_media` n'est pas une commodité : quand un
     * agrégat porte sur une table qui grossit avec l'usage, aucun index ne le
     * rattrape — et ce contrôle s'exécute à chaque dépôt.
     */
    await interroger(catalogue, "update public.shops set stockage_octets = $2 where id = $1", [
      alice.shopId,
      99_999_999_000,
    ]);

    const l = await interroger<{ id: string }>(
      catalogue,
      "insert into public.orders (shop_id) values ($1) returning id",
      [alice.shopId],
    );
    const commande = l[0]?.id ?? "";
    const prefixe = await interroger<{ p: string }>(
      catalogue,
      "select public.prefixe_media_attendu($1) as p",
      [commande],
    );

    const deposer = (taille: number, position: number) =>
      refus(
        `insert into public.order_media (order_id, type, cle, taille_octets, position)
         values ($1, 'photo', $2, $3, $4)`,
        // Le dernier segment est un UUID : c'est la forme que `cleMedia()`
        // fabrique, et celle que la migration 089 exige en base. Un
        // `${position}.jpg` serait refusé pour une raison SANS RAPPORT avec le
        // plafond — et ce test certifierait alors une garde qui n'a pas joué.
        [
          commande,
          `${String(prefixe[0]?.p)}aaaaaaaa-0000-4000-8000-${String(position).padStart(12, "0")}.jpg`,
          taille,
          position,
        ],
      );

    // Sous la borne : accepté. Sans ce premier dépôt, le refus suivant pourrait
    // venir de n'importe quoi d'autre — un préfixe mal formé, un plafond de
    // médias — et le contrôle certifierait une garde qui n'a pas joué.
    expect(await deposer(500, 0), "un dépôt sous le plafond est refusé").toBeNull();

    expect(
      await deposer(2_000_000_000, 1),
      "un compte a franchi son plafond de stockage",
    ).toBe("DL036");
  });
});

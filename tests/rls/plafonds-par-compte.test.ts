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
 * la borne. On abaisse donc le plafond LE TEMPS DU CONTRÔLE, sur la fonction
 * réelle, puis on rétablit exactement le corps du dépôt — jamais une copie
 * réécrite à la main, qui dériverait sans que rien ne le dise.
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

/** Remplace le plafond de commandes par une valeur éprouvable, et rend de quoi défaire. */
async function abaisserPlafondCommandes(valeur: number): Promise<void> {
  await interroger(
    catalogue,
    `create or replace function public.verifier_plafond_commandes()
       returns trigger language plpgsql set search_path = '' as $t$
     declare v_ce_mois integer;
     begin
       select count(*) into v_ce_mois from public.orders
        where shop_id = new.shop_id and created_at >= date_trunc('month', now());
       if v_ce_mois >= ${String(valeur)} then
         raise exception 'Plafond mensuel de commandes atteint pour ce compte (%).', v_ce_mois
           using errcode = 'DL035';
       end if;
       return new;
     end; $t$;`,
  );
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("plafond-alice");
}, 120_000);

afterAll(async () => {
  // Le plafond réel est REMIS depuis le fichier de migration, pas réécrit ici :
  // une réparation recopiée à la main dérive du dépôt sans que rien ne le dise,
  // et l'on croirait avoir restauré l'état de référence en ayant restauré une
  // copie périmée.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "077_plafonds_par_compte.sql"),
    "utf8",
  );
  const debut = migration.indexOf("create function public.verifier_plafond_commandes()");
  const fin = migration.indexOf("$$;", debut) + 3;
  await interroger(catalogue, migration.slice(debut, fin).replace("create function", "create or replace function"));

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

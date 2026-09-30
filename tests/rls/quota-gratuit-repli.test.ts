import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { ouvrirConnexionCatalogue } from "../aide/base";
import { PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT } from "@/lib/audit/panneau";

/**
 * LE REPLI DE LA BASE ET CELUI DE L'APPLICATION DISENT LE MÊME NOMBRE (210).
 *
 * Le quota gratuit vit à deux endroits : `lire_plafond_gratuit_a_vie()` le lit dans
 * `system_settings` et retombe sur un nombre écrit dans la fonction quand la clé
 * manque ; l'administration affiche `PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT` comme
 * valeur par défaut. La 210 a changé les deux (15 → 5). Si l'un bouge sans l'autre,
 * l'écran d'administration annonce un défaut que la base n'applique pas — et rien
 * d'autre ne le dirait, puisque la clé est réglée partout.
 *
 * Tout se passe dans une transaction ANNULÉE : la clé retirée ne l'est que pour ce
 * test, les suites voisines ne voient jamais la base sans elle.
 */

let catalogue: Client;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await catalogue.end();
});

describe("Le repli du quota gratuit", () => {
  test("sans réglage en base, la fonction rend la valeur par défaut de l'application", async () => {
    const lire = async () =>
      (await catalogue.query<{ n: number }>("select public.lire_plafond_gratuit_a_vie() as n")).rows[0]?.n;
    await catalogue.query("begin");
    try {
      // CONTRE-TEST D'ABORD : une valeur réglée est bien LUE. Sans lui, une fonction qui
      // rendrait toujours son repli passerait ce test — la base de tests n'a d'ailleurs
      // pas cette clé (mesuré en falsifiant le repli le 30/09/2026).
      await catalogue.query(
        `insert into public.system_settings (key, value) values ('plafond_commandes_gratuit_a_vie', to_jsonb(7))
           on conflict (key) do update set value = excluded.value`,
      );
      expect(await lire(), "la valeur réglée n'est pas lue").toBe(7);

      await catalogue.query("delete from public.system_settings where key = 'plafond_commandes_gratuit_a_vie'");
      expect(await lire()).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);
    } finally {
      await catalogue.query("rollback");
    }
  });

  test("la valeur réglée en base est celle de la décision du 30/09/2026", async () => {
    const { rows } = await catalogue.query<{ n: number }>("select public.lire_plafond_gratuit_a_vie() as n");
    expect(rows[0]?.n).toBe(5);
  });
});

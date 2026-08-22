import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * LES DROITS QUE LE CODE NE MONTRE PAS.
 *
 * Ces propriétés vivent dans le CATALOGUE Postgres. Elles ne s'écrivent pas
 * dans le corps d'une fonction ni dans la définition d'une table : aucune
 * relecture de code, si attentive soit-elle, ne peut les voir. Il faut
 * interroger.
 *
 * TROIS DÉFAUTS RÉELS ONT MOTIVÉ CE FICHIER, tous trouvés en interrogeant la
 * base et aucun visible dans les migrations :
 *
 *  1. `lire_commande_publique` portait un droit d'exécution accordé à **PUBLIC**
 *     — et PAS à `anon`. La page publique fonctionnait en héritant du droit de
 *     PUBLIC. Les migrations 017 et 035 écrivent pourtant toutes les deux le
 *     `revoke`. La sonde existante n'a rien vu parce qu'elle demande
 *     `has_function_privilege('anon', …)`, qui répond `true` pour un droit
 *     PUBLIC **exactement comme** pour un droit à `anon` : elle interroge bien
 *     un effet, mais un effet trop grossier pour distinguer « ouvert à anon »
 *     de « ouvert à tout le monde ».
 *
 *  2. Les droits PAR DÉFAUT du schéma `public` accordaient TOUT à `anon` et
 *     `authenticated` sur les tables et les séquences à venir. Les quinze
 *     tables existantes étaient fermées une par une — la protection tenait donc
 *     à ce que quelqu'un pense à l'écrire à chaque fois. Le taux d'échec observé
 *     est de 1 sur 15 : la migration 013 a créé `order_media` sans `revoke`, et
 *     la 014 existe pour rattraper.
 *
 *  3. `grant insert` posé sur une TABLE couvre TOUTES ses colonnes. La sonde des
 *     privilèges de colonne ne filtrait que `UPDATE` — parce que le défaut
 *     d'origine portait sur l'UPDATE. Le garde regardait là où le défaut n'était
 *     plus.
 *
 * CHAQUE CONTRÔLE ÉTABLIT D'ABORD QU'IL INSPECTE QUELQUE CHOSE. Un ensemble
 * vide passe tout, et une requête de catalogue qui ne rend rien à cause d'une
 * faute de nom de schéma est verte et muette.
 */

let catalogue: Client;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  await catalogue.end();
});

describe("Droits d'exécution — le bénéficiaire PUBLIC", () => {
  test("la sonde voit réellement des fonctions", async () => {
    const total = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`,
    );
    expect(Number(total[0]?.n), "aucune fonction lue : la requête est fausse").toBeGreaterThan(50);
  });

  test("AUCUNE fonction de public n'est exécutable par PUBLIC", async () => {
    // AUCUNE EXCEPTION N'EST ADMISE, et c'est délibéré. Un droit à PUBLIC ne
    // désigne pas un rôle mais « tout le monde, y compris les rôles qui
    // n'existent pas encore ». Il n'existe aucune raison légitime d'en accorder
    // un ici : ce qui doit être ouvert l'est nommément à `anon` ou à
    // `authenticated`.
    const ouvertes = await interroger<{ proname: string }>(
      catalogue,
      `select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace,
            aclexplode(p.proacl) a
       where n.nspname = 'public' and a.grantee = 0
       order by p.proname`,
    );

    expect(
      ouvertes.map((l) => l.proname),
      "Fonctions exécutables par PUBLIC. Un droit à PUBLIC vaut pour tout rôle " +
        "présent ET futur, et `has_function_privilege('anon', …)` ne sait pas " +
        "le distinguer d'un droit à `anon`.",
    ).toEqual([]);
  });

  test("contre-test positif : la lecture publique EST ouverte à anon, nommément", async () => {
    // Sans lui, un schéma où plus rien ne serait exécutable passerait le
    // contrôle précédent à 100 % en ayant cassé le produit.
    const droits = await interroger<{ ok: boolean }>(
      catalogue,
      `select exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace,
              aclexplode(p.proacl) a
         join pg_roles r on r.oid = a.grantee
         where n.nspname = 'public'
           and p.proname = 'lire_commande_publique'
           and r.rolname = 'anon'
           and a.privilege_type = 'EXECUTE'
       ) as ok`,
    );
    expect(droits[0]?.ok, "`anon` n'a pas le droit NOMMÉ d'exécuter la lecture publique").toBe(
      true,
    );
  });
});

describe("Droits par défaut — ce que l'objet SUIVANT recevra", () => {
  test("la sonde voit réellement des droits par défaut", async () => {
    const total = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       where n.nspname = 'public'`,
    );
    expect(Number(total[0]?.n), "aucun droit par défaut lu").toBeGreaterThan(0);
  });

  test("aucun objet créé par `postgres` ne naîtra ouvert à anon ou authenticated", async () => {
    // C'EST LA SEULE PROTECTION QUI VAUT POUR CE QU'ON N'A PAS ENCORE ÉCRIT.
    // Fermer chaque table à la main protège les tables d'aujourd'hui ; fermer
    // le défaut protège celles de demain.
    const ouverts = await interroger<{ type: string; role: string }>(
      catalogue,
      `select d.defaclobjtype as type, r.rolname as role
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       join pg_roles proprio on proprio.oid = d.defaclrole,
            aclexplode(d.defaclacl) a
       join pg_roles r on r.oid = a.grantee
       where n.nspname = 'public'
         and proprio.rolname = 'postgres'
         and r.rolname in ('anon', 'authenticated')
       order by 1, 2`,
    );

    expect(
      ouverts.map((l) => `${l.type}:${l.role}`),
      "Droits par défaut ouverts : tout objet créé ensuite les recevra sans " +
        "que le fichier de migration ne le dise.",
    ).toEqual([]);
  });

  test("les droits par défaut de `supabase_admin` sont SIGNALÉS, faute de pouvoir être fermés", async () => {
    /*
     * CE QU'ON NE PEUT PAS FERMER, ON LE SURVEILLE.
     *
     * `alter default privileges` ne vaut que pour les objets créés par le rôle
     * qui l'émet. Les entrées appartenant à `supabase_admin` ne sont pas
     * modifiables depuis nos migrations — elles concernent les objets que
     * Supabase crée lui-même, notamment les extensions.
     *
     * Ce contrôle ne les interdit donc pas : il RECENSE, et il échoue si le
     * recensement change. Une extension installée dans `public` demain
     * apporterait des fonctions exécutables par `anon` sans qu'aucune migration
     * ne l'écrive — c'est exactement pour cela que la migration 002 a déplacé
     * `unaccent` hors de `public`.
     */
    const connus = await interroger<{ type: string; role: string }>(
      catalogue,
      // DISTINCT : `aclexplode` rend une ligne par privilège, donc huit lignes
       // pour un `arwdDxtm`. Ce qu'on recense ici est le COUPLE genre d'objet /
       // rôle, pas le détail des verbes.
       `select distinct d.defaclobjtype as type, r.rolname as role
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       join pg_roles proprio on proprio.oid = d.defaclrole,
            aclexplode(d.defaclacl) a
       join pg_roles r on r.oid = a.grantee
       where n.nspname = 'public'
         and proprio.rolname = 'supabase_admin'
         and r.rolname in ('anon', 'authenticated')
       order by 1, 2`,
    );

    // L'état constaté au 22/08/2026, et la raison de chaque ligne : tables,
    // séquences et fonctions créées PAR SUPABASE. Si ce recensement grandit,
    // c'est qu'un objet d'un genre nouveau naîtra ouvert.
    expect(connus.map((l) => `${l.type}:${l.role}`).sort()).toEqual(
      ["S:anon", "S:authenticated", "f:anon", "f:authenticated", "r:anon", "r:authenticated"].sort(),
    );
  });
});

describe("Privilèges de colonne — l'INSERT autant que l'UPDATE", () => {
  test("la sonde voit réellement des privilèges de colonne", async () => {
    const total = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n from information_schema.column_privileges
       where table_schema = 'public' and grantee = 'authenticated'`,
    );
    expect(Number(total[0]?.n), "aucun privilège de colonne lu").toBeGreaterThan(10);
  });

  test("les colonnes que le SERVEUR établit ne sont ni insérables ni modifiables", async () => {
    /*
     * INVENTAIRE, PAS SÉLECTION. La liste décrit ce qui doit rester hors de
     * portée du client, et le contrôle porte sur les DEUX verbes — parce que le
     * défaut d'origine, lui, ne portait que sur l'UPDATE.
     *
     * `orders.public_token` et `unsubscribe_token` sont dans la liste bien que
     * le déclencheur `poser_jetons` les écrase de toute façon : une protection
     * qui tient à un seul mécanisme n'en est pas une, et ce qui ne peut pas
     * être fourni n'a pas à l'être.
     */
    const interdites: ReadonlyMap<string, readonly string[]> = new Map([
      [
        "orders",
        [
          "public_token",
          "unsubscribe_token",
          "first_content_at",
          "created_event_at",
          "views_count",
          "last_viewed_at",
          "created_at",
          "updated_at",
        ],
      ],
      ["profiles", ["role", "status"]],
      ["shops", ["commandes_reelles", "medias_count", "stockage_octets"]],
      ["order_media", ["source", "created_at"]],
    ]);

    const accordees = await interroger<{
      table_name: string;
      column_name: string;
      privilege_type: string;
    }>(
      catalogue,
      `select table_name, column_name, privilege_type
       from information_schema.column_privileges
       where table_schema = 'public'
         and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE')
       order by 1, 2, 3`,
    );

    const fautes = accordees
      .filter((l) => (interdites.get(l.table_name) ?? []).includes(l.column_name))
      .map((l) => `${l.table_name}.${l.column_name} ${l.privilege_type}`);

    expect(
      fautes,
      "Colonnes établies par le serveur, accordées au client. Un `grant` posé " +
        "sur la TABLE couvre toutes les colonnes — y compris celles qu'un " +
        "`grant` de colonnes voisin semble seul autoriser.",
    ).toEqual([]);
  });

  test("contre-test positif : les colonnes du vendeur, elles, restent accordées", async () => {
    // Sans lui, un schéma où l'on aurait tout révoqué passerait le contrôle
    // précédent en ayant rendu le produit inutilisable.
    const vendeur = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n
       from information_schema.column_privileges
       where table_schema = 'public'
         and grantee = 'authenticated'
         and table_name = 'orders'
         and column_name in ('customer_label', 'product_ref', 'internal_notes')
         and privilege_type = 'UPDATE'`,
    );
    expect(Number(vendeur[0]?.n), "le vendeur ne peut plus éditer sa commande").toBe(3);
  });
});

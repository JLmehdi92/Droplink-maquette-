import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * Sondes de sécurité par catalogue.
 *
 * Principe directeur : la sonde rend TOUT, le test déclare ses exceptions avec
 * leur raison, et il échoue DANS LES DEUX SENS — une protection manquante fait
 * échouer, et une exception devenue inutile aussi. Sans le second sens, une
 * exception posée pour une raison disparue survit indéfiniment et couvre le
 * jour où le défaut revient.
 *
 * Chaque sonde établit d'abord qu'elle INSPECTE quelque chose : un ensemble
 * vide passe tout, et une suite verte sur rien est le pire des résultats
 * puisqu'elle est indiscernable d'une suite verte sur tout.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

describe("Sonde A — RLS sur toutes les tables de public", () => {
  /**
   * Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut. La RLS est
   * la seule chose qui sépare un anonyme de toutes les lignes : une table créée
   * sans elle est grande ouverte, et le fichier de migration ne le dira pas.
   */
  const TABLES_SANS_RLS_ADMISES = new Map<string, string>([
    // Aucune pour l'instant. Toute entrée ici doit porter sa raison, et sera
    // signalée dès qu'elle deviendra inutile.
  ]);

  test("chaque table porte la RLS, activée et forcée, avec au moins une policy", async () => {
    const tables = await interroger<{
      table_name: string;
      rls_active: boolean;
      rls_forcee: boolean;
      nb_policies: string;
    }>(
      bd,
      `select c.relname as table_name,
              c.relrowsecurity as rls_active,
              c.relforcerowsecurity as rls_forcee,
              (select count(*) from pg_policy p where p.polrelid = c.oid)::text as nb_policies
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
       order by c.relname`,
    );

    // La garde prouve qu'elle inspecte quelque chose avant de prouver que ce
    // quelque chose est correct.
    expect(
      tables.length,
      "La sonde n'a trouvé AUCUNE table dans public. Soit les migrations ne " +
        "sont pas appliquées, soit la sonde interroge la mauvaise base — dans " +
        "les deux cas elle ne prouve rien.",
    ).toBeGreaterThan(0);

    const defauts: string[] = [];
    for (const t of tables) {
      if (TABLES_SANS_RLS_ADMISES.has(t.table_name)) continue;
      if (!t.rls_active) defauts.push(`${t.table_name} : RLS non activée`);
      if (!t.rls_forcee) defauts.push(`${t.table_name} : RLS non forcée`);
      if (Number(t.nb_policies) === 0) {
        defauts.push(`${t.table_name} : RLS activée mais AUCUNE policy`);
      }
    }
    expect(defauts, defauts.join(" | ")).toEqual([]);

    // Deuxième sens : une exception qui n'a plus lieu d'être doit faire échouer.
    const exceptionsPerimees = [...TABLES_SANS_RLS_ADMISES.keys()].filter((nom) => {
      const t = tables.find((x) => x.table_name === nom);
      return t === undefined || t.rls_active;
    });
    expect(
      exceptionsPerimees,
      `Exceptions déclarées devenues inutiles : ${exceptionsPerimees.join(", ")}. ` +
        "Les retirer — une exception périmée couvre le retour du défaut.",
    ).toEqual([]);
  });
});

describe("Sonde B — droits d'exécution dans public", () => {
  /**
   * Postgres accorde EXECUTE à PUBLIC par défaut, et un droit d'exécution ne
   * s'écrit pas dans le corps d'une fonction : aucun contrôle textuel ne peut
   * le voir (L-027, L-028).
   *
   * La propriété assertée porte sur `public` et non sur `extensions`, pour une
   * raison de fond : PostgREST n'expose que `public`, donc seul ce schéma est
   * atteignable par un porteur de clé publiable. Asserter sur `extensions`
   * reviendrait à asserter sur des objets appartenant à `supabase_admin`, que
   * nos migrations ne peuvent pas modifier — et un test qu'on ne peut pas faire
   * passer finit désactivé.
   */
  const FONCTIONS_OUVERTES_ADMISES = new Map<string, string>([]);

  test("aucune fonction de public n'est exécutable par anon, authenticated ou PUBLIC", async () => {
    const toutes = await interroger<{ nom: string }>(
      bd,
      `select p.proname as nom
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
       order by p.proname`,
    );

    expect(
      toutes.length,
      "Aucune fonction dans public : la sonde n'inspecte rien, donc ne prouve rien.",
    ).toBeGreaterThan(0);

    const ouvertes = await interroger<{ nom: string; beneficiaire: string }>(
      bd,
      `select p.proname as nom, a.grantee::regrole::text as beneficiaire
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where n.nspname = 'public'
         and a.privilege_type = 'EXECUTE'
         and a.grantee::regrole::text in ('public', '-', 'anon', 'authenticated')
       order by p.proname`,
    );

    const defauts = ouvertes
      .filter((o) => !FONCTIONS_OUVERTES_ADMISES.has(o.nom))
      .map((o) => `public.${o.nom} exécutable par ${o.beneficiaire}`);
    expect(defauts, defauts.join(" | ")).toEqual([]);

    const exceptionsPerimees = [...FONCTIONS_OUVERTES_ADMISES.keys()].filter(
      (nom) => !ouvertes.some((o) => o.nom === nom),
    );
    expect(exceptionsPerimees, `Exceptions périmées : ${exceptionsPerimees.join(", ")}`).toEqual([]);
  });
});

describe("Sonde C — privilèges de colonne", () => {
  /**
   * Ce qui empêche un vendeur de se promouvoir admin doit être un privilège de
   * COLONNE, pas une policy : une policy sur `profiles` qui lit `profiles`
   * produit une récursion infinie (L-002). Les privilèges de colonne sont
   * évalués AVANT les policies, donc ils tiennent même si une policy future
   * autorise trop largement.
   *
   * La liste ci-dessous est un inventaire EXHAUSTIF, pas une sélection. Le test
   * échoue si une colonne modifiable apparaît sans y figurer, ET si une entrée
   * de la liste n'est plus modifiable — sans quoi un retrait accidentel de
   * droit passerait inaperçu jusqu'à ce qu'un vendeur ne puisse plus se
   * configurer.
   */
  const COLONNES_MODIFIABLES_ATTENDUES = new Set([
    "profiles.account_type",
    "profiles.locale",
    "shops.name",
    "shops.slug",
    "shops.logo_url",
    "shops.accent_color",
    "shops.default_language",
    "shops.watermark_enabled",
  ]);

  test("seules les colonnes déclarées sont modifiables par authenticated", async () => {
    const modifiables = await interroger<{ cible: string }>(
      bd,
      `select table_name || '.' || column_name as cible
       from information_schema.column_privileges
       where table_schema = 'public'
         and grantee = 'authenticated'
         and privilege_type = 'UPDATE'
       order by 1`,
    );

    expect(
      modifiables.length,
      "Aucune colonne modifiable trouvée : soit la sonde vise à côté, soit le " +
        "produit est inutilisable. Dans les deux cas elle ne prouve rien.",
    ).toBeGreaterThan(0);

    const observees = new Set(modifiables.map((m) => m.cible));

    const enTrop = [...observees].filter((c) => !COLONNES_MODIFIABLES_ATTENDUES.has(c));
    expect(
      enTrop,
      `Colonnes modifiables NON déclarées : ${enTrop.join(", ")}. Si l'une d'elles ` +
        "est `profiles.role`, c'est une escalade de privilège complète.",
    ).toEqual([]);

    const manquantes = [...COLONNES_MODIFIABLES_ATTENDUES].filter((c) => !observees.has(c));
    expect(manquantes, `Colonnes attendues devenues non modifiables : ${manquantes.join(", ")}`).toEqual(
      [],
    );
  });

  test("role et status ne sont modifiables par personne d'autre que le serveur", async () => {
    const sensibles = await interroger<{ cible: string; grantee: string; privilege_type: string }>(
      bd,
      `select table_name || '.' || column_name as cible, grantee, privilege_type
       from information_schema.column_privileges
       where table_schema = 'public'
         and table_name = 'profiles'
         and column_name in ('role', 'status')
         and grantee in ('anon', 'authenticated')
       order by 1, 2, 3`,
    );

    // Contre-test positif : la sonde doit voir le SELECT, sinon elle regarde une
    // table vide et son silence sur UPDATE ne vaut rien.
    expect(
      sensibles.some((s) => s.privilege_type === "SELECT"),
      "La sonde ne voit même pas le SELECT sur profiles.role : elle n'inspecte rien.",
    ).toBe(true);

    const ecritures = sensibles.filter((s) => s.privilege_type !== "SELECT");
    expect(
      ecritures.map((e) => `${e.grantee} peut ${e.privilege_type} sur ${e.cible}`),
      "Un droit d'écriture sur profiles.role permet à un vendeur de se promouvoir admin.",
    ).toEqual([]);
  });
});

describe("Sonde D — anon n'a aucun droit de table", () => {
  test("anon ne peut rien lire ni écrire dans public", async () => {
    const droitsAnon = await interroger<{ table_name: string; privilege_type: string }>(
      bd,
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'anon'
       order by 1, 2`,
    );

    expect(
      droitsAnon.map((d) => `anon peut ${d.privilege_type} sur ${d.table_name}`),
      "La page publique lit par vue restreinte, jamais par droit direct de anon " +
        "sur les tables.",
    ).toEqual([]);
  });

  test("contre-test positif : authenticated PEUT lire ses tables", async () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. Ce test
    // établit que la sonde D distingue réellement anon de authenticated, et
    // qu'elle échouerait si les droits légitimes disparaissaient.
    const droitsAuth = await interroger<{ table_name: string }>(
      bd,
      `select distinct table_name
       from information_schema.role_table_grants
       where table_schema = 'public'
         and grantee = 'authenticated'
         and privilege_type = 'SELECT'
       order by 1`,
    );

    expect(droitsAuth.map((d) => d.table_name)).toEqual(["profiles", "shops"]);
  });
});

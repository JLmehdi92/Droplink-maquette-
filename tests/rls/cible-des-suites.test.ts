import { describe, expect, test } from "vitest";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { CibleInterdite, REF_PRODUCTION, exigerBaseDeTests } from "../aide/base-de-tests";

/**
 * LES SUITES ÉCRIVENT DANS LA BASE DE TESTS, JAMAIS DANS LA PRODUCTION.
 *
 * ⚠️ CE N'EST PAS UNE PRÉCAUTION THÉORIQUE. Jusqu'au 06/09/2026 il n'existait
 * qu'UN projet Supabase, et tout tournait dessus. Le 05/09,
 * `tests/rls/surveillance` portait un `delete from public.tracked_parcels where
 * registered_at >= now() - interval '30 days'` : chaque `pnpm gates` effaçait
 * les colis réellement pris en charge du mois — dont ceux d'un vrai client, et
 * chacun coûte 1 des 200 prises en charge À VIE du fournisseur de suivi.
 *
 * La séparation tient à deux gardes qui échouent fermé, et ce fichier éprouve
 * les DEUX SENS de chacune : qu'elles refusent, et qu'elles autorisent.
 */
describe("La cible des suites", () => {
  /** Rejoue la garde sur une cible forgée, puis rend l'environnement intact. */
  async function surCible(
    db: string | undefined,
    api: string | undefined,
  ): Promise<unknown> {
    const avant = {
      db: process.env["SUPABASE_DB_URL"],
      api: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    };
    const poser = (nom: string, v: string | undefined): void => {
      if (v === undefined) delete process.env[nom];
      else process.env[nom] = v;
    };
    poser("SUPABASE_DB_URL", db);
    poser("NEXT_PUBLIC_SUPABASE_URL", api);
    try {
      return await exigerBaseDeTests().then(
        () => null,
        (erreur: unknown) => erreur,
      );
    } finally {
      // ⚠️ RESTAURER PAR `delete` QUAND C'ÉTAIT ABSENT. Réaffecter `undefined`
      // pose la CHAÎNE "undefined", et le contrôle suivant tenterait de se
      // connecter à un hôte nommé ainsi — vu, et le diagnostic accusait la
      // garde plutôt que le harnais.
      poser("SUPABASE_DB_URL", avant.db);
      poser("NEXT_PUBLIC_SUPABASE_URL", avant.api);
    }
  }

  test("CONTRE-TEST : elle AUTORISE la base de tests réellement configurée", async () => {
    /*
     * IL VIENT EN PREMIER. « La garde refuse » serait vrai d'une garde qui
     * refuse TOUT — c'est-à-dire d'un harnais qui ne peut plus rien éprouver.
     * Une suite où tout est refusé passe à 100 % sans rien prouver.
     */
    await expect(exigerBaseDeTests()).resolves.toBeUndefined();
  });

  test("elle REFUSE la production, nommément", async () => {
    const erreur = await surCible(
      `postgresql://u:p@aws-1-eu-west-3.pooler.supabase.com:5432/postgres?r=${REF_PRODUCTION}`,
      `https://${REF_PRODUCTION}.supabase.co`,
    );
    expect(erreur, "la production a été acceptée comme cible de test").toBeInstanceOf(
      CibleInterdite,
    );
  });

  test("elle REFUSE une cible indéterminée", async () => {
    const erreur = await surCible(undefined, undefined);
    expect(erreur, "une cible absente a été acceptée").toBeInstanceOf(CibleInterdite);
  });

  test("la MARQUE autorise, l'absence d'interdit ne suffit pas", async () => {
    /*
     * ⚠️ LE CONTRÔLE QUI COMPTE LE PLUS. Refuser la seule production laisserait
     * passer n'importe quelle TROISIÈME base — celle d'un autre projet, celle
     * d'un collègue, un projet créé pour un essai. On éprouve donc une cible
     * qui n'est PAS la production et qui ne porte PAS la marque : elle doit
     * être refusée aussi.
     *
     * La base visée ici est celle du serveur d'authentification de Supabase
     * lui-même — inatteignable, donc la garde échoue sur la connexion. C'est le
     * bon comportement : elle refuse ce qu'elle ne peut pas PROUVER, jamais ce
     * qu'elle a seulement pu joindre.
     */
    const erreur = await surCible(
      "postgresql://u:p@db.exemple-qui-n-existe-pas.supabase.co:5432/postgres",
      "https://exemple-qui-n-existe-pas.supabase.co",
    );
    expect(
      erreur,
      "une base tierce, ni production ni marquée, a été acceptée",
    ).not.toBeNull();
  });

  test("la base visée porte réellement la marque, et la production ne l'a pas", async () => {
    // L'AUTRE SENS, INTERROGÉ PLUTÔT QUE SUPPOSÉ (L-014) : la garde lit un
    // commentaire de base, on vérifie ici qu'il existe bel et bien.
    const bd = await ouvrirConnexionCatalogue();
    try {
      const lignes = await interroger<{ m: string | null }>(
        bd,
        "select shobj_description(oid, 'pg_database') as m from pg_database where datname = current_database()",
      );
      expect(lignes[0]?.m ?? "", "la base visée ne porte pas la marque").toContain(
        "BASE DE TESTS",
      );
    } finally {
      await bd.end();
    }
  });
});

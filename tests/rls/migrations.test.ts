import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * Accord entre le dépôt et la base, DANS LES DEUX SENS.
 *
 * Un seul sens ne suffit pas, et les deux défauts qu'il laisse passer sont
 * différents :
 *
 * - un FICHIER JAMAIS APPLIQUÉ : quelqu'un a écrit la migration, l'a commitée,
 *   et personne ne l'a passée sur cet environnement. Le code qui en dépend
 *   échouera ici et nulle part ailleurs ;
 * - une MIGRATION APPLIQUÉE SANS FICHIER : la base porte une modification que le
 *   dépôt ne décrit pas. Un environnement neuf ne la reproduira jamais, et le
 *   défaut n'apparaîtra qu'au prochain déploiement propre — c'est-à-dire au pire
 *   moment.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

/**
 * Le SQL seul : lignes de commentaire et lignes vides retirées, fins de ligne
 * normalisées.
 *
 * Le commentaire d'une migration SQL commence par `--` en début de ligne dans
 * tout ce dépôt. On ne coupe donc pas à la première occurrence n'importe où :
 * un `--` peut vivre dans une chaîne littérale, et l'amputer changerait le SQL
 * comparé — c'est-à-dire ferait échouer la comparaison sur un artefact du
 * contrôle lui-même.
 */
function sqlSeul(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((ligne) => !/^\s*--/.test(ligne))
    .map((ligne) => ligne.trimEnd())
    .filter((ligne) => ligne.trim() !== "")
    .join("\n");
}

function migrationsDuDepot(): string[] {
  return readdirSync(join(process.cwd(), "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

describe("Accord dépôt / base", () => {
  test("la sonde inspecte réellement des migrations", () => {
    // Deux ensembles vides s'accordent parfaitement.
    expect(migrationsDuDepot().length, "aucune migration dans le dépôt").toBeGreaterThan(0);
  });

  test("aucun fichier de migration n'est resté non appliqué", async () => {
    const enBase = new Set(
      (
        await interroger<{ name: string | null }>(
          bd,
          "select name from supabase_migrations.schema_migrations where name is not null",
        )
      ).map((r) => r.name as string),
    );

    const jamaisAppliquees = migrationsDuDepot().filter((m) => !enBase.has(m));
    expect(
      jamaisAppliquees,
      `Fichiers présents dans le dépôt mais absents de la base : ` +
        `${jamaisAppliquees.join(", ")}. Lancer \`pnpm db:migrate\`.`,
    ).toEqual([]);
  });

  test("aucune migration en base ne manque au dépôt", async () => {
    const enBase = (
      await interroger<{ name: string | null }>(
        bd,
        "select name from supabase_migrations.schema_migrations where name is not null",
      )
    ).map((r) => r.name as string);

    expect(enBase.length, "registre de migrations vide : rien à comparer").toBeGreaterThan(0);

    const duDepot = new Set(migrationsDuDepot());
    const orphelines = enBase.filter((m) => !duDepot.has(m));
    expect(
      orphelines,
      `Migrations appliquées en base sans fichier correspondant : ${orphelines.join(", ")}. ` +
        "Un environnement neuf ne les reproduira jamais.",
    ).toEqual([]);
  });

  test("l'ordre lexicographique des fichiers est un ordre total sans doublon de numéro", async () => {
    // L'ordre lexicographique est censé ÊTRE l'ordre d'application — voir le
    // test suivant, qui mesure à quel point ce « censé » est fragile. Deux
    // fichiers portant le même préfixe numérique rendraient cet ordre dépendant
    // du reste du nom, donc du hasard.
    const prefixes = migrationsDuDepot().map((m) => m.split("_")[0] ?? "");
    const doublons = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
    expect(doublons, `Préfixes de migration dupliqués : ${doublons.join(", ")}`).toEqual([]);

    const nonNumerotees = migrationsDuDepot().filter((m) => !/^\d{3}_/.test(m));
    expect(nonNumerotees, `Migrations sans numéro à trois chiffres : ${nonNumerotees.join(", ")}`).toEqual(
      [],
    );
  });

  /**
   * ⚠️ L'ORDRE LEXICOGRAPHIQUE N'EST **PAS** L'ORDRE D'APPLIQUÉ SUR CETTE BASE.
   *
   * `CLAUDE.md` et le brief l'affirmaient tous les deux, en capitales. Mesuré :
   * la **088** a été appliquée AVANT la **087**. Deux positions sur cent trente,
   * et personne ne l'avait jamais interrogé — les trois contrôles ci-dessus
   * comparent des ENSEMBLES de noms et un contenu, jamais une SÉQUENCE.
   *
   * Ce que cela coûterait : une reconstruction depuis zéro applique l'ordre des
   * fichiers, c'est-à-dire un ordre que la production n'a jamais exécuté. Si
   * deux migrations inversées touchaient le même objet, l'environnement neuf
   * divergerait de la production sans qu'aucune porte ne rougisse — et le
   * désaccord n'apparaîtrait qu'au premier déploiement propre.
   *
   * L'inversion connue est INOFFENSIVE, et c'est vérifié plutôt qu'espéré : la
   * 087 crée `parametres_admis` et remplace `ecrire_parametre`, la 088 remplace
   * `compter_prise_en_charge`. Aucun objet commun, donc aucun ordre requis entre
   * elles. Elle est déclarée ici comme exception AVEC sa raison ; toute NOUVELLE
   * divergence fait rougir, dans les deux sens.
   */
  /*
   * ⚠️ UNE INVERSION DE DEUX VOISINES PRODUIT **DEUX** POSITIONS DIVERGENTES,
   * pas une. Ne déclarer que la première laissait la seconde faire rougir le
   * contrôle, ce qui est le bon comportement : c'est l'écriture de l'exception
   * qui était incomplète, pas la mesure.
   */
  const INVERSIONS_ADMISES: ReadonlyArray<readonly [string, string]> = [
    [
      "088_compteur_de_prise_en_charge_sur_insertion",
      "087_bornes_des_parametres_en_base",
    ],
    [
      "087_bornes_des_parametres_en_base",
      "088_compteur_de_prise_en_charge_sur_insertion",
    ],
  ];

  test("l'ordre d'application en base est celui du dépôt, aux inversions déclarées près", async () => {
    const enBase = (
      await interroger<{ name: string | null }>(
        bd,
        "select name from supabase_migrations.schema_migrations " +
          "where name is not null order by version",
      )
    ).map((r) => r.name as string);

    const auDepot = migrationsDuDepot();

    // Un ensemble vide passe tout : sans ce plancher, une table de suivi vidée
    // rendrait ce contrôle vert en n'ayant comparé aucune séquence.
    expect(enBase.length, "aucune migration en base : la sonde ne compare rien").toBeGreaterThan(
      100,
    );
    expect(enBase.length, "les deux côtés n'ont pas le même nombre de migrations").toBe(
      auDepot.length,
    );

    const divergences: Array<readonly [string, string]> = [];
    for (let i = 0; i < enBase.length; i += 1) {
      const base = enBase[i] ?? "";
      const depot = auDepot[i] ?? "";
      if (base !== depot) divergences.push([base, depot]);
    }

    const inattendues = divergences.filter(
      ([base, depot]) =>
        !INVERSIONS_ADMISES.some(([b, d]) => b === base && d === depot),
    );
    expect(
      inattendues,
      "Des migrations ont été appliquées dans un ordre que le dépôt ne reproduira pas :\n" +
        inattendues.map(([b, d]) => `  base « ${b} » là où le dépôt a « ${d} »`).join("\n"),
    ).toEqual([]);

    /*
     * ET L'AUTRE SENS — MAIS IL DÉPEND DE LA BASE VISÉE, ET C'EST UNE
     * DÉCOUVERTE DU 06/09/2026.
     *
     * L'inversion 087/088 est un fait HISTORIQUE de la production : elle y a
     * été appliquée dans cet ordre, une fois, et rien ne peut le défaire. Sur
     * une base RECONSTRUITE depuis le dépôt, l'ordre est forcément
     * lexicographique — l'inversion n'existe pas, et son absence n'est pas une
     * dérive : c'est la preuve que la reconstruction est plus propre que
     * l'histoire.
     *
     * ⚠️ LE CONTRÔLE DEVIENT DONC PLUS STRICT, PAS PLUS SOUPLE. Sur la base de
     * tests, on n'admet AUCUNE inversion : `divergences` doit être vide. Une
     * migration appliquée hors séquence sur une base neuve n'aurait aucune
     * excuse historique, et c'est exactement ce qu'on veut interdire.
     *
     * Sur toute autre base, les inversions déclarées restent tolérées ET
     * exigées : une exception qui ne correspond plus à rien laisserait croire
     * qu'on surveille une inversion résolue, et masquerait la prochaine.
     *
     * ⚠️ CE QUE CE DÉPLACEMENT COÛTE, ET IL FAUT LE DIRE : depuis que les
     * suites visent la base de tests, PLUS AUCUNE ne regarde l'ordre réel de la
     * PRODUCTION. La branche ci-dessous n'y sera plus exécutée. Ce n'est pas un
     * oubli, c'est le prix de la séparation — et il appelle une suite de
     * contrôles de production en lecture seule, qui n'existe pas encore.
     */
    const marque = (
      await interroger<{ m: string | null }>(
        bd,
        "select shobj_description(oid, 'pg_database') as m from pg_database where datname = current_database()",
      )
    )[0]?.m;
    const surBaseDeTests = (marque ?? "").includes("BASE DE TESTS");

    if (surBaseDeTests) {
      expect(
        divergences,
        "Une base RECONSTRUITE depuis le dépôt doit appliquer l'ordre " +
          "lexicographique exact : aucune inversion n'y a d'excuse historique. " +
          divergences.map(([b, d]) => `base « ${b} » là où le dépôt a « ${d} »`).join(" | "),
      ).toEqual([]);
    } else {
      const perimees = INVERSIONS_ADMISES.filter(
        ([b, d]) => !divergences.some(([base, depot]) => base === b && depot === d),
      );
      expect(
        perimees,
        `Inversions déclarées qui n'existent plus : ${perimees.map(([b]) => b).join(", ")}`,
      ).toEqual([]);
    }
  });

  /**
   * LE CONTENU, PAS SEULEMENT LE NOM.
   *
   * Les trois contrôles ci-dessus comparent des NOMS. Or la règle du projet
   * n'est pas « chaque migration existe des deux côtés », elle est ABSOLUE :
   * une migration appliquée n'est JAMAIS rouverte. Rouvrir un fichier déjà
   * passé ne change rien ici — la base garde ce qu'elle a exécuté, le dépôt
   * porte autre chose, et les deux ensembles de noms restent identiques.
   *
   * Le mode de défaillance est le pire qui soit : l'environnement de
   * développement, lui, a bien la version appliquée AVANT la réécriture. Tout
   * fonctionne. Le désaccord n'apparaît qu'au premier déploiement propre, quand
   * la nouvelle version s'exécute pour la première fois — et souvent sur un
   * objet que la précédente avait déjà créé.
   *
   * `supabase_migrations.schema_migrations.statements` conserve le SQL
   * réellement exécuté. La comparaison est donc faisable.
   *
   * ⚠️ ELLE PORTE SUR LE SQL EXÉCUTABLE, PAS SUR LES OCTETS, et il faut dire
   * pourquoi — sinon quelqu'un « resserrera » ce contrôle un jour et le rendra
   * inutilisable. Constaté par exécution : les migrations 001 et 002, appliquées
   * à une époque où l'outil de passage retirait les commentaires, sont stockées
   * amputées de la moitié de leur volume. Une comparaison à l'octet les déclare
   * rouvertes toutes les deux, définitivement et sans recours — et un contrôle
   * qui crie au loup finit désactivé, emportant le vrai signal avec le bruit.
   *
   * CE QUE CETTE COMPARAISON NE VOIT PAS, dit franchement : une réécriture qui
   * ne touche QUE des commentaires d'un fichier déjà appliqué. C'est un angle
   * mort assumé, parce qu'un commentaire ne peut pas faire diverger deux
   * environnements — et parce que le seul cas observé dans ce dépôt est
   * exactement celui-là : l'en-tête de la 088 a été corrigé après application,
   * pour cesser d'affirmer un défaut qui ne se reproduit pas sur PostgreSQL
   * 17.6. Le SQL, lui, n'a pas bougé d'un caractère.
   */
  test("le CONTENU des migrations appliquées est resté celui du dépôt", async () => {
    const appliquees = await interroger<{ name: string | null; statements: string[] | null }>(
      bd,
      `select name, statements from supabase_migrations.schema_migrations
       where name is not null order by version`,
    );

    expect(
      appliquees.length,
      "Aucune migration appliquée relevée : la sonde n'inspecte rien.",
    ).toBeGreaterThan(0);

    const dossier = join(process.cwd(), "supabase", "migrations");
    const divergentes: string[] = [];
    let comparees = 0;

    for (const { name, statements } of appliquees) {
      if (name === null || statements === null) continue;
      let fichier: string;
      try {
        fichier = readFileSync(join(dossier, `${name}.sql`), "utf8");
      } catch {
        // L'absence de fichier est déjà signalée par le contrôle précédent, avec
        // son propre message. La redire ici brouillerait les deux diagnostics.
        continue;
      }

      comparees += 1;
      if (sqlSeul(statements.join("\n")) !== sqlSeul(fichier)) divergentes.push(name);
    }

    expect(
      comparees,
      "Aucune migration n'a pu être comparée : tous les fichiers manquaient, " +
        "et un ensemble vide passe tout.",
    ).toBeGreaterThan(0);

    expect(
      divergentes,
      `Migrations ROUVERTES après application : ${divergentes.join(", ")}. La ` +
        "base porte une version, le dépôt une autre, et les deux ensembles de " +
        "NOMS s'accordent parfaitement. Un correctif est une NOUVELLE migration.",
    ).toEqual([]);
  });
});

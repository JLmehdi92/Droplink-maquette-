import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AUCUNE EXCEPTION NE DOIT ÉTEINDRE LE CLOISONNEMENT DES CLIENTS SUPABASE.
 *
 * ⚠️ CE DÉFAUT A ÉTÉ CORRIGÉ DEUX FOIS, ET IL EST REVENU. L'audit du
 * 31/08/2026 a trouvé des exceptions écrites `"no-restricted-imports": "off"` :
 * elles désarment TOUS les motifs à la fois, alors qu'elles n'avaient de raison
 * que pour un seul. `lib/page-publique/`, dispensé pour pouvoir importer
 * `anon`, pouvait ainsi importer `admin` — et c'est justement le dossier qui
 * rend du contenu à un visiteur non authentifié.
 *
 * Trois exceptions ont été réécrites en `sauf(...)`. LA QUATRIÈME EST RESTÉE,
 * sur `src/lib/supabase/**` lui-même : le seul dossier où les cinq clients sont
 * voisins, donc celui où l'on peut passer de l'un à l'autre en écrivant six
 * caractères. C'est L-025 dans sa forme exacte — *un garde écrit après coup
 * hérite du champ de vision de la CORRECTION, pas du problème* : la relecture a
 * regardé les exceptions qu'elle venait de corriger, jamais l'inventaire.
 *
 * ⚠️ ET SA RAISON ÉTAIT FAUSSE, ce qui l'a rendue crédible pendant des mois :
 * « sans cette exception, `admin.ts` échouerait sur sa propre existence ».
 * Vérifié fichier par fichier — aucun des cinq clients n'en importe un autre.
 * La règle complète passe sans rien casser.
 *
 * CE FICHIER EST UNE SONDE D'INVENTAIRE, PAS UNE SONDE PAR CAS. Elle part de
 * TOUTES les occurrences de la règle dans la configuration et exige de chacune
 * qu'elle nomme ce qu'elle dispense. Une sonde par cas ne peut voir que les cas
 * auxquels son auteur a pensé — c'est-à-dire ceux qui viennent d'être corrigés.
 */
const CONFIG = readFileSync(join(process.cwd(), "eslint.config.mjs"), "utf8");

/**
 * La configuration SANS SES COMMENTAIRES.
 *
 * ⚠️ SANS CE DÉPOUILLEMENT, CE FICHIER ÉCHOUAIT SUR SA PROPRE PROSE : le bloc
 * de la configuration qui raconte le défaut cite le réglage fautif pour
 * l'expliquer, et la sonde le comptait comme un réglage réel. C'est L-031 —
 * *un motif de garde doit s'appliquer au CODE, commentaires retirés, sinon il
 * se satisfait du commentaire qui décrit la garde*. Ici il faisait l'inverse,
 * ce qui est le même défaut vu de l'autre côté : il condamnait une explication.
 */
const CODE = CONFIG.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

/** Toutes les façons dont la configuration règle cette règle, dans l'ordre. */
function reglagesDeLaRegle(): readonly string[] {
  return [...CODE.matchAll(/"no-restricted-imports":\s*([^\n]+)/g)].map((m) => (m[1] ?? "").trim());
}

describe("Le cloisonnement des clients Supabase", () => {
  const reglages = reglagesDeLaRegle();

  test("la sonde voit réellement la règle dans la configuration", () => {
    /*
     * UN ENSEMBLE VIDE PASSE TOUT. Sans cette borne, renommer la règle, ou
     * simplement déplacer la configuration, rendrait ce fichier vert en
     * n'inspectant plus rien — et c'est le mode de défaillance le plus probable
     * d'un contrôle qui lit un fichier de configuration.
     */
    expect(reglages.length, "aucun réglage lu : la sonde vise à côté").toBeGreaterThanOrEqual(4);
  });

  test("aucun réglage n'éteint la règle", () => {
    const eteints = reglages.filter((r) => r.startsWith('"off"') || r.startsWith("'off'"));
    expect(
      eteints,
      'Une exception écrite "off" désarme TOUS les motifs, pas seulement celui ' +
        "qui la motive. Employer `sauf(...)`, qui ne dispense que ce qu'il nomme.",
    ).toEqual([]);
  });

  test("chaque réglage passe par `sauf(...)`, jamais par une liste écrite à la main", () => {
    /*
     * POURQUOI `sauf()` ET PAS UNE LISTE LITTÉRALE. Elle rend la liste des
     * cloisons PRIVÉE DE CE QUI EST AUTORISÉ ICI : le jour où un quatrième
     * client naîtra, il entrera automatiquement dans toutes les exceptions.
     * Une liste recopiée, elle, resterait muette sur lui — et personne ne
     * saurait qu'elle est devenue incomplète.
     */
    const horsSauf = reglages.filter((r) => !r.includes("sauf("));
    expect(
      horsSauf,
      "Réglages qui n'emploient pas `sauf(...)` : une liste recopiée ne " +
        "connaîtra jamais la cloison ajoutée demain.",
    ).toEqual([]);
  });

  test("chaque cloison ferme AUSSI la forme frère `./nom`", () => {
    /*
     * ⚠️ SECOND DÉFAUT DU MÊME BLOC, TROUVÉ LE 02/09/2026. Le motif en double
     * étoile attrape `../supabase/admin`, mais PAS `./admin` — qui ne contient
     * pas le segment `supabase`. Or c'est exactement l'écriture qu'un fichier
     * de `src/lib/supabase/` emploierait : la faille et l'exception qui la
     * doublait vivaient au même endroit.
     *
     * Le commentaire voisin affirmait pourtant avoir fermé le chemin relatif.
     * Il en avait fermé une écriture sur deux — L-029 sur le paragraphe qui
     * invoquait déjà L-029.
     */
    const cloisons = [...CODE.matchAll(/nom:\s*"([a-z]+)"/g)].map((m) => m[1] as string);
    expect(cloisons.length, "aucune cloison lue : la sonde vise à côté").toBeGreaterThanOrEqual(3);

    // Le nom de la cloison n'est pas toujours celui du fichier : `systeme` ferme
    // `system.ts`. On lit donc le chemin dans le groupe plutôt que de le déduire.
    for (const nom of cloisons) {
      const bloc = CODE.slice(CODE.indexOf(`nom: "${nom}"`));
      const groupe = bloc.slice(0, bloc.indexOf("]"));
      const fichier = /@\/lib\/supabase\/([a-z]+)/.exec(groupe)?.[1];
      expect(fichier, `la cloison « ${nom} » ne nomme aucun module`).toBeDefined();
      expect(
        groupe,
        `la cloison « ${nom} » laisse passer l'import frère « ./${fichier} »`,
      ).toContain(`"./${fichier}"`);
    }
  });
});

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LE RETOUR D'UN GESTE DE LISTE NE PEUT PAS SORTIR DU SITE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE TEST EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les trois gestes de la liste portent un champ `retour` : c'est lui qui ramène
 * le vendeur sur SA vue, filtres compris. Il vient du formulaire, donc du
 * navigateur, donc de n'importe qui.
 *
 * ⚠️ LE CONTRÔLE SE FAISAIT PAR PRÉFIXE — « commence par `/`, mais pas par
 * `//` » — et il était FRANCHISSABLE. `/\exemple.test/x` passe cette règle et se
 * résout vers l'hôte `exemple.test`, parce que l'analyseur d'URL traite
 * l'ANTISLASH comme une barre pour les schémas spéciaux. Un bouton « archiver »
 * devenait un tremplin vers un site tiers, et le vendeur atterrissait sur une
 * fausse page de connexion EN VENANT DE CHEZ NOUS — le scénario d'hameçonnage
 * le plus crédible qu'un produit puisse offrir.
 *
 * ⚠️ ET LE COMMENTAIRE DISAIT LE CONTRAIRE. Il expliquait précisément le danger
 * et affirmait le couvrir. Une garde qui se décrit juste et s'applique faux est
 * pire qu'une garde absente : personne ne la relit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL VÉRIFIE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le module est `server-only` : on ne peut pas l'importer ici. On éprouve donc
 * la RÈGLE elle-même, sur le même analyseur d'URL que celui qui construira la
 * redirection — et un contrôle de non-régression établit que le code appliqué
 * est bien celui-ci, et non un retour au préfixe.
 */

const BASE = "http://retour.invalid";

/** La règle telle qu'elle est écrite dans `geste-liste.ts`. */
function destination(brut: string, defaut: string): string {
  if (brut === "") return defaut;
  try {
    const resolue = new URL(brut, BASE);
    if (resolue.origin !== BASE) return defaut;
    return resolue.pathname + resolue.search;
  } catch {
    return defaut;
  }
}

/** L'ancienne règle, gardée pour montrer CE QU'ELLE LAISSAIT PASSER. */
function ancienneRegle(brut: string): boolean {
  return brut.startsWith("/") && !brut.startsWith("//");
}

const DEFAUT = "/fr/commandes";

/**
 * Les formes qui doivent TOUTES sortir du site si on les suit.
 *
 * Elles ne sont pas choisies au hasard : chacune est une façon différente
 * d'écrire « un autre hôte » que l'analyseur accepte.
 */
const EVASIONS = [
  "//exemple.test/x",
  "/\\exemple.test/x",
  "/\\/exemple.test",
  "/\\\\exemple.test",
  "https://exemple.test/x",
  "javascript:alert(1)",
];

/*
 * ⚠️ `http:/exemple.test` A ÉTÉ RETIRÉE DE CETTE LISTE, et c'est le contre-test
 * ci-dessous qui l'a exigé. Elle a l'air d'une évasion, mais l'analyseur la
 * résout en `http://retour.invalid/exemple.test` : un CHEMIN de notre site,
 * avec une seule barre après le schéma. La déclarer dangereuse aurait fait
 * passer une affirmation fausse pour une protection.
 */

describe("Le champ `retour` ne peut pas emmener le vendeur ailleurs", () => {
  test("CONTRE-TEST : ces formes s'échappent VRAIMENT si on les suit", () => {
    // Sans ce contrôle, la liste pourrait ne contenir que des chaînes inoffensives
    // et le test passerait en n'ayant rien éprouvé. On établit d'abord que chaque
    // forme est bien une évasion, avec le même analyseur que la redirection.
    for (const evasion of EVASIONS) {
      let hote: string | null = null;
      try {
        hote = new URL(evasion, BASE).origin;
      } catch {
        hote = null;
      }
      expect(hote, `« ${evasion} » ne s'échappe pas : elle ne prouve rien`).not.toBe(BASE);
    }
  });

  test("CONTRE-TEST : l'ancienne règle en laissait passer plusieurs", () => {
    // C'est ce qui donne sa valeur au test : la nouvelle règle ferme des portes
    // que l'ancienne ouvrait, et on le montre plutôt que de l'affirmer.
    const franchies = EVASIONS.filter(ancienneRegle);
    expect(
      franchies.length,
      "l'ancienne règle ne laissait rien passer : il n'y avait donc rien à corriger",
    ).toBeGreaterThan(0);
  });

  test("toutes sont ramenées au défaut", () => {
    for (const evasion of EVASIONS) {
      expect(destination(evasion, DEFAUT), `« ${evasion} » n'est pas ramenée au défaut`).toBe(
        DEFAUT,
      );
    }
  });

  test("CONTRE-TEST POSITIF : un vrai retour est conservé, filtres compris", () => {
    // Une règle qui refuserait TOUT passerait les contrôles ci-dessus à 100 %
    // sans rien prouver — et casserait l'écran, puisque le retour porte la vue
    // du vendeur.
    expect(destination("/fr/commandes", DEFAUT)).toBe("/fr/commandes");
    expect(destination("/fr/commandes?archivees=1&tri=anciennes", DEFAUT)).toBe(
      "/fr/commandes?archivees=1&tri=anciennes",
    );
    expect(destination("/en/commandes?q=cr%C3%A8me", DEFAUT)).toBe("/en/commandes?q=cr%C3%A8me");
  });

  test("ce qui SORT ne peut plus porter d'hôte", () => {
    // La propriété qui compte vraiment : quelle que soit l'entrée, la sortie est
    // un chemin. Elle tient même si un jour quelqu'un ajoute une forme d'évasion
    // à laquelle personne n'a pensé.
    for (const brut of [...EVASIONS, "/fr/commandes", "", "pas-un-chemin", "?q=x"]) {
      const sortie = destination(brut, DEFAUT);
      expect(sortie.startsWith("/"), `« ${brut} » rend « ${sortie} », qui n'est pas un chemin`).toBe(
        true,
      );
      expect(new URL(sortie, BASE).origin, `« ${brut} » rend une sortie qui s'échappe`).toBe(BASE);
    }
  });

  test("le code appliqué est bien celui-ci, et non un retour au préfixe", () => {
    /*
     * ⚠️ CE FICHIER ÉPROUVE UNE COPIE DE LA RÈGLE, parce que `geste-liste` est
     * `server-only`. Une copie qui diverge de l'original ne prouve rien — c'est
     * la leçon L-032 appliquée à un test plutôt qu'à un artefact construit.
     *
     * On vérifie donc sur le CODE, commentaires retirés, que le module résout
     * bien l'URL et compare l'ORIGINE, et qu'il ne contient plus le contrôle de
     * préfixe qui a été trouvé franchissable.
     */
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "commandes", "geste-liste.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

    expect(source, "le module ne résout plus le retour avec `new URL`").toMatch(
      /new URL\(brut,\s*BASE_DE_RESOLUTION\)/,
    );
    expect(source, "le module ne compare plus l'origine obtenue").toMatch(/\.origin\s*!==/);
    expect(
      source,
      "le contrôle par préfixe est revenu : il est franchissable par un antislash",
    ).not.toMatch(/startsWith\("\/\/"\)/);
  });
});

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { routing } from "@/i18n/routing";

/**
 * AUCUN ÉCRAN AUTHENTIFIÉ NE DOIT ÊTRE FIGÉ AU BUILD.
 *
 * Un écran de l'espace vendeur prérendu serait produit une fois, sans session,
 * puis servi tel quel à tout le monde. Le mode de défaillance est trompeur :
 * l'écran RÉPOND, il a l'air correct, il porte simplement le contenu de
 * quelqu'un d'autre — ou la redirection d'un visiteur non connecté, servie à un
 * vendeur qui vient de se connecter.
 *
 * Aujourd'hui, `cookies()` fait basculer ces routes en dynamique, donc rien
 * n'est prérendu. Mais c'est une protection qui tient à une ABSENCE : elle
 * disparaîtrait le jour où une page de cet espace cesserait de lire la session
 * avant de rendre — un écran d'aide, une page de réglages statique. Le contrôle
 * porte donc sur l'ARTEFACT réellement produit, pas sur la présence d'un appel
 * dans le code.
 */

const RACINE = process.cwd();
const ESPACE_AUTHENTIFIE = join(RACINE, "src", "app", "[locale]", "(app)");
const SORTIE = join(RACINE, ".next", "server", "app");

/** Routes de l'espace authentifié, lues depuis l'arborescence des fichiers. */
function routesAuthentifiees(): string[] {
  const trouvees: string[] = [];

  const parcourir = (dossier: string, prefixe: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (!statSync(chemin).isDirectory()) continue;
      // Un groupe entre parenthèses n'ajoute rien à l'URL.
      const segment = entree.startsWith("(") ? prefixe : prefixe + "/" + entree;
      if (existsSync(join(chemin, "page.tsx"))) trouvees.push(segment);
      parcourir(chemin, segment);
    }
  };

  parcourir(ESPACE_AUTHENTIFIE, "");
  return trouvees;
}

describe("Écrans authentifiés", () => {
  test("la sonde inspecte réellement des routes et un build", () => {
    // Un ensemble vide passe tout : sans routes trouvées, « aucune n'est
    // prérendue » serait vrai par vacuité.
    expect(routesAuthentifiees().length).toBeGreaterThan(0);
    expect(
      existsSync(SORTIE),
      "Aucune sortie de build dans `.next/server/app`. Lancer `pnpm build` avant cette suite.",
    ).toBe(true);
  });

  test("contre-test positif : la sonde SAIT reconnaître une page prérendue", () => {
    // Sans lui, une recherche qui ne trouverait jamais de fichier passerait le
    // test principal sans rien prouver. Les mentions légales, elles, DOIVENT
    // être prérendues : elles sont publiques et identiques pour tous.
    const publique = join(SORTIE, routing.defaultLocale, "conditions.html");
    expect(
      existsSync(publique),
      "La page des conditions n'est pas prérendue : la sonde ne regarde pas au bon endroit.",
    ).toBe(true);
  });

  test("aucune route de l'espace vendeur n'a d'artefact prérendu", () => {
    const figees: string[] = [];

    for (const route of routesAuthentifiees()) {
      for (const langue of routing.locales) {
        const artefact = join(SORTIE, langue + route + ".html");
        if (existsSync(artefact)) figees.push(langue + route);
      }
    }

    expect(
      figees,
      "Écrans authentifiés FIGÉS au build : " +
        figees.join(", ") +
        ". Ils seraient servis identiques à tous les vendeurs.",
    ).toEqual([]);
  });
});

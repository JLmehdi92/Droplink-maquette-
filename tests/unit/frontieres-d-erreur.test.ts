import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { sansCommentaires } from "../aide/source";

/**
 * CHAQUE RACINE DE MISE EN PAGE PORTE SA FRONTIÈRE D'ERREUR.
 *
 * ⚠️ DEUX MANQUAIENT, TROUVÉES À L'AUDIT DU 31/08/2026 : les surfaces publiques
 * `[locale]` — landing, connexion, inscription, onboarding, conditions,
 * confidentialité, signalement — et la page client `/p/[token]`. Une erreur de
 * rendu y servait la page générique de Next : anglais, Times New Roman, aucun
 * rapport avec le produit. Sur `/p/[token]`, le lecteur n'est même pas le
 * vendeur mais SON CLIENT, c'est-à-dire quelqu'un qui ne peut ni comprendre ce
 * qu'il voit ni le signaler à quiconque.
 *
 * L'asymétrie était un oubli : `(app)/error.tsx` argumente en toutes lettres
 * pourquoi cette page générique est inacceptable, et son raisonnement ne dépend
 * pas du fait qu'on soit authentifié.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS. Il constate qu'une déclaration existe ; il ne
 * peut pas prouver qu'elle s'affiche (L-018). Une frontière d'erreur ne se
 * déclenche que sur une erreur de rendu réelle, ce qu'aucune de nos portes ne
 * sait provoquer sans casser le produit. Ce qu'il tient VRAIMENT, c'est le
 * second contrôle : aucune de ces pages ne peut porter de texte en dur — sans
 * quoi elles resteraient en français pour tout le monde, ce qui est exactement
 * le défaut qu'on vient de corriger, une couche plus bas.
 */

const RACINE = join(process.cwd(), "src", "app");

/** Les quatre surfaces du produit, et le chemin de leur frontière. */
const SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["surfaces publiques", join("[locale]", "error.tsx")],
  ["espace vendeur", join("[locale]", "(app)", "error.tsx")],
  ["administration", join("[locale]", "admin", "error.tsx")],
  ["page client", join("p", "[token]", "error.tsx")],
];

describe("Les frontières d'erreur", () => {
  test("la sonde vise un dossier qui existe", () => {
    // Un ensemble vide passe tout : si `src/app` était introuvable, les
    // contrôles ci-dessous seraient verts et muets.
    expect(existsSync(join(RACINE, "[locale]", "layout.tsx"))).toBe(true);
    expect(SURFACES.length).toBe(4);
  });

  test.each(SURFACES)("%s porte une frontière d'erreur", (_nom, chemin) => {
    expect(
      existsSync(join(RACINE, chemin)),
      `${chemin} manque : une erreur de rendu y servirait la page générique de Next, en anglais`,
    ).toBe(true);
  });

  test.each(SURFACES)("%s ne porte aucun texte en dur", (_nom, chemin) => {
    const code = sansCommentaires(readFileSync(join(RACINE, chemin), "utf8"));

    // Elle DOIT passer par le catalogue. Une frontière d'erreur est un Client
    // Component : elle ne peut pas appeler `getTranslations()`, et la tentation
    // d'y écrire deux phrases en dur est donc maximale.
    expect(code, `${chemin} n'appelle pas le catalogue`).toContain("useTranslations");

    // Tout nœud de texte du JSX doit être une expression, jamais un littéral.
    const litteraux = [...code.matchAll(/>\s*([A-Za-zÀ-ÿ][^<>{}\n]{3,})\s*</g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((t) => t !== "");
    expect(
      litteraux,
      `${chemin} rend du texte en dur : il resterait en français pour tout le monde`,
    ).toEqual([]);
  });
});

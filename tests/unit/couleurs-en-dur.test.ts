import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * TOUTE COULEUR ÉCRITE EN DUR DANS UN COMPOSANT EST SOIT UNE COULEUR DU
 * CANEVAS, SOIT UNE EXCEPTION DÉCLARÉE AVEC SA RAISON.
 *
 * ⚠️ DÉFAUT MESURÉ LE 27/08/2026 : cinq champs de saisie portaient
 * `bg-[#F1F5F9]` — un gris bleuté qui n'existe NI dans le thème NI dans une
 * seule des 41 planches. Il ne cassait rien, ne déclenchait aucun test, et
 * rendait simplement un champ d'une couleur que personne n'avait choisie.
 *
 * C'est le mode de propagation ordinaire : une valeur en dur ne référence
 * aucun token, donc rien ne la relie au design, donc rien ne signale sa
 * dérive. Les sondes de palette et de classes servies ne peuvent pas la voir —
 * elles inspectent les tokens, et une couleur en dur n'en est pas un.
 *
 * LA SONDE INVENTORIE, le test DÉCLARE LES EXCEPTIONS avec leur raison, et il
 * échoue DANS LES DEUX SENS : une couleur inconnue qui apparaît, et une
 * exception qui ne sert plus.
 */

const RACINE = join(process.cwd(), "src");

/** Relevé sur les 41 planches. Une couleur du canevas est toujours recevable. */
/**
 * L'INVENTAIRE EXACT des 91 couleurs distinctes des 41 planches, et non les 32
 * plus fréquentes. ⚠️ La première version de ce test ne portait que le top 32,
 * et il a immédiatement signalé `#0a0a0d` — le fond du visionneur plein écran —
 * comme étrangère au canevas alors qu'elle y figure. Un inventaire tronqué
 * accuse le code d'un défaut qui est celui de l'inventaire.
 */
const DU_CANEVAS = new Set([
  "#0058be", "#0a0a0d", "#0e0e13", "#0f766e", "#111117", "#1da851", "#2a2730", "#2f2c36",
  "#2f8f5b", "#33343c", "#34a853", "#35313c", "#363039", "#383440", "#3a3038", "#4285f4",
  "#45464d", "#4b2fb0", "#5b5d68", "#5c3fd0", "#6b4ae0", "#7c5cf5", "#83858f", "#8a6415",
  "#9a9ca6", "#9c7527", "#a4a6b0", "#a8412c", "#a97b1e", "#b5654f", "#c13584", "#c2543c",
  "#c5cbfb", "#c6c6d0", "#c9d7f0", "#cfcfda", "#d19a20", "#d3d3dd", "#d6d6de", "#d8d2f8",
  "#d9d5f4", "#d9d9e2", "#dcdce4", "#ddd5fb", "#e0674a", "#e0e0e8", "#e0e4ee", "#e11d48",
  "#e2e6ea", "#e4e2ee", "#e4e4ea", "#e6d3a8", "#e6e2e0", "#e6e6ec", "#e7f3ec", "#e8bfb4",
  "#e8e4dd", "#e9f7ee", "#ea4335", "#eab308", "#eaeaef", "#ececf0", "#eee4e0", "#eef4f0",
  "#efeaff", "#f0f0f4", "#f1eefe", "#f2765e", "#f2e2dd", "#f2f2f6", "#f3c9bd", "#f3e4c4",
  "#f4f4f8", "#f4f4fa", "#f6d9d2", "#f7f7fb", "#f8f6ff", "#f9fcfa", "#faedd2", "#fafafc",
  "#fbbc05", "#fbd9d0", "#fdded6", "#fdeeea", "#fdeef6", "#ffeee9", "#fff4f1", "#fff8f6",
  "#fffaf0", "#fffaf9", "#ffffff",
  // Le noir pur ne vient pas des planches, mais aucune couleur ne peut le
  // remplacer : il sert de repli de contraste, calculé et non dessiné.
  "#000000",
]);

/**
 * Ce qui n'est pas du canevas et n'a pas à l'être. Chaque ligne porte sa
 * raison ; le second contrôle vérifie que chacune sert encore.
 */
const EXCEPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["#4285f4", "logo Google — une marque tierce ne se retouche pas"],
  ["#ea4335", "logo Google"],
  ["#fbbc05", "logo Google"],
  ["#34a853", "logo Google"],
  ["#c13584", "logo Instagram"],
  ["#1da851", "logo WhatsApp"],
  ["#ef0000", "cité dans un commentaire de contraste, jamais rendu"],
];
const tolerees = new Map(EXCEPTIONS);

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return sources(chemin);
    return /\.(tsx|ts)$/.test(e.name) ? [chemin] : [];
  });
}

const trouvees = new Map<string, string[]>();
for (const fichier of sources(RACINE)) {
  const relatif = relative(RACINE, fichier).split(sep).join("/");
  for (const m of readFileSync(fichier, "utf8").matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase();
    trouvees.set(hex, [...(trouvees.get(hex) ?? []), relatif]);
  }
}

describe("Les couleurs écrites en dur", () => {
  /** Un ensemble vide passe tout : on établit d'abord que la sonde voit. */
  test("la sonde en trouve réellement", () => {
    expect(trouvees.size).toBeGreaterThanOrEqual(15);
  });

  test("chacune vient du canevas ou porte une raison", () => {
    const inconnues = [...trouvees.entries()]
      .filter(([hex]) => !DU_CANEVAS.has(hex) && !tolerees.has(hex))
      .map(([hex, ou]) => `${hex} dans ${[...new Set(ou)].join(", ")}`);
    expect(inconnues).toEqual([]);
  });

  /**
   * L'AUTRE SENS. Une exception qui ne correspond plus à rien est une porte
   * ouverte sur la valeur du jour où quelqu'un la réécrira — et elle donne
   * l'impression que le sujet est traité alors qu'il ne l'est plus.
   */
  test("aucune exception déclarée n'est devenue inutile", () => {
    const mortes = EXCEPTIONS.filter(([hex]) => !trouvees.has(hex)).map(([hex, r]) => `${hex} — ${r}`);
    expect(mortes).toEqual([]);
  });

  test("la couleur du défaut corrigé ne revient pas", () => {
    // #F1F5F9 : ni thème, ni canevas. Cinq champs le portaient.
    expect(trouvees.has("#f1f5f9")).toBe(false);
  });
});

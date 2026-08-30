import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { familleDAction, natureDAction } from "@/lib/admin/nature-d-action";

/**
 * UNE RÉACTIVATION NE DOIT PAS ÊTRE PEINTE COMME UNE SUSPENSION.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE TEST EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La même sémantique vivait en DEUX exemplaires. Le Panneau distinguait
 * `compte.suspension` de `compte.reactivation` ; le Journal repliait tout
 * `compte.*` sur « suspension ». Les deux écrans lisent la même colonne et en
 * disaient deux choses différentes — et c'est le Journal, celui qu'on ouvre
 * précisément pour savoir ce qui s'est passé, qui rendait la réactivation en
 * rouge, pilule ET encart de motif.
 *
 * Ce n'est pas un écart de design : le journal d'audit est la pièce qu'on
 * produit en cas de litige. Une réactivation présentée comme une suspension y
 * affirme le contraire de ce que la base a enregistré.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA NATURE N'EST PAS LA FAMILLE — et les confondre casserait le filtre
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La FAMILLE sert au filtre et doit rester calée sur `lire_journal_admin` :
 * en base, `compte.reactivation` appartient bien à la famille « suspension ».
 * Séparer les deux notions ICI, dans la couleur, est correct ; les séparer
 * dans la famille ferait qu'un filtre « suspensions » cesserait d'afficher ce
 * que le serveur lui renvoie — l'écran montrerait moins de lignes que le
 * décompte annoncé juste au-dessus.
 *
 * Le contrôle de parenté avec le SQL est donc fait ICI, en lisant la
 * migration, et non de mémoire.
 */

const RACINE = join(import.meta.dirname, "..", "..");

/** Le code d'un fichier, commentaires retirés — L-031. */
function codeSansCommentaires(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\/\/[^\n]*/g, "");
}

/**
 * TOUTES les actions réellement écrites par les migrations.
 *
 * Inventorier, pas sélectionner : si une migration future écrit une action
 * d'un préfixe inconnu, elle apparaît ici sans que personne ait pensé à
 * l'ajouter, et le tableau d'attentes ci-dessous échoue.
 */
function actionsEcritesEnBase(): string[] {
  const dossier = join(RACINE, "supabase", "migrations");
  const trouvees = new Set<string>();
  for (const fichier of readdirSync(dossier).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dossier, fichier), "utf8");
    for (const m of sql.matchAll(/'([a-z_]+\.[a-z_.]+)'/g)) {
      const valeur = m[1];
      // Les actions du journal ont deux segments et sont insérées dans
      // `admin_audit_log` ; les autres chaînes pointées du SQL (noms de
      // schémas, chemins) ne s'écrivent jamais dans cette colonne.
      if (valeur !== undefined && /^(compte|comptes|boutiques|parametre)\./.test(valeur)) {
        trouvees.add(valeur);
      }
    }
  }
  return [...trouvees].sort();
}

/** Ce que chaque action DOIT valoir. Une action absente d'ici fait échouer. */
const ATTENDU: Record<string, ReturnType<typeof natureDAction>> = {
  "compte.suspension": "suspension",
  "compte.reactivation": "reactivation",
  "comptes.liste": "consultation",
  "comptes.detail": "consultation",
  "boutiques.liste": "consultation",
  "parametre.creation": "parametre",
  "parametre.modification": "parametre",
};

describe("La nature d'une action de journal", () => {
  const actions = actionsEcritesEnBase();

  test("CONTRE-TEST : l'inventaire n'est pas vide", () => {
    // Un ensemble vide passe tout. Si la lecture des migrations casse, ce
    // fichier doit le dire ici plutôt que de certifier le silence.
    expect(actions.length, "aucune action lue dans les migrations").toBeGreaterThanOrEqual(7);
  });

  test("l'inventaire et les attentes coïncident DANS LES DEUX SENS", () => {
    expect(actions, "une action est écrite en base sans attente déclarée").toEqual(
      Object.keys(ATTENDU).sort(),
    );
  });

  test("chaque action écrite en base reçoit la nature attendue", () => {
    for (const action of actions) {
      expect(natureDAction(action), `nature erronée pour « ${action} »`).toBe(ATTENDU[action]);
    }
  });

  test("LE CAS MOTIVANT : réactivation et suspension ne se confondent pas", () => {
    expect(natureDAction("compte.reactivation")).not.toBe(natureDAction("compte.suspension"));
  });

  test("FALSIFICATION HORS DU CAS MOTIVANT : les deux actions de paramètre", () => {
    // Corriger `compte.*` en oubliant que le préfixe est testé par `startsWith`
    // est l'erreur symétrique : une règle trop gourmande rangerait
    // `parametre.creation` avec `parametre.modification` — ce qui est correct —
    // mais une règle trop stricte ferait tomber l'une des deux en consultation.
    expect(natureDAction("parametre.creation")).toBe("parametre");
    expect(natureDAction("parametre.modification")).toBe("parametre");
  });

  test("une action inconnue tombe en consultation, jamais en suspension", () => {
    // Le défaut le plus coûteux serait qu'une action future soit peinte en
    // rouge par défaut : on lirait une alerte là où il n'y en a pas.
    expect(natureDAction("medias.purge")).toBe("consultation");
    expect(natureDAction("")).toBe("consultation");
  });
});

describe("La famille reste calée sur le SQL — sinon le filtre ment", () => {
  const sql = readFileSync(
    join(RACINE, "supabase", "migrations", "115_le_journal_se_filtre_et_se_compte.sql"),
    "utf8",
  );

  test("CONTRE-TEST : la migration lue contient bien les trois familles", () => {
    expect(sql).toContain("'suspension'");
    expect(sql).toContain("'parametre'");
    expect(sql).toContain("'consultation'");
  });

  test("la base range TOUT `compte.%` dans la famille suspension", () => {
    // C'est cette ligne qui interdit de séparer la réactivation dans la
    // FAMILLE : le serveur la renverrait quand même.
    expect(sql).toContain("v_famille = 'suspension' and a.action like 'compte.%'");
  });

  test("et le code TypeScript dit la même chose", () => {
    expect(familleDAction("compte.reactivation")).toBe("suspension");
    expect(familleDAction("compte.suspension")).toBe("suspension");
    expect(familleDAction("parametre.creation")).toBe("parametre");
    expect(familleDAction("comptes.liste")).toBe("consultation");
  });
});

describe("Aucun écran ne redéfinit la règle dans son coin", () => {
  const ECRANS = ["src/app/[locale]/admin/journal/page.tsx", "src/app/[locale]/admin/page.tsx"];

  test("CONTRE-TEST : les deux écrans existent et importent le module", () => {
    for (const ecran of ECRANS) {
      expect(codeSansCommentaires(ecran), `${ecran} n'importe pas la règle commune`).toContain(
        "@/lib/admin/nature-d-action",
      );
    }
  });

  test("aucun n'inspecte le préfixe d'une action lui-même", () => {
    // C'est la duplication qui a produit le défaut : deux règles écrites
    // séparément finissent par diverger, et c'est la plus permissive qui
    // gagne. Le motif s'applique au CODE, commentaires retirés — sinon il se
    // satisferait du commentaire qui décrit la règle (L-031).
    for (const ecran of ECRANS) {
      expect(codeSansCommentaires(ecran), `${ecran} redérive la famille localement`).not.toMatch(
        /startsWith\(\s*["']compte|startsWith\(\s*["']parametre/,
      );
    }
  });
});

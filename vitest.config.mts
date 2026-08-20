import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const racine = path.dirname(fileURLToPath(import.meta.url));

// Redeclare dans CHAQUE projet : avec `projects`, la resolution definie a la
// racine n est pas heritee. Sans cela les tests ne resolvent pas `@/...` alors
// que `tsc` les valide — un desaccord silencieux entre typage et execution.
const alias = { "@": path.join(racine, "src") };

/**
 * Trois projets séparés, parce qu'ils n'ont ni les mêmes prérequis ni le même
 * statut :
 *
 * - `unit` : pur, sans réseau ni base. Doit rester exécutable partout.
 * - `rls`  : exige une VRAIE base et de VRAIS utilisateurs authentifiés. Un
 *            test qui simule RLS ne teste pas RLS. Suite JAMAIS désactivable.
 * - `perf` : mesures. Séparée parce qu'une mesure lente ne doit pas décourager
 *            de lancer les deux autres.
 */
export default defineConfig({
  // L'alias doit etre declare ici aussi : Vitest ne lit pas les  du
  // tsconfig, qui ne servent qu'au typage.
  resolve: { alias: { "@": path.join(racine, "src") } },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "rls",
          environment: "node",
          include: ["tests/rls/**/*.test.ts"],
          setupFiles: ["tests/aide/charger-env.ts"],
          // Les sondes ouvrent une connexion Postgres : le défaut de 5 s de
          // Vitest expire avant l'établissement de la connexion TLS.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Une base unique ne supporte pas des sondes concurrentes qui
          // liraient le catalogue pendant qu'une autre le modifie.
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "perf",
          environment: "node",
          include: ["tests/perf/**/*.test.ts"],
          setupFiles: ["tests/aide/charger-env.ts"],
          testTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});

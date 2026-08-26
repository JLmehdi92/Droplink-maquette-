import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const racine = path.dirname(fileURLToPath(import.meta.url));

// Redeclare dans CHAQUE projet : avec `projects`, la resolution definie a la
// racine n est pas heritee. Sans cela les tests ne resolvent pas `@/...` alors
// que `tsc` les valide — un desaccord silencieux entre typage et execution.
// `server-only` LEVE une exception sous Node : son export par defaut est un
// module qui jette, et seule la condition `react-server` rend le module vide.
// C est exactement ce qu on veut dans un bundle navigateur, et exactement ce
// qu on ne veut pas dans un test qui s execute deliberement cote serveur. La
// garantie reelle reste posee ailleurs, et a deux endroits : le build Next, et
// la regle `no-restricted-imports` d ESLint.
const alias = {
  "@": path.join(racine, "src"),
  "server-only": path.join(racine, "node_modules", "server-only", "empty.js"),
};

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
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        // Le projet `unit` importe des composants `.tsx` — la garde qui vérifie
        // qu'un lien de réseau non conforme n'est PAS rendu appelle le composant
        // lui-même. Tester une fonction pure extraite à côté prouverait que la
        // fonction est correcte, jamais que le composant l'appelle (L-018).
        oxc: { jsx: { runtime: "automatic" } },
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
          // Purge les comptes de test abandonnés par des exécutions dont la
          // mise en place a échoué. À l'ENTRÉE, parce qu'une protection qui
          // dépend d'un `afterAll` dépend d'une absence d'échec.
          globalSetup: ["tests/aide/amorcage.ts"],
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
          // Branchement RÉEL du stockage R2, de bout en bout. Séparé parce
          // qu'il exige des identifiants Cloudflare et touche un vrai bucket :
          // il ne peut pas faire partie des portes de qualité, qui doivent
          // rester exécutables sans compte tiers. Lancé par `pnpm check:r2`.
          name: "r2",
          environment: "node",
          include: ["tests/r2/**/*.test.ts"],
          setupFiles: ["tests/aide/charger-env.ts"],
          testTimeout: 60_000,
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
          globalSetup: ["tests/aide/amorcage.ts"],
          testTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Message porté par la restriction d'import du client admin. Il dit le POURQUOI,
 * parce qu'une erreur de lint qui n'explique rien se contourne en désactivant la
 * règle.
 */
const MESSAGE_ADMIN =
  "Le client service-role `admin.ts` ne s'importe que depuis `src/lib/audit/`. " +
  "Il sert quand un HUMAIN lit les données d'un tiers, et cette lecture doit " +
  "être auditée atomiquement avec l'accès qu'elle trace. Pour un chemin sans " +
  "humain (webhook, tâche, envoi), utiliser `system.ts`.";

const MESSAGE_ANON =
  "Le client sans session `anon.ts` est réservé à la page publique `/p/[token]`. " +
  "Ailleurs, utiliser `server.ts` : lire sans session depuis l'espace vendeur " +
  "contournerait la RLS silencieusement.";

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    // ⚠️ `scripts/**` NE FIGURE PLUS ICI, et c'est délibéré.
    //
    // Ce dossier porte `falsifier.mjs` et `fumee.mjs` : les deux outils qui
    // certifient que le produit est VIVANT et que ses gardes mordent. Ils
    // étaient hors de toutes les portes — ni typés, ni lintés — donc
    // `no-floating-promises` ne s'y appliquait pas. Une promesse perdue dans
    // le falsificateur laisse le produit CASSÉ EN BASE pendant que le script
    // annonce l'avoir réparé : le seul défaut du dépôt dont la conséquence est
    // une base durablement fausse.
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },

  // Règles à typage requis. Le brief les exige nommément : `foo()` et
  // `await foo()` se ressemblent trop pour qu'une relecture ou une recherche
  // textuelle les distingue — c'est le TYPAGE qui doit l'exiger, sinon une
  // promesse non attendue perd son événement en silence.
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Cloisonnement des clients Supabase. La règle vise TOUT le code source, et
  // les exceptions sont déclarées en dessous — plutôt que l'inverse, qui aurait
  // laissé ouvert tout ce à quoi personne n'a pensé (L-029).
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/lib/supabase/admin", "@/lib/supabase/admin"], message: MESSAGE_ADMIN },
            { group: ["**/lib/supabase/anon", "@/lib/supabase/anon"], message: MESSAGE_ANON },
          ],
        },
      ],
    },
  },

  // Les seules exceptions, chacune avec sa raison.
  {
    // `lib/audit/` EST le lieu de l'audit : c'est là que le client admin doit
    // vivre, et nulle part ailleurs.
    files: ["src/lib/audit/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // La page publique et ses dépendances directes : le seul endroit où lire
    // sans session est la bonne chose à faire.
    files: ["src/app/p/**/*.ts", "src/app/p/**/*.tsx", "src/lib/page-publique/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Les modules eux-mêmes. Sans cette exception, `admin.ts` échouerait sur sa
    // propre existence.
    files: ["src/lib/supabase/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;

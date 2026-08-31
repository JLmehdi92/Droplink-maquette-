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

/*
 * ⚠️ `system.ts` N'ÉTAIT RESTREINT PAR RIEN, et il porte la MÊME clé
 * service-role qu'`admin.ts`.
 *
 * Trouvé à l'audit du 31/08/2026. Deux motifs étaient déclarés — `admin` et
 * `anon` — et le troisième client à contourner la RLS n'en avait aucun. Il
 * n'était protégé que par `server-only`, qui n'arrête RIEN côté serveur :
 * n'importe quel Server Component ou Server Action pouvait l'importer et lire
 * les données de tous les vendeurs, sans audit, sans erreur de lint, sans
 * erreur de build. Le raisonnement d'`admin.ts` — « l'enfermer rend l'audit
 * structurellement inévitable » — vaut au moins autant pour celui dont la
 * promesse est « aucun humain n'est derrière ».
 *
 * LES MOTIFS NE CITENT PLUS `lib/` : ils l'exigeaient, donc un import RELATIF
 * (`../supabase/admin`) les traversait. La convention du dépôt est aujourd'hui
 * 100 % `@/`, mais « ce serait ouvert si quelqu'un écrivait un chemin relatif »
 * n'est pas une protection (L-029).
 */
const MESSAGE_SYSTEME =
  "Le client service-role `system.ts` est réservé aux chemins SANS HUMAIN " +
  "(webhooks, tâches planifiées, compteurs de limitation). Il contourne la RLS " +
  "sans écrire d'audit : l'employer sur un écran ferait lire les données d'un " +
  "tiers en silence. Depuis une page ou une Server Action, utiliser `server.ts`.";

const CLOISONS = [
  { nom: "admin", group: ["**/supabase/admin", "@/lib/supabase/admin"], message: MESSAGE_ADMIN },
  { nom: "anon", group: ["**/supabase/anon", "@/lib/supabase/anon"], message: MESSAGE_ANON },
  {
    nom: "systeme",
    group: ["**/supabase/system", "@/lib/supabase/system"],
    message: MESSAGE_SYSTEME,
  },
];

/** Les cloisons SAUF celles nommées — une exception ne désarme que sa raison. */
const sauf = (...autorises) =>
  CLOISONS.filter((c) => !autorises.includes(c.nom)).map(({ group, message }) => ({
    group,
    message,
  }));

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
      "no-restricted-imports": ["error", { patterns: sauf() }],
    },
  },

  /*
   * Les seules exceptions, chacune avec sa raison.
   *
   * ⚠️ ELLES ÉTEIGNAIENT LA RÈGLE ENTIÈRE, et pas seulement le motif qui les
   * motive. Trouvé à l'audit du 31/08/2026 : `"no-restricted-imports": "off"`
   * désarme TOUS les motifs à la fois. `lib/page-publique/`, dispensé pour
   * pouvoir importer `anon`, pouvait donc aussi importer `admin` sans un mot —
   * et c'est précisément le dossier qui rend du contenu à un visiteur non
   * authentifié. Chaque dispense était deux fois plus large que sa raison.
   *
   * Chacune REDÉCLARE donc les motifs qui restent en vigueur, plutôt que
   * d'éteindre. `sauf()` rend la liste privée de ce qui est autorisé ici : si
   * quelqu'un ajoute un quatrième client demain, il entre automatiquement dans
   * toutes les exceptions sans qu'on ait à y penser.
   */
  {
    // `lib/audit/` EST le lieu de l'audit : c'est là que le client admin doit
    // vivre, et nulle part ailleurs.
    files: ["src/lib/audit/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: sauf("admin") }] },
  },
  {
    // La page publique et ses dépendances directes : le seul endroit où lire
    // sans session est la bonne chose à faire. `system` y est admis pour le
    // SEUL comptage de vue — un chemin sans humain, hors du rendu.
    files: ["src/app/p/**/*.ts", "src/app/p/**/*.tsx", "src/lib/page-publique/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: sauf("anon", "systeme") }] },
  },
  {
    // Les chemins SANS HUMAIN : compteurs de limitation, webhooks et tâches de
    // suivi. C'est la raison d'être de `system.ts`, distinct d'`admin.ts`
    // précisément parce qu'un webhook n'est personne et n'a rien à auditer.
    files: [
      "src/lib/limitation/**/*.ts",
      "src/lib/tracking/**/*.ts",
      "src/lib/instrumentation/**/*.ts",
      // La veille mutuelle : elle ne lit QUE des battements de tâches et le
      // seuil de retard — aucune donnée de vendeur, donc rien à auditer. Elle
      // tourne appelée par un planificateur, jamais par quelqu'un.
      "src/lib/veille/**/*.ts",
    ],
    rules: { "no-restricted-imports": ["error", { patterns: sauf("systeme") }] },
  },
  {
    // Les modules eux-mêmes. Sans cette exception, `admin.ts` échouerait sur sa
    // propre existence.
    files: ["src/lib/supabase/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;

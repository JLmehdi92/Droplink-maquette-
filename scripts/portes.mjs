#!/usr/bin/env node
/**
 * LES SEPT PORTES, TOUTES SUR LA MEME BASE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN SCRIPT PLUTOT QU UNE CHAINE DE `&&`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `gates` etait `pnpm typecheck && pnpm lint && pnpm build && pnpm test &&
 * pnpm test:rls && pnpm fumee`. Chaque maillon chargeait son environnement de
 * son cote, et depuis le 06/09/2026 ce n est plus tenable : les suites visent
 * la base de TESTS (`.env.test.local`), et le build, lui, lisait `.env.local`.
 *
 * ⚠️ CE N EST PAS UN DETAIL DE CONFORT. Les variables `NEXT_PUBLIC_*` sont
 * INLINEES DANS LE BUNDLE au moment du build. Un build fait avec `.env.local`
 * puis une fumee lancee contre la base de tests produirait un serveur pointe
 * sur la PRODUCTION pendant que les sondes croiraient mesurer la base de
 * tests — et tout serait vert. C est L-032 : *toute verification qui interroge
 * un artefact construit doit etablir que l artefact CORRESPOND au code sous
 * test*. Ici, au code ET a la base.
 *
 * Ce script charge donc l environnement UNE FOIS, en tete, et le transmet aux
 * six commandes. Elles ne peuvent plus diverger.
 *
 * ⚠️ ET IL REFUSE DE DEMARRER SUR LA PRODUCTION. La garde du harnais
 * (`tests/aide/base-de-tests.ts`) protege les suites ; elle ne protege pas le
 * BUILD, qui s execute avant elles. Sans le controle ci-dessous, `pnpm gates`
 * construirait un bundle de production, puis la fumee le servirait, et les
 * 293 controles s executeraient contre les vraies donnees — c est exactement
 * l etat qu on vient de quitter.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { config } from "dotenv";

const REF_PRODUCTION = "csndfatwtbzqmhgqseem";

/*
 * LA BASE DE TESTS D ABORD : `dotenv` ne remplace pas une variable deja posee,
 * donc ses valeurs gagnent sur celles de `.env.local`, qui ne fournit plus que
 * le complement (sel de hachage, bord de confiance, identifiants R2).
 */
if (!existsSync(".env.test.local")) {
  console.error(
    "ECHEC `.env.test.local` est absent.\n" +
      "  Les portes ne peuvent pas tourner : sans lui, le build et la fumee\n" +
      "  viseraient la PRODUCTION. Une suite qui ecrit dans la production a\n" +
      "  deja efface de vrais colis sur ce projet, le 05/09/2026.\n" +
      "  Voir `tests/aide/base-de-tests.ts` pour ce qu il doit contenir.",
  );
  process.exit(1);
}
config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const cible = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
if (cible === "" || cible.includes(REF_PRODUCTION)) {
  console.error(
    `ECHEC les portes viseraient ${cible === "" ? "une base indeterminee" : "la PRODUCTION"}.\n` +
      "  Refus. Le build inline `NEXT_PUBLIC_SUPABASE_URL` dans le bundle :\n" +
      "  une fumee lancee ensuite servirait de vraies donnees a 293 controles\n" +
      "  qui croiraient mesurer une base jetable.",
  );
  process.exit(1);
}

const ref = cible.replace(/^https?:\/\//, "").split(".")[0];
console.log(`[portes] base visee : ${ref} — les sept portes partagent cet environnement.`);

/*
 * ⚠️ LA SEPTIÈME PORTE, `couverture`, VIENT APRÈS `test:rls` ET PAS AVANT.
 *
 * Posée le 23/09/2026. Elle ne relance rien : elle LIT les deux rapports de
 * couverture que `test` et `test:rls` viennent d'écrire (vidés avant chacun) et
 * refuse tout fichier de `src/lib/` qu'aucun test ne traverse — une feature
 * ajoutée sans test rougit donc le jour même. Placée avant, elle lirait les
 * rapports d'une exécution précédente, c'est-à-dire un code qui n'existe plus.
 */
const PORTES = ["typecheck", "lint", "build", "test", "test:rls", "couverture", "fumee"];

for (const porte of PORTES) {
  console.log(`\n[portes] ── ${porte} ─────────────────────────────────────────`);
  const r = spawnSync("pnpm", [porte], {
    stdio: "inherit",
    env: process.env,
    // Windows : `pnpm` est un script, il lui faut un shell pour etre resolu.
    shell: true,
  });
  if (r.status !== 0) {
    console.error(
      `\n[portes] ECHEC a « ${porte} » (code ${r.status}). Les portes suivantes ` +
        "ne sont PAS executees : on ne mesure pas par-dessus du rouge.",
    );
    process.exit(r.status ?? 1);
  }
}

console.log("\n[portes] les sept portes sont passees.");

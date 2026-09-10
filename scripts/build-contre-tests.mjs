/**
 * Construit le produit CONTRE LA BASE DE TESTS.
 *
 * ⚠️ L ORDRE DE CHARGEMENT EST LA PROPRIETE : `dotenv` ne remplace pas une
 * variable deja posee. `.env.test.local` D ABORD gagne donc sur `.env.local`.
 * Les `NEXT_PUBLIC_*` sont INLINEES dans le bundle : un build fait sur
 * `.env.local` puis sonde contre la base de tests servirait de VRAIES donnees
 * a une sonde convaincue de mesurer une base jetable (L-032).
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const cible = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
if (!/djvjaocvndqhqqgilrof/.test(cible)) {
  console.error("ECHEC la base visee n est pas la base de tests : " + cible);
  process.exit(1);
}
console.log("build contre : " + cible);
const r = spawnSync("pnpm", ["build"], { shell: true, env: process.env, stdio: "inherit" });
process.exit(r.status ?? 1);

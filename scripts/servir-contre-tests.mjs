/**
 * SERT LE BUILD COURANT CONTRE LA BASE DE TESTS.
 *
 * ⚠️ L ORDRE DE CHARGEMENT EST LA PROPRIETE DE SECURITE : `dotenv` ne remplace
 * PAS une variable deja posee, donc `.env.test.local` D ABORD gagne sur
 * `.env.local`. Sans cet ordre, Next chargerait `.env.local` tout seul et le
 * serveur ecrirait dans la PRODUCTION pendant qu on croit sonder une base
 * jetable — c est exactement L-032, et ca a deja coute des colis reels.
 *
 * ⚠️ PORT EPHEMERE + ARRET DE L ARBRE : sous Windows, `child.kill()` ne tue que
 * `pnpm`, pas le serveur qu il a lance. Un serveur du passage precedent reste
 * en ecoute et les requetes atteignent un build ANTERIEUR aux modifications.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const cible = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
if (!/djvjaocvndqhqqgilrof/.test(cible)) {
  console.error("ECHEC la base visee n est pas la base de tests : " + cible);
  process.exit(1);
}

const port = await new Promise((r) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});

writeFileSync(process.argv[2] ?? "port.txt", String(port));
console.log("base visee : " + cible);
console.log("port ephemere : " + port);

const serveur = spawn("pnpm", ["start", "--port", String(port)], {
  shell: true,
  env: { ...process.env, BORD_DE_CONFIANCE: "railway", NEXT_PUBLIC_POSTHOG_KEY: "" },
  stdio: "inherit",
});
serveur.on("exit", (c) => process.exit(c ?? 0));

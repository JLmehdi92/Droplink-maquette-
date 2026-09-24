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
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

/*
 * ⚠️ LES TIERS PAYANTS SONT DÉBRANCHÉS, ET ILS NE L'ÉTAIENT PAS — 9 PRISES EN CHARGE PERDUES.
 *
 * `.env.local`, chargé en second, apporte les clés de PRODUCTION de tout ce que `.env.test.local`
 * ne redéfinit pas : 17TRACK et Resend compris. Seul PostHog était coupé. Relevé le 20/09/2026 par
 * Wassim sur le tableau de bord 17TRACK : 191 / 200, et des numéros « LX…123FR » — ceux que le
 * parcours navigateur (`parcours.mjs`) saisit dans l'éditeur. Chaque passage prenait donc en charge
 * un numéro INVENTÉ chez le fournisseur, sur les 200 prises À VIE du compte gratuit.
 *
 * Même règle que `tests/aide/charger-env.ts` (`TIERS_DEBRANCHES`) : ce serveur mesure des écrans,
 * il n'a pas à parler au transporteur ni à envoyer d'e-mail. DEUX barrières :
 *   1. LE TRANSPORT REFUSE les hôtes payants (`refus-tiers.mjs`, préchargé dans le serveur) —
 *      c'est la protection ; elle tient même si une vraie clé revient par un autre chemin ;
 *   2. les clés sont remplacées par des valeurs SENTINELLES, non vides. ⚠️ VIDE NE SUFFIT PAS,
 *      mesuré : Next recharge lui-même `.env.local` au démarrage et traite une chaîne vide comme
 *      « non posée » — la route de notification répondait encore 401 (clé présente), pas 503.
 */
const precharge = pathToFileURL(join(process.cwd(), "scripts", "refus-tiers.mjs")).href;
const serveur = spawn("pnpm", ["start", "--port", String(port)], {
  shell: true,
  // Sans lui, Windows ouvre une console par serveur lancé en arrière-plan (24/09/2026).
  windowsHide: true,
  env: {
    ...process.env,
    BORD_DE_CONFIANCE: "railway",
    NEXT_PUBLIC_POSTHOG_KEY: "",
    TRACKING_API_KEY: "debranche-serveur-de-mesure",
    /*
     * ⚠️ AU FORMAT D'UNE CLÉ (`re_…`) DEPUIS LE 23/09/2026, ET C'EST SANS RISQUE.
     * La planche de la page client dessine la carte « Suivi par e-mail », qui
     * n'apparaît que si l'envoi est configuré : avec une sentinelle hors format,
     * on mesurait une page à laquelle il manquait une carte. Rien ne peut partir
     * pour autant — `refus-tiers.mjs`, préchargé ci-dessous, refuse Resend au
     * TRANSPORT, quelle que soit la clé.
     */
    RESEND_API_KEY: "re_debranche_serveur_de_mesure",
    EMAIL_CLIENTS_DE: "DropLink <suivi@mesure.invalid>",
    /*
     * LE BOUTON DE PAIEMENT DE « PASSER AU PRO » n'est rendu que si l'adresse est posée —
     * la planche le dessine. Sans elle on mesurait « l'abonnement n'est pas encore
     * ouvert », un état que la production n'aura pas (24/09/2026). L'adresse est
     * factice et ne sera jamais suivie : une page mesurée ne clique pas.
     */
    LEMON_SQUEEZY_CHECKOUT_URL: "https://mesure.lemonsqueezy.com/buy/mesure",
    NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", `--import=${precharge}`].join(" ").trim(),
  },
  stdio: "inherit",
});
serveur.on("exit", (c) => process.exit(c ?? 0));

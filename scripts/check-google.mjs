#!/usr/bin/env node
/**
 * ÉPROUVE QUE LA CONNEXION GOOGLE EST RÉELLEMENT BRANCHÉE — chez Supabase, pas
 * seulement chez nous.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUI JUSTIFIE CET OUTIL, MESURÉ LE 06/09/2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `fournisseurActif("google")` lit `AUTH_GOOGLE_ACTIF`. C'est une variable que
 * NOUS posons : elle dit ce que nous croyons, jamais ce qui est. Poser `1` sans
 * avoir activé Google dans le tableau de bord Supabase affiche le bouton, et le
 * clic mène — mesuré, sur le vrai projet :
 *
 *     GET /auth/v1/authorize?provider=google
 *     400 {"error_code":"validation_failed",
 *          "msg":"Unsupported provider: provider is not enabled"}
 *
 * Un visiteur verrait donc du JSON brut, sur un domaine `supabase.co` dont il
 * n'a jamais entendu parler, à la place de sa page de connexion. C'est L-026 :
 * *une valeur qui a la FORME d'une configuration franchit toutes les
 * validations de présence* — valider notre drapeau ne dit rien de l'état chez
 * le fournisseur.
 *
 * ⚠️ POURQUOI CE N'EST PAS UNE GARDE À L'EXÉCUTION. Vérifier l'état réel au
 * moment du clic ajouterait un aller-retour réseau sur un chemin
 * d'authentification. Ce réseau échoue pour de vrai sur ce projet — mesuré, 2
 * requêtes sur 200 éjectées au-delà de dix secondes, et un `fetch failed` a
 * déjà rendu tout le panneau admin en 500. On paierait une panne récurrente
 * pour se prémunir d'une erreur de séquence qui ne dure que le temps d'une
 * configuration.
 *
 * ⚠️ CE QU'IL PROUVE. Que `/authorize` REND LA MAIN VERS GOOGLE au lieu de
 * refuser — c'est-à-dire l'appel qui échoue quand la configuration est fausse,
 * et je l'ai VU échouer avant d'écrire ces lignes (L-024). Un contrôle qui n'a
 * jamais pu être rouge ne prouve rien.
 *
 * ⚠️ CE QU'IL NE PROUVE PAS. Que l'identifiant client déclaré chez Google porte
 * la bonne URI de redirection : cela ne se constate qu'en allant jusqu'au bout
 * d'une vraie connexion, avec un vrai compte Google. Il le DIT plutôt que de le
 * laisser croire.
 *
 * Usage : pnpm check:google
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const cle = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ""
).trim();
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();

if (url === "" || cle === "") {
  console.error(
    "ECHEC configuration incomplete : NEXT_PUBLIC_SUPABASE_URL et la cle publiable " +
      "sont necessaires pour interroger les reglages du projet.",
  );
  process.exit(1);
}

const controles = [];
const constate = (ok, quoi) => controles.push([ok === true, quoi]);

// ── 1. Les reglages du projet ────────────────────────────────────────────────
let reglages = null;
try {
  const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: cle } });
  if (r.ok) reglages = await r.json();
  else console.error(`  lecture des reglages : HTTP ${r.status}`);
} catch (erreur) {
  console.error(`  lecture des reglages impossible : ${erreur.message}`);
}

if (reglages === null) {
  console.error(
    "\nECHEC les reglages du projet sont illisibles. Rien ne peut etre affirme " +
      "d ici — et surtout pas que Google fonctionne.",
  );
  process.exit(1);
}

/*
 * CONTRE-TEST D ABORD. Sans lui, « google est faux » serait vrai d une reponse
 * vide, d une cle refusee, ou d un objet dont la forme a change : la sonde
 * accuserait une configuration correcte, et on apprendrait a l ignorer.
 */
constate(
  reglages.external?.email === true,
  "CONTRE-TEST : les reglages sont bien lus (l email est declare actif)",
);

constate(
  reglages.external?.google === true,
  `Google est ACTIVE chez Supabase (external.google = ${String(reglages.external?.google)})`,
);

// ── 2. Notre drapeau, et son accord avec ce qui precede ──────────────────────
const drapeau = (process.env.AUTH_GOOGLE_ACTIF ?? "").trim();
constate(
  drapeau === "1",
  `AUTH_GOOGLE_ACTIF vaut exactement "1" (lu : ${drapeau === "" ? "(absente)" : `"${drapeau}"`})`,
);

/*
 * L ACCORD EST LE CONTROLE QUI COMPTE, et il echoue DANS LES DEUX SENS.
 *
 *   drapeau sans Supabase → le bouton s affiche et mene a du JSON d erreur ;
 *   Supabase sans drapeau → la porte est ouverte et personne ne la voit.
 *
 * Le second est benin, le premier est visible par tous les visiteurs. Les deux
 * sont des ecarts entre ce qu on croit et ce qui est, donc les deux se disent.
 */
constate(
  (drapeau === "1") === (reglages.external?.google === true),
  "notre drapeau et l etat reel chez Supabase disent la MEME chose",
);

// ── 3. L appel qui refuse quand la configuration est fausse (L-024) ──────────
const retour = site === "" ? "https://droplink.fr/fr/auth/retour" : `${site}/fr/auth/retour`;
let statut = null;
let destination = "";
let corps = "";
try {
  const r = await fetch(
    `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(retour)}`,
    { redirect: "manual" },
  );
  statut = r.status;
  destination = r.headers.get("location") ?? "";
  if (statut >= 400) corps = (await r.text()).slice(0, 200);
} catch (erreur) {
  console.error(`  appel de /authorize impossible : ${erreur.message}`);
}

constate(
  statut !== null,
  "CONTRE-TEST : /authorize a bien ete joint (sinon rien ci-dessous ne veut dire quoi que ce soit)",
);

constate(
  destination.startsWith("https://accounts.google.com/"),
  `/authorize rend la main VERS GOOGLE (statut ${statut}${corps === "" ? "" : `, ${corps}`})`,
);

// ── Verdict ──────────────────────────────────────────────────────────────────
let echecs = 0;
console.log();
for (const [ok, quoi] of controles) {
  console.log(`${ok ? "OK   " : "ECHEC"} ${quoi}`);
  if (!ok) echecs += 1;
}
console.log(`\n${controles.length} controles, ${echecs} echec(s).`);

if (echecs === 0) {
  console.log(
    "\nRESTE A EPROUVER A LA MAIN, ET CETTE SONDE NE PEUT PAS LE FAIRE : que\n" +
      "l identifiant client declare chez Google porte bien l URI de redirection\n" +
      `  ${url}/auth/v1/callback\n` +
      "et que Supabase accepte notre retour dans sa liste d URL autorisees\n" +
      `  ${retour}\n` +
      "Les deux ne se constatent qu en allant au bout d une VRAIE connexion.",
  );
}

process.exit(echecs === 0 ? 0 : 1);

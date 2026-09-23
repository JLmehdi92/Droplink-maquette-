// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ AUCUN FICHIER DE `src/lib/` SANS UN TEST QUI LE TRAVERSE                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Posé le 23/09/2026, à la demande de Wassim — une vidéo d'un développeur qui
// met « des tests automatisés partout » pour ne plus avoir à vérifier à la main,
// après chaque nouvelle feature, que les autres marchent encore. Sa méthode
// tient en trois gestes : un fichier de test par feature, les tests relancés à
// chaque modification, et un RAPPORT DE COUVERTURE qui dit quelles lignes aucun
// test ne traverse.
//
// Ce dépôt avait déjà le premier geste — massivement. Il n'avait PAS le
// troisième : `@vitest/coverage-v8` était installé et n'avait jamais tourné.
// Allumé ce jour-là : 28 fichiers de `src/lib/` qu'aucun des 1 931 tests ne
// traversait, dont le secret des tâches planifiées, la garde anti-CSRF et la
// cadence qui décide des appels PAYANTS au fournisseur de suivi.
//
// ⚠️ CE SCRIPT NE FIXE PAS UN POURCENTAGE, ET C'EST DÉLIBÉRÉ. Un seuil global
// (« 60 % des lignes ») ne voit pas une feature nouvelle : cinquante lignes sans
// test sur six mille déplacent le total d'un demi-point, sous n'importe quel
// seuil raisonnable. Ce qu'on exige est plus précis et plus dur : CHAQUE fichier
// de logique est traversé par au moins un test, ou déclaré ci-dessous avec sa
// raison. Une feature ajoutée sans test fait donc rougir la porte LE JOUR MÊME.
//
// ⚠️ L'INVENTAIRE PART DU DISQUE, PAS DU RAPPORT. Un fichier jamais importé par
// aucun test pourrait ne pas apparaître dans le rapport, et un contrôle qui ne
// regarderait que le rapport le laisserait passer — c'est précisément le
// fichier qu'il faut attraper (L-025 : un garde hérite du champ de vision de
// l'outil qu'il interroge, pas de celui du problème).
//
// ⚠️ CE QU'IL NE COUVRE PAS, DIT EXPLICITEMENT : `src/app/` et
// `src/components/`. Les pages, les routes et les composants sont exercés par la
// fumée (un vrai serveur, 359 contrôles) et par les sondes navigateur — dans un
// AUTRE processus, que la couverture de vitest ne peut pas voir. Les inclure
// ferait lire « 0 % » là où les contrôles existent, et pousserait à les
// déclarer tous en exception : une liste qui grossit finit par tout couvrir.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const racine = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RACINE_LIB = join(racine, "src", "lib");

/**
 * Les fichiers de `lib/` qu'AUCUN test ne traverse, et pourquoi c'est accepté.
 *
 * Chaque entrée est une DÉCISION, et la liste échoue dans les deux sens : une
 * entrée qui désigne un fichier désormais traversé, ou disparu, fait rougir la
 * porte — sans quoi elle deviendrait l'autorisation permanente de ne jamais
 * tester ce fichier, même le jour où quelqu'un y ajoute de la logique.
 */
const EXCEPTIONS = new Map([
  // ── Le contexte d'une requête Next : cookies, redirections, cache de rendu ──
  //    Un test unitaire n'a pas de requête. Chacune de ces routes est atteinte de
  //    bout en bout par la fumée — relevé le 23/09/2026 en croisant les
  //    appelants de `src/app` avec les chemins que `scripts/fumee.mjs` demande.
  [
    "src/lib/audit/garde.ts",
    "`exigerAdmin()` : `notFound()` et `cache()` de React. Éprouvée de bout en bout " +
      "par la fumée sur les routes d'administration (« rend 404 sans session »).",
  ],
  [
    "src/lib/comptes/apres-session.ts",
    "Redirections `next/navigation` après ouverture de session. Atteinte par la fumée " +
      "sur les douze routes vendeur et d'accès qui l'appellent.",
  ],
  [
    "src/lib/comptes/profil.ts",
    "`lireProfilVendeur()` lit les cookies de session. Atteinte par la fumée sur " +
      "quinze routes, dont les deux exports CSV.",
  ],
  [
    "src/lib/supabase/server.ts",
    "Le client serveur lit `cookies()` de `next/headers`. Trente-deux appelants, " +
      "atteint par la fumée sur chaque écran authentifié.",
  ],
  [
    "src/lib/commandes/actions.ts",
    "Module `use server` : chaque export est une Server Action, qui n'existe que dans " +
      "une requête. Atteint par la fumée sur /fr/commandes.",
  ],
  [
    "src/lib/commandes/actions-contestation.ts",
    "Module `use server` appelé par `bandeau-blocage.tsx`. Le travail vit dans " +
      "`lib/commandes/contestation.ts`, éprouvé en RLS.",
  ],
  [
    "src/lib/commandes/actions-medias.ts",
    "Module `use server` appelé par `carte-medias.tsx`. Le travail vit dans " +
      "`lib/commandes/medias.ts`, éprouvé en RLS.",
  ],

  // ── Atteints de bout en bout par la fumée, sur une route qu'elle inspecte ──
  [
    "src/lib/tracking/ingestion.ts",
    "Appelée par le webhook `/api/suivi/notification`, que la fumée éprouve : " +
      "signature, rejeu du même corps ignoré, étape du colis qui avance.",
  ],
  [
    "src/lib/envois/export-csv.ts",
    "Appelée par `/api/envois/export`, que la fumée télécharge et inspecte " +
      "(aucun lien public dans le fichier).",
  ],
  [
    "src/lib/blog/articles.ts",
    "Le registre des articles, servi par /fr/blog et /fr/blog/[slug] — que la fumée " +
      "demande (200 en français, 404 dans les autres langues).",
  ],
  [
    "src/lib/seo/donnees-structurees.ts",
    "Le JSON-LD des articles, que la fumée lit sur le HTML servi.",
  ],
  [
    "src/lib/analyses/recente.ts",
    "Servie par /fr/analyses et /fr/tableau-de-bord, que la fumée et les sondes " +
      "de conformité rendent.",
  ],
  [
    "src/lib/boutique/libelles-apercu.ts",
    "Les libellés de l'aperçu, rendus par /fr/marque, /fr/bienvenue et l'éditeur — " +
      "mesurés par les sondes de conformité.",
  ],
  [
    "src/lib/auth/recuperation.ts",
    "Appelée par /fr/nouveau-mot-de-passe, que la fumée demande.",
  ],
  [
    "src/lib/audit/empreinte-admin.ts",
    "Sept lignes, appelées par sept routes d'administration que la fumée demande.",
  ],


  // ── ⚠️ DU CODE MORT — constaté le 23/09/2026 par cet inventaire ────────────
  [
    "src/lib/supabase/client.ts",
    "Code mort DÉCLARÉ : `creerClientNavigateur` n'est appelé nulle part, et " +
      "`lib/auth/cookies.ts` le dit. Gardé : la cloison ESLint le cite.",
  ],
]);

// ── 1. Les deux rapports, frais ─────────────────────────────────────────────

const griefs = [];
const rapports = {};
for (const projet of ["unit", "rls"]) {
  const chemin = join(tmpdir(), "droplink-couverture", projet, "coverage-final.json");
  if (!existsSync(chemin)) {
    console.error(
      `\nECHEC inventaire de couverture : aucun rapport pour « ${projet} » (${chemin}).\n` +
        "  Il est écrit par `pnpm test` et `pnpm test:rls`, et VIDÉ avant chacun :\n" +
        "  un rapport absent veut dire que la suite n'a pas tourné, pas qu'elle a tout couvert.",
    );
    process.exit(1);
  }
  rapports[projet] = JSON.parse(readFileSync(chemin, "utf8"));
}

/** Ramène un chemin du rapport à `src/lib/...`, quels que soient la casse du lecteur et les séparateurs. */
function relatif(cle) {
  const normal = cle.replace(/\\/g, "/");
  const i = normal.toLowerCase().lastIndexOf("/src/lib/");
  return i === -1 ? null : normal.slice(i + 1);
}

/** Un fichier est traversé si UNE instruction au moins a été exécutée, dans l'un OU l'autre rapport. */
const traverse = new Map();
/**
 * Les fichiers SANS AUCUNE INSTRUCTION exécutable — des types, des interfaces.
 * Il n'y a rien à traverser : les exiger couverts forcerait à les déclarer en
 * exception un par un, et une liste qui grossit finit par tout couvrir.
 */
const sansCode = new Set();
for (const rapport of Object.values(rapports)) {
  for (const [cle, donnees] of Object.entries(rapport)) {
    const rel = relatif(cle);
    if (rel === null) continue;
    const instructions = Object.values(donnees.s ?? {});
    if (instructions.length === 0) sansCode.add(rel);
    const touche = instructions.some((n) => n > 0);
    traverse.set(rel, (traverse.get(rel) ?? false) || touche);
  }
}

// ── 2. L'inventaire, depuis le disque ───────────────────────────────────────

function fichiersDeLib(dossier = RACINE_LIB) {
  const trouves = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersDeLib(chemin));
    else if (/\.tsx?$/.test(entree) && !entree.endsWith(".d.ts")) {
      trouves.push(relative(racine, chemin).split(sep).join("/"));
    }
  }
  return trouves;
}

const inventaire = fichiersDeLib().sort();

// UN ENSEMBLE VIDE PASSE TOUT. Un chemin mal résolu ne trouverait aucun fichier,
// et un rapport mal lu n'en déclarerait aucun traversé : les deux rendraient la
// porte verte en ne regardant rien.
if (inventaire.length < 80) {
  griefs.push(`seulement ${inventaire.length} fichier(s) sous src/lib/ : la sonde vise à côté`);
}
if (traverse.size < 50) {
  griefs.push(`seulement ${traverse.size} fichier(s) dans les rapports : ils ont été mal lus`);
}
// CONTRE-TEST : si AUCUN fichier n'était traversé, le rapport serait vide de
// sens — une couverture désactivée produit exactement ça.
const nbTraverses = inventaire.filter((f) => traverse.get(f) === true).length;
if (nbTraverses === 0) griefs.push("aucun fichier traversé : la couverture n'a pas été collectée");
/*
 * ⚠️ ET LA RÈGLE « SANS CODE » EST ELLE-MÊME BORNÉE. Une instrumentation cassée
 * rendrait CHAQUE fichier sans instruction — et tous passeraient pour des
 * fichiers de types, porte verte. Le dépôt en compte deux au 23/09/2026
 * (`blog/types.ts`, `email/port.ts`) ; au-delà de dix, c'est la collecte qui
 * ment, pas le code.
 */
/*
 * On ne compte que les fichiers INVENTORIÉS : le rapport instrumente aussi
 * `tracking/transporteurs.json`, un fichier de données sans instruction, que
 * l'inventaire (fichiers `.ts` seulement) ne voit pas. Le mélanger au décompte
 * faisait afficher « 97 + 19 + 3 » pour 118 fichiers — un total qui ne
 * s'additionne pas finit toujours par cacher quelque chose.
 */
const sansCodeInventories = inventaire.filter((f) => sansCode.has(f));
if (sansCodeInventories.length > 10) {
  griefs.push(
    `${sansCodeInventories.length} fichiers sans aucune instruction : la couverture est mal ` +
      "collectée, pas un dépôt rempli de fichiers de types",
  );
}

// ── 3. Le verdict, dans les deux sens ───────────────────────────────────────

const nonTraverses = inventaire.filter((f) => traverse.get(f) !== true && !sansCode.has(f));
const nonDeclares = nonTraverses.filter((f) => !EXCEPTIONS.has(f));
const perimees = [...EXCEPTIONS.keys()].filter(
  (f) => !inventaire.includes(f) || traverse.get(f) === true,
);

if (nonDeclares.length > 0) {
  griefs.push(
    `${nonDeclares.length} fichier(s) de src/lib/ qu'AUCUN test ne traverse :\n` +
      nonDeclares.map((f) => `      - ${f}`).join("\n") +
      "\n    Écrire le test qui le traverse — c'est une feature sans filet. Ou, si " +
      "c'est un cas\n    à part, le déclarer dans EXCEPTIONS avec sa raison.",
  );
}
if (perimees.length > 0) {
  griefs.push(
    `${perimees.length} exception(s) qui ne désignent plus rien (fichier traversé ou disparu) :\n` +
      perimees.map((f) => `      - ${f}`).join("\n") +
      "\n    Les retirer : une exception périmée autoriserait en silence le retour du défaut.",
  );
}

if (griefs.length > 0) {
  console.error(`\nECHEC inventaire de couverture :\n  - ${griefs.join("\n  - ")}`);
  process.exit(1);
}

console.log(
  `\ninventaire de couverture : ${nbTraverses}/${inventaire.length} fichiers de src/lib/ ` +
    `traversés par un test, ${sansCodeInventories.length} sans code exécutable, ` +
    `${EXCEPTIONS.size} exception(s) déclarée(s).`,
);

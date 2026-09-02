// Test de fumee HTTP : le produit doit REPONDRE, pas seulement compiler.
//
// Deux pieges Windows deja rencontres sur ce projet, tous deux traites ici :
//   - `child.kill()` ne tue que le processus `pnpm`, pas le serveur qu il a
//     lance. Un serveur du passage precedent reste en ecoute, le `next start`
//     suivant echoue SILENCIEUSEMENT a se lier, et les requetes atteignent un
//     build anterieur aux modifications a verifier. D ou l arret de l ARBRE de
//     processus (`taskkill /T`) et le port EPHEMERE, qui rend impossible de
//     parler par accident au serveur d un passage precedent.
//   - Les chemins passent par `path.join`, jamais de separateur en dur.
//
// ⚠️ CE SCRIPT EST DANS LES PORTES DE QUALITE depuis qu on a MESURE ce qu il
// coute : SEPT SECONDES, et non « une trentaine » comme l affirmait cette ligne
// — une affirmation que personne n avait executee, sur le fichier meme dont le
// role est d etablir les choses par execution.
//
// Ce qui a tranche n est pas le cout mais un TROU CONSTATE : falsifier la
// verification de signature du point de reception des notifications laissait
// typecheck, lint, build, unitaires et RLS entierement verts. Cette route est la
// seule surface du produit qui ECRIVE sans qu aucun humain soit implique, et son
// unique couverture vivait ici — c est-a-dire hors de ce qu on lance avant de
// commiter. Une protection posee a l endroit ou l on ne regarde pas.
//
// Il exige un `.next` a jour, donc il vient APRES `pnpm build` dans la chaine.
import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Le serveur enfant lit `.env.local` lui-meme ; ce script, non. Sans ce
// chargement, la sonde qui cree une commande de test echouerait sur une
// variable absente — et l echec ressemblerait a un defaut du produit.
const { config: chargerEnv } = await import("dotenv");
chargerEnv({ path: ".env.local", quiet: true });

const racine = dirname(dirname(fileURLToPath(import.meta.url)));

if (!existsSync(join(racine, ".next"))) {
  console.error("Aucun build dans .next — lancer `pnpm build` d'abord.");
  process.exit(1);
}

function portLibre() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

const port = await portLibre();
const base = `http://127.0.0.1:${port}`;
console.log(`port ephemere : ${port}\n`);

// Le plafond public est abaisse POUR CE SERVEUR : mesurer le seuil reel de 120
// exigerait 121 requetes, et on ne verifierait de toute facon qu un nombre. Ce
// qu on veut etablir est que le seuil CONFIGURE mord, et qu il mord par
// adresse. La valeur est volontairement inhabituelle : un 7 qui apparait dans
// le comportement ne peut pas venir d ailleurs que de cette variable.
const PLAFOND_PUBLIC = 7;

/*
 * UNE ADRESSE PAR BLOC DE CONTROLES.
 *
 * Le plafond public est compte PAR ADRESSE. Sans ces en-tetes, tous les blocs
 * partagent celle de la boucle locale, et le huitieme controle de la sonde se
 * fait refuser par la limitation de debit — en repondant 404, c est-a-dire
 * EXACTEMENT ce que repond une page suspendue ou un jeton inconnu. Le produit
 * n a qu un seul chemin de sortie, par conception, donc l echec ressemble trait
 * pour trait a la propriete qu on cherchait a etablir.
 *
 * C est le piege le plus retors de cette sonde : elle a affiche « la suspension
 * coupe la page » alors qu elle mesurait son propre quota epuise.
 */
function visiteur(n) {
  // L ADRESSE VARIE AUSSI D UNE EXECUTION A L AUTRE.
  //
  // La fenetre de limitation vit EN BASE et dure une minute : deux executions
  // rapprochees partagent donc les memes compteurs, et la seconde trouve le
  // plafond deja consomme par la premiere. La sonde devenait non reproductible
  // — verte, puis rouge, puis pire — sans qu aucun code produit n ait change.
  //
  // Le port ephemere est unique par execution : il sert de graine. Sans lui, la
  // seule facon d obtenir un vert serait d attendre une minute entre deux
  // lancements, c est-a-dire de relancer jusqu au vert.
  const serie = port % 250;
  return {
    "x-forwarded-for": `10.${serie}.${n}.1`,
    "user-agent": `sonde-fumee/${serie}-${n}`,
  };
}

// Secrets POSES POUR CE SERVEUR, et differents de ceux de production. Ce qu on
// eprouve est le SCHEMA — « la porte est-elle fermee, et s ouvre-t-elle avec la
// bonne cle » — pas le secret lui-meme.
const SECRET_CRON = "fumee-cron-secret-0123456789";
const CLE_SUIVI = "fumee-cle-suivi-abcdef0123456789";

/*
 * LE BUILD DOIT CORRESPONDRE AU CODE SOUS TEST — verifie AVANT de demarrer.
 *
 * `pnpm start` sert le contenu de `.next`, pas les sources. Une sonde de fumee
 * lancee sans rebuild interroge donc le passage precedent, et le fait
 * SILENCIEUSEMENT : le serveur demarre, repond 200, et tous les controles
 * passent — sur un produit qui n est plus celui qu on a ecrit.
 *
 * OBSERVE SUR CE PROJET, a l instant meme ou l on falsifiait une garde : le code
 * casse, la fumee VERTE. C est exactement L-032 — « il repond » est la propriete
 * que tous les residus possedent — et les suites RLS s en protegeaient depuis
 * longtemps, alors que la sonde qui interroge le produit REEL ne s en protegeait
 * pas. La verification qui en avait le plus besoin etait la seule a ne pas
 * l avoir.
 *
 * ON REFUSE DE DEMARRER plutot que d avertir : un avertissement dans un journal
 * de cent lignes est un avertissement que personne ne lit, et le cout d une
 * fausse assurance est ici maximal.
 */
function dateModifLaPlusRecente(dossiers) {
  let plusRecente = 0;
  const parcourir = (chemin) => {
    for (const entree of readdirSync(chemin, { withFileTypes: true })) {
      const complet = join(chemin, entree.name);
      if (entree.isDirectory()) {
        parcourir(complet);
      } else if (/\.(ts|tsx|mjs|json|css)$/.test(entree.name)) {
        plusRecente = Math.max(plusRecente, statSync(complet).mtimeMs);
      }
    }
  };
  for (const d of dossiers) {
    if (!existsSync(d)) continue;
    // Un fichier isole — `next.config.ts` — n est pas un dossier a parcourir.
    if (statSync(d).isDirectory()) parcourir(d);
    else plusRecente = Math.max(plusRecente, statSync(d).mtimeMs);
  }
  return plusRecente;
}

const manifeste = join(racine, ".next", "build-manifest.json");
if (!existsSync(manifeste)) {
  console.error(
    "ECHEC .next/build-manifest.json absent : il n y a rien a servir. Lancer `pnpm build`.",
  );
  process.exit(1);
}

const dateBuild = statSync(manifeste).mtimeMs;
const dateSource = dateModifLaPlusRecente([
  join(racine, "src"),
  join(racine, "messages"),
  join(racine, "next.config.ts"),
]);

if (dateBuild < dateSource) {
  console.error(
    `ECHEC le build (${new Date(dateBuild).toISOString()}) est ANTERIEUR a la source ` +
      `la plus recente (${new Date(dateSource).toISOString()}).`,
  );
  console.error("      La sonde interrogerait le passage PRECEDENT, et tout serait vert.");
  console.error("      Lancer `pnpm build` avant `pnpm fumee`.");
  process.exit(1);
}

const serveur = spawn("pnpm", ["start", "--port", String(port)], {
  cwd: racine,
  shell: true,
  env: {
    ...process.env,
    QUOTA_PUBLIQUE_PAR_MINUTE: String(PLAFOND_PUBLIC),
    // LE MODE DE CONFIANCE EST DECLARE, comme il devra l etre en production.
    // Le defaut est `cloudflare` — seul `cf-connecting-ip` est cru — et il n y a
    // pas de Cloudflare devant ce serveur : sans ce reglage, aucune adresse ne
    // serait lisible, donc AUCUN QUOTA NE SERAIT CONSOMME, et les controles de
    // limitation passeraient tous en ne mesurant rien. Un ensemble vide passe
    // tout.
    BORD_DE_CONFIANCE: "xff",
    CRON_SECRET: SECRET_CRON,
    TRACKING_API_KEY: CLE_SUIVI,
    /*
     * ⚠️ L ANALYTICS EST DEBRANCHE POUR CE SERVEUR, comme la cle de suivi juste
     * au-dessus, et pour la meme raison : ce qu on eprouve est le SCHEMA, pas le
     * service. Le 01/09/2026 la cle de production a ete posee dans `.env.local`,
     * et cette sonde s est mise a emettre de VRAIS evenements d usage — dont
     * `order_created`, qui est le denominateur du taux d activation. La metrique
     * de verdict de la phase aurait ete faussee par sa propre sonde de fumee,
     * en restant credible.
     */
    NEXT_PUBLIC_POSTHOG_KEY: "",
    /*
     * ⚠️ ET L EXPEDITEUR AUSSI — LE TROISIEME, TROUVE PARCE QU IL A MORDU.
     *
     * Le 01/09/2026, quelques minutes apres la verification du domaine d envoi,
     * une VRAIE alerte est arrivee dans la boite de Wassim : « Tache en retard :
     * veille-mutuelle », emise par `cadence-suivi`. Personne ne l avait demandee.
     *
     * Elle venait d ICI. Cette sonde appelle `/api/suivi/cadence`, la cadence
     * veille sur l autre planificateur, et le serveur heritait de la vraie cle
     * Resend. Chaque `pnpm gates` aurait donc envoye une alerte — et « une
     * alerte qui se trompe est une alerte qu on apprend a ignorer ». Le veilleur
     * serait devenu inaudible avant d avoir jamais servi.
     *
     * ⚠️ CE QUE CET INCIDENT A PROUVE, ET QU IL FAUT GARDER : la chaine complete
     * FONCTIONNE. Etat des battements → decision → reservation → email recu.
     * C est L-022 etablie par execution, une fois, pour de vrai. Elle n a pas
     * besoin de l etre a chaque passage.
     *
     * La voie d envoi reste eprouvable a la demande par `pnpm check:email`,
     * hors des portes, comme `pnpm check:r2`.
     *
     * ⚠️ ICI LA NEUTRALISATION EST LA SEULE GARDE, et il faut le dire : ce
     * serveur est un PROCESSUS SEPARE, il n installe pas le transport du harnais
     * et ne peut donc pas refuser l appel. C est une protection qui tient a une
     * absence — moins solide que celle de la suite, et c est assume faute de
     * levier qui ne deforme pas le produit.
     */
    RESEND_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let journal = "";
serveur.stdout.on("data", (d) => (journal += d.toString()));
serveur.stderr.on("data", (d) => (journal += d.toString()));

function arreter() {
  try {
    execSync(`taskkill /pid ${serveur.pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* le processus est deja mort : rien a arreter */
  }
}

const debut = Date.now();
let pret = false;
while (Date.now() - debut < 90_000) {
  try {
    await fetch(`${base}/fr`, { redirect: "manual" });
    pret = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 400));
  }
}

if (!pret) {
  console.error("LE SERVEUR N'A PAS DEMARRE\n");
  console.error(journal.slice(-2000));
  arreter();
  process.exit(1);
}

/**
 * Suit la chaine de redirections et rend l etat FINAL.
 *
 * Attendre un 404 immediat sur `/de` etait une attente fausse, pas un defaut du
 * produit : next-intl prefixe le chemin inconnu puis rend 404 en un saut. Ce qui
 * doit etre vrai, c est que la langue non supportee FINIT en 404 — pas qu elle y
 * arrive sans redirection. La chaine complete est rendue pour que l ecart, s il
 * revient, soit lisible sans relancer un tracage a la main.
 */
async function suivre(chemin) {
  let url = base + chemin;
  const chaine = [];
  for (let saut = 0; saut < 5; saut += 1) {
    const r = await fetch(url, { redirect: "manual" });
    chaine.push(`${r.status} ${url.slice(base.length)}`);
    const suivant = r.headers.get("location");
    if (suivant === null) return { statut: r.status, chaine, final: url.slice(base.length) };
    url = suivant.startsWith("http") ? suivant : base + suivant;
  }
  return { statut: 0, chaine, final: url.slice(base.length) };
}

const cas = [
  { chemin: "/fr", statut: 200, libelle: "landing francaise" },
  { chemin: "/en", statut: 200, libelle: "landing anglaise" },
  { chemin: "/fr/connexion", statut: 200, libelle: "connexion" },
  { chemin: "/en/connexion", statut: 200, libelle: "connexion anglaise" },
  { chemin: "/fr/inscription", statut: 200, libelle: "inscription" },
  { chemin: "/en/inscription", statut: 200, libelle: "inscription anglaise" },
  { chemin: "/fr/conditions", statut: 200, libelle: "conditions" },
  { chemin: "/fr/confidentialite", statut: 200, libelle: "confidentialite" },
  {
    /*
     * ⚠️ CE CAS ATTENDAIT 404 EN DUR, ET IL A ROUGI LE JOUR OU LE PRODUIT A EU
     * RAISON.
     *
     * `abus@droplink.fr` a ete configure le 01/09/2026 : la page rend
     * legitimement 200, et ce controle a accuse le produit d un defaut qui
     * etait une CORRECTION. Il n encodait pas la regle, il encodait l ETAT du
     * jour ou il a ete ecrit — c est le meme travers que L-014, transpose dans
     * une sonde.
     *
     * LA REGLE, ELLE, EST : la page rend 200 quand le canal existe, 404 sinon,
     * et JAMAIS AUTRE CHOSE. On borne donc les deux etats legitimes ici, et la
     * COHERENCE entre la page et les liens du pied de page est eprouvee plus
     * bas, dans les deux sens, par le bloc « Le recours de signalement ».
     *
     * Ce n est pas un affaiblissement : avant, un 500 ou une redirection
     * passaient inapercus des que l adresse etait posee, puisque le bloc du bas
     * se contente de lire `statut === 200` pour decider si le canal est ouvert.
     * Un 500 s y lisait donc comme « canal ferme ». Il echoue maintenant ici.
     */
    chemin: "/fr/signalement",
    statuts: [200, 404],
    libelle: "signalement rend 200 (canal ouvert) ou 404 (canal ferme), jamais autre chose",
  },
  // L espace vendeur, sans session : la liste ne doit JAMAIS repondre 200 a un
  // visiteur anonyme. On suit la chaine et on verifie l etat FINAL — une
  // redirection vers un ecran qui redirige ailleurs se lirait sinon comme une
  // protection alors que ce serait une boucle.
  {
    chemin: "/fr/commandes",
    statut: 200,
    final: "/fr/connexion?erreur=session",
    libelle: "liste des commandes SANS session renvoyee vers la connexion",
  },
  {
    chemin: "/en/commandes",
    statut: 200,
    final: "/en/connexion?erreur=session",
    libelle: "liste anglaise SANS session renvoyee vers la connexion",
  },
  // LES TROIS AUTRES ECRANS DE L ESPACE VENDEUR. Ils n etaient pas ici, et
  // c est un trou : un ecran qui plante au rendu repond 500, et rien ne le
  // disait tant que seule la liste des commandes etait interrogee. Ils
  // partagent desormais leur en-tete avec elle, donc une erreur dans cet
  // en-tete les emporterait tous les trois d un coup.
  {
    chemin: "/fr/envois",
    statut: 200,
    final: "/fr/connexion?erreur=session",
    libelle: "envois SANS session renvoyes vers la connexion",
  },
  {
    chemin: "/fr/analyses",
    statut: 200,
    final: "/fr/connexion?erreur=session",
    libelle: "analyses SANS session renvoyees vers la connexion",
  },
  {
    chemin: "/fr/marque",
    statut: 200,
    final: "/fr/connexion?erreur=session",
    libelle: "reglages de marque SANS session renvoyes vers la connexion",
  },
  {
    chemin: "/fr/bienvenue",
    statut: 200,
    final: "/fr/connexion?erreur=session",
    libelle: "onboarding SANS session renvoye vers la connexion",
  },
  { chemin: "/", statut: 200, final: "/fr", libelle: "racine negociee vers une langue" },
  { chemin: "/FR", statut: 200, final: "/fr", libelle: "casse de la langue normalisee" },
  { chemin: "/de", statut: 404, libelle: "langue non supportee" },
  { chemin: "/zz", statut: 404, libelle: "segment inconnu" },
  { chemin: "/fr/nexiste-pas", statut: 404, libelle: "route inconnue" },
];

let echecs = 0;

console.log("— Statuts —");
for (const { chemin, statut, statuts, final, libelle } of cas) {
  const r = await suivre(chemin);
  // `statuts` borne un ensemble d etats LEGITIMES ; `statut` en exige un seul.
  // L un des deux, jamais les deux — un cas qui n en porte aucun ne prouverait
  // rien tout en s affichant vert.
  const attendus = statuts ?? (statut === undefined ? [] : [statut]);
  if (attendus.length === 0) {
    echecs += 1;
    console.log(`ECHEC ${chemin.padEnd(20)} cas sans statut attendu : il ne prouve rien`);
    continue;
  }
  const statutOk = attendus.includes(r.statut);
  const finalOk = final === undefined || r.final === final;
  const ok = statutOk && finalOk;
  if (!ok) echecs += 1;
  console.log(
    `${ok ? "OK   " : "ECHEC"} ${chemin.padEnd(20)} ${r.chaine.join("  ->  ").padEnd(34)} ` +
      `${ok ? "" : `attendu ${attendus.join(" ou ")}${final === undefined ? "" : ` sur ${final}`} — `}${libelle}`,
  );
}

const fr = await (await fetch(`${base}/fr`)).text();
const en = await (await fetch(`${base}/en`)).text();

/*
 * AUCUNE CLE BRUTE, SUR AUCUN ECRAN ATTEIGNABLE SANS SESSION.
 *
 * Le controle qui suit ne cherchait que « landing. », et seulement sur les deux
 * landings. Une cle manquante ailleurs sortait telle quelle dans le HTML sans
 * que rien ne le dise — et c est exactement ce qui arrive quand un ecran est
 * refait : le composant demande des cles que le catalogue n a pas encore.
 *
 * IL INVENTORIE PLUTOT QUE DE SELECTIONNER : le motif est construit depuis les
 * espaces de noms REELS du catalogue, pas depuis une liste tenue a cote.
 *
 * ⚠️ CE QU IL NE COUVRE PAS, ET IL FAUT LE DIRE : les ecrans de l espace
 * vendeur et de l administration EXIGENT une session. Sans elle ils
 * redirigent, et une sonde qui suivrait la redirection inspecterait la page de
 * connexion en annoncant « marque : aucune cle brute ». Un controle qui rend un
 * verdict sur un ecran qu il n a pas regarde est pire que son absence. Ils sont
 * donc REFUSES explicitement plus bas, et la limitation est nommee.
 *
 * LES SCRIPTS SONT RETIRES AVANT LA RECHERCHE : une charge d hydratation peut
 * legitimement porter un nom de cle comme DONNEE ; ce qui compte est le TEXTE
 * rendu au lecteur.
 */
const catalogue = JSON.parse(readFileSync(join(process.cwd(), "messages", "fr.json"), "utf8"));
const espaces = Object.keys(catalogue);
// AUCUN ANTISLASH DANS CE MOTIF, ET C EST DELIBERE.
//
// Ecrit avec une frontiere de mot et un point echappes, il a ete casse DEUX
// FOIS de suite : dans un gabarit, la sequence de frontiere de mot vaut le
// caractere RETOUR ARRIERE. Le motif etait alors muet — il annoncait « aucune
// cle brute » sur une page qui en portait une.
//
// Ni la relecture ni la sortie du terminal ne pouvaient le montrer : un retour
// arriere EFFACE le caractere precedent a l affichage, donc le motif casse
// avait l air correct partout ou on le regardait. C est le contre-test du
// motif, plus bas, qui l a attrape — deux fois.
//
// La frontiere est donc ecrite en classe de caracteres, et le point en `[.]`.
// Moins lisible, impossible a casser en silence.
const motifCle = new RegExp("(?:^|[^A-Za-z0-9_-])(" + espaces.join("|") + ")[.][A-Za-z][A-Za-z0-9_.]*", "g");

const ECRANS_SANS_SESSION = [
  "/fr",
  "/en",
  "/fr/connexion",
  "/en/connexion",
  "/fr/inscription",
  "/en/inscription",
  "/fr/conditions",
  "/fr/confidentialite",
];

console.log("");
console.log("— Cles resolues —");
let ecransInspectes = 0;
for (const chemin of ECRANS_SANS_SESSION) {
  const r = await fetch(`${base}${chemin}`, { redirect: "manual" });

  // Une redirection ici signifie que l ecran n a pas ete rendu. On le DIT :
  // annoncer « aucune cle brute » sur une page qu on n a pas lue serait
  // exactement le defaut que ce controle est cense empecher.
  if (r.status >= 300 && r.status < 400) {
    echecs += 1;
    console.log(`ECHEC ${chemin.padEnd(20)} redirige (${r.status}) : l ecran n a PAS ete inspecte`);
    continue;
  }

  const visible = (await r.text()).replace(/<script[\s\S]*?<\/script>/g, "");
  const brutes = [...new Set(visible.match(motifCle) ?? [])];
  ecransInspectes += 1;
  if (brutes.length > 0) {
    echecs += 1;
    console.log(
      `ECHEC ${chemin.padEnd(20)} cles rendues telles quelles : ` +
        `${brutes.slice(0, 6).join(", ")}${brutes.length > 6 ? ` … (+${brutes.length - 6})` : ""}`,
    );
  } else {
    console.log(`OK    ${chemin.padEnd(20)} aucune cle brute`);
  }
}

// UN ENSEMBLE VIDE PASSE TOUT. Sans ces bornes, une liste videe par erreur ou un
// catalogue illisible rendrait cette section verte et muette.
if (ecransInspectes !== ECRANS_SANS_SESSION.length || espaces.length < 5) {
  echecs += 1;
  console.log("ECHEC la sonde des cles n a pas inspecte ce qu elle pretend inspecter");
}

// CONTRE-TEST DU MOTIF LUI-MEME : il doit reconnaitre une cle brute fabriquee.
// C est ce controle-la qui manquait — le motif etait casse et personne ne le
// voyait, puisqu il ne trouvait jamais rien.
if (!motifCle.test("<h2>landing.exempleDeCleBrute</h2>")) {
  echecs += 1;
  console.log("ECHEC le motif de cle brute ne reconnait meme pas une cle brute");
}
motifCle.lastIndex = 0;

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * AUCUNE ROUTE DE L ESPACE VENDEUR NE REPOND A UN VISITEUR ANONYME
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * LA LISTE CI-DESSUS EST ECRITE A LA MAIN, DONC ELLE SE PERIME. Elle a deja
 * ete completee une fois — trois ecrans y manquaient — et le commentaire qui
 * l accompagne le dit. Le probleme n est pas ces trois-la : c est qu un
 * controle ne doit pas dependre de ce que son auteur a pense a inspecter.
 *
 * Constate le 27/08/2026 : l ajout de `/commandes/[id]/page-client` n aurait
 * ete vu par RIEN. La sonde qui suit ENUMERE le dossier `(app)` et exige que
 * chaque route trouvee reponde la meme chose a un anonyme — la connexion.
 *
 * LES SEGMENTS DYNAMIQUES SONT EPROUVES AVEC DEUX VALEURS, dont une portant un
 * POINT. Le matcher du middleware exclut `[^/]+\.[^/]+$`, et c est exactement
 * par la qu une valeur choisie par le visiteur est sortie du filtre sur
 * `/admin` — le defaut n etait pas dans les noms de dossiers, mais dans les
 * valeurs. Un garde qui n essaie qu une valeur bien elevee regarde la ou le
 * defaut n est pas (L-025).
 */
console.log("");
console.log("— L espace vendeur, sans session —");

function routesDeLEspaceVendeur(dossier, prefixe = "") {
  const trouvees = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (!statSync(chemin).isDirectory()) continue;
    // Un groupe entre parentheses n ajoute rien a l URL.
    const segment = entree.startsWith("(") ? prefixe : prefixe + "/" + entree;
    if (existsSync(join(chemin, "page.tsx"))) trouvees.push(segment);
    trouvees.push(...routesDeLEspaceVendeur(chemin, segment));
  }
  return trouvees;
}

const VALEURS_DYNAMIQUES = [
  "11111111-1111-1111-1111-111111111111",
  // Une valeur qui PORTE UN POINT : le cas par lequel `/admin` est sorti du
  // middleware. Elle n a aucune raison d etre traitee autrement.
  "rapport.png",
];

const ESPACE_VENDEUR = join(process.cwd(), "src", "app", "[locale]", "(app)");
const routesVendeur = routesDeLEspaceVendeur(ESPACE_VENDEUR);

let routesEprouvees = 0;

for (const route of routesVendeur) {
  const dynamique = route.includes("[");
  for (const valeur of dynamique ? VALEURS_DYNAMIQUES : [null]) {
    const chemin = "/fr" + (valeur === null ? route : route.replace(/\[[^\]]+\]/g, valeur));
    const r = await suivre(chemin);
    routesEprouvees += 1;

    const ok = r.statut === 200 && r.final === "/fr/connexion?erreur=session";
    if (!ok) echecs += 1;
    console.log(
      `${ok ? "OK   " : "ECHEC"} ${chemin.padEnd(56)} ` +
        (ok ? "renvoye vers la connexion" : `attendu la connexion, obtenu ${r.statut} sur ${r.final}`),
    );
  }
}

// UN ENSEMBLE VIDE PASSE TOUT. Sans cette borne, un chemin de dossier errone
// rendrait cette section verte et muette — et c est precisement le mode de
// defaillance qu elle existe pour empecher.
if (routesVendeur.length < 5 || routesEprouvees < routesVendeur.length) {
  echecs += 1;
  console.log(
    `ECHEC la sonde n a inventorie que ${routesVendeur.length} routes : elle n inspecte pas ce qu elle pretend`,
  );
}

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * LA PROCEDURE DE SIGNALEMENT NE SE PROMET QUE SI ELLE EXISTE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * DEFAUT TROUVE EN PILOTANT LE PRODUIT LE 27/08/2026. La landing porte SON
 * PROPRE pied de page — celui du canevas — et la garde de `PiedDePage` n y
 * avait pas ete recopiee : le lien « Signaler un contenu » etait ecrit SANS
 * CONDITION vers une page qui rend 404 tant qu aucune adresse n est
 * configuree. Sur la seule page que tout le monde voit, le recours qui fonde
 * notre statut d hebergeur tombait dans le vide au premier clic.
 *
 * ON INTERROGE L EFFET, PAS LA CONFIGURATION (L-020). Le produit repond
 * lui-meme : `/fr/signalement` rend 200 quand le canal existe, 404 sinon. Lire
 * `NEXT_PUBLIC_CONTACT_ABUS` ici reproduirait la regle au lieu de l eprouver,
 * et la copie pourrait deriver sans que rien ne le dise.
 *
 * LE CONTROLE ECHOUE DANS LES DEUX SENS, parce que les deux etats sont des
 * defauts :
 *   - page absente ET lien present  → on promet un recours qui n aboutit pas ;
 *   - page presente ET aucun lien   → le recours existe et personne ne peut
 *                                     l atteindre, ce qui revient au meme pour
 *                                     celui qui cherche a signaler.
 *
 * ET IL PROUVE D ABORD QU IL INSPECTE QUELQUE CHOSE : sans la presence
 * constatee du lien « conditions » sur chaque page, une page rendue sans pied
 * de page — ou pas rendue du tout — passerait ce controle en ne prouvant rien.
 */
console.log("");
console.log("— Le recours de signalement —");

const PAGES_A_PIED = ["/fr", "/en", "/fr/conditions", "/fr/confidentialite"];

const signalementServi = (await fetch(`${base}/fr/signalement`, { redirect: "manual" })).status;
const canalOuvert = signalementServi === 200;
console.log(
  `      /fr/signalement rend ${signalementServi} — canal ${canalOuvert ? "OUVERT" : "FERME"}`,
);

let piedsInspectes = 0;
let pagesQuiPromettent = 0;

for (const chemin of PAGES_A_PIED) {
  const r = await fetch(`${base}${chemin}`, { redirect: "manual" });
  if (r.status !== 200) {
    echecs += 1;
    console.log(`ECHEC ${chemin.padEnd(22)} rend ${r.status} : le pied n a PAS ete inspecte`);
    continue;
  }

  const html = await r.text();
  const langue = chemin.startsWith("/en") ? "en" : "fr";

  // La preuve que la sonde regarde un vrai pied de page. Sans elle, « aucun
  // lien de signalement » serait vrai sur une page qui n en a aucun.
  if (!html.includes(`/${langue}/conditions`)) {
    echecs += 1;
    console.log(`ECHEC ${chemin.padEnd(22)} aucun pied de page trouve : la sonde n inspecte rien`);
    continue;
  }
  piedsInspectes += 1;

  const promet = html.includes(`/${langue}/signalement`);
  if (promet) pagesQuiPromettent += 1;

  if (!canalOuvert && promet) {
    echecs += 1;
    console.log(`ECHEC ${chemin.padEnd(22)} promet un signalement vers une page qui rend 404`);
  } else {
    console.log(`OK    ${chemin.padEnd(22)} pied inspecte, lien ${promet ? "present" : "absent"}`);
  }
}

if (piedsInspectes !== PAGES_A_PIED.length) {
  echecs += 1;
  console.log("ECHEC la sonde du recours n a pas inspecte tous les pieds de page annonces");
}

// L AUTRE SENS : un canal ouvert que personne ne peut atteindre.
if (canalOuvert && pagesQuiPromettent === 0) {
  echecs += 1;
  console.log("ECHEC le canal de signalement existe mais AUCUNE page ne le propose");
}

console.log("");

// Controle par VALEUR de ce qui est REELLEMENT rendu. Verifier qu une cle de
// traduction existe dans le catalogue ne prouve pas qu elle est resolue a
// l ecran : une cle manquante sort telle quelle dans le HTML.
// Le titre attendu est LU DANS LE CATALOGUE, pas fige ici.
//
// Une phrase en dur dans la sonde casse a chaque changement de copy, sans que
// rien ne soit casse dans le produit — et un controle qui echoue pour de
// mauvaises raisons finit par etre supprime. En lisant le catalogue, la sonde
// verifie ce qu elle doit verifier : que la cle est RESOLUE dans le HTML servi,
// pas qu une phrase precise a ete choisie.
//
// Elle refuse une valeur trop courte : lire une chaine vide rendrait le
// controle vrai sans rien prouver, `includes("")` etant toujours vrai.
const titreFr = JSON.parse(readFileSync(join(process.cwd(), "messages", "fr.json"), "utf8"))
  .landing.heroTitre;
const titreEn = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"))
  .landing.heroTitre;

const controles = [
  [typeof titreFr === "string" && titreFr.length > 10, "titre francais lisible au catalogue"],
  [typeof titreEn === "string" && titreEn.length > 10, "titre anglais lisible au catalogue"],
  [fr.includes(titreFr), "titre francais rendu"],
  [en.includes(titreEn), "titre anglais rendu"],
  [!fr.includes("landing."), "aucune cle brute rendue en francais"],
  [!en.includes("landing."), "aucune cle brute rendue en anglais"],
  [fr.includes('lang="fr"'), "attribut lang correct en francais"],
  [en.includes('lang="en"'), "attribut lang correct en anglais"],
  // Copy de fret et faux logos clients supprimes de la maquette Stitch : le
  // controle porte sur le HTML servi, pas sur le fichier source, parce que
  // c est le HTML que le visiteur recoit.
  [!fr.includes("Trusted by industry leaders"), "faux logos clients absents"],
  [!/Logistique Invisible|Genealogie|Dedouanement/i.test(fr), "copy de fret absente"],
  [!/\bERP\b|\bSAP\b|\bOracle\b/.test(fr), "vocabulaire ERP absent"],
  [!/\brep\b|replica|\bW2C\b/i.test(fr), "vocabulaire du vertical absent"],
  // LE FLOU DE FOND N EST PAS INTERDIT ICI. Le brief le proscrit sur
  // `/p/[token]`, et nulle part ailleurs : c est cette page-la qui est vue une
  // fois, en 4G, sur un appareil quelconque, et sur un aplat uni le flou n a
  // rien a flouter. La landing et l espace vendeur gardent le rendu des
  // maquettes. Une premiere version de ce controle appliquait la regle partout
  // et faisait echouer une landing pourtant conforme.
];

// L inscription ne doit reprendre AUCUN des codes de la maquette Stitch : ni
// SSO, ni certification qu on ne possede pas. Le controle porte sur le HTML
// SERVI, pas sur le fichier source, parce que c est le HTML que le visiteur
// recoit.
//
// ⚠️ LE CONTROLE « AUCUN CHAMP MOT DE PASSE » A ETE RETOURNE LE 01/09/2026.
// Il exigeait l ABSENCE du champ, parce que le produit n avait que le lien
// magique et que la maquette Stitch en montrait un. Wassim a tranche l inverse.
// Il n est pas supprime : il exige desormais sa PRESENCE, sur les DEUX ecrans.
// Une page d inscription qui perdrait son champ creerait des comptes sans mot
// de passe choisi, donc inaccessibles autrement que par une reinitialisation —
// et rien ne leverait.
const inscription = await (await fetch(`${base}/fr/inscription`)).text();
const connexion = await (await fetch(`${base}/fr/connexion`)).text();
controles.push(
  [/type="password"/.test(inscription), "l inscription porte un champ mot de passe"],
  [/type="password"/.test(connexion), "la connexion porte un champ mot de passe"],
  // `autocomplete` N EST PAS UN DETAIL D ERGONOMIE. `new-password` fait
  // PROPOSER un mot de passe au gestionnaire ; `current-password` fait remplir
  // celui qui est enregistre. Les intervertir fait suggerer un mot de passe neuf
  // sur un ecran de connexion — donc pousse a ecraser un compte qui marche.
  [/autocomplete="new-password"/i.test(inscription), "l inscription demande un mot de passe NEUF"],
  [/autocomplete="current-password"/i.test(connexion), "la connexion demande le mot de passe ENREGISTRE"],
  [connexion.includes("/fr/mot-de-passe-oublie"), "la connexion mene au mot de passe oublie"],
  // CONTRE-TEST : le lien magique a bien disparu du produit SERVI, pas seulement
  // du code. Sans lui, un reste de l ancien formulaire passerait inapercu.
  [!/Recevoir mon lien|Send me the link/.test(connexion), "plus aucun envoi de lien de connexion"],
  // FRONTIERES DE MOT OBLIGATOIRES, et pas de `/i` sur les acronymes. Le motif
  // precedent, `/SSO|SOC2|Enterprise/i`, matchait « crossOrigin » et
  // « associer » : deux faux positifs sur une page parfaitement
  // correcte. Un controle qui crie au loup finit par etre ignore, et c est
  // alors qu il laisse passer le vrai cas.
  [!/\bSSO\b/.test(inscription), "aucune mention de SSO"],
  [!/\bSOC ?2\b/i.test(inscription), "aucune certification SOC2 revendiquee"],
  [!/\bEnterprise\b/.test(inscription), "aucun vocabulaire d'entreprise"],
  [!/\bCorporate\b/i.test(inscription), "aucun « Corporate Email »"],
  [!/99[.,]9\s*%/.test(inscription), "aucune promesse d'uptime invérifiable"],
  [inscription.includes('name="email"'), "le champ email est bien present"],
  [inscription.length > 5000, "la page d'inscription n'est pas vide"],
);

// CHAQUE PAGE NE TRANSPORTE QUE SES PROPRES LIBELLES.
//
// `NextIntlClientProvider` sans prop `messages` expedie le catalogue ENTIER sur
// chaque page. Mesure sur les pages servies : la landing pesait 31,1 Ko et
// portait les libelles du legal et de l onboarding. Providers descendus au
// niveau de chaque page, elle est a 20,1 Ko.
//
// Le defaut ne casse RIEN et CROIT : chaque ecran client ajoute alourdirait
// toutes les pages, dont la landing, ouverte en 4G depuis un message prive.
// Un controle sur le HTML SERVI est le seul qui le voie — le code source, lui,
// aura toujours l air correct.
const conditions = await (await fetch(`${base}/fr/conditions`)).text();

controles.push(
  [!fr.includes("Je fournis des revendeurs"), "la landing ne porte pas l'onboarding"],
  [!fr.includes("Recevoir mon lien"), "la landing ne porte pas la connexion"],
  [!conditions.includes("Je fournis des revendeurs"), "les conditions ne portent pas l'onboarding"],
  [!conditions.includes("Recevoir mon lien"), "les conditions ne portent pas la connexion"],
  // Contre-test positif : la page qui A besoin de ses libelles les a bien.
  // Sans lui, un provider casse ferait passer tous les controles ci-dessus.
  [inscription.includes("Créer mon compte"), "l'inscription porte bien ses propres libelles"],
);

// LA PAGE PUBLIQUE N EXISTE PAS ENCORE — et ce controle le VERIFIE.
//
// C est la ou le flou de fond sera reellement interdit. Plutot que d ecrire une
// note que personne ne relira, on affirme l absence de la route : le jour ou
// elle apparait, ce controle vire au rouge et oblige a le remplacer par la
// verification du flou. Une affirmation trop vague pour etre fausse ne peut pas
// non plus etre vraie.
// LA PAGE PUBLIQUE, SUR UNE VRAIE COMMANDE.
//
// Ce controle remplace celui qui se contentait de verifier que la page
// n existait pas encore. Il cree une commande avec la cle de service, demande
// sa page comme le ferait le client, puis efface tout — quoi qu il arrive.
//
// Un controle sur le HTML SERVI est le seul qui voie ces defauts : le code
// source, lui, aura toujours l air correct.
/*
 * LE TRANSPORT RESILIENT, POUR LES APPELS DE CETTE SONDE.
 *
 * ⚠️ POSE LE 01/09/2026 APRES UN ROUGE MAL ATTRIBUE. Une ecriture de mise en
 * place — celle qui franchit l onboarding — a echoue sur un hoquet de
 * transport. Son erreur n etait pas lue, la sonde a continue, et le defaut est
 * ressorti DEUX CENTS LIGNES PLUS LOIN en accusant l editeur : « la session
 * ouvre bien l editeur (307 vers /fr/bienvenue) » et deux titres vides.
 *
 * La suite de tests etait deja protegee ; ce script, lui, fabrique son propre
 * client et ne l etait pas. Le remede vit desormais dans `scripts/transport.mjs`
 * pour que les deux le lisent — une regle ecrite a deux endroits est une regle
 * qu un seul des deux appliquera.
 */
const { installerTransportResilient } = await import("./transport.mjs");
installerTransportResilient();

const { createClient } = await import("@supabase/supabase-js");
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const NOTE_SENTINELLE = "prix-achat-fumee-7d2e9c41";
let jetonFumee = null;
// Capturee pour les controles qui viennent APRES le nettoyage : la commande
// de fumee est supprimee dans le `finally`, donc la page ne repond plus.
let htmlPagePublique = null;
let commandeFumee = null;
let brouillonFumee = null;
let profilFumee = null;

try {
  // ── RAMASSER LES COMPTES DE FUMEE ABANDONNES ──
  //
  // ⚠️ TROU REEL, TROUVE LE 29/08/2026 A LA VERIFICATION D ETAT : un compte
  // `fumee-…@exemple.test` vivait depuis dix-sept heures, avec sa boutique et sa
  // commande. Le `finally` plus bas nettoie tout chemin d ECHEC — mais pas un
  // processus TUE, et c est exactement ce qui arrive quand on interrompt les
  // portes. `pnpm purge:test` ne le ramassait pas non plus : il ne connait que
  // le domaine `@droplink-test.invalid`.
  //
  // Ce que ca coutait : ces comptes fantomes se comptent dans les ecrans
  // d administration. Le panneau annoncait deux comptes actifs pour un seul
  // vrai vendeur — une metrique de verdict faussee par notre propre outillage.
  //
  // LE GARDE-FOU D AGE : on ne supprime que ce qui a plus d une heure. Sans
  // lui, une execution concurrente se supprimerait elle-meme, et le defaut
  // serait pire que celui qu on repare.
  {
    const { data: connus } = await service.auth.admin.listUsers({ perPage: 200 });
    const limite = Date.now() - 60 * 60 * 1000;
    const abandonnes = (connus?.users ?? []).filter(
      (u) =>
        /^fumee-\d+@exemple\.test$/.test(u.email ?? "") &&
        Date.parse(u.created_at) < limite,
    );
    for (const u of abandonnes) {
      await service.auth.admin.deleteUser(u.id);
    }
    if (abandonnes.length > 0) {
      console.log(
        `  ${abandonnes.length} compte(s) de fumee abandonne(s) par une execution interrompue, ramasse(s)`,
      );
    }
  }

  const courriel = `fumee-${Date.now()}@exemple.test`;
  /*
   * LE COMPTE DE SONDE A UN MOT DE PASSE DEPUIS LE 01/09/2026.
   *
   * Il n en avait pas : le produit n en avait pas non plus, et la session etait
   * fabriquee par un lien magique. Le lien magique supprime, continuer a
   * l employer aurait fait valider par la sonde un chemin que le produit n a
   * plus — c est L-032, « il repond » est la propriete que tous les residus
   * possedent.
   *
   * AUCUN RAPPORT AVEC L ADRESSE, deliberement : la politique refuse un mot de
   * passe qui contient la partie locale de l adresse, et une sonde qui se ferait
   * refuser pour cette raison ferait chercher un defaut inexistant.
   */
  const motDePasseFumee = "Chariot-Lilas-Tempete-91";
  const { data: utilisateur, error: erreurCompte } = await service.auth.admin.createUser({
    email: courriel,
    email_confirm: true,
    password: motDePasseFumee,
  });

  /*
   * ⚠️ L ERREUR ETAIT JETEE, ET LES DEUX TIERS DE LA SONDE AVEC ELLE.
   *
   * DEFAUT REEL, ATTRAPE PAR LE PLANCHER DE CONTROLES POSE LE 31/08/2026 : un
   * passage a rendu 143 controles la ou il en faut 183, sans un seul ECHEC. La
   * creation du compte avait echoue, le `if` ci-dessous etait faux, et quarante
   * controles — signature du point de reception, garde CSRF, export CSV, les
   * deux seuils de limitation, la coupure de suspension, la propagation de
   * cache, l arbitrage QC, le contre-test admin — n avaient pas tourne.
   *
   * LE MOTIF EST DIT MAINTENANT. Sans lui, le plancher signale que quelque
   * chose manque sans jamais dire quoi, et on cherche dans le produit un defaut
   * qui est dans l environnement (quota d authentification, base en lecture
   * seule, service indisponible).
   */
  if (erreurCompte !== null) {
    echecs += 1;
    console.log(
      `ECHEC compte de fumee non cree : ${erreurCompte.message}. Les controles qui ` +
        "en dependent — les deux tiers de cette sonde — ne tourneront pas.",
    );
  }

  if (utilisateur?.user) {
    const { data: profil, error: erreurProfil } = await service
      .from("profiles")
      .select("id")
      .eq("user_id", utilisateur.user.id)
      .maybeSingle();
    profilFumee = profil?.id ?? null;

    // MEME RAISON QUE CI-DESSUS : sans le motif, le plancher dit qu il manque
    // des controles sans jamais dire lequel des trois etages a cede.
    if (profilFumee === null) {
      echecs += 1;
      console.log(
        "ECHEC profil de fumee introuvable apres creation du compte" +
          (erreurProfil ? ` : ${erreurProfil.message}` : " (aucune ligne, aucune erreur)"),
      );
    }

    // L ONBOARDING EST OBLIGATOIRE TANT QUE `account_type` EST NUL : sans lui
    // toute page de l espace vendeur redirige vers `/bienvenue`, et une sonde
    // qui y mesure un titre lirait celui de l onboarding en croyant lire celui
    // de l editeur. La colonne est nullable SANS defaut, expres.
    if (profilFumee) {
      /*
       * ⚠️ L ERREUR DE CETTE ECRITURE N ETAIT PAS LUE, ET C EST CE QUI A RENDU
       * SA PANNE ILLISIBLE. Le 01/09/2026 elle a echoue, la sonde a continue, et
       * le defaut est ressorti DEUX CENTS LIGNES PLUS LOIN sous la forme de trois
       * ecarts qui accusaient l editeur : « la session ouvre bien l editeur
       * (307 vers /fr/bienvenue) » et deux titres vides. On cherchait un defaut
       * de titre alors que la mise en place n avait pas abouti.
       *
       * Une mise en place qui echoue doit le DIRE a l endroit ou elle echoue :
       * sinon ce sont les controles suivants qui portent l accusation, et ils
       * la portent contre le mauvais coupable.
       */
      const { error: erreurType } = await service
        .from("profiles")
        .update({ account_type: "reseller", locale: "fr" })
        .eq("id", profilFumee);

      if (erreurType !== null) {
        echecs += 1;
        console.log(
          `ECHEC onboarding de fumee non franchi : ${erreurType.message}. ` +
            "Tant que `account_type` est nul, TOUTE page de l espace vendeur " +
            "redirige vers /fr/bienvenue — les controles qui en dependent " +
            "mesureront l onboarding en croyant mesurer l editeur.",
        );
      }
    }

    const { data: shop, error: erreurShop } = await service
      .from("shops")
      .select("id")
      .eq("owner_id", profilFumee)
      .maybeSingle();

    if (!shop?.id) {
      echecs += 1;
      console.log(
        "ECHEC boutique de fumee introuvable" +
          (erreurShop ? ` : ${erreurShop.message}` : " (aucune ligne, aucune erreur)"),
      );
    }

    if (shop?.id) {
      const { data: commande } = await service
        .from("orders")
        .insert({
          shop_id: shop.id,
          customer_label: "Client de fumee",
          product_ref: "REF-FUMEE",
          internal_notes: NOTE_SENTINELLE,
        })
        .select("id, public_token, unsubscribe_token")
        .single();

      commandeFumee = commande?.id ?? null;
      jetonFumee = commande?.public_token ?? null;

      // La boutique de fumee n a PAS de nom — `shops.name` est nullable et la
      // ligne nait a l inscription. On lui pose un reseau : c est exactement le
      // cas de la planche `PageClientSansEntete`, ou le libelle « Retrouvez … »
      // doit DISPARAITRE au lieu d etre remplace par un texte generique.
      //
      // ⚠️ LA COLONNE S APPELLE `instagram_url`. Le premier jet ecrivait
      // `instagram`, PostgREST refusait, et l erreur n etait pas lue : la sonde
      // se serait declaree verte en n ayant rien rendu. C est le contre-test
      // qui l a signale, ce pour quoi il vient EN PREMIER.
      const { error: erreurReseau } = await service
        .from("shops")
        .update({ instagram_url: "https://instagram.com/fumee" })
        .eq("id", shop.id);
      if (erreurReseau) {
        console.error(`ECHEC impossible de poser le reseau de fumee : ${erreurReseau.message}`);
        echecs += 1;
      }

      // ── UNE SESSION VENDEUR REELLE ──
      //
      // ⚠️ JUSQU AU 29/08/2026 CETTE SONDE NE VOYAIT RIEN DERRIERE UNE SESSION.
      // Elle verifiait que l espace vendeur REFUSE un anonyme — ce qui est la
      // moitie de la question — et jamais ce qu il SERT a celui qui a le droit.
      // Un titre d onglet faux a vecu la, invisible : « Nouvelle commande » sur
      // toutes les commandes, y compris remplies et expediees.
      //
      // La session est ouverte par le VRAI chemin d authentification du produit
      // — email et mot de passe, avec la cle publiable —, pas par un jeton
      // bricole. Le cookie est celui qu attend `@supabase/ssr`.
      //
      // ⚠️ ELLE PASSAIT PAR UN LIEN MAGIQUE JUSQU AU 01/09/2026. Le garder
      // aurait fait valider par la sonde un chemin que le produit n a plus : la
      // session aurait ete parfaitement valide, les controles suivants
      // parfaitement verts, et `signInWithPassword` jamais exerce par personne.
      let cookieVendeur = null;
      {
        const publiable = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false } },
        );
        const { data: verif, error: erreurMdp } = await publiable.auth.signInWithPassword({
          email: courriel,
          password: motDePasseFumee,
        });
        if (erreurMdp !== null) {
          // Le motif est DIT. Sans lui, le plancher de controles signale que
          // quelque chose manque sans jamais dire quoi.
          console.error(`ECHEC ouverture de session par mot de passe : ${erreurMdp.message}`);
          echecs += 1;
        }
        if (verif?.session) {
          const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
          // Reduite au strict necessaire : au-dela d environ 3180 octets
          // `@supabase/ssr` decoupe le cookie en `.0`, `.1`, … et une sonde qui
          // ne decoupe pas enverrait un cookie tronque, donc pas de session —
          // et le controle ci-dessous se croirait rouge pour la mauvaise raison.
          const mince = {
            access_token: verif.session.access_token,
            refresh_token: verif.session.refresh_token,
            token_type: verif.session.token_type,
            expires_in: verif.session.expires_in,
            expires_at: verif.session.expires_at,
            user: {
              id: verif.session.user.id,
              aud: verif.session.user.aud,
              role: verif.session.user.role,
              email: verif.session.user.email,
              app_metadata: {},
              user_metadata: {},
              created_at: verif.session.user.created_at,
            },
          };
          const valeur = "base64-" + Buffer.from(JSON.stringify(mince)).toString("base64");
          cookieVendeur =
            valeur.length <= 3180
              ? `sb-${ref}-auth-token=${valeur}`
              : valeur
                  .match(/.{1,3180}/g)
                  .map((m, i) => `sb-${ref}-auth-token.${i}=${m}`)
                  .join("; ");
        }
      }

      controles.push([
        cookieVendeur !== null,
        "une session vendeur reelle a pu etre fabriquee (sinon rien de ce qui suit ne prouve quoi que ce soit)",
      ]);

      if (cookieVendeur) {
        // Une SECONDE commande, sans nom de client : c est le contre-test. Sans
        // elle, « le titre porte le nom du client » serait indistinguable de
        // « le titre porte n importe quoi qui contient ce nom ».
        const { data: brouillon } = await service
          .from("orders")
          .insert({ shop_id: shop.id })
          .select("id")
          .single();
        brouillonFumee = brouillon?.id ?? null;

        // LE LIBELLE EST LU DANS LE CATALOGUE, jamais recopie ici : recopie, il
        // resterait vrai apres un renommage et la sonde passerait au vert sur
        // une chaine que le produit n emploie plus.
        const catalogue = JSON.parse(readFileSync(join(racine, "messages", "fr.json"), "utf8"));
        const libelleBrouillon = catalogue.editeur.titre;

        const entetes = { cookie: cookieVendeur, ...visiteur(41) };
        const titreDe = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i) ?? [])[1] ?? "";

        const remplie = await fetch(`${base}/fr/commandes/${commandeFumee}`, {
          headers: entetes,
          redirect: "manual",
        });
        const htmlRemplie = remplie.status === 200 ? await remplie.text() : "";
        const titreRemplie = titreDe(htmlRemplie);

        const vide = brouillonFumee
          ? await fetch(`${base}/fr/commandes/${brouillonFumee}`, {
              headers: entetes,
              redirect: "manual",
            })
          : null;
        const htmlVide = vide && vide.status === 200 ? await vide.text() : "";
        const titreVide = titreDe(htmlVide);

        // CONTRE-TEST, EN PREMIER : la session donne-t-elle vraiment acces ?
        // Sans lui, un titre mesure sur la page de connexion passerait pour un
        // titre d editeur.
        controles.push([
          remplie.status === 200 && htmlRemplie.includes("Client de fumee"),
          `la session ouvre bien l editeur (statut ${remplie.status}` +
            `${remplie.status === 200 ? "" : ", vers " + remplie.headers.get("location")})`,
        ]);

        controles.push(
          [
            titreRemplie.includes("Client de fumee"),
            `l onglet d une commande remplie porte son client (titre « ${titreRemplie} »)`,
          ],
          // L AUTRE SENS. Le defaut du 29/08 est exactement celui-ci : un titre
          // de brouillon servi a une commande qui n en est plus un.
          [
            !titreRemplie.includes(libelleBrouillon),
            `l onglet d une commande remplie ne dit pas « ${libelleBrouillon} » (titre « ${titreRemplie} »)`,
          ],
          [
            titreVide.includes(libelleBrouillon),
            `l onglet d une commande SANS client dit bien « ${libelleBrouillon} » (titre « ${titreVide} »)`,
          ],
        );

        /*
         * ═════════════════════════════════════════════════════════════════════
         * UN FILTRE QUI NE RENVOIE RIEN NE DOIT PAS VIDER L ECRAN ENTIER
         * ═════════════════════════════════════════════════════════════════════
         *
         * Defaut montre en capture par Wassim le 02/09/2026 : sur un resultat
         * vide, l ecran retirait la rangee de vues ET les quatre compteurs, et
         * basculait sur un etat vide pleine page — « c est comme si ca ouvrait
         * une deuxieme page ». On perdait le contexte, et surtout la
         * possibilite de cliquer une AUTRE vue sans repasser par « tout
         * effacer ».
         *
         * ⚠️ IL FAUT LES DEUX SENS, ET LE CONTRE-TEST VIENT EN PREMIER. Une
         * sonde qui verifierait seulement la presence des pilules sur la liste
         * vide passerait aussi si elles etaient rendues PARTOUT, y compris la
         * ou la planche `CommandesVide` les interdit — c est-a-dire sur un
         * compte qui n a aucune commande, ou quatre zeros seraient la premiere
         * chose qu un nouveau vendeur verrait du produit.
         *
         * Les libelles sont LUS DANS LE CATALOGUE : recopies ici, ils
         * resteraient vrais apres un renommage et la sonde passerait au vert
         * sur des chaines que le produit n emploie plus.
         */
        const vues = catalogue.commandes.vues;
        const compteursListe = catalogue.commandes.compteurs;
        const pilules = [vues.toutes, vues.enTransit, vues.jamaisOuvertes];
        const cartes = [compteursListe.preparation, compteursListe.enTransit, compteursListe.livrees];

        const pleine = await fetch(`${base}/fr/commandes`, { headers: entetes, redirect: "manual" });
        const htmlPleine = pleine.status === 200 ? await pleine.text() : "";

        const filtree = await fetch(
          `${base}/fr/commandes?q=zzz-aucune-commande-ne-porte-ceci-zzz`,
          { headers: entetes, redirect: "manual" },
        );
        const htmlFiltree = filtree.status === 200 ? await filtree.text() : "";

        const tous = (html, liste) => liste.every((v) => html.includes(v));
        const aucun = (html, liste) => liste.every((v) => !html.includes(v));

        controles.push(
          // CONTRE-TEST, EN PREMIER : la liste pleine porte bien les deux.
          [
            pleine.status === 200 && tous(htmlPleine, pilules) && tous(htmlPleine, cartes),
            `la liste pleine porte ses ${pilules.length} vues et ses ${cartes.length} compteurs`,
          ],
          // ET LE RESULTAT VIDE EN EST BIEN UN — sans ca, les deux controles
          // ci-dessous mesureraient deux fois la meme page.
          [
            filtree.status === 200 && !htmlFiltree.includes("<tbody"),
            `le filtre introuvable ne rend aucune ligne (statut ${filtree.status})`,
          ],
          [
            tous(htmlFiltree, pilules),
            `un resultat VIDE garde ses ${pilules.length} vues cliquables`,
          ],
          [
            tous(htmlFiltree, cartes),
            `un resultat VIDE garde ses ${cartes.length} compteurs`,
          ],
          // L AUTRE SENS : ce qui n a rien a outiller reste cache.
          [
            aucun(htmlFiltree, [catalogue.commandes.lot.exporter]),
            "un resultat VIDE n offre pas d export — il n y a rien a exporter",
          ],
        );
      }

      /*
       * ═══════════════════════════════════════════════════════════════════════
       * L ADMIN N ETAIT EPROUVE QUE QUAND IL REFUSE
       * ═══════════════════════════════════════════════════════════════════════
       *
       * Cette sonde etablit depuis longtemps que `/fr/admin` rend 404 sans
       * session, et que son corps ne divulgue rien. C est la moitie de la
       * propriete. L autre moitie — QU UN ADMINISTRATEUR OBTIENNE SA PAGE —
       * n etait verifiee par aucune porte.
       *
       * UNE SUITE OU TOUT EST REFUSE PASSE A 100 % SANS RIEN PROUVER. Un
       * middleware qui rendrait 404 a tout le monde, une garde qui leverait
       * toujours, une page qui aurait cesse de compiler : les trois passaient
       * les controles existants sans les faire broncher.
       *
       * ⚠️ LE MEME COOKIE SERT AUX DEUX CONTROLES, ET C EST LE COEUR DU TEST.
       * On promeut le compte en base, on demande la page, on le retrograde, on
       * redemande la MEME page avec la MEME session. Si le 404 revenait de la
       * session plutot que du ROLE LU EN BASE A CHAQUE REQUETE, le second appel
       * repondrait encore 200 — et c est exactement ce qu on veut interdire.
       */
      if (cookieVendeur && profilFumee) {
        const entetesAdmin = { cookie: cookieVendeur, ...visiteur(42) };
        const catalogueAdmin = JSON.parse(
          readFileSync(join(racine, "messages", "fr.json"), "utf8"),
        );
        // Un libelle LU DANS LE CATALOGUE, jamais recopie : une chaine en dur
        // resterait vraie apres un renommage, et la sonde passerait au vert sur
        // un texte que le produit n emploie plus.
        const titreAdmin = catalogueAdmin.admin.panneau.titre;

        await service.from("profiles").update({ role: "admin" }).eq("id", profilFumee);
        const promu = await fetch(`${base}/fr/admin`, {
          headers: entetesAdmin,
          redirect: "manual",
        });
        const htmlPromu = promu.status === 200 ? await promu.text() : "";

        const journalPromu = await fetch(`${base}/fr/admin/journal`, {
          headers: entetesAdmin,
          redirect: "manual",
        });

        await service.from("profiles").update({ role: "user" }).eq("id", profilFumee);
        const retrograde = await fetch(`${base}/fr/admin`, {
          headers: entetesAdmin,
          redirect: "manual",
        });
        const corpsRetrograde = await retrograde.text();

        // Une route admin qui N EXISTE PAS, demandee avec le MEME cookie : c est
        // l etalon auquel le refus doit ressembler. Sans elle, on ne pourrait
        // que constater que le corps est court, jamais qu il est INDISCERNABLE.
        const inventee = await fetch(`${base}/fr/admin/cet-ecran-n-existe-pas`, {
          headers: entetesAdmin,
          redirect: "manual",
        });
        const corpsInvente = await inventee.text();

        controles.push(
          [
            promu.status === 200,
            `CONTRE-TEST : un administrateur OBTIENT le panneau (statut ${promu.status}` +
              `${promu.status === 200 ? "" : ", vers " + promu.headers.get("location")})`,
          ],
          [
            htmlPromu.includes(titreAdmin),
            `et la page rendue porte bien son titre « ${titreAdmin} »`,
          ],
          // UNE PAGE QUI REPOND N EST PAS UNE PAGE QUI RENDT. Sans ce seuil,
          // une coquille vide de deux cents octets passerait les deux controles
          // ci-dessus — « il repond » est la propriete que tous les residus
          // possedent.
          [
            htmlPromu.length > 4000,
            `le panneau rendu fait ${htmlPromu.length} octets, pas une coquille`,
          ],
          [
            journalPromu.status === 200,
            `le journal d audit repond aussi a un administrateur (statut ${journalPromu.status})`,
          ],
          // L AUTRE SENS, AVEC LA MEME SESSION. C est ici que se prouve que le
          // role est relu EN BASE a chaque requete, et non porte par le jeton.
          [
            retrograde.status === 404,
            `retrograde, LE MEME COOKIE ne rouvre plus le panneau (statut ${retrograde.status})`,
          ],
          [
            !corpsRetrograde.includes(titreAdmin),
            "et le corps du refus ne laisse pas fuir le titre de la surface",
          ],
          /*
           * ⚠️ LE TITRE N EST PAS LA SEULE CHOSE QUI PEUT FUIR — ET LE
           * SQUELETTE N EN PORTE AUCUN.
           *
           * `admin/loading.tsx` est le repli Suspense du segment. Next peut le
           * diffuser PENDANT que le layout resout son `await exigerAdmin()`,
           * donc AVANT de savoir si l appelant a le droit. Un tel debut de
           * reponse ne contient aucun texte — il est `aria-hidden`, ses blocs
           * sont vides — donc le controle du titre ci-dessus resterait vert
           * pendant qu un vendeur ordinaire apprendrait que la surface existe.
           * C est le champ de vision de la correction, pas celui du probleme.
           *
           * On controle donc la MARQUE de la surface elle-meme, `bg-admin`,
           * que portent le chrome sombre du layout ET le squelette. Le
           * contre-test qui precede est obligatoire : sans lui, un renommage
           * de la classe rendrait ce controle vert a vide.
           */
          [
            htmlPromu.includes("bg-admin"),
            "CONTRE-TEST : la surface admin porte bien la marque `bg-admin` quand elle est SERVIE",
          ],
          [
            !corpsRetrograde.includes("bg-admin"),
            `ni le squelette : le corps du refus (${corpsRetrograde.length} octets) ne porte aucune marque de la surface`,
          ],
          /*
           * ⚠️ ET LA TROISIEME CHOSE QUI FUYAIT : LE NOM DU FICHIER DE CODE.
           *
           * Defaut mesure le 02/09/2026, avec le cookie d un vendeur ORDINAIRE.
           * Le refus venait alors d `exigerAdmin()`, donc APRES que Next a
           * compose la page — et sa charge d hydratation nomme le chunk de
           * l ecran demande :
           *
           *   /fr/admin               404  7 956 o  …/admin/page-bd9a7fb78….js
           *   /fr/admin/comptes       404  8 429 o  …/admin/comptes/page-….js
           *   /fr/admin/facturation   404  5 547 o  aucun
           *   /fr/nexistepas-du-tout  404  5 547 o  aucun
           *
           * La regle « 404 jamais 403 » etait donc tenue sur le STATUT et
           * rompue sur le CORPS : un vendeur ordinaire distinguait une route
           * admin REELLE d une route inventee, et reconstituait les six ecrans
           * plus le segment `[id]`.
           *
           * LES DEUX CONTROLES PRECEDENTS RESTAIENT VERTS : ce corps ne portait
           * ni le titre, ni `bg-admin`. C est L-025 — le garde regardait la ou
           * le defaut n etait plus.
           */
          [
            !/static\/chunks\/app\/[^"\\]*admin/.test(corpsRetrograde),
            "ni le nom du fichier de code de l ecran demande",
          ],
          /*
           * ET LE REFUS DOIT ETRE INDISCERNABLE D UNE ROUTE QUI N EXISTE PAS.
           * La TAILLE est un canal a elle seule : 7 956 octets pour un ecran
           * reel contre 5 547 pour une route inventee se lisait a l oeil.
           */
          [
            corpsRetrograde.length === corpsInvente.length,
            `le refus (${corpsRetrograde.length} o) pese comme une route admin inventee (${corpsInvente.length} o)`,
          ],
        );
      }

      /*
       * ══════════════════════════════════════════════════════════════════════
       * LA DECONNEXION — ET ELLE PASSE EN DERNIER, DELIBEREMENT
       * ══════════════════════════════════════════════════════════════════════
       *
       * La portee du `signOut` est GLOBALE : toutes les sessions du compte
       * tombent. Tout controle place apres celui-ci travaillerait donc avec un
       * cookie mort et echouerait pour une raison qui n a rien a voir avec lui.
       *
       * CE QUE CETTE SONDE PROUVE, ET QUE RIEN D AUTRE NE PEUT PROUVER : une
       * deconnexion qui VIDE L ECRAN sans invalider la session passerait pour
       * bonne partout ailleurs. Le pilotage au navigateur montrerait un ecran de
       * connexion, la base ne dirait rien, aucun test ne rougirait — et le
       * cookie continuerait d ouvrir l editeur, l export CSV et les notes
       * internes, qui portent le prix d achat.
       *
       * ⚠️ LE CONTRE-TEST VIENT EN PREMIER. Sans lui, « le cookie ne rouvre plus
       * /fr/commandes » serait indistinguable de « ce cookie n a jamais rien
       * ouvert » — et une sonde ou tout est refuse passe a 100 % sans rien
       * prouver.
       */
      if (cookieVendeur) {
        const entetesSortie = { cookie: cookieVendeur, ...visiteur(43) };
        const origineNotre = new URL(base).origin;

        const avant = await fetch(`${base}/fr/commandes`, {
          headers: entetesSortie,
          redirect: "manual",
        });

        /*
         * ⚠️ LA CHARGE RSC, ET PAS SEULEMENT LE DOCUMENT.
         *
         * DEFAUT REEL, TROUVE LE 02/09/2026 : trois pages vendeur s en
         * remettaient a la redirection du LAYOUT. Elle tombe apres que Next a
         * engage la reponse — le `location:` part, et la charge de la page part
         * avec. Un navigateur suit le 307 et jette le corps ; un script, non.
         *
         * Le controle sur le STATUT ne voyait donc rien : il lisait 307, ce qui
         * ressemble a un refus. Ce qui compte est le CORPS, et il portait les
         * notes internes — le prix d achat — et le `public_token`, qui transfere
         * une CAPACITE a vie.
         *
         * On demande donc la charge RSC de l editeur, avant et apres, et on y
         * cherche les sentinelles PAR VALEUR.
         */
        const rscEditeur = (entetes) =>
          fetch(`${base}/fr/commandes/${commandeFumee}`, {
            headers: { ...entetes, RSC: "1" },
            redirect: "manual",
          });

        const chargeAvant = await (await rscEditeur(entetesSortie)).text();

        /*
         * UNE SESSION ORDINAIRE N OUVRE PAS L ECRAN DE NOUVEAU MOT DE PASSE.
         *
         * DEFAUT REEL, TROUVE LE 02/09/2026 : cet ecran n exigeait qu UNE
         * session, pas une session de RECUPERATION. Avec le cookie de quelqu un
         * simplement connecte par mot de passe — donc avec un cookie VOLE —, il
         * rendait le formulaire, et l action changeait le mot de passe SANS
         * connaitre l ancien. Puis le `signOut({scope:"others"})` qui suit
         * ejectait le vrai proprietaire : un acces temporaire devenait une prise
         * de compte definitive.
         *
         * Ce cookie-ci vient d un `signInWithPassword` : c est exactement la
         * session qui doit etre refusee.
         */
        const ecranMotDePasse = await fetch(`${base}/fr/nouveau-mot-de-passe`, {
          headers: entetesSortie,
          redirect: "manual",
        });

        // GARDE CSRF : un POST sans `Origin` est refuse. Elle echoue FERMEE —
        // « ce serait ouvert si quelqu un omettait l en-tete » n est pas une
        // protection.
        const sansOrigine = await fetch(`${base}/fr/deconnexion`, {
          method: "POST",
          headers: entetesSortie,
          redirect: "manual",
        });

        // ORIGINE ETRANGERE : le cas reel du formulaire poste depuis un tiers.
        const origineTierce = await fetch(`${base}/fr/deconnexion`, {
          method: "POST",
          headers: { ...entetesSortie, origin: "https://exemple.test" },
          redirect: "manual",
        });

        // AUCUNE METHODE `GET` : une deconnexion atteignable par une simple
        // navigation se declencherait sur un prechargement de lien ou un
        // `<img src>` pose dans une page tierce.
        const enGet = await fetch(`${base}/fr/deconnexion`, {
          headers: entetesSortie,
          redirect: "manual",
        });

        const sortie = await fetch(`${base}/fr/deconnexion`, {
          method: "POST",
          headers: { ...entetesSortie, origin: origineNotre },
          redirect: "manual",
        });

        const apres = await fetch(`${base}/fr/commandes`, {
          headers: entetesSortie,
          redirect: "manual",
        });
        const chargeApres = await (await rscEditeur(entetesSortie)).text();

        controles.push(
          [
            avant.status === 200,
            `CONTRE-TEST : AVANT la deconnexion, ce cookie ouvre /fr/commandes (statut ${avant.status})`,
          ],
          [
            sansOrigine.status === 403,
            `la deconnexion refuse un POST sans Origin (statut ${sansOrigine.status}, attendu 403)`,
          ],
          [
            origineTierce.status === 403,
            `et un POST venu d une autre origine (statut ${origineTierce.status}, attendu 403)`,
          ],
          [
            enGet.status === 405,
            `aucune deconnexion par simple navigation (GET rend ${enGet.status}, attendu 405)`,
          ],
          [
            sortie.status === 303,
            `la deconnexion rend un 303, jamais un 307 (statut ${sortie.status})`,
          ],
          [
            (sortie.headers.get("location") ?? "").includes("/fr/connexion?info=deconnecte"),
            `et renvoie a la connexion en l ANNONCANT (vers ${sortie.headers.get("location")})`,
          ],
          // LE COOKIE EST BIEN EFFACE DANS LA REPONSE. Necessaire, pas
          // suffisant : c est le controle suivant qui fait autorite.
          [
            /sb-[^=]*auth-token[^;]*=;|Max-Age=0/i.test(sortie.headers.get("set-cookie") ?? ""),
            "la reponse efface le cookie de session",
          ],
          /*
           * LE CONTROLE QUI FAIT AUTORITE. Le MEME cookie, rejoue apres coup.
           *
           * Effacer un cookie ne protege que le navigateur qui l a recu ; ce qui
           * protege le compte est la REVOCATION cote serveur. Un attaquant qui
           * aurait copie le cookie ne le rendra pas parce qu on le lui demande.
           */
          [
            apres.status !== 200,
            `LE MEME COOKIE ne rouvre plus /fr/commandes apres deconnexion (statut ${apres.status})`,
          ],
          // CONTRE-TEST D ABORD : sans lui, « la sentinelle est absente » serait
          // indistinguable de « cette requete n a jamais rien rendu ».
          [
            chargeAvant.includes(NOTE_SENTINELLE),
            `CONTRE-TEST : AVANT, la charge RSC de l editeur porte bien la note interne (${chargeAvant.length} o)`,
          ],
          [
            !chargeApres.includes(NOTE_SENTINELLE),
            `et APRES, la charge RSC (${chargeApres.length} o) ne porte plus la NOTE INTERNE`,
          ],
          [
            jetonFumee === null || !chargeApres.includes(jetonFumee),
            "ni le jeton public, qui transfere une capacite a vie",
          ],
          [
            ecranMotDePasse.status !== 200,
            `une session ORDINAIRE n ouvre pas l ecran de nouveau mot de passe (statut ${ecranMotDePasse.status}, il faut un lien recu par email)`,
          ],
        );
      }


      {
    // L EXPORT CSV — ROUTE `/api`, DONC HORS DU MIDDLEWARE.
    //
    // Elle n est protegee par RIEN d autre que sa propre garde, et son
    // emplacement donnerait l impression contraire a qui la relit. Le controle
    // porte sur ce qui SORT : un export produit un fichier qui quitte
    // l application, sera ouvert ailleurs, transmis, garde. Une fuite ici ne se
    // rattrape pas.
    const sansSession = await fetch(`${base}/api/commandes/export`, { redirect: "manual" });
    const corpsExport = await sansSession.text();

    controles.push(
      [
        sansSession.status === 404,
        `l export refuse sans session (statut ${sansSession.status}, attendu 404)`,
      ],
      // 404 et non 401 : un 401 confirmerait que la route existe et ce qu elle
      // fait. Un seul chemin de sortie.
      [
        !corpsExport.includes("client,reference") && !corpsExport.includes("lien_public"),
        "aucune ligne de CSV ne fuit dans la reponse refusee",
      ],
      [
        (sansSession.headers.get("content-disposition") ?? "") === "",
        "aucun telechargement n est propose a qui n a pas de session",
      ],
    );

    const enPost = await fetch(`${base}/api/commandes/export`, { method: "POST" });
    controles.push([
      enPost.status === 405,
      `l export refuse explicitement les autres methodes (statut ${enPost.status})`,
    ]);
  }

  {
    // LES GESTES DE LA LISTE — POST NATIF, DONC CSRF A NOTRE CHARGE.
    //
    // ⚠️ EN QUITTANT LES SERVER ACTIONS, ON A PERDU LA PROTECTION QUE NEXT
    // APPLIQUE TOUT SEUL : il compare `Origin` a l hote avant d executer une
    // action. Sans elle, un formulaire pose sur un site tiers archiverait les
    // commandes d un vendeur connecte sans qu il clique sur quoi que ce soit.
    // La route refait donc cette comparaison, et ces controles etablissent
    // qu elle mord VRAIMENT — pas qu elle est ecrite.
    const chemin = `${base}/fr/commandes/geste`;

    const sansOrigine = await fetch(chemin, { method: "POST", redirect: "manual" });
    const origineEtrangere = await fetch(chemin, {
      method: "POST",
      redirect: "manual",
      headers: { origin: "https://collecteur.exemple.test" },
    });

    /*
     * L ORIGINE ETRANGERE QUI SE DECLARE ELLE-MEME COMME NOTRE HOTE.
     *
     * ⚠️ DEFAUT REEL, CORRIGE LE 01/09/2026. `memeOrigine` lisait
     * `x-forwarded-host` AVANT `host`, sans condition, avec pour raison
     * « derriere un proxy, `host` porte le nom interne ». Rien ne distinguait
     * alors un en-tete pose par notre bord d un en-tete pose par l appelant :
     * envoyer les DEUX faisait comparer la garde a elle-meme, et elle passait.
     *
     * Le controle precedent ne pouvait pas le voir — il n envoie qu un `Origin`
     * etranger, donc il regarde exactement la ou le defaut n etait pas.
     */
    const origineAutoProclamee = await fetch(chemin, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: "https://collecteur.exemple.test",
        "x-forwarded-host": "collecteur.exemple.test",
      },
    });

    controles.push(
      // ELLE ECHOUE FERMEE. Tout navigateur envoie `Origin` sur un POST ; ne pas
      // l exiger laisserait la porte ouverte a qui sait simplement l omettre.
      [
        sansOrigine.status === 403,
        `le geste de liste refuse un POST SANS origine (statut ${sansOrigine.status}, attendu 403)`,
      ],
      [
        origineEtrangere.status === 403,
        `le geste de liste refuse une origine etrangere (statut ${origineEtrangere.status}, attendu 403)`,
      ],
      [
        origineAutoProclamee.status === 403,
        `il la refuse AUSSI quand elle se declare elle-meme comme notre hote via ` +
          `x-forwarded-host (statut ${origineAutoProclamee.status}, attendu 403)`,
      ],
      [
        (await sansOrigine.text()) === "",
        "le refus CSRF ne rend aucun corps — un refus n a rien a apprendre a qui l a provoque",
      ],
    );

    // ⚠️ CONTRE-TEST POSITIF, ET IL EST INDISPENSABLE. Une route qui repondrait
    // 403 a TOUT passerait les deux controles ci-dessus sans rien prouver. Avec
    // la BONNE origine, la requete doit franchir la garde CSRF et se faire
    // refuser plus loin, par la garde de SESSION — donc rendre une redirection
    // vers la connexion, et non un 403.
    const corps = new URLSearchParams({ geste: "archiver", retour: "/fr/commandes" });
    const bonneOrigine = await fetch(chemin, {
      method: "POST",
      redirect: "manual",
      headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
      body: corps,
    });
    const ou = bonneOrigine.headers.get("location") ?? "";

    // ⚠️ UN CORPS ABSENT NE DOIT PAS PRODUIRE UN 500. `formData()` leve sur un
    // corps mal forme, et l exception remontait telle quelle : un point d entree
    // qui plante sur une requete fabriquee ecrit une trace d erreur a chaque
    // tentative, donc noie son journal a la demande.
    const sansCorps = await fetch(chemin, {
      method: "POST",
      redirect: "manual",
      headers: { origin: base },
    });
    controles.push([
      sansCorps.status === 400,
      `un POST sans corps est refuse proprement (statut ${sansCorps.status}, attendu 400)`,
    ]);

    controles.push(
      [
        bonneOrigine.status !== 403,
        `CONTRE-TEST : avec la bonne origine, la garde CSRF laisse passer (statut ${bonneOrigine.status})`,
      ],
      [
        bonneOrigine.status === 303,
        `sans session, le geste renvoie a la connexion en 303 (statut ${bonneOrigine.status})`,
      ],
      // 303 ET NON 307 : un 307 conserve la METHODE. Le navigateur reposterait
      // le formulaire sur la destination, et chaque rafraichissement rejouerait
      // l archivage. C est le motif POST-redirect-GET, et il tient a ce nombre.
      [
        ou.includes("/connexion") && ou.includes("erreur=session"),
        `la destination du refus est la connexion (« ${ou} »)`,
      ],
    );

    const enGet = await fetch(chemin, { redirect: "manual" });
    controles.push([
      enGet.status === 405,
      `le geste de liste n existe qu en POST (GET : statut ${enGet.status}, attendu 405)`,
    ]);
  }

  if (jetonFumee) {
        const reponse = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(11) });
        const html = await reponse.text();
        htmlPagePublique = html;

        controles.push(
          [reponse.status === 200, "la page publique repond sur un jeton valide"],
          [html.includes("Client de fumee"), "elle porte bien le contenu de la commande"],

          // CONTRE-TEST D ABORD : sans reseau rendu, « aucun texte de
          // remplacement » serait vrai en n ayant rien regarde.
          [
            html.includes("instagram.com/fumee"),
            "CONTRE-TEST : le bloc des reseaux du vendeur est bien rendu",
          ],
          // ⚠️ LA BOUTIQUE N A PAS DE NOM, et la page affichait « Retrouvez le
          // vendeur ». La planche l interdit nommement, et c est la decision 26
          // du brief : une information absente est OMISE, jamais remplacee.
          // Le controle porte sur la FORME du texte, pas sur une chaine precise
          // — un autre texte invente passerait tout aussi mal.
          [
            !/Retrouvez\s+(le|la|nos|notre|l’|ce)\b/i.test(html) && !/Find\s+(the|our|us)\b/i.test(html),
            "sans nom de boutique, AUCUN libelle de remplacement n est rendu",
          ],

          // CONTROLE PAR VALEUR, pas par nom : une valeur voyage sous n importe
          // quel nom. On cherche la valeur elle-meme dans le HTML rendu, charges
          // d hydratation comprises.
          [!html.includes(NOTE_SENTINELLE), "les notes internes n apparaissent PAS dans le HTML servi"],
          [
            !html.includes(commande?.unsubscribe_token ?? "|impossible|"),
            "le jeton de desabonnement n apparait pas — un jeton, un pouvoir",
          ],

          // Sur un aplat uni, un blanc a 70 % floute rend la meme couleur qu un
          // blanc opaque : le flou n a rien a flouter, et c est ce qui rame le
          // plus sur un mobile d entree de gamme.
          [!/backdrop-blur/.test(html), "aucun backdrop-blur sur la page publique"],
          [!/glass-card/.test(html), "aucun glassmorphism sur la page publique"],

          // Un apercu enrichi montrerait la photo ou le pseudo du client DANS la
          // conversation, et les messageries le mettent en cache sur leurs
          // serveurs. La fuite serait hors de notre portee.
          [!/og:image/.test(html), "aucune image de partage Open Graph"],
          [/noindex/.test(html), "la page porte bien noindex"],

          [
            Buffer.byteLength(html) / 1024 < 300,
            `poids du HTML public : ${(Buffer.byteLength(html) / 1024).toFixed(1)} Ko`,
          ],
        );

        /*
         * ⚠️ LE BUDGET DU BRIEF PORTE SUR LA PAGE, PAS SUR SON HTML.
         *
         * DEFAUT REEL, TROUVE A L AUDIT DU 31/08/2026. Le controle ci-dessus
         * etait etiquete « budget 300 » et comparait 44 Ko de HTML a 300 : il ne
         * pouvait PAS devenir rouge pour la chose que le budget protege. Une
         * bibliotheque de carrousel de 40 a 90 Ko — le cas exact que le brief
         * redoute, en toutes lettres — serait passee sans un mot.
         *
         * ON PESE DONC CE QUE LE NAVIGATEUR TELECHARGE : le HTML, plus chaque
         * sous-ressource `_next/static` qu il reference. Mesure du 31/08 sur une
         * commande a 14 medias : 631 Ko bruts, 177 Ko compresses. C est le
         * chiffre compresse qui compte — c est celui qui passe sur le reseau —
         * et le brief annonce « ~116 Ko atteignable », valeur devenue fausse.
         *
         * LE CONTRE-TEST VIENT EN PREMIER : sans sous-ressource trouvee, la
         * somme vaudrait le seul HTML et le controle passerait en n ayant rien
         * pese.
         */
        const refs = [
          ...new Set(
            [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]),
          ),
        ];
        let brut = Buffer.byteLength(html);
        let compresse = gzipSync(Buffer.from(html)).length;
        for (const u of refs) {
          const octets = Buffer.from(await (await fetch(base + u)).arrayBuffer());
          brut += octets.length;
          compresse += gzipSync(octets).length;
        }
        const ko = (n) => (n / 1024).toFixed(1);

        controles.push(
          [
            refs.length >= 3,
            `CONTRE-TEST : ${refs.length} sous-ressource(s) pesee(s) avec la page`,
          ],
          [
            compresse / 1024 < 300,
            `poids TOTAL hors medias : ${ko(compresse)} Ko compresses ` +
              `(${ko(brut)} Ko bruts) — budget 300`,
          ],
        );
      }

      if (jetonFumee) {
        // CE QUE LE VENDEUR CHANGE ARRIVE-T-IL CHEZ SON CLIENT ?
        //
        // C est la chaine dont le mode de defaillance est le plus trompeur du
        // produit : si une page publique etait servie depuis un cache, la
        // mutation reussirait, l ecran du vendeur afficherait le nouvel etat, et
        // le client continuerait de voir l ancien. Rien n echouerait nulle part.
        //
        // LA MUTATION EST FAITE EN BASE, EN CONTOURNANT L APPLICATION. Aucune
        // invalidation n est declenchee : c est le PIRE cas, celui d un chemin
        // de code qui oublierait de la poser. Passer par une Server Action
        // prouverait seulement que l invalidation qu on vient d ecrire
        // fonctionne — pas que la page est fraiche.
        const avant = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(12) });
        const htmlAvant = await avant.text();
        const cachePublic = avant.headers.get("cache-control") ?? "";

        // CONTRE-TEST, ET IL VIENT EN PREMIER : la sonde doit savoir
        // DISTINGUER une reponse mise en cache d une reponse dynamique. Sans
        // lui, « la page publique n est pas en cache » pourrait etre vrai
        // simplement parce qu on interroge le mauvais en-tete.
        const statique = await fetch(`${base}/fr/conditions`);
        const cacheStatique = statique.headers.get("cache-control") ?? "";

        const MARQUEUR = `Client-propage-${Date.now()}`;
        const depart = Date.now();
        await service.from("orders").update({ customer_label: MARQUEUR }).eq("id", commandeFumee);

        const apresMutation = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(12) });
        const htmlApres = await apresMutation.text();
        const delai = (Date.now() - depart) / 1000;

        controles.push(
          [
            cacheStatique !== cachePublic,
            `la sonde distingue cache et dynamique (statique: ${cacheStatique || "absent"} / publique: ${cachePublic || "absent"})`,
          ],
          [
            /no-store|no-cache|private/.test(cachePublic),
            `la page publique n est pas mise en cache (cache-control: ${cachePublic || "absent"})`,
          ],
          [htmlAvant.includes("Client de fumee"), "avant mutation, la page porte bien l ancienne valeur"],
          [htmlApres.includes(MARQUEUR), "la mutation faite EN BASE est servie sur la page publique"],
          [
            !htmlApres.includes("Client de fumee"),
            "l ancienne valeur ne survit nulle part dans le HTML servi",
          ],
          [delai < 30, `delai de propagation : ${delai.toFixed(1)} s (seuil 30)`],
        );

        // On remet la valeur d origine : les controles suivants la lisent.
        await service
          .from("orders")
          .update({ customer_label: "Client de fumee" })
          .eq("id", commandeFumee);

        // LA COUPURE DE SUSPENSION COUPE-T-ELLE VRAIMENT ?
        //
        // C est la capacite technique qui fonde notre statut d hebergeur, et son
        // mode de defaillance est SILENCIEUX : si un maillon de la chaine
        // manquait, rien n echouerait. Le statut serait ecrit, l audit
        // consigne, l ecran afficherait « suspendu » — et la page publique
        // continuerait d etre servie. TOUT dirait que le compte est coupe.
        //
        // LE CONTRE-TEST VIENT EN PREMIER : on etablit que la page REPOND avant
        // de pretendre mesurer une coupure. Sans lui, « elle ne repond plus »
        // serait vrai pour n importe quelle raison — un jeton mal recopie, une
        // commande jamais creee — et l on prouverait une coupure qui n a jamais
        // eu lieu.
        /*
         * ═══════════════════════════════════════════════════════════════════
         * UNE REQUETE, UNE UNITE DE PLAFOND — PAS DEUX
         * ═══════════════════════════════════════════════════════════════════
         *
         * Defaut mesure le 02/09/2026 : chaque chargement de la page publique
         * consommait DEUX unites du plafond au lieu d une. La mise en page
         * racine pose le plafond AVANT la depense qu il previent, et la page
         * l appelle a son tour : deux appels pour une seule requete HTTP.
         *
         * LE PLAFOND REEL ETAIT DONC DE 60 CHARGEMENTS PAR MINUTE, PAS 120, et
         * la sanction est un 404 identique a un lien mort — le client conclut
         * que son vendeur lui a envoye un lien casse. La cible de cette page
         * est le telephone en 4G, donc une adresse partagee par des dizaines
         * d abonnes.
         *
         * ⚠️ LA SONDE COMPTE EN BASE, pas dans le code : c est le compteur qui
         * fait autorite, et c est lui que le plafond consulte. Un controle qui
         * chercherait un appel a  dans la source prouverait qu une
         * expression existe, jamais qu une unite est consommee.
         */
        {
          // ⚠️ `x-forwarded-for`, PAS `cf-connecting-ip` : ce serveur tourne en
          // `BORD_DE_CONFIANCE=xff` (voir plus haut). En mode `cloudflare`,
          // seul `cf-connecting-ip` est cru, et une sonde qui poserait le mauvais
          // en-tete ne compterait RIEN — donc mesurerait zero unite et
          // conclurait a une sous-consommation.
          const adresseQuota = {
            "x-forwarded-for": `10.${port % 250}.201.7`,
            "user-agent": "sonde-fumee/quota",
          };
          const cleQuota = "publique-requetes:%";
          await service.from("rate_limit").delete().like("cle", cleQuota);

          const APPELS = 6;
          for (let i = 0; i < APPELS; i++) {
            await fetch(`${base}/p/${jetonFumee}`, { headers: adresseQuota });
          }

          const { data: lignes } = await service
            .from("rate_limit")
            .select("compte")
            .like("cle", cleQuota);
          const unites = (lignes ?? []).reduce((t, l) => t + l.compte, 0);

          controles.push(
            // CONTRE-TEST, EN PREMIER : la sonde compte-t-elle quelque chose ?
            // A zero, l egalite ci-dessous serait fausse mais le diagnostic le
            // serait aussi — on croirait a une sous-consommation.
            [unites > 0, `le compteur public enregistre bien les requetes (${unites} unites)`],
            [
              unites === APPELS,
              `${APPELS} chargements consomment ${APPELS} unites de plafond, pas ${unites}`,
            ],
          );

          await service.from("rate_limit").delete().like("cle", cleQuota);
        }
        const avantCoupure = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(13) });

        const departCoupure = Date.now();
        await service
          .from("profiles")
          .update({ status: "suspended" })
          .eq("id", profilFumee);

        const pendantCoupure = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(13) });
        const delaiCoupure = (Date.now() - departCoupure) / 1000;

        // Les medias aussi : une coupure a moitie faite est une coupure qui n a
        // pas eu lieu. La page peut cesser de repondre pendant que les photos
        // restent atteignables par leur URL directe.
        const mediasCoupes = await fetch(`${base}/p/${jetonFumee}/media/${commandeFumee}`, {
          headers: visiteur(13),
        });

        await service.from("profiles").update({ status: "active" }).eq("id", profilFumee);
        const apresRetour = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(13) });

        controles.push(
          [avantCoupure.status === 200, "CONTRE-TEST : la page repond AVANT la suspension"],
          [pendantCoupure.status === 404, `la suspension coupe la page (statut ${pendantCoupure.status})`],
          // UN DELAI NE SE MESURE QUE SI L EVENEMENT A EU LIEU.
          //
          // Cette ligne disait « OK, la coupure prend 0.1 s » ALORS QUE LA
          // COUPURE N AVAIT PAS EU LIEU : constate le 30/08/2026 en cassant
          // `suspension-ne-coupe-pas`. Elle chronometre le temps entre l ecriture
          // et la requete, sans jamais regarder ce que la requete a rendu — donc
          // elle certifie un seuil sur un evenement qui ne s est pas produit.
          //
          // Elle n etait rattrapee que par la ligne du dessus. Le jour ou
          // celle-ci serait assouplie, celle-ci continuerait de dire OK pour
          // toujours, et le journal afficherait une coupure rapide sur un
          // produit qui ne coupe plus.
          [
            pendantCoupure.status === 404 && delaiCoupure < 30,
            pendantCoupure.status === 404
              ? `la coupure prend ${delaiCoupure.toFixed(1)} s (seuil 30)`
              : `delai NON MESURABLE : la page repond encore (${pendantCoupure.status})`,
          ],
          [mediasCoupes.status !== 200, "les medias sont coupes eux aussi"],
          [apresRetour.status === 200, "la reactivation retablit la page SUR LE MEME LIEN"],
        );

        // LA LANGUE DE LA PAGE PUBLIQUE EST CELLE DU VENDEUR, PAS DE L URL.
        //
        // Elle vient de `shops.default_language`, un reglage de marque. Avant le
        // lot 8 la colonne existait, la page la lisait, et PERSONNE ne l ecrivait
        // jamais : toute page publique sortait en francais, y compris pour un
        // vendeur ayant tout choisi en anglais. Le defaut ne se voyait pas cote
        // vendeur — il ne se voyait que chez son client.
        //
        // Le controle porte sur du texte que SEUL le catalogue anglais contient.
        const { data: shopFumee } = await service
          .from("shops")
          .select("id")
          .eq("owner_id", profilFumee)
          .maybeSingle();

        if (shopFumee?.id) {
          await service
            .from("shops")
            .update({ name: "Atelier Fumee", default_language: "en", watermark_enabled: true })
            .eq("id", shopFumee.id);

          const anglaise = await (await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(14) })).text();

          await service
            .from("shops")
            .update({ default_language: "fr" })
            .eq("id", shopFumee.id);

          const francaise = await (await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(14) })).text();

          controles.push(
            [/<html lang="en"/.test(anglaise), "la langue reglee par le vendeur est celle du document servi"],
            [/<html lang="fr"/.test(francaise), "et elle rebascule quand il la change"],
            [anglaise !== francaise, "les deux rendus different reellement, pas seulement l attribut"],
            [
              anglaise.includes("Atelier Fumee"),
              "le nom de boutique regle apparait dans l en-tete de la page publique",
            ],
          );
        }
      }

      if (jetonFumee) {
        // LA BALISE DE CONSULTATION, de bout en bout.
        //
        // `x-forwarded-for` est pose ici parce que c est ce que fait le bord en
        // production. Sans adresse exploitable, le produit REFUSE d ecrire
        // plutot que de fusionner tous les visiteurs sous une cle commune : le
        // controle passerait alors sur un comportement qui n est pas celui qui
        // sera servi.
        const enTetes = visiteur(21);

        const balise = await fetch(`${base}/p/${jetonFumee}/vue`, {
          method: "POST",
          headers: enTetes,
        });
        const { count: apres } = await service
          .from("link_views")
          .select("id", { count: "exact", head: true })
          .eq("order_id", commandeFumee);

        // Deuxieme appel, meme visiteur, meme jour : ce n est pas une vue de
        // plus. Une ligne = un visiteur, un JOUR — c est la definition de la
        // metrique, pas un detail d implementation.
        await fetch(`${base}/p/${jetonFumee}/vue`, { method: "POST", headers: enTetes });
        const { count: apresDeux } = await service
          .from("link_views")
          .select("id", { count: "exact", head: true })
          .eq("order_id", commandeFumee);

        // MEME VISITEUR, AGENT LEGEREMENT DIFFERENT : toujours une seule vue.
        //
        // MESURE AVANT CORRECTION, en base : cinq cents vues sur une seule
        // commande depuis une seule adresse, en variant l agent. La chaine
        // complete est presque unique par machine, et la cle de deduplication
        // reposait dessus — donc une mise a jour de navigateur suffisait a
        // recompter un visiteur, sans que personne triche.
        //
        // Les deux agents ci-dessous ne different QUE par la version. Ce
        // controle passe par le produit reel : il etablit que la reduction en
        // classe est bien CABLEE dans le chemin servi, pas seulement qu une
        // fonction sait la calculer.
        const CHROME = (v) =>
          `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
        await fetch(`${base}/p/${jetonFumee}/vue`, {
          method: "POST",
          headers: { ...enTetes, "user-agent": CHROME(120) },
        });
        await fetch(`${base}/p/${jetonFumee}/vue`, {
          method: "POST",
          headers: { ...enTetes, "user-agent": CHROME(131) },
        });
        const { count: apresVersions } = await service
          .from("link_views")
          .select("id", { count: "exact", head: true })
          .eq("order_id", commandeFumee);

        controles.push(
          [balise.status === 204, "la balise de consultation repond 204"],
          [apres === 1, `une vue enregistree (compte : ${apres})`],
          [apresDeux === 1, `la seconde consultation du jour ne compte pas (compte : ${apresDeux})`],
          [
            apresVersions === 2,
            `deux versions du meme navigateur ne comptent qu une fois (compte : ${apresVersions}, attendu 2)`,
          ],
        );

        // L ARBITRAGE QC, de bout en bout : la seule ecriture publique du
        // produit. Le controle porte sur l EFFET en base, pas sur le code de
        // reponse — « il repond » est la propriete que tous les residus
        // possedent.
        const arbitrage = await fetch(`${base}/p/${jetonFumee}/qc`, {
          method: "POST",
          headers: { ...enTetes, "content-type": "application/json" },
          body: JSON.stringify({ decision: "refuse", commentaire: "La couture est de travers" }),
        });
        const corpsQc = arbitrage.ok ? await arbitrage.json() : null;

        const { data: apresArbitrage } = await service
          .from("orders")
          .select("qc_status")
          .eq("id", commandeFumee)
          .single();

        const { data: journal } = await service
          .from("order_events")
          .select("type, actor, payload")
          .eq("order_id", commandeFumee)
          .order("occurred_at", { ascending: false })
          .limit(1);

        const derniere = journal?.[0] ?? null;

        // Un corps invalide ne doit rien ecrire, et ne doit pas se distinguer
        // d un jeton inconnu.
        const invalide = await fetch(`${base}/p/${jetonFumee}/qc`, {
          method: "POST",
          headers: { ...enTetes, "content-type": "application/json" },
          body: JSON.stringify({ decision: "peut_etre" }),
        });

        controles.push(
          [arbitrage.status === 200, "l arbitrage QC repond 200"],
          [corpsQc?.qc === "refuse", "il rend le statut CONFIRME par la base"],
          [
            apresArbitrage?.qc_status === "refuse",
            `la commande porte le nouveau statut (${apresArbitrage?.qc_status})`,
          ],
          [derniere?.type === "qc_refuse", `le journal porte la decision (${derniere?.type})`],
          [derniere?.actor === "client", "elle est attribuee au CLIENT, pas au vendeur"],
          [
            derniere?.payload?.commentaire === "La couture est de travers",
            "le commentaire est retenu",
          ],
          [invalide.status === 404, "une decision inventee ne se distingue pas d un jeton inconnu"],
        );

        // LES DEUX SEUILS. On epuise le plafond depuis UNE adresse, puis on
        // verifie qu une AUTRE adresse passe encore : sans ce second controle,
        // un compteur global — donc un seul balayeur capable de couper la page
        // de tous les vendeurs — passerait le test.
        // Le balayeur a SA propre adresse, et elle varie par execution comme les
        // autres : sinon le plafond serait deja consomme au lancement suivant.
        //
        // ⚠️ CETTE SONDE FLOTTAIT, ET ELLE A ETE BORNEE LE 29/08/2026 — pas
        // relancee jusqu au vert. Elle envoyait PLAFOND+1 requetes et exigeait
        // que la DERNIERE soit refusee. Or la fenetre du compteur est FIXE et
        // dure soixante secondes : une rafale a cheval sur une bordure laisse
        // le compteur repartir de zero, et la derniere requete passe. Mesure :
        // un echec sur trois executions, sans qu aucun defaut existe.
        //
        // AUCUN NOMBRE DE REQUETES NE REND LA DERNIERE DETERMINISTE : la
        // bordure peut tomber juste avant elle. Ce qui est deterministe, c est
        // qu AU MOINS UNE soit refusee — avec 2×PLAFOND+1 requetes, l une des
        // deux fenetres en contient forcement plus que le plafond.
        //
        // La propriete verifiee ne s affaiblit pas : on exige toujours un refus
        // reel, qu il emprunte le meme chemin de sortie qu un jeton inconnu, et
        // qu une AUTRE adresse ne soit pas penalisee.
        const balayeur = visiteur(31);
        const statuts = [];
        for (let i = 0; i < 2 * PLAFOND_PUBLIC + 1; i += 1) {
          statuts.push((await fetch(`${base}/p/${jetonFumee}`, { headers: balayeur })).status);
        }
        const refuses = statuts.filter((c) => c !== 200);
        const dernierStatut = refuses[0] ?? 200;
        const voisin = await fetch(`${base}/p/${jetonFumee}`, {
          headers: visiteur(32),
        });

        controles.push(
          [
            refuses.length > 0 && dernierStatut === 404,
            `le plafond public mord (${refuses.length} refus sur ${statuts.length} requetes, ` +
              `premier statut refuse ${dernierStatut}, plafond ${PLAFOND_PUBLIC})`,
          ],
          [voisin.status === 200, "une autre adresse n est pas penalisee : le compteur est par adresse"],
          // Le refus emprunte le MEME chemin de sortie que tout le reste :
          // repondre 429 distinguerait « tu vas trop vite sur un jeton qui
          // existe » de « ce jeton n existe pas », donc rendrait le balayage
          // informatif.
          // ⚠️ CE CONTROLE PASSAIT A VIDE. Ecrit `dernierStatut !== 429`, il
          // etait VRAI quand aucune requete n avait ete refusee — donc vert
          // pendant la falsification qui vient de retirer le plafond. Un
          // ensemble vide passe tout : il doit exiger qu il y ait eu un refus
          // AVANT de dire de quoi ce refus a l air.
          [
            refuses.length > 0 && !refuses.includes(429),
            `un refus de quota ne se distingue pas d un jeton inconnu (${refuses.length} refus, statuts ${[...new Set(refuses)].join("/") || "aucun"})`,
          ],
        );
      }

      // ── LES DEUX ROUTES MACHINE DU SUIVI ──
      //
      // `/api` est EXCLU du matcher du middleware : ces deux routes ne sont
      // protegees par rien d autre que leur propre garde. Le controle porte donc
      // sur l EFFET — ce que le serveur repond reellement, et ce qui arrive en
      // base — parce que « il repond » est la propriete que tous les residus
      // possedent.
      const cadenceSansSecret = await fetch(`${base}/api/suivi/cadence`, { method: "POST" });
      const cadenceMauvais = await fetch(`${base}/api/suivi/cadence`, {
        method: "POST",
        headers: { authorization: "Bearer mauvais-secret-0123456789" },
      });
      const cadenceGet = await fetch(`${base}/api/suivi/cadence`);
      const cadenceOk = await fetch(`${base}/api/suivi/cadence`, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET_CRON}` },
      });
      const bilan = cadenceOk.ok ? await cadenceOk.json() : null;

      const { data: battement } = await service
        .from("scheduler_heartbeat")
        .select("source, beat_at")
        .eq("source", "cadence-suivi")
        .maybeSingle();

      controles.push(
        [cadenceSansSecret.status === 404, "la cadence sans secret rend 404"],
        [cadenceMauvais.status === 404, "la cadence avec un MAUVAIS secret rend 404"],
        [cadenceGet.status === 404, "un GET sur la cadence est refuse explicitement"],
        [cadenceOk.status === 200, `la cadence s ouvre avec le bon secret (${cadenceOk.status})`],
        [bilan !== null && typeof bilan.examines === "number", "elle rend un bilan chiffre"],
        [battement !== null, "elle a ecrit son battement — un passage sans battement n a pas veille"],
      );

      // ── L AUTRE MOITIE DE LA VEILLE MUTUELLE ──
      //
      // ⚠️ CETTE ROUTE N ETAIT ATTEINTE PAR RIEN. Ni sonde, ni test : les suites
      // eprouvent `veillerSur`, la fonction, jamais `/api/veille`, le cablage.
      // Sa garde est partagee avec la cadence — donc eprouvee —, mais un
      // `maxDuration` mal ecrit, un import casse, un `passerLaVeille` qui leve,
      // et la route rend 500 en silence. Le planificateur le verrait ; personne
      // d autre.
      //
      // C est la moitie qui constate la mort de la CADENCE. Une veille muette
      // rend le silence de la cadence indiscernable d un fonctionnement normal,
      // et c est exactement ce que L-022 interdit.
      //
      // ⚠️ L ORDRE COMPTE : la cadence vient de battre, quelques lignes plus
      // haut. La veille doit donc OBSERVER ce battement. Sans ce controle, une
      // veille qui n observe rien passerait — un ensemble vide passe tout, et
      // c est precisement l etat qu on ne peut pas distinguer d une panne.
      const veilleSansSecret = await fetch(`${base}/api/veille`, { method: "POST" });
      const veilleMauvais = await fetch(`${base}/api/veille`, {
        method: "POST",
        headers: { authorization: "Bearer mauvais-secret-0123456789" },
      });
      const veilleGet = await fetch(`${base}/api/veille`);
      const veilleOk = await fetch(`${base}/api/veille`, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET_CRON}` },
      });
      const bilanVeille = veilleOk.ok ? await veilleOk.json() : null;

      const { data: battementVeille } = await service
        .from("scheduler_heartbeat")
        .select("source, beat_at")
        .eq("source", "veille-mutuelle")
        .maybeSingle();

      controles.push(
        [veilleSansSecret.status === 404, "la veille sans secret rend 404"],
        [veilleMauvais.status === 404, "la veille avec un MAUVAIS secret rend 404"],
        [veilleGet.status === 404, "un GET sur la veille est refuse explicitement"],
        [veilleOk.status === 200, `la veille s ouvre avec le bon secret (${veilleOk.status})`],
        [
          bilanVeille !== null && typeof bilanVeille.observees === "number",
          "elle rend un bilan chiffre",
        ],
        [
          bilanVeille !== null && bilanVeille.observees >= 1,
          `elle a VU la cadence battre (${bilanVeille?.observees ?? "aucun bilan"} source(s) observee(s)) — ` +
            "un veilleur qui n observe rien ne se distingue pas d un veilleur en panne",
        ],
        [
          battementVeille !== null,
          "elle a ecrit SON battement, apres avoir veille — c est lui que la cadence regardera",
        ],
      );

      // LE POINT DE RECEPTION. Sans signature, n importe qui pourrait annoncer au
      // client d un vendeur inconnu que son colis est livre.
      const corpsSuivi = JSON.stringify({
        event: "TRACKING_UPDATED",
        data: { number: "FUMEE-NUMERO-INEXISTANT", carrier: 3011 },
      });
      const signature = createHash("sha256")
        .update(corpsSuivi + "/" + CLE_SUIVI, "utf8")
        .digest("hex");

      const sansSignature = await fetch(`${base}/api/suivi/notification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpsSuivi,
      });
      const mauvaiseSignature = await fetch(`${base}/api/suivi/notification`, {
        method: "POST",
        headers: { "content-type": "application/json", sign: "f".repeat(64) },
        body: corpsSuivi,
      });
      // Le bon secret, mais un corps MODIFIE apres signature : c est ce que
      // ferait un intermediaire pour transformer « en transit » en « livre ».
      const corpsModifie = corpsSuivi.replace("3011", "3012");
      const corpsFalsifie = await fetch(`${base}/api/suivi/notification`, {
        method: "POST",
        headers: { "content-type": "application/json", sign: signature },
        body: corpsModifie,
      });
      const signee = await fetch(`${base}/api/suivi/notification`, {
        method: "POST",
        headers: { "content-type": "application/json", sign: signature },
        body: corpsSuivi,
      });
      const corpsSignee = signee.ok ? await signee.json() : null;

      /*
       * LE SECOND NOM D EN-TETE. Leur doc v1 dit `sign`, leur v2.2 dit
       * `x-17track-signature` : deux sources officielles qui se contredisent.
       *
       * Parier sur un seul nom et perdre refuserait TOUTES les notifications en
       * 401 — le suivi s arreterait EN SILENCE, et rien dans les journaux ne
       * dirait que la cause est un nom d en-tete. On accepte donc les deux, et
       * on eprouve ICI que les deux passent vraiment : un test qui n exercerait
       * que le nom deja implemente ne prouverait rien de la correction.
       */
      const signeeAutreNom = await fetch(`${base}/api/suivi/notification`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-17track-signature": signature },
        body: corpsSuivi,
      });
      // ET LE CONTRE-TEST : un TROISIEME nom, plausible mais jamais declare, ne
      // doit rien ouvrir. Sans lui, une route qui accepterait n importe quel
      // en-tete — ou qui ne lirait plus d en-tete du tout — passerait le
      // controle ci-dessus a cent pour cent.
      const nomInvente = await fetch(`${base}/api/suivi/notification`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature },
        body: corpsSuivi,
      });

      controles.push(
        [sansSignature.status === 401, "une notification SANS signature est refusee"],
        [mauvaiseSignature.status === 401, "une signature fausse est refusee"],
        [corpsFalsifie.status === 401, "un corps modifie apres signature est refuse"],
        [signee.status === 200, `une notification signee est acceptee (${signee.status})`],
        [
          signeeAutreNom.status === 200,
          `signee sous le SECOND nom d en-tete, acceptee aussi (${signeeAutreNom.status})`,
        ],
        [
          nomInvente.status === 401,
          `un nom d en-tete jamais declare n ouvre rien (${nomInvente.status})`,
        ],
        [
          corpsSignee !== null && corpsSignee.colis === 0,
          "et elle dit COMBIEN de colis ont ete touches — ici zero, le numero n existe pas",
        ],
      );

      /*
       * ── ET LA PREUVE QU ELLE ECRIT ──
       *
       * ⚠️ TOUT CE QUI PRECEDE N EXERCE QUE `colis === 0`. Le numero pousse
       * n existe pas en base, donc la route repond 200 sans rien ecrire — et
       * elle repondrait EXACTEMENT pareil si l ingestion entiere etait retiree.
       * « Il repond » est la propriete que tous les residus possedent : ce bloc
       * manquait, et c est celui qui certifie la seule chose que le suivi
       * promet, ecrire ce que le transporteur annonce.
       *
       * C est aussi la REPETITION de l etape qui suivra le deploiement —
       * relever une vraie notification et constater qu elle atterrit — et elle
       * ne coute AUCUN quota chez le fournisseur : rien ici ne l appelle.
       *
       * Le mode de defaillance vise est nomme dans la route elle-meme : si la
       * chaine signature → lecture → ingestion se rompait, le suivi cesserait
       * de se mettre a jour EN SILENCE, et rien dans les journaux ne le dirait.
       */
      const { data: shopEcriture } = await service
        .from("shops")
        .select("id")
        .eq("owner_id", profilFumee)
        .maybeSingle();

      if (shopEcriture?.id && commandeFumee) {
        // Un numero propre a l execution : deux passages concurrents ne doivent
        // pas se disputer la meme ligne, et l unicite est (shop_id, numero).
        const numeroEcriture = `FUMEE-${Date.now().toString(36).toUpperCase()}`;
        const { data: colisFumee, error: erreurColis } = await service
          .from("tracked_parcels")
          .insert({ shop_id: shopEcriture.id, tracking_number: numeroEcriture })
          .select("id, normalized_status")
          .single();

        if (erreurColis || !colisFumee) {
          echecs += 1;
          console.log(
            `ECHEC colis de fumee non cree : ${erreurColis?.message ?? "aucune ligne"}`,
          );
        } else {
          await service
            .from("order_parcels")
            .insert({ order_id: commandeFumee, parcel_id: colisFumee.id });

          // CONTRE-TEST D ETAT INITIAL. Sans lui, un colis qui naitrait deja
          // « en transit » ferait passer l assertion d avancement sans qu aucune
          // ecriture n ait eu lieu.
          controles.push([
            colisFumee.normalized_status === "preparation",
            `le colis de fumee nait en preparation (${colisFumee.normalized_status})`,
          ]);

          const corpsEcrit = JSON.stringify({
            event: "TRACKING_UPDATED",
            data: {
              number: numeroEcriture,
              carrier: 3011,
              track_info: {
                latest_status: { status: "InTransit" },
                latest_event: {
                  time_utc: "2026-09-01T10:00:00Z",
                  description: "Departed from facility",
                  location: "SHENZHEN",
                },
                milestone: [{ key_stage: "Departure", time_utc: "2026-09-01T10:00:00Z" }],
              },
            },
          });
          const signatureEcrit = createHash("sha256")
            .update(corpsEcrit + "/" + CLE_SUIVI, "utf8")
            .digest("hex");

          const ecrite = await fetch(`${base}/api/suivi/notification`, {
            method: "POST",
            headers: { "content-type": "application/json", sign: signatureEcrit },
            body: corpsEcrit,
          });
          const corpsReponse = ecrite.ok ? await ecrite.json() : null;

          const { data: passages } = await service
            .from("parcel_checkpoints")
            .select("description, location, occurred_at")
            .eq("parcel_id", colisFumee.id);

          const { data: apresEcriture } = await service
            .from("tracked_parcels")
            .select("normalized_status, last_movement_at")
            .eq("id", colisFumee.id)
            .maybeSingle();

          /*
           * LE REJEU, EPROUVE DANS LA FOULEE. Le fournisseur reemet ; sans
           * deduplication, chaque renvoi repaierait un appel et ferait avancer
           * les compteurs de cout. La marque porte sur les octets EXACTS signes,
           * donc le meme corps redonne la meme empreinte.
           */
          const rejouee = await fetch(`${base}/api/suivi/notification`, {
            method: "POST",
            headers: { "content-type": "application/json", sign: signatureEcrit },
            body: corpsEcrit,
          });
          const corpsRejeu = rejouee.ok ? await rejouee.json() : null;

          const { count: passagesApresRejeu } = await service
            .from("parcel_checkpoints")
            .select("id", { count: "exact", head: true })
            .eq("parcel_id", colisFumee.id);

          controles.push(
            [
              corpsReponse !== null && corpsReponse.statut === "applique",
              `une notification signee sur un numero CONNU est appliquee (${corpsReponse?.statut ?? ecrite.status})`,
            ],
            [
              corpsReponse !== null && corpsReponse.colis >= 1,
              `elle dit avoir touche au moins un colis (${corpsReponse?.colis ?? "aucun corps"})`,
            ],
            [
              Array.isArray(passages) && passages.length >= 1,
              `le point de passage est REELLEMENT en base (${passages?.length ?? 0} ligne(s))`,
            ],
            [
              Array.isArray(passages) &&
                passages.some((p) => p.description === "Departed from facility"),
              "et il porte la description annoncee par le transporteur",
            ],
            [
              apresEcriture !== null && apresEcriture.normalized_status !== "preparation",
              `l etape du colis a AVANCE (${apresEcriture?.normalized_status ?? "illisible"})`,
            ],
            [
              apresEcriture !== null && apresEcriture.last_movement_at !== null,
              "la date du dernier mouvement est posee — c est elle qui nomme le silence",
            ],
            [
              corpsRejeu !== null && corpsRejeu.statut === "ignore",
              `le MEME corps rejoue est ignore (${corpsRejeu?.statut ?? rejouee.status})`,
            ],
            [
              passagesApresRejeu === (passages?.length ?? -1),
              `et le rejeu n ajoute aucun point (${passages?.length ?? "?"} puis ${passagesApresRejeu})`,
            ],
          );
        }
      }

      // Jeton inconnu : meme sortie, aucune divulgation.
      const inconnu = await fetch(`${base}/p/aaaaaaaaaaaaaaaaaaaaa`, { redirect: "manual" });
      controles.push([inconnu.status === 404, "un jeton inconnu rend 404"]);
    }
  }

  /*
   * L ADMINISTRATION, VUE PAR QUELQU UN QUI N Y A PAS DROIT.
   *
   * 404 ET JAMAIS 403, ET JAMAIS UNE REDIRECTION VERS LA CONNEXION. Les trois se
   * distinguent : un 403 confirme que la surface existe, et une redirection vers
   * « connectez-vous » aussi — elle dit « il y a quelque chose ici, et il te
   * manque juste un compte ». Un 404 ne dit rien.
   *
   * LE CORPS EST INSPECTE, pas seulement le statut : une page d erreur qui
   * porterait le mot « admin » ou un libelle reconnaissable serait un aveu
   * malgre le bon code de reponse.
   */
  const cheminsAdmin = [
    "/fr/admin",
    "/fr/admin/comptes",
    "/fr/admin/journal",
    "/fr/admin/parametres",
    "/fr/admin/boutiques",
    "/fr/admin/surveillance",
    // Casse et absence de prefixe de langue : ne reconnaitre que `/fr/admin`
    // laisserait ces formes franchir le filtre. Elles ne menent nulle part
    // aujourd hui, mais une protection qui tient a ce qu une redirection ait
    // lieu D ABORD n est pas une protection.
    "/FR/admin/comptes",
    "/admin/comptes",
  ];

  for (const chemin of cheminsAdmin) {
    const reponse = await fetch(`${base}${chemin}`, { redirect: "manual" });
    const corps = reponse.status === 404 ? await reponse.text() : "";

    controles.push([
      reponse.status === 404,
      `${chemin} rend 404 sans session (statut ${reponse.status})`,
    ]);
    controles.push([
      !/administration|audit|suspend/i.test(corps),
      `${chemin} ne divulgue rien dans son corps`,
    ]);
  }

  // CONTRE-TEST : la sonde saurait-elle voir une page qui REPOND ? Sans lui,
  // « tout rend 404 » pourrait etre vrai parce que le serveur est mort.
  const temoin = await fetch(`${base}/fr/connexion`, { redirect: "manual" });
  controles.push([
    temoin.status === 200,
    `CONTRE-TEST : une page publique repond bien (statut ${temoin.status})`,
  ]);
} finally {
  // Nettoyage INCONDITIONNEL : un chemin d echec qui laisse des lignes derriere
  // lui fausse toutes les mesures suivantes.
  if (commandeFumee) await service.from("orders").delete().eq("id", commandeFumee);
  if (brouillonFumee) await service.from("orders").delete().eq("id", brouillonFumee);
  if (profilFumee) {
    const { data: p } = await service.from("profiles").select("user_id").eq("id", profilFumee).maybeSingle();
    if (p?.user_id) await service.auth.admin.deleteUser(p.user_id);
  }

  /*
   * ⚠️ LES BATTEMENTS AUSSI — ET CE N EST PAS DE L HYGIENE.
   *
   * Cette sonde appelle `/api/suivi/cadence`, qui ECRIT un vrai battement et
   * fait veiller la cadence sur l autre planificateur. Les laisser derriere
   * elle a produit, le 01/09/2026, une VRAIE alerte dans la boite de Wassim :
   * « Tache en retard : veille-mutuelle, 301 minutes ». Elle etait FAUSSE —
   * `veille-mutuelle` n a jamais tourne, son battement etait un residu.
   *
   * `scheduler_heartbeat` est GLOBALE et l ABSENCE de ligne y est
   * l information : elle distingue « jamais deployee » d « en retard »,
   * c est-a-dire un CONSTAT d une ALERTE. Un residu deplace le produit d un
   * etat vers l autre, et une alerte qui se trompe est une alerte qu on apprend
   * a ignorer.
   *
   * La reservation d alerte part avec, pour le defaut SYMETRIQUE : une ligne
   * laissee la FAIT TAIRE l alerte correspondante pendant tout son repos, donc
   * un residu de sonde peut etouffer une alerte genuine. Celui-la ne se
   * remarque pas.
   */
  await service.from("scheduler_heartbeat").delete().neq("source", "");
  await service.from("alertes_envoyees").delete().neq("cle", "");
}

console.log("\n— Contenu rendu —");
// --- En-tetes de securite, sur le RESEAU et non dans la configuration ---
//
// Un `headers()` ecrit dans `next.config.ts` peut etre correct et ne rien
// produire : mauvais motif de chemin, plugin qui le remplace, build qui ne le
// reprend pas. Ce qui fait autorite est ce que le serveur REPOND.
const enTetesPublique = (await fetch(`${base}/p/inexistant-pour-les-entetes`)).headers;
const enTetesLanding = (await fetch(`${base}/fr`)).headers;

/** Six mois : le plancher en dessous duquel HSTS ne protege plus grand-chose. */
const HSTS_MINIMUM_S = 15_552_000;

function ageHsts(entetes) {
  const brut = entetes.get("strict-transport-security") ?? "";
  const trouve = /max-age=(\d+)/i.exec(brut);
  return trouve === null ? -1 : Number(trouve[1]);
}

controles.push(
  [enTetesLanding.get("x-content-type-options") === "nosniff", "nosniff sur la landing"],
  [enTetesLanding.get("x-frame-options") === "DENY", "cadrage refuse sur la landing"],
  // LE POINT QUI COMPTE : l URL de la page publique CONTIENT le jeton. Un
  // `Referer` sortant vers R2 emporterait la capacite d ouvrir la commande.
  [enTetesPublique.get("referrer-policy") === "no-referrer", "aucun referent sur la page publique"],
  [
    (enTetesPublique.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"),
    "page publique non cadrable — l arbitrage QC ne peut pas etre vole au clic",
  ],
  [
    (enTetesLanding.get("referrer-policy") ?? "") === "strict-origin-when-cross-origin",
    "referent borne ailleurs que sur la page publique",
  ],
  /*
   * HSTS — SUR LES DEUX SURFACES, ET SURTOUT SUR LA PAGE PUBLIQUE.
   *
   * L URL de `/p/{jeton}` PORTE la capacite, et elle est ouverte depuis un DM,
   * souvent sans schema. Une interception sur un reseau partage transfere un
   * acces DEFINITIF, sans laisser de trace : personne ne pensera a revoquer.
   *
   * On le mesure sur la reponse SERVIE et non dans `next.config.ts` : l en-tete
   * n est ajoute qu en production, et c est precisement le genre de condition
   * qui peut cesser d etre vraie sans que rien ne casse.
   */
  /*
   * ⚠️ ON LIT LA VALEUR, PAS LA PRESENCE. Le premier controle ecrit ici se
   * contentait de `startsWith("max-age=")` — il aurait donc ete VERT sur
   * `max-age=0`, qui DESACTIVE HSTS et efface l epinglage deja acquis. Un
   * controle incapable de distinguer une protection de son contraire est pire
   * qu absent : il occupe la place.
   */
  [
    ageHsts(enTetesLanding) >= HSTS_MINIMUM_S,
    `HSTS sur la landing (max-age ${ageHsts(enTetesLanding)} s, minimum ${HSTS_MINIMUM_S})`,
  ],
  [
    ageHsts(enTetesPublique) >= HSTS_MINIMUM_S,
    `HSTS sur la page publique (max-age ${ageHsts(enTetesPublique)} s) — c est son URL qui porte la capacite`,
  ],
);

// --- Le rayon de la carte-page, dans le CSS REELLEMENT SERVI ---
//
// Deux valeurs, selon la surface : 24 sur l authentifie, 28 sur le public.
// Les tests unitaires etablissent l APPARIEMENT — quelle classe est ecrite ou.
// Ils ne peuvent pas etablir que la classe PRODUIT un rayon : un token Tailwind
// v4 qui n arrive pas jusqu au CSS ne casse rien, il rend simplement un coin
// carre, sans une erreur nulle part. C est le meme piege que `--color-admin`,
// et il ne se voit qu ici, sur ce que le serveur repond.
const feuilles = [...fr.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]);
const css = (
  await Promise.all(feuilles.map(async (f) => (await fetch(`${base}${f}`)).text()))
).join("\n");

// CONTRE-TEST D ABORD : une feuille vide satisferait toutes les absences qu on
// s apprete a verifier. On etablit qu on regarde une vraie feuille avant d y
// chercher quoi que ce soit.
controles.push([
  feuilles.length > 0 && css.includes("--color-surface:"),
  `CONTRE-TEST : ${feuilles.length} feuille(s) servie(s), et elles portent bien le theme`,
]);

// LE PLANCHER TACTILE N ECRASE PAS `sr-only`.
//
// DEFAUT MESURE DANS CHROME LE 29/08/2026 : le bouton d envoi visuellement
// masque du champ de recherche rendait 44 x 44 au lieu de 1 x 1, et debordait de
// 27 px a droite du telephone. `sr-only` pose `width: 1px`, la regle de cible
// tactile pose `min-width: 44px` — et `min-width` l emporte TOUJOURS sur
// `width`, quelle que soit la couche. Aucun classement de couches ne corrige
// cela : ce ne sont pas deux declarations de la meme propriete.
//
// ON INTERROGE LA FEUILLE SERVIE, pas la source : c est la seule facon
// d etablir que la regle a survecu a la compilation. Et sans regex multiligne —
// la premiere version en portait une, et le saut de ligne qu elle contenait a
// casse le fichier au chargement.
const cssCompact = css.replace(/\s+/g, "");
const debutTactile = cssCompact.indexOf("@media(pointer:coarse){");
const blocTactile = debutTactile < 0 ? "" : cssCompact.slice(debutTactile, debutTactile + 800);

// LE CONTRE-TEST VIENT EN PREMIER : sans le plancher dans la feuille, « aucune
// cible invisible » serait vrai et ne prouverait rien.
const plancherPose = blocTactile.includes("min-width:44px");
controles.push([
  plancherPose,
  "CONTRE-TEST : le plancher tactile de 44 px est bien dans la feuille servie",
]);
controles.push([
  plancherPose && /\.sr-only\{[^}]*min-width:0/.test(blocTactile),
  "un element visuellement masque n est pas une cible tactile de 44 px",
]);

const valeur = (nom) => /:\s*(\d+)px/.exec(new RegExp(`--radius-${nom}\s*:\s*[^;]+;`).exec(css)?.[0] ?? "")?.[1];
const rayonAuth = valeur("page");
const rayonPublic = valeur("page-publique");

controles.push(
  [rayonAuth === "24", `carte-page authentifiee servie a 24px (lu : ${rayonAuth ?? "AUCUNE VALEUR"})`],
  [rayonPublic === "28", `carte-page publique servie a 28px (lu : ${rayonPublic ?? "AUCUNE VALEUR"})`],
  // LES DEUX SENS : si quelqu un ramene une valeur unique, les deux tokens
  // resteraient definis et les deux controles ci-dessus pourraient rester verts
  // sur la mauvaise moitie. Ce qui distingue les surfaces, c est l ECART.
  [
    rayonAuth !== undefined && rayonAuth !== rayonPublic,
    "les deux surfaces ne partagent PAS le meme rayon",
  ],
  // Et la classe doit exister ET referencer le token : une variable definie que
  // personne n utilise laisse le coin carre tout aussi silencieusement.
  [
    /rounded-page\{border-radius:var\(--radius-page\)\}/.test(css),
    "la classe du rayon authentifie existe et pointe sur son token",
  ],
  [
    /rounded-page-publique\{border-radius:var\(--radius-page-publique\)\}/.test(css),
    "la classe du rayon public existe et pointe sur son token",
  ],
);

// --- Aucune classe ne peint dans le vide ---
//
// Une classe Tailwind qui reference un token supprime ne casse RIEN : elle
// produit `border-radius: var(--disparu)`, donc aucune peinture, sans une
// erreur nulle part. C est le mode de defaillance de tout refactor de palette,
// et aucune relecture de code ne peut le voir — il faut confronter, dans le CSS
// SERVI, ce qui est REFERENCE a ce qui est DEFINI.
//
// La sonde INVENTORIE au lieu de selectionner : elle rend TOUT, et les
// exceptions sont declarees ici avec leur raison.
const EXCEPTIONS_VARIABLES = [
  // ⚠️ LES CINQ EXCEPTIONS « interne Tailwind » ONT DISPARU LE 31/08/2026, et
  // c est la sonde qui l a exige en echouant DANS L AUTRE SENS. Elles couvraient
  // `--tw-ease` et les quatre `--default-*`, toutes referencees AVEC UN REPLI :
  // depuis que la sonde ne retient que les references NUES — les seules qui
  // peuvent reellement ne rien peindre — ces cinq-la ne peuvent plus etre
  // signalees. Une exception qui ne peut plus servir est une exception qui
  // masquera le jour ou la variable reviendra vraiment orpheline.
  //
  // POSEE EN LIGNE par les apercus de marque et d onboarding — elle porte la
  // couleur du vendeur, donc elle ne peut pas vivre dans une feuille statique —
  // mais elle est LUE par une classe utilitaire (la bordure et le halo de la
  // carte choisie), donc elle apparait bien dans le CSS servi.
  //
  // ⚠️ `--apercu-sur-remplissage` A QUITTE CETTE LISTE. Elle est desormais posee
  // ET lue en ligne : elle ne traverse plus jamais la feuille de style, donc
  // l attendre ici revenait a declarer une exception qui ne correspond plus a
  // rien. C est la sonde qui l a dit, en echouant DANS L AUTRE SENS.
  ["--apercu-remplissage", "posee en ligne, mais lue par une classe utilitaire"],
];
const tolerees = new Set(EXCEPTIONS_VARIABLES.map(([v]) => v));

const definies = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

/*
 * ⚠️ SEULES LES REFERENCES SANS REPLI PEUVENT PEINDRE DANS LE VIDE.
 *
 * FAUX POSITIF REEL, LE 31/08/2026. La sonde a signale `--tw-duration` apres la
 * suppression d un composant mort — le seul du depot a porter une classe
 * `duration-200`. Or Tailwind emet
 * `transition-duration: var(--tw-duration, var(--default-transition-duration))`
 * : le repli est la, la transition dure la valeur par defaut, et RIEN ne peint
 * dans le vide. La sonde accusait le produit d un defaut qui n existait pas.
 *
 * Une sonde qui crie au loup finit desactivee, et on perd le vrai signal avec
 * le bruit. On ne retient donc que `var(--x)` NU, c est-a-dire le seul cas ou
 * la propriete n a aucune valeur — ce que le libelle du controle affirme.
 *
 * `[^),]` : on s arrete au premier `,` ou `)`. Une reference a repli porte une
 * virgule, une reference nue porte directement la parenthese fermante.
 */
const referencees = new Set(
  [...css.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)].map((m) => m[1]),
);
const avecRepli = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\s*,/g)].map((m) => m[1]));
const orphelines = [...referencees].filter((v) => !definies.has(v) && !tolerees.has(v));

controles.push(
  // CONTRE-TEST : sur une feuille vide, « aucune orpheline » serait vrai et ne
  // prouverait rien. On etablit d abord que la sonde voit une vraie palette.
  [
    definies.size > 100 && referencees.size + avecRepli.size > 100,
    `CONTRE-TEST : ${definies.size} variables definies, ${referencees.size} referencees ` +
      `sans repli et ${avecRepli.size} avec repli`,
  ],
  [
    orphelines.length === 0,
    orphelines.length === 0
      ? "aucune classe ne peint dans le vide"
      : `des classes peignent dans le vide : ${orphelines.join(", ")}`,
  ],
  // L autre sens : une exception qui ne sert plus est une exception qui
  // masquera le jour ou la variable reviendra vraiment orpheline.
  [
    EXCEPTIONS_VARIABLES.every(([v]) => referencees.has(v)),
    "chaque exception declaree correspond a une variable reellement referencee",
  ],
);

// --- Toute classe utilitaire ECRITE est-elle SERVIE ? ---
//
// ⚠️ CE CONTROLE A ETE ECRIT TROIS FOIS, et les deux premieres versions
// passaient VERTES sur le defaut qu elles etaient censees voir.
//
//   1. La sonde des variables orphelines : renommer `--color-violet` la laisse
//      verte, parce que Tailwind v4 ne GENERE PAS la classe quand le token
//      manque — plus de reference, donc plus d orpheline. Le HTML porte encore
//      `class="text-violet"`, aucune regle ne s y applique, et la couleur
//      dispara it SANS ERREUR.
//   2. La deuxieme version derivait son inventaire des tokens de `globals.css`
//      — le fichier meme qu elle protege. Renommer le token le retirait de
//      l inventaire : la garde s aveuglait AVEC le defaut. C est la forme la
//      plus traitre de L-025, parce qu elle donne un vert franc.
//
// Celle-ci part de ce que le CODE ECRIT, qui ne bouge pas quand le theme bouge,
// et demande au SERVEUR si chaque classe existe.
const fsSonde = await import("node:fs");
const pathSonde = await import("node:path");

function fichiersSources(dossier) {
  return fsSonde.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = pathSonde.join(dossier, e.name);
    if (e.isDirectory()) return fichiersSources(chemin);
    return /\.(tsx|ts)$/.test(e.name) ? [chemin] : [];
  });
}

// Les prefixes qui portent une couleur ou une bordure. Les valeurs arbitraires
// entre crochets sont exclues par la classe de caracteres : elles ne dependent
// d aucun token, donc leur disparition est impossible.
//
// ⚠️ NE PAS ECRIRE D EXEMPLE DE CLASSE ENTRE CROCHETS DANS CE FICHIER : le
// scanner de Tailwind lit ce script comme n importe quelle source, et il a
// genere la classe citee en exemple — dont la variable etait alors signalee
// orpheline par la sonde d a cote. C est L-008 : un controle de contenu qui
// scanne le code trebuche sur ses propres exemples.
const MOTIF_CLASSE = /\b(?:bg|text|border|ring|fill|stroke|divide|decoration|outline|accent|shadow|from|via|to)-[a-z][a-z0-9]*(?:-[a-z0-9]+)*\b/g;

/**
 * LES COMMENTAIRES SONT RETIRES AVANT LA RECHERCHE — L-031. Un commentaire qui
 * cite une propriete CSS (`border-bottom: 1px solid #ececf0`, `text-align`)
 * ressemble mot pour mot a une classe utilitaire, et la sonde reclamait au
 * serveur de servir une classe que personne n a jamais ecrite. La regle vaut
 * dans les deux sens : une garde doit inspecter le CODE, jamais sa description.
 */
function sansCommentaires(source) {
  return source
    .split("/*").map((p, i) => (i === 0 ? p : p.slice(p.indexOf("*/") + 2))).join("")
    .split(String.fromCharCode(10)).map((l) => { const i = l.indexOf("//"); return i === -1 ? l : l.slice(0, i); }).join(String.fromCharCode(10));
}

const classesEcrites = new Set();
for (const fichier of fichiersSources(pathSonde.join(racine, "src"))) {
  const source = sansCommentaires(fsSonde.readFileSync(fichier, "utf8"));
  for (const m of source.matchAll(MOTIF_CLASSE)) {
    classesEcrites.add(m[0]);
  }
}

// Tailwind accole quatre suites differentes au nom de la classe, CONSTATEES
// dans le CSS produit et non supposees : une regle nue, un modificateur
// d opacite echappe, une pseudo-classe, un combinateur.
const SUITES_SERVIES = ["{", "\\", ":", ">", ","];
const servie = (c) => SUITES_SERVIES.some((suite) => css.includes(`${c}${suite}`));

// Ce que le code ecrit sans que Tailwind ait a le servir. Chaque exception
// porte sa raison, et le controle suivant verifie qu elle sert encore.
// Plus aucune exception : elles ne servaient qu a rattraper les proprietes CSS
// citees en commentaire, et les commentaires sont desormais retires en amont.
// Une exception qu on peut supprimer vaut mieux qu une exception qu on declare.
const jamaisServies = [...classesEcrites].filter((c) => !servie(c));

controles.push(
  // CONTRE-TEST : un inventaire vide declarerait « tout est servi » sans avoir
  // rien regarde. C est lui qui a signale les deux versions precedentes.
  [
    // Seuil pose SOUS la mesure du jour (96) : il signale une extraction
    // cassee, pas une variation normale du code.
    classesEcrites.size >= 80,
    `CONTRE-TEST : ${classesEcrites.size} classes utilitaires ecrites dans le code`,
  ],
  [
    jamaisServies.length === 0,
    jamaisServies.length === 0
      ? "chaque classe ecrite est reellement servie"
      : `ecrites mais JAMAIS SERVIES (rendu perdu en silence) : ${jamaisServies.join(", ")}`,
  ],
);


// --- Le lien mort rend NOTRE ecran, pas celui de Next ---
//
// ⚠️ IL RENDAIT CELUI DE NEXT. `notFound()` etait appele sans qu aucun
// `not-found.tsx` existe sous `p/[token]`, donc le destinataire d un lien
// revoque recevait une page en Times New Roman, en anglais, sans rapport avec
// ce qu il venait de recevoir en message prive. Rien ne cassait, rien ne levait,
// et le defaut ne se voyait que chez quelqu un qui ne peut pas le signaler.
//
// La sonde interroge le CORPS SERVI. Verifier que le statut vaut 404 ne prouve
// rien : le 404 de Next en est un aussi.
const reponseLienMort = await fetch(`${base}/p/jeton-qui-n-existe-pas-du-tout`);
const corpsLienMort = await reponseLienMort.text();

controles.push(
  [reponseLienMort.status === 404, `un jeton inconnu rend 404 (statut ${reponseLienMort.status})`],
  [
    corpsLienMort.includes("Ce lien n"),
    "le lien mort rend l ecran du produit, et non le 404 generique",
  ],
  // CONTRE-TEST : sans lui, « ne contient rien du vendeur » serait vrai d une
  // page vide. On etablit d abord qu on regarde une vraie page.
  [
    corpsLienMort.length > 800,
    `CONTRE-TEST : la page du lien mort fait ${corpsLienMort.length} octets`,
  ],
  // CONTROLE PAR VALEUR : la page ne doit RIEN dire de la boutique. Le nom du
  // vendeur de fumee est une sentinelle : s il apparait ici, c est que le 404
  // a resolu la commande avant de refuser.
  [
    !corpsLienMort.toLowerCase().includes("fumee"),
    "le lien mort ne divulgue rien de la boutique",
  ],
);

// --- LA PAGE CLIENT PORTE UN TITRE ---
//
// ⚠️ ELLE N EN PORTAIT AUCUN. Mesure sur le HTML servi : ZERO balise `<title>`,
// contre une sur la landing. Personne ne l avait vu parce qu aucune sonde ne le
// demandait a CETTE page — celles qui existent portent sur l espace vendeur.
//
// Ce n est pas qu un defaut d accessibilite, meme si « Page Titled » est un
// critere de NIVEAU A et que c est la seule page que tous les clients de tous
// les vendeurs ouvrent. Sans titre, l onglet et l historique du navigateur
// affichent L URL — et cette URL PORTE la capacite, immuable a vie.
//
// LE TITRE EST NEUTRE, et le controle l exige : ni le pseudo du client, ni la
// reference du produit. Ce qui apparait hors de la page apparait a qui n a pas
// ouvert le lien — c est la raison qui interdit deja l image de partage.
{
  // ⚠️ ON DECODE LES ENTITES. Le titre est servi echappe — « Ce lien
  // n&#x27;est plus valable » — et comparer du texte brut a du HTML echappe
  // faisait rougir la sonde sur un produit correct. Un controle qui ne parle
  // pas la langue de ce qu il lit accuse toujours le mauvais coupable.
  const decoder = (t) =>
    t === null
      ? null
      : t
          .replace(/&#x27;|&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#x2F;/g, "/")
          .replace(/&amp;/g, "&");
  const titreDe = (html) =>
    decoder((/<title[^>]*>([^<]*)<\/title>/i.exec(html) ?? [, null])[1]);
  const titrePublique = titreDe(htmlPagePublique ?? "");
  const titreLienMort = titreDe(corpsLienMort);
  const attendu = catalogue["page-publique"].titre;
  const attenduMort = catalogue["page-publique"].lienInvalideTitre;

  controles.push(
    [
      titrePublique === attendu,
      `la page client porte son titre « ${attendu} » (servi : ${titrePublique === null ? "AUCUN" : `« ${titrePublique} »`})`,
    ],
    // Le pseudo du client et la reference produit sont sur la PAGE — c est leur
    // place, celui qui la lit est le client. Dans le TITRE, ils sortiraient de
    // la page : onglet, historique, capture d ecran.
    [
      titrePublique !== null && !titrePublique.includes("Client de fumee"),
      "et il ne porte pas le pseudo du client",
    ],
    [
      titrePublique !== null && !titrePublique.includes("REF-FUMEE"),
      "ni la reference du produit",
    ],
    // L AUTRE SENS : le lien mort porte le titre de l ecran de lien mort, celui
    // que le produit affiche deja pour inconnu, revoque ET suspendu. Le titre ne
    // distingue donc pas ce que le corps ne distingue pas.
    [
      titreLienMort === attenduMort,
      `le lien mort porte le sien « ${attenduMort} » (servi : ${titreLienMort === null ? "AUCUN" : `« ${titreLienMort} »`})`,
    ],
  );
}

// --- Aucune page ne montre un IDENTIFIANT de traduction ---
//
// ⚠️ CONSTATE EN DIRECT LE 27/08/2026 : la page publique a servi
// `page-publique.reseaux.sansNom` EN CLAIR au client, parce qu une cle avait
// ete retiree du catalogue pendant que le code l appelait encore. next-intl ne
// leve pas — il rend l identifiant. Le defaut ne casse rien, ne se voit dans
// aucun journal, et ne se manifeste que chez le destinataire.
//
// C est la meme famille que le format de date jamais declare (commit fee1454) :
// une cle absente degrade au lieu de casser.
//
// LE MOTIF EST ANCRE AUX NAMESPACES REELS du catalogue, jamais devine : sans
// cela, `instagram.com` ou `droplink.fr` seraient signales, la sonde crierait
// au loup, et on apprendrait a l ignorer.
const catalogueI18n = JSON.parse(
  fsSonde.readFileSync(pathSonde.join(racine, "messages", "fr.json"), "utf8"),
);
const namespaces = Object.keys(catalogueI18n);
// ⚠️ `String.raw` N'EST PAS UNE COQUETTERIE. Ce motif a d'abord ete ecrit dans
// un template literal ordinaire, ou \b est la sequence d'echappement
// JavaScript du BACKSPACE — pas une frontiere de mot. La regex cherchait donc
// un caractere de controle en tete, ne matchait jamais, et le controle se
// declarait vert. Le caractere etant invisible, ni la relecture ni l'affichage
// terminal ne pouvaient le montrer : seul un decodage octet par octet le voit.
const motifIdentifiant = new RegExp(
  String.raw`\b(?:${namespaces.join("|")})\.[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*`,
  "g",
);

const pagesAInspecter = [
  ["/fr", fr],
  ["/p/<jeton>", htmlPagePublique],
  ["/p/<jeton mort>", corpsLienMort],
];
const identifiantsVus = [];
for (const [nom, contenu] of pagesAInspecter) {
  for (const m of (contenu ?? "").matchAll(motifIdentifiant)) {
    identifiantsVus.push(`${nom} : ${m[0]}`);
  }
}

controles.push(
  // CONTRE-TEST : sans namespaces, le motif ne peut rien trouver et le controle
  // serait vert en n ayant rien cherche.
  [
    namespaces.length >= 5 && pagesAInspecter.every(([, c]) => (c ?? "").length > 500),
    `CONTRE-TEST : ${namespaces.length} namespaces cherches sur ${pagesAInspecter.length} pages servies`,
  ],
  [
    identifiantsVus.length === 0,
    identifiantsVus.length === 0
      ? "aucune page ne montre un identifiant de traduction"
      : `IDENTIFIANTS DE TRADUCTION RENDUS EN CLAIR : ${identifiantsVus.join(" | ")}`,
  ],
);

for (const [ok, libelle] of controles) {
  if (!ok) echecs += 1;
  console.log(`${ok ? "OK   " : "ECHEC"} ${libelle}`);
}

// Contre-test positif : une suite ou tout est « absent » passerait a 100 % sur
// une page vide. On etablit d abord que la sonde regarde une vraie page.
if (fr.length < 5000) {
  echecs += 1;
  console.log("ECHEC la page /fr est trop courte : la sonde regarde une page vide");
}

const poids = Buffer.byteLength(fr) / 1024;
console.log(`\npoids HTML /fr : ${poids.toFixed(1)} Ko`);

/*
 * COMBIEN DE CONTROLES LE TABLEAU PORTE, ET UN PLANCHER DESSUS.
 *
 * ⚠️ DEFAUT REEL, TROUVE A L AUDIT DU 31/08/2026. Ce script ne comptait que les
 * ECHECS. Or vingt de ses trente-quatre `controles.push` vivent a l interieur de
 * deux `if` imbriques — `if (utilisateur?.user)` puis `if (shop?.id)` — dont
 * l erreur etait JETEE. Un quota d authentification a 429, ou une base repassee
 * en lecture seule, suffisait a faire disparaitre la signature du point de
 * reception, la garde CSRF, l export CSV, les deux seuils de limitation, la
 * coupure de suspension, la propagation de cache et le contre-test admin — et
 * le script affichait « Tout est vert. » en statut 0.
 *
 * ⚠️ ET LE PREMIER PLANCHER ETAIT FAUX : pose a 170 parce que la sortie imprime
 * 183 lignes « OK ». Elle en imprime 183, mais le TABLEAU n en porte que 143 —
 * une quarantaine de controles s impriment directement, sans y passer. Un
 * plancher qui compte la mauvaise quantite accuse le produit d un defaut qui est
 * le sien : il a fallu le mesurer pour s en apercevoir. 140 est donc juste sous
 * la valeur RELEVEE, pas sous une valeur supposee.
 *
 * Les trois etages disent desormais leur motif quand ils cedent, sans quoi le
 * plancher signale qu il manque quelque chose sans jamais dire quoi.
 */
const PLANCHER_CONTROLES = 140;
console.log(`controles empiles : ${controles.length}`);
if (controles.length < PLANCHER_CONTROLES) {
  echecs += 1;
  console.log(
    `ECHEC seulement ${controles.length} controles empiles pour un plancher de ` +
      `${PLANCHER_CONTROLES}. Les deux tiers de cette sonde vivent sous deux \`if\` : ` +
      "si la creation du compte de fumee a echoue, ils ont ete SAUTES en silence.",
  );
}

arreter();
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} ecart(s).`);
process.exit(echecs === 0 ? 0 : 1);

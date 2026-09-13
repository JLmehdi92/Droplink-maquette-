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
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * LA MARQUE DE LA SURFACE D ADMINISTRATION, et sa seule raison d exister.
 *
 * Elle sert a distinguer un refus d administration d une adresse inventee : si
 * le corps du 404 la porte, un vendeur ordinaire apprend que la surface existe.
 * Elle est posee sur la racine du layout d administration et sur rien d autre.
 *
 * ⚠️ NE JAMAIS LA REMPLACER PAR UNE VALEUR D APPARENCE. Elle etait la classe
 * de couleur du chrome sombre, et la migration de ce chrome l a effacee du depot
 * en silence le 12/09/2026 — le controle serait devenu vert a vide.
 */
const MARQUE_ADMIN = 'data-surface="administration"';

/**
 * LES DATES DU SCENARIO DE SUIVI, RELATIVES A MAINTENANT.
 *
 * ⚠️ ELLES ETAIENT ECRITES EN DUR, ET ELLES ONT PERIME. Le scenario posait un
 * dernier mouvement au « 2026-09-02 » et une arrivee annoncee « du 09 au 12 ».
 * Le 12/09/2026, ce dernier mouvement a eu DIX JOURS — le seuil du silence du
 * brief — la page a donc NOMME le silence et retire la prevision, comme elle
 * doit le faire, et le contre-test « quand le transporteur annonce une arrivee,
 * la carte la porte » est devenu ROUGE. Pas a cause d un defaut du produit : a
 * cause d une sonde qui avait une date de peremption.
 *
 * Une sonde qui depend du calendrier ne mesure pas ce qu elle croit mesurer.
 * Celle-ci fabrique donc ses dates depuis l instant du passage : le dernier
 * mouvement a TOUJOURS deux jours, l arrivee annoncee encadre TOUJOURS
 * aujourd hui.
 */
const jourISO = (decalage) => new Date(Date.now() + decalage * 86400000).toISOString().slice(0, 10);
const instantISO = (decalage) =>
  new Date(Date.now() + decalage * 86400000).toISOString().replace(/\.\d+Z$/, "Z");

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
    "x-real-ip": `10.${serie}.${n}.1`,
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
    // LE MODE DE CONFIANCE EST CELUI DE LA CIBLE DE DEPLOIEMENT, PAS UN MODE DE
    // COMMODITE. Le defaut est `cloudflare` — seul `cf-connecting-ip` est cru —
    // et il n y a pas de Cloudflare devant ce serveur : sans reglage, aucune
    // adresse ne serait lisible, donc AUCUN QUOTA NE SERAIT CONSOMME, et les
    // controles de limitation passeraient tous en ne mesurant rien. Un ensemble
    // vide passe tout.
    //
    // ⚠️ `railway` ET NON `xff` DEPUIS LE 04/09/2026. Le produit est deploye sur
    // Railway, dont le bord pose `x-real-ip`. Eprouver le produit sous un autre
    // mode que celui qu il servira laisserait le chemin de resolution REELLEMENT
    // employe hors de portee de la sonde — et c est ce chemin qui decide si une
    // vue est enregistree ou si un quota est consomme.
    BORD_DE_CONFIANCE: "railway",
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
  /*
   * ⚠️ LE CHINOIS EST SERVI, ET IL FAUT L EXECUTER POUR LE SAVOIR.
   *
   * `zh-CN` est entre dans `LANGUES` le 06/09/2026 et les portes sont passees
   * au vert sans qu AUCUNE page `/zh-CN` ne soit jamais rendue : la fumee
   * codait `fr` et `en` en dur en dix points. Un routage casse par le sous-tag
   * — le seul code de langue du produit qui en porte un — n aurait ete vu par
   * personne. C est « une affirmation trop vague pour etre fausse ne peut pas
   * non plus etre vraie », appliquee a une langue entiere.
   */
  { chemin: "/zh-CN", statut: 200, libelle: "landing chinoise" },
  { chemin: "/zh-CN/connexion", statut: 200, libelle: "connexion chinoise" },
  { chemin: "/zh-CN/inscription", statut: 200, libelle: "inscription chinoise" },
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

/*
 * ⚠️ CHERCHER UN LIBELLE DANS LE HTML BRUT NE PROUVE RIEN SUR UNE PAGE
 * AUTHENTIFIEE.
 *
 * L espace vendeur et l administration EXPEDIENT LEUR CATALOGUE DE TRADUCTION
 * au navigateur — contrairement a `/p/{jeton}`, qui ne le fait deliberement
 * pas. Chaque libelle de ces ecrans est donc dans la charge d hydratation,
 * RENDU OU NON : un controle qui le cherche dans le HTML entier resterait vert
 * apres que l element aurait disparu de l ecran.
 *
 * Trouve le 03/09/2026 en posant une sonde neuve, NEE ROUGE sur un produit
 * deja corrige. C est L-020 — interroger l effet, pas le mot — et sa variante
 * L-031, appliquer le motif au contenu debarrasse de ce qui n en est pas.
 *
 * A N EMPLOYER QUE POUR LES LIBELLES. Les controles qui visent justement la
 * charge — la sentinelle des notes internes, le jeton — doivent continuer de
 * lire le HTML ENTIER : c est la que la fuite se produirait.
 */
/*
 * LE HTML SERVI N EST PAS LE TEXTE RENDU, ET UNE APOSTROPHE SUFFIT A LE PROUVER.
 *
 * Defaut mesure le 13/09/2026 : le titre du panneau d administration est passe
 * de « Panneau » a « Vue d ensemble », et la sonde qui verifie que la page porte
 * son titre est devenue ROUGE alors que la page le portait. React echappe
 * l apostrophe en `&#x27;` ; `includes` cherchait donc une chaine que le HTML ne
 * peut pas contenir.
 *
 * Le sens de l erreur importe : elle etait FAUSSEMENT ROUGE, donc visible. Le
 * meme motif dans une assertion NEGATIVE — « ce libelle ne fuit pas » — aurait
 * ete faussement VERT, et rien ne l aurait dit. Les entites sont donc decodees
 * une fois pour toutes, ici, plutot que contournees au cas par cas.
 */
const sansEntites = (html) =>
  html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const rendu = (html) => sansEntites(html.replace(/<script[\s\S]*?<\/script>/gi, ""));


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
  // Le chinois passe par le meme balayage : un identifiant non resolu s y
  // verrait autant, et personne ne le regardait.
  "/zh-CN",
  "/zh-CN/connexion",
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

const PAGES_A_PIED = ["/fr", "/en", "/zh-CN", "/fr/conditions", "/fr/confidentialite"];

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
  // ⚠️ L ORDRE COMPTE : `/zh-CN` d abord, sinon un `startsWith("/en")` ne le
  // verrait pas et l attribut `lang` serait compare a la mauvaise valeur.
  const langue = chemin.startsWith("/zh-CN") ? "zh-CN" : chemin.startsWith("/en") ? "en" : "fr";

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
/*
 * ═════════════════════════════════════════════════════════════════════════
 * LE MIDDLEWARE PORTE-T-IL SA CONFIGURATION ? — sur l ARTEFACT, pas la source
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ DEFAUT DE PRODUCTION, TROUVE AU PREMIER DEPLOIEMENT, LE 04/09/2026. Le
 * middleware levait a CHAQUE requete :
 *
 *     Error: Variable d environnement NEXT_PUBLIC_SUPABASE_URL absente.
 *
 * alors que la variable ETAIT posee sur la plateforme. `lireVariable(nom)`
 * lisait `process.env[nom]` — une cle DYNAMIQUE, que le bundler ne sait pas
 * analyser, donc rien n etait inline. Or l execution « edge » ne recoit PAS
 * l environnement ambiant du conteneur : elle ne voit que l inline et ce qu un
 * fichier `.env` a charge.
 *
 * ⚠️ ET C EST POURQUOI AUCUNE PORTE NE L A VU. En local, Next charge
 * `.env.local` et le transmet au bac a sable : le middleware marchait. Le
 * defaut n existait QUE la ou il n y a pas de fichier `.env`, c est-a-dire en
 * production. Une garde qui lirait la SOURCE ne verrait rien non plus — c est
 * l ARTEFACT qu il faut interroger.
 *
 * LE CONTRE-TEST EST LE PLUS IMPORTANT DES DEUX : la cle service-role ne doit
 * JAMAIS etre figee dans ce bundle. Elle donnerait un acces total, RLS
 * contournee, a toutes les donnees de tous les vendeurs.
 */
{
  /*
   * ⚠️ LE BUNDLE EST TROUVE PAR SON MANIFESTE, PAS PAR UN CHEMIN DEVINE.
   *
   * Il vivait dans `.next/server/src/middleware.js` jusqu a Next 15. Next 16 l
   * eclate en PLUSIEURS morceaux sous `.next/server/edge/chunks/`, aux noms
   * haches. Le chemin en dur a donc fait tomber la fumee entiere sur un
   * `ENOENT` — et c est le meilleur des deux echecs possibles : un chemin qui
   * n existe plus se voit tout de suite, la ou un fichier VIDE aurait laisse
   * passer les trois controles suivants en croyant les avoir faits.
   *
   * `middleware-manifest.json` est la source de verite de Next lui-meme : il
   * liste les fichiers du bundle, quelle que soit la version. On les concatene
   * tous, parce que la cle service-role figee dans N IMPORTE LEQUEL d entre eux
   * serait une fuite.
   */
  const manifeste = JSON.parse(
    readFileSync(join(".next", "server", "middleware-manifest.json"), "utf8"),
  );
  const morceaux = Object.values(manifeste.middleware ?? {}).flatMap((m) => m.files ?? []);
  const middleware = morceaux
    .map((f) => {
      try {
        return readFileSync(join(".next", f), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
  const lu = (nom) => (process.env[nom] ?? "").trim();

  controles.push(
    [
      morceaux.length > 0,
      `CONTRE-TEST : le manifeste declare ${morceaux.length} morceau(x) de bundle`,
    ],
    [
      middleware.length > 10_000,
      `CONTRE-TEST : le bundle du middleware est lu (${(middleware.length / 1024).toFixed(0)} Ko)`,
    ],
    [
      lu("NEXT_PUBLIC_SUPABASE_URL") !== "" && middleware.includes(lu("NEXT_PUBLIC_SUPABASE_URL")),
      "l URL Supabase est FIGEE dans le middleware — sans quoi l execution edge ne la verra pas en production",
    ],
    [
      lu("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") !== "" &&
        middleware.includes(lu("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")),
      "la cle publiable aussi",
    ],
    // ⚠️ L AUTRE SENS, et il pese plus lourd que les deux precedents.
    [
      lu("SUPABASE_SERVICE_ROLE_KEY") !== "" &&
        !middleware.includes(lu("SUPABASE_SERVICE_ROLE_KEY")),
      "CONTRE-TEST : la cle service-role n est PAS figee dans le bundle",
    ],
  );
}


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
let shopFumee = null;
/*
 * LES ADRESSES CREEES PAR LES SONDES, A EFFACER QUOI QU IL ARRIVE.
 *
 * Une sonde qui cree un compte et sort par un chemin d echec le laisse derriere
 * elle. Ces comptes-la ne sont pas seulement du desordre : ils comptent dans
 * `orders_created`, dans les compteurs du panneau admin et dans le denominateur
 * du taux d activation, c est-a-dire dans la metrique de verdict de la phase.
 */
const comptesJetables = [];
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
      shopFumee = shop.id;
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

      /*
       * ── UN LOGO, PARCE QUE SANS LUI LA BARRE LATERALE N A RIEN A RENDRE ──
       *
       * ⚠️ TROU REEL, MONTRE EN CAPTURE PAR WASSIM LE 03/09/2026 : son bloc de
       * compte affichait un disque gris alors que sa marque est configuree. Le
       * layout vendeur ne rendait tout simplement JAMAIS `profil.logoUrl` —
       * la donnee arrivait pourtant jusqu'a lui.
       *
       * La boutique de fumee n avait pas de logo, donc aucune sonde ne pouvait
       * voir la difference entre « le logo est rendu » et « il n y en a pas ».
       * C est le meme piege que le media de fumee : un ensemble vide passe tout.
       *
       * La cle a la FORME que le produit ecrit — `logos/{shop}/{uuid}.{ext}` —
       * et l objet n existe pas dans R2 : ce qu on mesure ici est le HTML rendu
       * et la SIGNATURE de l URL, pas le telechargement.
       */
      const cleLogoFumee = `logos/${shop.id}/${randomUUID()}.webp`;
      const { error: erreurLogo } = await service
        .from("shops")
        .update({ logo_url: cleLogoFumee })
        .eq("id", shop.id);
      if (erreurLogo) {
        console.error(`ECHEC impossible de poser le logo de fumee : ${erreurLogo.message}`);
        echecs += 1;
      }

      // ── UN MEDIA, PARCE QUE SANS LUI LA PAGE PUBLIQUE N A AUCUNE URL SIGNEE ──
      //
      // ⚠️ TROU REEL DE CETTE SONDE, TROUVE LE 02/09/2026. La commande de fumee
      // n a JAMAIS porte de media. Consequences, deux, et la seconde est la
      // pire :
      //
      //   1. le chemin le plus visite du produit — la galerie — n etait rendu
      //      par aucun controle de bout en bout ;
      //   2. le controle par VALEUR pose ci-dessous aurait ete VRAI SANS RIEN
      //      REGARDER. Un ensemble vide passe tout : chercher un identifiant
      //      dans une page qui ne porte aucune URL signee ne prouve rien, et se
      //      lit exactement comme une garde qui tient.
      //
      // La cle a la FORME que le declencheur `verifier_cles_media` (055) exige :
      // `medias/{shop}/{commande}/{media}.{ext}`. L objet n existe pas dans R2 —
      // signer une cle ne demande pas que l objet existe, et ce qu on mesure ici
      // est le HTML rendu, pas le telechargement.
      const idMediaFumee = randomUUID();
      const cleFumee = `medias/${shop.id}/${commandeFumee}/${idMediaFumee}.jpg`;
      const { error: erreurMedia } = await service.from("order_media").insert({
        id: idMediaFumee,
        order_id: commandeFumee,
        type: "photo",
        cle: cleFumee,
        cle_vignette: `medias/${shop.id}/${commandeFumee}/${idMediaFumee}.vignette.webp`,
        /*
         * ⚠️ LE MEDIA DE FUMEE N AVAIT PAS DE DERIVEE 900 PX, ET C EST CE QUI
         * RENDAIT LA SONDE AVEUGLE AU DEFAUT DES TUILES.
         *
         * Sans `cle_couverture`, la page publique de fumee ne reference AUCUNE
         * `.couverture.webp`. Le controle « la derivee 900 px n est demandee que
         * par l en-tete » etait alors vrai en n ayant rien regarde — un ensemble
         * vide passe tout. Son contre-test l a dit tout haut des le premier
         * passage : « elle reference aussi la derivee 900 px (vu 0) ».
         *
         * Le jeu de fumee doit donc porter LES DEUX derivees, comme un vrai
         * media depose depuis le navigateur : c est la seule configuration ou la
         * question « laquelle va dans la tuile » a un sens.
         */
        cle_couverture: `medias/${shop.id}/${commandeFumee}/${idMediaFumee}.couverture.webp`,
        largeur: 1200,
        hauteur: 1600,
        taille_octets: 240000,
        position: 0,
      });
      if (erreurMedia) {
        console.error(`ECHEC impossible de poser le media de fumee : ${erreurMedia.message}`);
        echecs += 1;
      }

      /*
       * ⚠️ UN SECOND MEDIA, PARCE QU AVEC UN SEUL LA GRILLE N EXISTE PAS.
       *
       * La page client rend le PREMIER media en grand, puis les SUIVANTS en
       * tuiles. Avec un media unique il n y a donc aucune tuile — et la sonde
       * qui pretend garder ce que les tuiles telechargent ne regardait, depuis
       * toujours, qu une page qui n en a pas. Son contre-test l a dit : « une
       * balise img demande bien une vignette 200 px (vu 0) ».
       *
       * C est la meme faute que celle qu on vient de corriger dans le produit,
       * commise cette fois dans le JEU DE MESURE : un ensemble vide passe tout.
       * Deux medias sont le MINIMUM pour que la question « en-tete ou tuile »
       * ait un sens, et le minimum est ce qu on pose — un jeu de fumee n est pas
       * un jeu de charge.
       */
      const idMediaTuile = randomUUID();
      const { error: erreurTuile } = await service.from("order_media").insert({
        id: idMediaTuile,
        order_id: commandeFumee,
        type: "photo",
        cle: `medias/${shop.id}/${commandeFumee}/${idMediaTuile}.jpg`,
        cle_vignette: `medias/${shop.id}/${commandeFumee}/${idMediaTuile}.vignette.webp`,
        cle_couverture: `medias/${shop.id}/${commandeFumee}/${idMediaTuile}.couverture.webp`,
        largeur: 1200,
        hauteur: 1600,
        taille_octets: 240000,
        position: 1,
      });
      if (erreurTuile) {
        console.error(`ECHEC impossible de poser le second media de fumee : ${erreurTuile.message}`);
        echecs += 1;
      }

      /*
       * ── UN TROISIEME MEDIA, SANS AUCUNE DERIVEE ──
       *
       * ⚠️ CE CAS A RENDU UNE PAGE DE CLIENT ENTIEREMENT VIDE, LE 05/09/2026.
       * `cle_vignette` est NULLABLE et le modele de donnees dit que son absence
       * est « un cas normal » ; le rendu, lui, ne signait QUE les derivees. Cinq
       * photos deposees, presentes dans R2, servies en 200 image/jpeg a qui
       * demandait leur URL — et rien a l ecran, ni chez le vendeur ni chez son
       * client.
       *
       * LE JEU DE FUMEE N EN PORTAIT AUCUN. Les deux medias ci-dessus ont leurs
       * deux derivees, donc la question « que rend-on quand il n y en a pas »
       * n etait posee nulle part : un ensemble vide passe tout.
       */
      const idMediaNu = randomUUID();
      const cleNue = `medias/${shop.id}/${commandeFumee}/${idMediaNu}.jpg`;
      const { error: erreurNu } = await service.from("order_media").insert({
        id: idMediaNu,
        order_id: commandeFumee,
        type: "photo",
        cle: cleNue,
        // NI VIGNETTE NI COUVERTURE : c est tout l objet de ce media.
        largeur: 1200,
        hauteur: 1600,
        taille_octets: 210000,
        position: 2,
      });
      if (erreurNu) {
        console.error(`ECHEC impossible de poser le media sans derivee : ${erreurNu.message}`);
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
      /*
       * FABRIQUER UNE SESSION VENDEUR — EN FONCTION, PARCE QU IL EN FAUT DEUX.
       *
       * ⚠️ ELLE ETAIT EN LIGNE, ET FABRIQUEE UNE SEULE FOIS EN TETE DE SUITE.
       * Le jeton d acces Supabase vaut UNE HEURE ; la sonde en dure davantage.
       * Les controles de suivi, tout a la fin, recevaient donc un cookie
       * EXPIRE et lisaient 307 — c est-a-dire la connexion, pas l ecran.
       * Leurs contre-tests l ont dit tout haut plutot que de laisser passer un
       * vert : « l ecran Commandes repond a la session (statut 307) ».
       *
       * En fonction, chaque bloc ouvre la sienne au moment ou il en a besoin.
       * Et elle passe TOUJOURS par le vrai chemin mot de passe : une session
       * bricolee validerait un chemin que le produit n a pas.
       */
      async function ouvrirSessionVendeur() {
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
          console.error(`ECHEC ouverture de session par mot de passe : ${erreurMdp.message}`);
          echecs += 1;
        }
        if (!verif?.session) return null;

        const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
        // Reduite au strict necessaire : au-dela d environ 3180 octets
        // `@supabase/ssr` decoupe le cookie en `.0`, `.1`, … et une sonde qui
        // ne decoupe pas enverrait un cookie tronque, donc pas de session —
        // et le controle se croirait rouge pour la mauvaise raison.
        const s = verif.session;
        const mince = {
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          token_type: s.token_type,
          expires_in: s.expires_in,
          expires_at: s.expires_at,
          user: {
            id: s.user.id,
            aud: s.user.aud,
            role: s.user.role,
            email: s.user.email,
            app_metadata: {},
            user_metadata: {},
            created_at: s.user.created_at,
          },
        };
        const valeur = "base64-" + Buffer.from(JSON.stringify(mince)).toString("base64");
        return valeur.length <= 3180
          ? `sb-${ref}-auth-token=${valeur}`
          : valeur
              .match(/.{1,3180}/g)
              .map((m, i) => `sb-${ref}-auth-token.${i}=${m}`)
              .join("; ");
      }

      const cookieVendeur = await ouvrirSessionVendeur();

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

        // ══════════════════════════════════════════════════════════════════════════
        // ET LE GESTE FAIT-IL CE QU IL DIT ? — LE CONTRE-TEST POSITIF QUI MANQUAIT
        // ══════════════════════════════════════════════════════════════════════════
        //
        // ⚠️ TOUT CE QUI PRECEDE EPROUVE DES REFUS. La garde CSRF refuse, la garde
        // de session refuse, le GET est refuse, le corps vide est refuse. Une
        // suite ou tout est refuse passe a 100 % sans rien prouver : ces controles
        // resteraient TOUS VERTS si le geste, une fois passe, n archivait rien.
        //
        // ⚠️ ET C EST EXACTEMENT LA QUE VIT LE DEFAUT LE PLUS GRAVE DU PROJET. Sur
        // la surface authentifiee, en build de PRODUCTION, une navigation qui garde
        // le meme chemin a deja ete ABANDONNEE en silence — 16 pistes fermees par
        // mesure. Le mode de defaillance n est pas une erreur : c est un 303 qui
        // part, un ecran qui revient, et une base qui n a pas bouge.
        //
        // ON LIT DONC LA BASE, AVANT ET APRES, sur les DEUX transitions. Le geste
        // inverse n est pas du zele : archiver puis desarchiver ramene la commande
        // de fumee a son etat de depart, donc les controles suivants — la page
        // publique, le suivi — mesurent ce qu ils croient mesurer.
        if (commandeFumee) {
          const entetesGeste = {
            cookie: cookieVendeur,
            ...visiteur(46),
            origin: base,
            "content-type": "application/x-www-form-urlencoded",
          };
          const archivee = async () => {
            const { data } = await service
              .from("orders")
              .select("archived_at")
              .eq("id", commandeFumee)
              .single();
            return data?.archived_at !== null && data?.archived_at !== undefined;
          };
          const geste = async (archiver) =>
            fetch(`${base}/fr/commandes/geste`, {
              method: "POST",
              redirect: "manual",
              headers: entetesGeste,
              body: new URLSearchParams({
                geste: "archiver",
                id: commandeFumee,
                archiver: archiver ? "1" : "0",
                retour: "/fr/commandes",
              }),
            });

          const avant = await archivee();
          const rArchive = await geste(true);
          const apresArchive = await archivee();
          const rRetour = await geste(false);
          const apresRetour = await archivee();

          controles.push(
            // CONTRE-TEST D ABORD : si elle etait DEJA archivee, « elle l est apres »
            // serait vrai sans que le geste ait rien fait.
            [avant === false, `CONTRE-TEST : la commande n est pas archivee au depart (${avant})`],
            [
              rArchive.status === 303,
              `le geste d archivage repond 303 (statut ${rArchive.status})`,
            ],
            // LA MOITIE QUI MANQUAIT, ET LA SEULE QUI PROUVE QUELQUE CHOSE.
            [apresArchive === true, "et la commande est REELLEMENT archivee EN BASE"],
            [
              rRetour.status === 303 && apresRetour === false,
              `le geste inverse la sort des archives, en base (statut ${rRetour.status}, archivee ${apresRetour})`,
            ],
          );
        }


        // ── LE PLAFOND DE L EXPORT, EPROUVE PAR EPUISEMENT ──
        //
        // ⚠️ IL N EXISTAIT PAS. L export etait le SEUL chemin du produit a produire
        // un fichier quittant l application, et le seul sans compteur de debit. Le
        // fichier porte les LIENS PUBLICS des commandes — jusqu a 5 000 par
        // requete, et un `public_token` est immuable a vie : ce qui sort n est pas
        // une donnee qu on relira, c est une CAPACITE qu on ne reprend plus. Une
        // session volee pouvait en tirer tous les jetons d un compte, en autant de
        // requetes qu elle voulait.
        //
        // ON L EPUISE POUR DE VRAI plutot que de lire une constante : un plafond
        // qu on n a jamais vu mordre est une declaration, pas une garde (L-018). Le
        // compte de fumee est neuf a chaque passage, donc son compteur part de zero.
        {
          const entetesExport = { cookie: cookieVendeur, ...visiteur(44) };

          /*
           * ⚠️ LE COMPTEUR EST REMIS A ZERO AVANT LA MESURE, ET C EST NECESSAIRE.
           *
           * Sa fenetre est d UNE HEURE, et le compte de fumee peut survivre a un
           * passage — le script ramasse les comptes abandonnes plutot que d en
           * creer un a chaque fois. Deux executions rapprochees trouvaient donc
           * le plafond DEJA epuise, et la porte rougissait sur QUATRE controles
           * sans qu aucun defaut produit n existe. Observe une fois.
           *
           * Un controle qui echoue par intermittence se BORNE, il ne se relance
           * pas jusqu au vert. On efface donc la seule ligne de ce vendeur —
           * jamais la table — pour que la mesure parte d un etat connu.
           *
           * ⚠️ CELA N AFFAIBLIT RIEN : ce qui est eprouve est que douze requetes
           * consecutives se heurtent au plafond, pas que la table etait vide. La
           * cle est composee comme le module la compose, `surface:cle`.
           */
          await service
            .from("rate_limit")
            .delete()
            .eq("cle", `export-csv:${profilFumee}`);

          const statuts = [];
          // Le plafond vaut 10 par heure ; on tire douze fois pour voir la coupure
          // ET la voir tenir apres.
          for (let i = 0; i < 12; i += 1) {
            const r = await fetch(`${base}/api/commandes/export`, { headers: entetesExport });
            statuts.push(r.status);
          }
          /*
           * L EXPORT DES COLIS, POSE LE 12/09/2026 AVEC LA CASE A COCHER DE
           * L ECRAN ENVOIS. Il est verifie ICI parce que c est le seul bloc qui
           * porte un cookie de vendeur : une garde ne se contröle qu avec les
           * deux cas, et le refus sans session est deja mesure plus bas.
           *
           * ⚠️ LE CONTRÖLE QUI COMPTE LE PLUS EST LE DERNIER : ce fichier ne doit
           * porter AUCUN lien public. C est ce qui distingue cet export de celui
           * des commandes — et ce qui justifie qu il n ait pas de plafond de
           * debit. Le jour ou quelqu un ajouterait la colonne par commodite,
           * cette ligne deviendrait rouge.
           */
          const exportColis = await fetch(`${base}/api/envois/export`, { headers: entetesExport });
          /*
           * ⚠️ LES OCTETS, PAS LE TEXTE — ET C EST LA GARDE QUI L A REVELE.
           *
           * `Response.text()` decode en UTF-8 avec `ignoreBOM: false`, donc il
           * RETIRE le BOM : `csv.startsWith("﻿")` est faux meme quand le
           * fichier le porte. Le contröle passait donc au rouge sur un export
           * correct. On lit les trois premiers octets — EF BB BF — qui sont ce
           * qu Excel regarde vraiment.
           */
          const octetsColis = exportColis.ok
            ? new Uint8Array(await exportColis.clone().arrayBuffer())
            : new Uint8Array();
          const bomColis =
            octetsColis[0] === 0xef && octetsColis[1] === 0xbb && octetsColis[2] === 0xbf;
          const csvColis = exportColis.ok ? await exportColis.text() : "";
          controles.push(
            [
              exportColis.status === 200,
              `CONTRE-TEST : l export des colis repond 200 a un vendeur legitime (statut ${exportColis.status})`,
            ],
            [
              (exportColis.headers.get("content-disposition") ?? "").includes("droplink-envois-"),
              "l export des colis propose un telechargement nomme",
            ],
            [
              bomColis && csvColis.includes("numero_de_suivi"),
              "le CSV des colis porte le BOM (EF BB BF) et son en-tete de colonnes",
            ],
            [
              csvColis !== "" && !csvColis.includes("/p/") && !csvColis.includes("lien_public"),
              "AUCUN lien public ne sort dans l export des colis",
            ],
          );

          const passes = statuts.filter((s) => s === 200).length;
          const coupes = statuts.filter((s) => s === 429).length;
          const premierRefus = statuts.indexOf(429);

          controles.push(
            // CONTRE-TEST D ABORD : une suite ou tout est refuse passe a 100 % sans
            // rien prouver. Le vendeur doit d abord pouvoir exporter.
            [passes > 0, `CONTRE-TEST : l export repond 200 a un vendeur legitime (${passes} fois)`],
            [
              coupes > 0,
              `le plafond de l export MORD (${coupes} refus sur 12, statuts ${statuts.join(",")})`,
            ],
            // LA COUPURE EST AU BON ENDROIT, pas seulement quelque part : un
            // plafond qui mordrait des la premiere requete casserait le produit, et
            // un plafond qui ne mordrait qu a la douzieme ne bornerait rien.
            [
              premierRefus >= 5 && premierRefus <= 11,
              `la coupure tombe apres ${premierRefus} exports, pas des le premier`,
            ],
            // ET ELLE TIENT : une fois coupe, ca reste coupe dans la fenetre.
            [
              statuts.slice(premierRefus).every((s) => s === 429),
              "une fois coupe, le compteur ne se rouvre pas dans la meme fenetre",
            ],
          );
        }
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
        /*
         * ═════════════════════════════════════════════════════════════════════
         * UNE COMMANDE INTROUVABLE NE S APPELLE PAS « NOUVELLE COMMANDE »
         * ═════════════════════════════════════════════════════════════════════
         *
         * Defaut mesure le 02/09/2026, avec une vraie session :
         *
         *   /fr/commandes/00000000-…   200 · titre « Nouvelle commande »
         *   /fr/commandes/pas-un-uuid  200 · titre « Nouvelle commande »
         *
         * Trois choses fausses d un coup. Le TITRE affirmait une commande neuve
         * — le libelle ecrit pour l instant qui SUIT une creation. Le CORPS
         * servait la page d erreur native de Next, « This page could not be
         * found », en anglais en dur et hors du canevas, sur une locale
         * francaise. Et sans JavaScript, le squelette de chargement restait a l
         * ecran sans jamais se resoudre.
         *
         * Le cas n est pas theorique : une URL d editeur perimee est un lien
         * colle dans une conversation, ou un onglet garde ouvert apres une
         * suppression.
         *
         * ⚠️ LES DEUX LANGUES SONT EPROUVEES, et dans les deux sens. Une page
         * qui rendrait toujours le francais passerait un controle mono-langue —
         * c est exactement le defaut voisin corrige le meme jour sur la page
         * client, ou la frontiere d erreur parlait francais a un vendeur
         * anglophone.
         */
        {
          const absente = "00000000-0000-0000-0000-000000000000";
          const lire = async (langue) => {
            const r = await fetch(`${base}/${langue}/commandes/${absente}`, {
              headers: entetes,
              redirect: "manual",
            });
            const html = r.status === 200 ? await r.text() : "";
            return { statut: r.status, titre: titreDe(html), html };
          };

          const introuvableFr = catalogue.commandes.introuvable;
          const introuvableEn = JSON.parse(
            readFileSync(join(racine, "messages", "en.json"), "utf8"),
          ).commandes.introuvable;

          const sansFr = await lire("fr");
          const sansEn = await lire("en");

          controles.push(
            [
              sansFr.titre === introuvableFr.titre,
              `une commande absente porte son propre titre (titre servi : « ${sansFr.titre} »)`,
            ],
            /*
             * ⚠️ CE CONTROLE CHERCHE DANS LA REPONSE ENTIERE, ET C EST VOULU —
             * mais il a fallu le MESURER pour le savoir.
             *
             * Ce segment porte un `loading.tsx`, donc Next l enveloppe d une
             * frontiere de suspension et STREAME son contenu. Mesure du
             * 03/09/2026 sur la reponse servie : le squelette ne contient ni
             * `<main>` ni `<h1>` — 28 848 octets bruts, 7 706 hors `<script>`,
             * et pas une ligne du corps de l ecran. L ecran arrive par la
             * charge, et le navigateur le rend.
             *
             * Filtrer les `<script>` ici rendrait donc le controle rouge sur un
             * produit qui marche. Ce qu il doit etablir est autre chose : que
             * c est bien NOTRE page traduite qui est servie, et non celle de
             * Next — « This page could not be found », en anglais en dur, hors
             * canevas, sur une locale `fr`. C est la regression exacte que
             * `not-found.tsx` a ete ecrit pour fermer.
             *
             * LE REFUS DE NEXT EST DONC EXIGE EN NEGATIF, dans la foulee : sans
             * lui, une page qui servirait LES DEUX passerait le controle
             * positif.
             */
            [
              sansFr.html.includes(introuvableFr.texte),
              "et son corps est la page traduite (servie dans la charge, ce segment etant streame)",
            ],
            /*
             * ⚠️ J AI ESSAYE D EXIGER ICI QUE « This page could not be found »
             * SOIT ABSENT DE LA REPONSE, ET C ETAIT FAUX.
             *
             * La chaine y est deux fois — mesure du 03/09/2026 — mais UNIQUEMENT
             * dans la charge, jamais dans le squelette servi : c est le
             * composant de repli que Next embarque dans l arbre de routage pour
             * les segments SANS `not-found.tsx` a eux. Elle ne s affiche pas, et
             * elle y serait encore si notre page etait parfaite.
             *
             * CE QUI DISTINGUE VRAIMENT NOTRE PAGE DE CELLE DE NEXT EST DEJA
             * CONTROLE, et par egalite EXACTE : le titre servi. Celui de Next
             * est « 404: This page could not be found. » — un titre different du
             * notre fait echouer le controle du dessus, dans les deux langues.
             * Un controle de plus, qui rougirait sur un artefact normal du
             * cadre, serait une alerte qu on apprend a ignorer.
             */
            [
              sansEn.titre === introuvableEn.titre,
              `en anglais aussi (titre servi : « ${sansEn.titre} »)`,
            ],
            // L AUTRE SENS. Sans lui, une page qui rendrait TOUJOURS le francais
            // passerait les trois controles ci-dessus.
            [
              !rendu(sansEn.html).includes(introuvableFr.texte),
              "et la version anglaise ne porte pas le texte francais",
            ],
          );
        }

        const vues = catalogue.commandes.vues;
        const compteursListe = catalogue.commandes.compteurs;
        const pilules = [vues.toutes, vues.enTransit, vues.jamaisOuvertes];
        const cartes = [compteursListe.preparation, compteursListe.enTransit, compteursListe.livrees];

        const pleine = await fetch(`${base}/fr/commandes`, { headers: entetes, redirect: "manual" });
        const htmlPleine = pleine.status === 200 ? await pleine.text() : "";

        /*
         * ── LE LOGO DU VENDEUR EST RENDU DANS SON BLOC DE COMPTE ────────────
         *
         * ⚠️ MONTRE EN CAPTURE PAR WASSIM : disque gris alors que sa marque est
         * configuree. Le layout ne rendait jamais `profil.logoUrl`.
         *
         * ⚠️ ET IL FAUT VERIFIER LA SIGNATURE, PAS SEULEMENT LA PRESENCE.
         * `shops.logo_url` porte une CLE d objet, pas une URL. La rendre brute
         * afficherait une image cassee ET ferait sortir le `shop_id` dans le
         * HTML — c est le defaut exact deja corrige sur la page publique
         * (`lib/page-publique/lecture.ts`). Un controle qui se contenterait de
         * « une balise img existe » serait donc vert sur la version fautive.
         */
        {
          const srcs = [...htmlPleine.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map((m) => m[1]);
          // ⚠️ SANS BARRE DE TETE. La cle brute s ecrit `logos/{shop}/…`, l URL
          // signee `https://…/droplink-media/logos/{shop}/…`. Chercher
          // « /logos/ » ne voyait donc QUE la forme correcte : falsifiee, la
          // sonde annoncait « logo non rendu » au lieu de « cle brute rendue »
          // — elle rougissait pour la mauvaise raison, ce qui envoie corriger
          // au mauvais endroit.
          const logos = srcs.filter((u) => u.includes("logos/"));
          const bruts = logos.filter((u) => !u.includes("X-Amz-Signature"));

          controles.push(
            [
              pleine.status === 200 && htmlPleine.includes(courriel),
              // L adresse du compte connecte est rendue JUSTE SOUS le logo,
              // dans le meme bloc. Si elle manque, ce n est pas le logo qui est
              // en cause : c est que rien de ce bloc n a ete rendu, et les deux
              // controles suivants ne prouveraient alors rien.
              "CONTRE-TEST : le bloc de compte est bien rendu, adresse comprise",
            ],
            [
              logos.length > 0,
              `le logo du vendeur est rendu dans son bloc de compte (vu ${logos.length})`,
            ],
            [
              logos.length > 0 && bruts.length === 0,
              "et son URL est SIGNEE — la cle brute ferait sortir le shop_id" +
                (bruts.length ? ` — ${bruts.length} URL non signee(s)` : ""),
            ],
          );
        }

        const filtree = await fetch(
          `${base}/fr/commandes?q=zzz-aucune-commande-ne-porte-ceci-zzz`,
          { headers: entetes, redirect: "manual" },
        );
        const htmlFiltree = filtree.status === 200 ? await filtree.text() : "";

        // UN TRI RESTREINT, SANS AUCUN FILTRE : le cas ou la puce en doublon
        // apparaissait. Aucun `q`, aucune periode — la rangee de puces ne doit
        // donc pas exister du tout.
        const triSeul = await fetch(`${base}/fr/commandes?tri=jamais-ouvert`, {
          headers: entetes,
          redirect: "manual",
        });
        const htmlTriSeul = triSeul.status === 200 ? await triSeul.text() : "";

        const htmlPleineRendu = rendu(htmlPleine);
        const htmlFiltreeRendu = rendu(htmlFiltree);
        const htmlTriSeulRendu = rendu(htmlTriSeul);

        const tous = (html, liste) => liste.every((v) => html.includes(v));
        const aucun = (html, liste) => liste.every((v) => !html.includes(v));

        controles.push(
          // CONTRE-TEST, EN PREMIER : la liste pleine porte bien les deux.
          [
            pleine.status === 200 && tous(htmlPleineRendu, pilules) && tous(htmlPleineRendu, cartes),
            `la liste pleine porte ses ${pilules.length} vues et ses ${cartes.length} compteurs`,
          ],
          // ET LE RESULTAT VIDE EN EST BIEN UN — sans ca, les deux controles
          // ci-dessous mesureraient deux fois la meme page.
          [
            filtree.status === 200 && !htmlFiltree.includes("<tbody"),
            `le filtre introuvable ne rend aucune ligne (statut ${filtree.status})`,
          ],
          [
            tous(htmlFiltreeRendu, pilules),
            `un resultat VIDE garde ses ${pilules.length} vues cliquables`,
          ],
          [
            tous(htmlFiltreeRendu, cartes),
            `un resultat VIDE garde ses ${cartes.length} compteurs`,
          ],

          /*
           * UN TRI NE PRODUIT PAS DE PUCE DE FILTRE.
           *
           * ⚠️ IL EN PRODUISAIT UNE, EN DOUBLON DE SA PROPRE PILULE : l ecran
           * montrait « Jamais ouvertes » surligne dans la rangee de vues ET,
           * au-dessus, une puce « Vue : jamais ouvertes » dans une rangee
           * intitulee « Filtres actifs ». Les planches n y dessinent que des
           * filtres — recherche, statut, periode ; un tri est une VUE.
           *
           * LE CONTRE-TEST VIENT D ABORD, sinon « aucune rangee de puces »
           * serait vrai d un ecran qui n en rendrait JAMAIS, y compris sur une
           * vraie recherche — et c est cette rangee-la qui donne au vendeur le
           * moyen de retirer un critere sans tout effacer.
           */
          [
            htmlFiltreeRendu.includes(catalogue.commandes.filtresActifsLabel),
            "CONTRE-TEST : une recherche rend bien la rangee « Filtres actifs »",
          ],
          [
            triSeul.status === 200 &&
              !htmlTriSeulRendu.includes(catalogue.commandes.filtresActifsLabel),
            `un TRI seul ne rend AUCUNE rangee de puces (statut ${triSeul.status})`,
          ],
          [
            tous(htmlTriSeulRendu, [vues.jamaisOuvertes]),
            "et sa pilule de vue est bien la, seule a nommer la restriction",
          ],
          // L AUTRE SENS : ce qui n a rien a outiller reste cache.
          [
            aucun(htmlFiltree, [catalogue.commandes.lot.exporter]),
            "un resultat VIDE n offre pas d export — il n y a rien a exporter",
          ],
        );

        /*
         * LES QUATRE VUES SONT UN CHOIX UNIQUE, ET ELLES GARDENT LA RECHERCHE.
         *
         * ⚠️ DEFAUT MONTRE EN CAPTURE PAR WASSIM LE 03/09/2026 : on clique
         * « En transit », puis « Bloquees », et les DEUX pilules restent
         * allumees, la rangee « Filtres actifs » apparait, et la liste affiche
         * « Aucune commande ne correspond ». Les planches n en dessinent
         * pourtant qu UNE allumee depuis le debut.
         *
         * ⚠️ ET LA SONDE QUI OCCUPAIT CETTE PLACE ENCODAIT LA MAUVAISE REGLE.
         * Elle exigeait qu une vue « ne perde aucun critere » — ce qui est faux
         * d une vue : une vue REMPLACE une autre vue, donc elle DOIT effacer le
         * statut ou le tri que la precedente avait pose. C est en la rendant
         * verte que j ai retire le `statut: null` de « Bloquees », et donc que
         * j ai casse l exclusivite. Une sonde qui decrit mal l invariant ne
         * protege pas le produit : elle le tire vers son erreur.
         *
         * L INVARIANT JUSTE, EN TROIS MORCEAUX :
         *   1. exactement UNE pilule est allumee, quoi qu on ait clique ;
         *   2. les quatre pilules gardent ce qui ne leur appartient pas — la
         *      recherche, la periode, les archives ;
         *   3. aucune puce ne redit ce qu une pilule dit deja.
         */
        {
          const lireVues = async (params) => {
            const r = await fetch(`${base}/fr/commandes?${params}`, {
              headers: entetes,
              redirect: "manual",
            });
            const html = r.status === 200 ? await r.text() : "";
            const vu = rendu(html);
            /*
             * ⚠️ LE CONTENU DE L ONGLET N EST PLUS DU TEXTE NU. Depuis que trois
             * des quatre vues portent une pastille de compte, le lien contient
             * un `<span>` : le motif `([^<]*)</a>` ne trouvait plus AUCUNE
             * balise, et les quatre controles de cette section tombaient en
             * bloc. Le motif accepte donc du balisage a l interieur, et le
             * libelle se lit AVANT la premiere balise — sinon « Toutes » et son
             * compte se colleraient en « Toutes4 », qui ne correspondrait a
             * aucune entree du catalogue.
             */
            const balises = [
              ...vu.matchAll(/<a\s[^>]*href="(\/fr\/commandes(?:\?[^"]*)?)"[^>]*>(.*?)<\/a>/gs),
            ];
            const libellesVues = Object.values(catalogue.commandes.vues);
            const libelleDe = (interieur) => interieur.split("<")[0].trim();
            return {
              statut: r.status,
              vu,
              allumees: balises.filter((m) => m[0].includes('aria-current="true"')).length,
              vues: balises
                .filter((m) => libellesVues.includes(libelleDe(m[2])))
                .map((m) => m[1].replace(/&amp;/g, "&")),
            };
          };

          const surTransit = await lireVues("q=veste&statut=en_transit");
          const surLivre = await lireVues("q=veste&statut=livre");
          // Le statut SEUL : c est le seul cas ou la liste de puces peut etre
          // vide, donc le seul qui eprouve le garde-fou de la rangee.
          const transitSeul = await lireVues("statut=en_transit");
          /*
           * ⚠️ L URL DES CAPTURES DE WASSIM, ET LA SEULE OU LE CUMUL SE VOIT :
           * un statut ET un tri restrictif poses ensemble. Une premiere version
           * de cette sonde n interrogeait que `?statut=en_transit`, ou aucune
           * des deux pilules ne peut se disputer l allumage — falsifiee en
           * rendant les vues cumulables, elle est restee VERTE. Un invariant ne
           * se mesure que sur l etat qui peut le violer.
           */
          const cumul = await lireVues("statut=en_transit&tri=bloquees");

          const libelleFiltres = catalogue.commandes.filtresActifsLabel;
          const puceStatut = (v, valeur) =>
            v.includes(
              catalogue.commandes.puce.statut.replace(
                "{valeur}",
                catalogue.commandes.statut[valeur],
              ),
            );

          controles.push(
            [
              surTransit.statut === 200 && surTransit.vues.length === 4,
              `CONTRE-TEST : les ${surTransit.vues.length} vues sont rendues (statut ${surTransit.statut})`,
            ],
            [
              surTransit.allumees === 1,
              `exactement UNE pilule est allumee (${surTransit.allumees})`,
            ],
            [
              cumul.statut === 200 && cumul.vues.length === 4,
              `CONTRE-TEST : l etat qui cumule statut ET tri rend ses ${cumul.vues.length} vues (statut ${cumul.statut})`,
            ],
            [
              cumul.allumees === 1,
              `et meme la, UNE SEULE pilule est allumee (${cumul.allumees})`,
            ],
            [
              surTransit.vues.every(
                (h) => new URLSearchParams(h.split("?")[1] ?? "").get("q") === "veste",
              ),
              "et les quatre gardent la recherche, qui ne leur appartient pas",
            ],
            [
              surLivre.statut === 200 && puceStatut(surLivre.vu, "livre"),
              "CONTRE-TEST : un statut SANS pilule garde sa puce (« livre »)",
            ],
            [
              surLivre.vu.includes(libelleFiltres),
              "CONTRE-TEST : et la rangee des puces se rend bien",
            ],
            [
              !puceStatut(surTransit.vu, "en_transit"),
              "mais « en transit », qu une pilule allume deja, n a PAS de puce",
            ],
            [
              transitSeul.statut === 200 && transitSeul.allumees === 1,
              `CONTRE-TEST : le statut seul rend bien l ecran (statut ${transitSeul.statut}, ${transitSeul.allumees} pilule allumee)`,
            ],
            [
              !transitSeul.vu.includes(libelleFiltres),
              "et quand ce statut est le SEUL critere, la rangee des puces ne se rend pas du tout",
            ],
          );
        }


        /*
        * LA SURFACE ANGLAISE, BALAYEE PAR VALEUR ET NON PAR NOM.
        *
        * Le produit est bilingue depuis le premier jour et le persona
        * fournisseur est anglophone : l espace vendeur en anglais est un
        * ecran de travail, pas une politesse. Rien ne le verifiait ailleurs
        * que sur trois pages publiques.
        *
        * CHAQUE LIBELLE DONT LA VERSION FRANCAISE DIFFERE DE L ANGLAISE EST
        * UNE SENTINELLE. S il apparait dans le RENDU d une page `/en`, c est
        * du francais servi a un anglophone — et reciproquement. On cherche
        * hors des `<script>` : cette surface EXPEDIE son catalogue, donc le
        * HTML brut porte les deux langues par construction, et un controle
        * sur le brut serait vert quoi qu il arrive.
        *
        * LE CONTRE-TEST VIENT EN PREMIER, et il est indispensable : sans
        * lui, « aucun libelle de l autre langue » serait vrai d une page
        * VIDE, ou d un jeu de sentinelles qui ne correspond a rien de ce que
        * l ecran affiche. On exige donc d abord d en RECONNAITRE.
        */
          {
            const feuilles = (o, prefixe = "") =>
              Object.entries(o).flatMap(([k, v]) =>
                typeof v === "string" ? [[prefixe + k, v]] : feuilles(v, prefixe + k + "."),
              );
            const catalogueEn = JSON.parse(
              readFileSync(join(racine, "messages", "en.json"), "utf8"),
            );
            /*
             * ⚠️ TROIS CATALOGUES. Les sentinelles ne portaient que `fr` et
             * `en` : la boucle ci-dessous, etendue au chinois, aurait cherche
             * `undefined` dans le HTML rendu — un controle qui ne peut pas
             * mordre est pire qu aucun controle, il occupe la place.
             *
             * ⚠️ ET LE SEUIL DE LONGUEUR EST PLUS BAS EN CHINOIS, PAR NATURE :
             * un ideogramme porte ce qu un mot latin met cinq a six caracteres
             * a dire. Exiger 14 caracteres d une chaine chinoise ecarterait la
             * quasi-totalite du catalogue, et le balayage n aurait plus rien a
             * reconnaitre. Le plancher est donc de 5 pour elle — mesure, pas
             * devine : sous ce seuil, une chaine devient assez courte pour
             * apparaitre par hasard dans une autre.
             */
            const catalogueZh = JSON.parse(
              readFileSync(join(racine, "messages", "zh-CN.json"), "utf8"),
            );
            const parCle = new Map(feuilles(catalogueEn));
            const parCleZh = new Map(feuilles(catalogueZh));
            const sentinelles = feuilles(catalogue)
              .map(([cle, vFr]) => ({
                cle,
                fr: vFr,
                en: parCle.get(cle),
                "zh-CN": parCleZh.get(cle),
              }))
              .filter(
                (x) =>
                  typeof x.en === "string" &&
                  typeof x["zh-CN"] === "string" &&
                  x.en !== x.fr &&
                  x["zh-CN"] !== x.fr &&
                  x["zh-CN"] !== x.en &&
                  x.fr.length >= 14 &&
                  x.en.length >= 14 &&
                  x["zh-CN"].length >= 5 &&
                  !x.fr.includes("{") &&
                  !x.en.includes("{") &&
                  !x["zh-CN"].includes("{") &&
                  /*
                   * ⚠️ UNE SEULE EXCEPTION, ET ELLE EST LE CONTRAIRE D UN TROU.
                   *
                   * `marque.apercuPour` est le libelle de l APERCU « ce que voit
                   * le client » de l ecran de marque. Depuis le 06/09/2026 il est
                   * rendu dans la langue de `shops.default_language`, PAS dans
                   * celle de l URL — c est la correction du defaut rapporte par
                   * Wassim, ou trois surfaces disaient « anglais » et la page
                   * client rendait « francais ».
                   *
                   * Le balayage ci-dessous cherche des FUITES : un libelle de
                   * l autre langue la ou il n a rien a faire. Celui-la n est pas
                   * une fuite, c est le contenu qu on montre DELIBEREMENT dans la
                   * langue du client. Le laisser ici ferait rougir la sonde sur le
                   * produit corrige — et on apprendrait a l ignorer.
                   *
                   * IL N EST PAS SIMPLEMENT RETIRE : le controle dedie qui suit
                   * ce balayage EXIGE qu il suive la boutique, dans les DEUX SENS,
                   * en basculant reellement `default_language`. Une exception
                   * muette aurait ouvert une porte ; celle-ci la referme plus
                   * fort qu elle ne l ouvre.
                   */
                  x.cle !== "marque.apercuPour",
              );

            /*
             * LUES DANS LES CATALOGUES, JAMAIS RECOPIEES. Une sentinelle ecrite
             * en dur survit a la retraduction de la cle qu elle surveille : le
             * controle cesse alors de mordre sans jamais echouer. Ce projet l a
             * deja paye — une falsification a menti dans le sens rassurant parce
             * que la sentinelle avait ete recopiee de memoire.
             */
            const APERCU_FR = catalogue.marque.apercuPour;
            const APERCU_EN = catalogueEn.marque.apercuPour;

            const ecrans = ["/commandes", "/envois", "/analyses", "/marque"];
            const bilan = [];
            for (const ecran of ecrans) {
              /*
               * ⚠️ TROIS LANGUES, PAS DEUX. Le chinois est entre dans `LANGUES`
               * le 06/09/2026 et AUCUN ecran authentifie n avait jamais ete
               * rendu dans cette langue : ce sont pourtant eux qui portent la
               * quasi-totalite du catalogue. Un ecran qui aurait cesse de se
               * rendre en `zh-CN` — routage, sous-tag, cle manquante — serait
               * passe inapercu, portes vertes.
               */
              for (const langue of ["fr", "en", "zh-CN"]) {
                const r = await fetch(`${base}/${langue}${ecran}`, {
                  headers: entetes,
                  redirect: "manual",
                });
                const html = r.status === 200 ? await r.text() : "";
                const vu = rendu(html);
                /*
                 * ⚠️ CE TERNAIRE ETAIT BINAIRE — `langue === "fr" ? "fr" : "en"`.
                 * Avec une troisieme langue il aurait attendu de l ANGLAIS sur
                 * un ecran chinois, et le controle serait devenu du bruit.
                 * La sentinelle interdite est celle d une AUTRE langue, choisie
                 * explicitement : on cherche une fuite, pas une coincidence.
                 */
                const attendue = langue;
                const interdite = langue === "fr" ? "en" : "fr";
                bilan.push({
                  ecran,
                  langue,
                  statut: r.status,
                  /*
                   * ⚠️ CE MOTIF N ACCEPTAIT QUE DES MINUSCULES — `[a-z-]+` — et
                   * il a ACCUSE UN PRODUIT CORRECT. Sur `lang="zh-CN"` il ne
                   * trouve rien, rend « ? », et la sonde a declare fautifs les
                   * quatre ecrans authentifies chinois alors qu ils repondaient
                   * 200 et portaient le bon attribut.
                   *
                   * C est le pire genre de rouge : il DESIGNE un coupable, et
                   * il aurait envoye chercher un defaut de routage la ou il n y
                   * en avait pas. Le sous-tag de region s ecrit en majuscules
                   * par convention (BCP 47) — le seul code de langue du produit
                   * qui en porte un est justement celui qu on vient d ajouter.
                   */
                  lang: (/<html[^>]*lang="([A-Za-z-]+)"/.exec(html) ?? [, "?"])[1],
                  reconnus: sentinelles.filter((x) => vu.includes(x[attendue])).length,
                  fuites: sentinelles.filter(
                    (x) => vu.includes(x[interdite]) && !vu.includes(x[attendue]),
                  ),
                });
              }
            }

            const totalReconnus = bilan.reduce((n, b) => n + b.reconnus, 0);
            const fuites = bilan.flatMap((b) =>
              b.fuites.map((f) => `${b.langue}${b.ecran} : ${f.cle}`),
            );
            const langsFaux = bilan.filter((b) => b.lang !== b.langue);
            const nonServis = bilan.filter((b) => b.statut !== 200);

            controles.push(
              [
                nonServis.length === 0,
                `les ${bilan.length} pages du balayage bilingue repondent 200` +
                  (nonServis.length === 0
                    ? ""
                    : ` (fautives : ${nonServis.map((b) => b.langue + b.ecran + "=" + b.statut).join(", ")})`),
              ],
              [
                sentinelles.length > 200 && totalReconnus > 0,
                `CONTRE-TEST : ${sentinelles.length} sentinelles comparables, ${totalReconnus} reconnues dans les rendus`,
              ],
              [
                langsFaux.length === 0,
                `chaque page porte l attribut lang de son URL` +
                  (langsFaux.length === 0
                    ? ""
                    : ` (fautives : ${langsFaux.map((b) => b.langue + b.ecran + '=' + b.lang).join(", ")})`),
              ],
              [
                fuites.length === 0,
                `aucune page ne sert un libelle de l AUTRE langue` +
                  (fuites.length === 0 ? "" : ` (${fuites.slice(0, 6).join(" | ")})`),
              ],
            );

            /*
             * ═══════════════════════════════════════════════════════════════
             * L APERCU « CE QUE VOIT LE CLIENT » SUIT LA BOUTIQUE, PAS L URL
             * ═══════════════════════════════════════════════════════════════
             *
             * ⚠️ DEFAUT RAPPORTE PAR WASSIM LE 06/09/2026 : « quand je suis sur
             * le SaaS anglais et que je clique sur la page client, ca me
             * redirige vers la page client en francais ».
             *
             * La page client etait JUSTE — elle vit hors du segment [locale] et
             * prend `shops.default_language`. Ce qui mentait, ce sont les ecrans
             * qui promettent de la montrer : sur `/en/marque`, un selecteur
             * intitule « Customer page language » regle sur « French », et a
             * vingt pixels un apercu affichant « Your order ».
             *
             * CE CONTROLE BASCULE REELLEMENT `default_language` ET EPROUVE LES
             * DEUX SENS. Verifier seulement que `/en/marque` rend du francais
             * laisserait passer une correction qui figerait tout en francais —
             * c est-a-dire un produit ou le reglage ne servirait a rien.
             */
            {
              const apercuDe = async (urlLangue) => {
                const r = await fetch(`${base}/${urlLangue}/marque`, {
                  headers: entetes,
                  redirect: "manual",
                });
                const vu = rendu(r.status === 200 ? await r.text() : "");
                return { statut: r.status, fr: vu.includes(APERCU_FR), en: vu.includes(APERCU_EN) };
              };

              const { data: boutique } = await service
                .from("shops")
                .select("id, default_language")
                .eq("owner_id", profilFumee)
                .single();
              const origine = boutique?.default_language ?? "fr";

              await service.from("shops").update({ default_language: "en" }).eq("id", boutique.id);
              // URL FRANCAISE, BOUTIQUE ANGLAISE : l apercu doit dire l anglais.
              const urlFrBoutiqueEn = await apercuDe("fr");

              await service.from("shops").update({ default_language: "fr" }).eq("id", boutique.id);
              // URL ANGLAISE, BOUTIQUE FRANCAISE : c est le cas exact de Wassim.
              const urlEnBoutiqueFr = await apercuDe("en");

              await service
                .from("shops")
                .update({ default_language: origine })
                .eq("id", boutique.id);

              controles.push(
                [
                  urlFrBoutiqueEn.statut === 200 && urlEnBoutiqueFr.statut === 200,
                  `CONTRE-TEST : les deux ecrans de marque repondent 200 (${urlFrBoutiqueEn.statut}, ${urlEnBoutiqueFr.statut})`,
                ],
                [
                  urlFrBoutiqueEn.en && !urlFrBoutiqueEn.fr,
                  `URL /fr, boutique en ANGLAIS : l apercu montre l anglais (en=${urlFrBoutiqueEn.en}, fr=${urlFrBoutiqueEn.fr})`,
                ],
                [
                  urlEnBoutiqueFr.fr && !urlEnBoutiqueFr.en,
                  `URL /en, boutique en FRANCAIS : l apercu montre le francais (fr=${urlEnBoutiqueFr.fr}, en=${urlEnBoutiqueFr.en})`,
                ],
              );
            }
          }

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
        const htmlJournal = journalPromu.status === 200 ? await journalPromu.text() : "";

        /*
         * ⚠️ COMBIEN D ENTREES DE NAVIGATION SONT ALLUMEES — defaut mesure le
         * 12/09/2026, et il vivait la depuis toujours.
         *
         * `estCourante` faisait `chemin === href || chemin.startsWith(href + "/")`.
         * Sur `/fr/admin/journal`, l entree RACINE `/fr/admin` satisfait la
         * seconde branche : DEUX entrees etaient courantes, et deux
         * `aria-current="page"` partaient dans le HTML. Le commentaire du code
         * affirmait pourtant corriger exactement ce cas.
         *
         * Rien ne pouvait le voir tant que le chrome etait sombre : les deux
         * etats ne differaient que par un `bg-white/10`. Le design system peint
         * l entree courante du degrade de marque, et deux degrades cote a cote
         * sautent aux yeux — mais une sonde ne regarde pas, elle compte.
         *
         * DEUX COLONNES SONT RENDUES sur cet ecran, celle du bureau et la barre
         * d onglets du telephone : l entree courante y apparait donc DEUX fois.
         * C est ce nombre-la qu on attend, et le CONTRE-TEST ci-dessous etablit
         * qu on a bien trouve des entrees avant de compter celles qui brillent.
         */
        const entreesJournal = [
          ...htmlJournal.matchAll(/<a\s[^>]*href="\/fr\/admin(?:\/[a-z-]+)?"[^>]*>/g),
        ];
        const allumeesJournal = entreesJournal.filter((m) =>
          m[0].includes('aria-current="page"'),
        ).length;

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
            rendu(htmlPromu).includes(titreAdmin),
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
          [
            entreesJournal.length >= 12,
            `CONTRE-TEST : ${entreesJournal.length} entrees de navigation admin trouvees dans le journal rendu`,
          ],
          [
            allumeesJournal === 2,
            `exactement UNE entree est courante, dans chacune des deux navigations (${allumeesJournal} marques)`,
          ],
          // L AUTRE SENS, AVEC LA MEME SESSION. C est ici que se prouve que le
          // role est relu EN BASE a chaque requete, et non porte par le jeton.
          [
            retrograde.status === 404,
            `retrograde, LE MEME COOKIE ne rouvre plus le panneau (statut ${retrograde.status})`,
          ],
          [
            !rendu(corpsRetrograde).includes(titreAdmin),
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
           * On controle donc la MARQUE de la surface elle-meme, que portent
           * le layout ET le squelette. Le contre-test qui precede est
           * obligatoire : sans lui, un renommage de la marque rendrait ce
           * controle vert a vide.
           *
           * ⚠️ CETTE MARQUE ETAIT `bg-admin`, UNE CLASSE DE COULEUR, ET ELLE A
           * DISPARU LE 12/09/2026 quand le chrome sombre de l administration
           * est passe au design system. Le controle serait devenu vert a vide ;
           * c est son contre-test qui l a attrape. Une sentinelle qui est aussi
           * une valeur d apparence s efface le jour ou l apparence change. La
           * marque est desormais `data-surface="administration"`, qui n a pas
           * d autre emploi que d etre trouvee.
           */
          [
            htmlPromu.includes(MARQUE_ADMIN),
            `CONTRE-TEST : la surface admin porte bien la marque ${MARQUE_ADMIN} quand elle est SERVIE`,
          ],
          [
            !corpsRetrograde.includes(MARQUE_ADMIN),
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
        /*
         * ⚠️ `?_rsc` EN PLUS DE L EN-TETE, ET C EST NEXT 16 QUI L IMPOSE.
         *
         * Jusqu a Next 15, l en-tete `RSC: 1` suffisait a obtenir la charge.
         * Next 16 repond a cet en-tete seul par un `307` vers la MEME adresse
         * suffixee de `?_rsc` — et la sonde, qui suit ses redirections a la
         * main (`redirect: "manual"`, voulu pour les autres controles), lisait
         * donc un corps VIDE. Elle cherchait ses sentinelles dans zero octet :
         * le controle « la note interne ne fuit pas » serait passe au vert sans
         * avoir rien lu, et c est le contre-test de taille qui l a dit.
         *
         * On demande donc l adresse finale directement. L en-tete reste : les
         * deux ensemble marchent sur les deux versions.
         */
        const rscEditeur = (entetes) =>
          fetch(`${base}/fr/commandes/${commandeFumee}?_rsc`, {
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

    /*
     * L EXPORT DES COLIS, POSE LE 12/09/2026 AVEC LA CASE A COCHER DE L ECRAN
     * ENVOIS. Il a sa propre garde, dans son propre fichier : la verifier ici
     * plutot que de supposer qu elle ressemble a celle des commandes est la
     * seule facon de savoir qu elle existe.
     *
     * ⚠️ ET SURTOUT LE CONTRE-TEST POSITIF. Une garde qui refuse tout passe a
     * 100 % sans rien prouver : on verifie d abord qu un vendeur legitime
     * OBTIENT son fichier, avec le bon type et le bon en-tete de
     * telechargement. Sans cela, une route cassee serait indistinguable d une
     * route bien gardee.
     */
    const envoisSansSession = await fetch(`${base}/api/envois/export`, { redirect: "manual" });
    controles.push([
      envoisSansSession.status === 404,
      `l export des colis refuse sans session (statut ${envoisSansSession.status}, attendu 404)`,
    ]);

  }

  {
    // ══════════════════════════════════════════════════════════════════════════
    // L INTERRUPTEUR D INSCRIPTION FERME-T-IL QUELQUE CHOSE ?
    // ══════════════════════════════════════════════════════════════════════════
    //
    // ⚠️ DEUX DEFAUTS MESURES LE 02/09/2026 EN REJOUANT LE VRAI FORMULAIRE.
    //
    //   1. Il ne fermait RIEN. Lu dans `suivreApresSession`, donc APRES
    //      `signUp` : la reponse etait bien `?erreur=fermees` et le compte
    //      naissait quand meme — 1 `auth.users`, 1 `profiles`, 1 `shops`.
    //
    //   2. Il VERROUILLAIT DEHORS des comptes existants. Lu apres
    //      `onboardingAFaire`, il frappait exactement ceux qui n avaient pas
    //      fini leur onboarding — les inscrits les plus recents, c est-a-dire
    //      la population qu une fermeture ne cherche jamais a exclure.
    //
    // ⚠️ ET LA CORRECTION A ECHOUE EN SILENCE AU PREMIER JET, pour une raison
    // qu aucune relecture ne pouvait voir : `anon` n avait pas `EXECUTE` sur
    // `lire_inscriptions_ouvertes`. Appelee apres `signUp` la session existait ;
    // appelee avant, l appelant est `anon` — le seul role qui puisse jamais
    // s inscrire. L appel echouait, la branche de repli laissait entrer, et
    // l ecran se comportait comme si l interrupteur etait ouvert. C est L-027,
    // et c est pour ce genre de defaut que ce controle s EXECUTE.
    const interrupteur = async (valeur) => {
      if (valeur === null) {
        await service.from("system_settings").delete().eq("key", "inscriptions_ouvertes");
      } else {
        await service
          .from("system_settings")
          .upsert({ key: "inscriptions_ouvertes", value: valeur }, { onConflict: "key" });
      }
    };

    // Le formulaire poste en `multipart/form-data` avec ses champs caches : on
    // les rejoue tels quels. C est le chemin SANS JAVASCRIPT du produit, donc
    // exactement ce qu un navigateur envoie.
    const deHtml = (v) =>
      v
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    const champsDuFormulaire = async (chemin) => {
      const page = await (await fetch(`${base}${chemin}`)).text();
      const bloc = /<form[\s\S]*?<\/form>/.exec(page)?.[0] ?? "";
      return [...bloc.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map(
        (m) => [deHtml(m[1]), deHtml(m[2] ?? "")],
      );
    };
    const soumettre = async (chemin, champs, valeurs) => {
      const corps = new FormData();
      for (const [n, v] of champs) corps.set(n, v);
      for (const [n, v] of Object.entries(valeurs)) corps.set(n, v);
      const r = await fetch(`${base}${chemin}`, {
        method: "POST",
        headers: { origin: base, ...visiteur(45) },
        body: corps,
        redirect: "manual",
      });
      return r.headers.get("location") ?? `(statut ${r.status}, pas de redirection)`;
    };

    const champsInscription = await champsDuFormulaire("/fr/inscription");
    const MDP = "Chariot-Lilas-Tempete-91";
    const adresseFermee = `fumee-ferme-${Date.now()}@exemple.test`;
    const adresseOuverte = `fumee-ouvert-${Date.now()}@exemple.test`;
    comptesJetables.push(adresseFermee, adresseOuverte);

    const comptes = async (adresse) => {
      const { data } = await service.auth.admin.listUsers({ perPage: 200 });
      return (data?.users ?? []).filter((u) => u.email === adresse).length;
    };

    controles.push([
      champsInscription.length > 0,
      `CONTRE-TEST : le formulaire d inscription porte ses champs caches (${champsInscription.length})`,
    ]);

    if (champsInscription.length > 0) {
      await interrupteur(0);
      const refus = await soumettre("/fr/inscription", champsInscription, {
        email: adresseFermee,
        motDePasse: MDP,
      });
      const nesPendantFermeture = await comptes(adresseFermee);

      const champsConnexion = await champsDuFormulaire("/fr/connexion");

      await interrupteur(1);
      const succes = await soumettre("/fr/inscription", champsInscription, {
        email: adresseOuverte,
        motDePasse: MDP,
      });
      const nesPendantOuverture = await comptes(adresseOuverte);

      // CE COMPTE N A PAS FAIT SON ONBOARDING : c est exactement celui que
      // l ancien interrupteur verrouillait dehors.
      await interrupteur(0);
      const entree = await soumettre("/fr/connexion", champsConnexion, {
        email: adresseOuverte,
        motDePasse: MDP,
      });
      await interrupteur(null);

      controles.push(
        // CONTRE-TEST D ABORD : sans une inscription qui REUSSIT, « aucun compte
        // n est cree » serait vrai d un formulaire completement casse.
        [
          succes.includes("/bienvenue") && nesPendantOuverture === 1,
          `CONTRE-TEST : inscriptions OUVERTES, le compte est cree (${succes}, ${nesPendantOuverture} compte)`,
        ],
        [
          refus.includes("erreur=fermees"),
          `inscriptions FERMEES : la soumission est refusee (${refus})`,
        ],
        // LA MOITIE QUI MANQUAIT. Le refus a l ecran etait deja vrai AVANT la
        // correction ; ce qui ne l etait pas, c est que rien ne naisse.
        [
          nesPendantFermeture === 0,
          `inscriptions FERMEES : AUCUN compte n est cree (${nesPendantFermeture} trouve)`,
        ],
        /*
         * ⚠️ CE CONTROLE CHERCHAIT LE MOT `erreur=fermees`, ET IL A LAISSE
         * PASSER SA PROPRE FALSIFICATION.
         *
         * En remettant le verrou dans `suivreApresSession` sous un AUTRE motif,
         * le vendeur etait de nouveau renvoye a la porte — et le controle
         * restait vert, parce que le mot qu il cherchait avait change. C est
         * L-020 : *un controle qui cherche un MOT ne prouve rien, il faut
         * interroger l EFFET.*
         *
         * L effet, ici, c est ENTRER : la destination doit etre un ecran du
         * produit. On l exige positivement plutot que d enumerer les refus —
         * une liste de refus se perime a chaque motif ajoute.
         */
        [
          /\/(bienvenue|commandes)(\?|$)/.test(entree),
          `fermer les INSCRIPTIONS ne ferme pas la CONNEXION d un compte existant (${entree})`,
        ],
      );
    }
  }

  {
    /*
     * LES REDIRECTIONS DES ROUTE HANDLERS SONT-ELLES RELATIVES ?
     *
     * ⚠️ DEFAUT MESURE EN PRODUCTION LE 08/09/2026, SUR LA PREMIERE CONNEXION
     * GOOGLE REELLE. Wassim a atterri sur `localhost:8080`,
     * `ERR_CONNECTION_REFUSED`. Les TROIS route handlers redirigeaient vers la
     * machine interne du conteneur :
     *
     *   GET  /fr/auth/retour     -> https://localhost:8080/fr/connexion?erreur=lien
     *   POST /fr/deconnexion     -> https://localhost:8080/fr/connexion?info=deconnecte
     *   POST /fr/commandes/geste -> https://localhost:8080/fr/connexion?erreur=session
     *
     * `NextResponse.redirect()` exige une URL ABSOLUE, donc une base, et la
     * seule disponible etait `requete.url` : l adresse par laquelle le
     * CONTENEUR a ete joint, jamais celle que le navigateur a demandee.
     *
     * ⚠️ CE BLOC EXISTE PARCE QUE LA SONDE QUI REGARDAIT DEJA CE `Location`
     * EST RESTEE VERTE. Elle verifiait que l en-tete CONTIENT
     * `/fr/connexion?info=deconnecte` — et
     * `https://localhost:8080/fr/connexion?info=deconnecte` le contient. Un
     * controle d inclusion ne peut pas voir un prefixe de trop.
     *
     * ⚠️ ET IL NE POUVAIT PAS NON PLUS SE CONTENTER DE COMPARER L HOTE : ici,
     * en local, il n y a pas de proxy, `requete.url` porte le BON hote, et une
     * assertion « l hote est le notre » resterait verte sur le produit casse.
     * La seule propriete verifiable depuis une machine de developpement est
     * que le `Location` ne porte AUCUN hote — c est-a-dire qu il est RELATIF,
     * et que c est le navigateur qui le resout contre l adresse qu il a
     * demandee. C est L-032 : il faut mesurer une propriete que l artefact
     * local partage avec la production.
     */
    const origineNotre = new URL(base).origin;
    const relatives = [
      ["GET /fr/auth/retour", await fetch(`${base}/fr/auth/retour`, { redirect: "manual" })],
      [
        "POST /fr/deconnexion",
        await fetch(`${base}/fr/deconnexion`, {
          method: "POST",
          headers: { origin: origineNotre },
          redirect: "manual",
        }),
      ],
      [
        "POST /fr/commandes/geste",
        await fetch(`${base}/fr/commandes/geste`, {
          method: "POST",
          headers: { origin: origineNotre, "content-type": "application/x-www-form-urlencoded" },
          body: "locale=fr&geste=archiver&id=00000000-0000-0000-0000-000000000000",
          redirect: "manual",
        }),
      ],
    ];

    // CONTRE-TEST D ABORD. Sans lui, « aucun Location absolu » serait
    // indistinguable de « aucune de ces routes n a redirige » — et un ensemble
    // vide passe tout.
    const redirigent = relatives.filter(([, r]) => r.status >= 300 && r.status < 400);
    controles.push([
      redirigent.length === relatives.length,
      `CONTRE-TEST : les ${relatives.length} route handlers redirigent bien (${relatives
        .map(([nom, r]) => `${nom}:${r.status}`)
        .join(", ")})`,
    ]);

    for (const [nom, reponse] of relatives) {
      const lieu = reponse.headers.get("location") ?? "";
      controles.push([
        lieu.startsWith("/") && !lieu.startsWith("//"),
        `${nom} redirige RELATIVEMENT, sans hote (location: ${lieu || "(absent)"})`,
      ]);
    }
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

        /*
         * ── QUELLE DÉRIVÉE LA GRILLE TÉLÉCHARGE RÉELLEMENT ──────────────────
         *
         * ⚠️ POSÉ PARCE QUE LA GARDE EXISTANTE NE POUVAIT PAS VOIR LE DÉFAUT.
         * `tests/unit/page-client-couleurs.test.ts` interroge `apercuDe()`, et
         * le fichier source annonçait qu'elle « s'interroge par l'EFFET, dans
         * les portes ». C'était faux : elle interroge une FONCTION. Tant que la
         * fonction rendait la couverture aux deux surfaces, le test la
         * confirmait et la page servait 900 px dans des tuiles de 197.
         *
         * MESURÉ AU NAVIGATEUR le 03/09/2026 : 77 à 89 Ko par tuile, contre un
         * PLAFOND DUR de 20 Ko. Ce contrôle-ci lit ce que le HTML DEMANDE.
         *
         * ⚠️ LE CONTRE-TEST VIENT EN PREMIER. « Aucune couverture dans les
         * tuiles » est trivialement vrai d'une page sans tuile. Il faut donc
         * établir qu'une vignette est bien demandée avant de dire que la
         * dérivée 900 px ne l'est pas.
         */
        {
          /*
           * ⚠️ ON NE COMPTE QUE LES `src` DES BALISES `img`, ET LA PREMIERE
           * VERSION DE CE CONTROLE COMPTAIT TOUT LE HTML — elle etait rouge sur
           * un produit CORRIGE.
           *
           * L URL de couverture figure NECESSAIREMENT dans la charge
           * d hydratation, en PROPRIETE : c est ainsi que le visionneur la
           * recoit pour l ouvrir en grand. Une propriete ne telecharge rien.
           * Compter les occurrences du texte confondait donc « reference » et
           * « telecharge », et aurait fait corriger un produit qui n avait plus
           * rien. C est L-020 : un controle qui cherche un MOT ne prouve rien,
           * il faut interroger l EFFET — ici, ce que le navigateur ira chercher.
           */
          const srcs = [...html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map((m) => m[1]);
          const vignettes = srcs.filter((u) => u.includes(".vignette.webp")).length;
          const couvertures = srcs.filter((u) => u.includes(".couverture.webp")).length;

          controles.push(
            [
              vignettes > 0,
              `CONTRE-TEST : une balise img demande bien une vignette 200 px (vu ${vignettes})`,
            ],
            /*
             * AUCUNE BALISE NE DEMANDE LA DERIVEE 900 PX, et c est une regle
             * qui a change de forme sans changer de raison. La planche du
             * canevas posait UNE piece en grand, seule autorisee a la demander ;
             * le kit `client_link` dessine une grille UNIFORME de carres, donc
             * plus aucune image n a de raison de peser 900 px. Toute demande
             * est une tuile de 197 px qui telecharge 77 a 89 Ko — la forme
             * exacte du defaut du 03/09, et la seule qui se voie sans
             * navigateur.
             *
             * Le contre-test qui l accompagne est celui des vignettes, juste
             * au-dessus : sans tuile servie, « zero couverture » serait vrai
             * d une page vide.
             */
            [
              couvertures === 0,
              `aucune tuile ne demande la derivee 900 px (vu ${couvertures})`,
            ],
            /*
             * ⚠️ UNE PHOTO SANS DERIVEE DOIT QUAND MEME S AFFICHER.
             *
             * Le jeu porte un troisieme media depourvu de vignette ET de
             * couverture. Avant le 05/09/2026 il ne produisait AUCUNE balise
             * img : la page servait une case vide, et c est ce qu un vrai
             * client a recu. Le repli sert l image pleine — plus lourde, et
             * infiniment preferable a rien.
             */
            [
              srcs.some((u) => u.includes(`${idMediaNu}.jpg`)),
              `une photo SANS derivee est servie par son image pleine (repli)`,
            ],
            /*
             * ET LE REPLI RESTE BORNE AU CAS DEGRADE. Sans ce controle, servir
             * l image pleine PARTOUT passerait le controle ci-dessus a 100 % —
             * et rendrait exactement le defaut du 03/09, ou la grille
             * telechargeait 900 px pour dessiner 197. On exige donc qu UNE
             * SEULE image pleine soit demandee : celle qui n a pas le choix.
             */
            [
              srcs.filter((u) => /\.jpg(\?|$)/.test(u)).length === 1,
              `le repli ne touche QUE le media sans derivee (images pleines demandees : ${srcs.filter((u) => /\.jpg(\?|$)/.test(u)).length})`,
            ],
          );
        }

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

          // ── LES IDENTIFIANTS INTERNES, BORNES LA OU LA FUITE SE PRODUIT ──
          //
          // ⚠️ CETTE BORNE N EXISTAIT QUE SUR L OBJET DE LECTURE.
          // `tests/rls/page-publique.test.ts` la tient sur ce que rend
          // `lire_commande_publique` ; RIEN ne la tenait sur le HTML REELLEMENT
          // SERVI. Un attribut de donnee ajoute a un composant, une charge d
          // hydratation, un identifiant passe en propriete a un ilot client :
          // aucun de ces chemins ne traverse l objet de lecture, et aucune garde
          // ne les regardait.
          //
          // FAIT MESURE LE 02/09/2026 SUR UN BUILD SERVI, sur une vraie commande
          // a un media : 28 occurrences du `shop_id` et 25 de l `order_id` dans
          // le HTML, et ZERO hors des chemins d objet R2. La propriete tient
          // donc aujourd hui — c est precisement le moment de la border, avant
          // qu un ecran suivant ne la perde sans que personne ne le voie.
          //
          // L EXCEPTION EST DECLAREE ET BORNEE, pas subie : une signature S3/R2
          // ne peut pas ne pas porter la cle d objet qu elle signe, et la forme
          // de cette cle est la garde qui empeche un vendeur d ecraser le media
          // d un autre (declencheur `verifier_cles_media`, migration 055). La
          // rendre opaque retirerait la protection la plus forte du stockage
          // pour masquer un UUID sans signification hors de notre base.
          // L arbitrage — deux liens du meme vendeur restent correlables — est a
          // Wassim, et il est ecrit dans le test RLS.
          ...(() => {
            const signees = (html.match(/https?:\/\/[^"'\\\s]+/g) ?? []).filter((u) =>
              u.includes("X-Amz-Signature"),
            );
            /*
             * ON RETIRE LE CHEMIN D OBJET, PAS « L URL SIGNEE ».
             *
             * Premier jet : decouper sur les URL entieres portant
             * `X-Amz-Signature`. Il a laisse UNE occurrence de chaque
             * identifiant, et le contexte imprime a montre qu elle etait
             * pourtant dans une URL R2 — la meme adresse voyage sous PLUSIEURS
             * ecritures dans la meme page (`&` dans la charge d hydratation,
             * `&amp;` dans un attribut, encodages differents), donc un
             * decoupage par CHAINE EXACTE en manque toujours une.
             *
             * L exception declaree porte sur le CHEMIN — `medias/{shop}/…`,
             * `logos/{shop}/…` — et c est donc lui qu on retire, quelle que
             * soit l ecriture de ce qui l entoure.
             */
            const sansUrl = html.replace(
              /(medias|logos)(\/|%2F)[0-9a-f-]{36}(\/|%2F)[0-9a-f-]{36}((\/|%2F)[0-9a-f-]{36})?/gi,
              "[chemin-objet]",
            );
            const compter = (v) => (v ? sansUrl.split(v).length - 1 : -1);
            // UN CONTROLE QUI ECHOUE DOIT DIRE CE QU IL A VU. Sans le contexte,
            // « 1 ailleurs » envoie relire tout un HTML de 50 Ko a la main.
            const ou = (v) => {
              const k = v ? sansUrl.indexOf(v) : -1;
              return k === -1
                ? ""
                : ` — …${sansUrl.slice(Math.max(0, k - 90), k + 40).replace(/\s+/g, " ")}`;
            };
            return [
              // CONTRE-TEST D ABORD, ET IL EST LA RAISON DU MEDIA DE FUMEE :
              // sans une seule URL signee, les deux controles suivants seraient
              // vrais en n ayant rien retire et rien regarde.
              [
                signees.length > 0,
                `CONTRE-TEST : ${signees.length} URL signee(s) dans le HTML servi`,
              ],
              [
                compter(shopFumee) === 0,
                `le shop_id n apparait QUE dans les chemins d objet (${compter(shopFumee)} ailleurs)${ou(shopFumee)}`,
              ],
              [
                compter(commandeFumee) === 0,
                `l order_id n apparait QUE dans les chemins d objet (${compter(commandeFumee)} ailleurs)${ou(commandeFumee)}`,
              ],
            ];
          })(),

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

        /*
         * ⚠️ LE RAPPORTEUR D ERREURS N ATTEINT PAS CETTE PAGE — mesure sur les
         * OCTETS SERVIS, pas sur la source.
         *
         * Sentry est installe cote serveur depuis le 04/09/2026, et toute la
         * justification de ce choix est le budget de cette page : son SDK
         * navigateur couterait 30 a 40 Ko sur 300 dont 102 de socle, pour une
         * page vue une fois, en 4G, depuis un DM. Deux gestes suffiraient a l y
         * faire entrer sans que personne le remarque — creer un
         * `instrumentation-client`, ou envelopper `next.config.ts`.
         *
         * `tests/unit/sentry-ne-fuite-pas.test.ts` verifie qu aucun des deux
         * n existe : c est un controle sur le DEPOT. Celui-ci interroge ce que
         * le navigateur telecharge vraiment, ce qu aucune lecture de source ne
         * peut etablir — *un controle qui cherche un MOT ne prouve rien.*
         */
        const contenuDesRefs = [];
        for (const u of refs) contenuDesRefs.push(await (await fetch(base + u)).text());
        const scripts = contenuDesRefs.join("");

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
          // CONTRE-TEST : la sonde lit-elle seulement quelque chose ? A vide,
          // « aucune trace de Sentry » serait vrai de fichiers jamais telecharges.
          [
            scripts.length > 50_000,
            `CONTRE-TEST : ${ko(Buffer.byteLength(scripts))} Ko de script reellement lus`,
          ],
          [
            !/sentry/i.test(scripts) && !/sentry/i.test(html),
            "aucun octet de Sentry n atteint le navigateur sur la page client",
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
          // ⚠️ `x-real-ip`, PAS `cf-connecting-ip` : ce serveur tourne en
          // `BORD_DE_CONFIANCE=railway` (voir plus haut), le mode de la cible de
          // deploiement. Chaque mode ne croit QU UN en-tete et ne se replie sur
          // aucun autre : une sonde qui poserait le mauvais ne compterait RIEN —
          // donc mesurerait zero unite et conclurait a une sous-consommation.
          const adresseQuota = {
            "x-real-ip": `10.${port % 250}.201.7`,
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
        /*
         * ═══════════════════════════════════════════════════════════════════
         * LA PAGE CLIENT PARLE LA LANGUE DU VENDEUR — Y COMPRIS QUAND ELLE
         * TOMBE EN ERREUR
         * ═══════════════════════════════════════════════════════════════════
         *
         * Defaut mesure le 02/09/2026. Cette page vit HORS du segment
         * `[locale]` — la langue est celle du VENDEUR, pas de l URL — donc
         * `requestLocale` est absent et le catalogue expedie a la frontiere
         * d erreur retombait sur la langue par defaut du routage, le francais.
         * Boutique en anglais, page servie : `lang="en"`, corps integralement
         * anglais, et dans la charge d hydratation « Cette page n a pas pu s
         * afficher ».
         *
         * Le client d un vendeur anglophone recevait donc, en cas d erreur de
         * rendu, une page en FRANCAIS dans un document `lang="en"` — le miroir
         * exact du defaut que cette frontiere a ete creee pour fermer.
         *
         * ⚠️ ON EPROUVE LES DEUX SENS. Verifier seulement l anglais laisserait
         * passer une correction qui forcerait TOUT en anglais.
         */
        {
          const langueDe = async () => {
            const r = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(14) });
            const html = await r.text();
            return {
              statut: r.status,
              lang: (html.match(/<html lang="([^"]*)"/) ?? [])[1] ?? "",
              fr: /Cette page n'a pas pu s.afficher/.test(html),
              en: /This page could not be displayed/.test(html),
            };
          };

          const { data: boutiqueFumee } = await service
            .from("shops")
            .select("id, default_language")
            .eq("owner_id", profilFumee)
            .single();
          const langueOrigine = boutiqueFumee?.default_language ?? "fr";

          await service.from("shops").update({ default_language: "en" }).eq("id", boutiqueFumee.id);
          const enAnglais = await langueDe();
          await service.from("shops").update({ default_language: "fr" }).eq("id", boutiqueFumee.id);
          const enFrancais = await langueDe();
          await service
            .from("shops")
            .update({ default_language: langueOrigine })
            .eq("id", boutiqueFumee.id);

          controles.push(
            [
              enAnglais.lang === "en" && enAnglais.en && !enAnglais.fr,
              `boutique en anglais : lang="${enAnglais.lang}" et la frontiere d erreur est en anglais`,
            ],
            // L AUTRE SENS, et il est obligatoire : une correction qui forcerait
            // tout en anglais passerait le controle ci-dessus a 100 %.
            [
              enFrancais.lang === "fr" && enFrancais.fr && !enFrancais.en,
              `boutique en francais : lang="${enFrancais.lang}" et la frontiere d erreur est en francais`,
            ],
          );
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
        // `x-real-ip` est pose ici parce que c est ce que fait le bord en
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
          [
            invalide.status === 404,
            // LE SIGNALEMENT PORTE SA VALEUR. Sans le statut observe, un echec ici
            // ne dit pas si la route a repondu 200 (defaut reel), 429 (plafond
            // atteint par les controles precedents) ou autre chose — et l on
            // choisit alors entre « regression » et « incident » en devinant.
            `une decision inventee ne se distingue pas d un jeton inconnu (statut ${invalide.status})`,
          ],
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

      /*
       * ═══════════════════════════════════════════════════════════════════
       * LE PLANIFICATEUR EST LANCE POUR DE VRAI — pas inspecte, EXECUTE
       * ═══════════════════════════════════════════════════════════════════
       *
       * ⚠️ RIEN N EXECUTAIT `deploiement/planificateur.mjs` AVANT LE 04/09/2026.
       * `tests/unit/deploiement.test.ts` lit sa SOURCE : que les routes existent,
       * que les deux services portent des taches distinctes, qu il sorte en
       * erreur. Aucun de ces controles ne prouve qu un passage ABOUTIT — *un
       * test qui constate qu une declaration existe ne prouve jamais que son
       * absence bloque* (L-018).
       *
       * Or ce fichier est le SEUL lien entre Railway et le produit : c est lui,
       * et rien d autre, qui fait avancer le suivi de tous les vendeurs. Une
       * faute dedans ne casse aucune porte, ne leve nulle part, et se lit comme
       * un produit qui marche avec un suivi fige.
       *
       * ON LANCE DONC LE VRAI FICHIER, avec la vraie commande, contre ce serveur.
       * Les deux taches, et le CONTRE-TEST du mauvais secret : sans lui, « sort
       * en succes » serait aussi vrai d un script qui ne regarde jamais la
       * reponse.
       */
      {
        const lancer = (tache, secret) => {
          try {
            return {
              code: 0,
              sortie: execSync(`node ${join("deploiement", "planificateur.mjs")} ${tache}`, {
                encoding: "utf8",
                stdio: "pipe",
                env: { ...process.env, PLANIFICATEUR_BASE_URL: base, CRON_SECRET: secret },
              }),
            };
          } catch (e) {
            return { code: e.status ?? -1, sortie: String(e.stdout ?? "") + String(e.stderr ?? "") };
          }
        };

        for (const tache of ["cadence", "veille"]) {
          const bon = lancer(tache, SECRET_CRON);
          const faux = lancer(tache, "ce-secret-n-est-pas-le-bon");
          controles.push(
            [bon.code === 0, `planificateur ${tache} : un passage aboutit (code ${bon.code})`],
            [
              bon.sortie.includes("[planificateur] " + tache + " : 200 en") &&
                              bon.sortie.includes(" ms"),
              `planificateur ${tache} : il ecrit la ligne qu on cherchera dans les journaux Railway`,
            ],
            // CONTRE-TEST. Le 404 d un secret refuse est identique a celui d une
            // route inconnue, par conception : sans code de sortie non nul, une
            // faute de frappe dans le secret produirait des passages « reussis »
            // a jamais.
            [faux.code === 1, `planificateur ${tache} : un MAUVAIS secret sort en ERREUR (code ${faux.code})`],
            [
              faux.sortie.includes("statut 404") && faux.sortie.includes("secret refus"),
              `planificateur ${tache} : le 404 est NOMME « secret refuse », jamais pris pour une route disparue`,
            ],
          );
        }

        // Une tache inconnue sort en 2, DISTINCT de l echec d appel : les deux
        // se corrigent a des endroits differents.
        const inconnue = lancer("cadance", SECRET_CRON);
        controles.push([
          inconnue.code === 2,
          `planificateur : une tache mal orthographiee sort en 2, jamais en 0 (code ${inconnue.code})`,
        ]);
      }

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

          /*
           * ⚠️ ET LE NUMERO SUR LA COMMANDE, QUE CE JEU N AVAIT JAMAIS POSE.
           *
           * Le produit ne cree pas un colis a partir de rien : le vendeur TAPE
           * le numero dans sa commande, et `lib/tracking/attache.ts` le RELIT
           * la (`select("tracking_number, carrier_code")`) pour attacher le
           * colis. La sonde, elle, inserait le colis directement et laissait
           * `orders.tracking_number` vide — un etat que le produit ne peut pas
           * produire.
           *
           * Consequence attrapee le 04/09/2026 : le controle « le vendeur
           * retrouve sa commande en cherchant le numero de suivi » etait rouge,
           * et il aurait ete lu comme un defaut de la RECHERCHE. C est
           * l index d expression de la migration 008 qui indexe
           * `coalesce(tracking_number, '')` SUR LA COMMANDE — il ne pouvait
           * rien trouver puisque la colonne etait vide.
           *
           * Un jeu de mesure qui ne reproduit pas ce que le produit ecrit fait
           * accuser le produit a sa place.
           */
          await service
            .from("orders")
            .update({ tracking_number: numeroEcriture })
            .eq("id", commandeFumee);

          /*
           * L ETAT « EXPEDIE, PAS ENCORE SCANNE », SUR LA PAGE REELLEMENT
           * SERVIE — et son basculement quand le transporteur parle enfin.
           *
           * ⚠️ RIEN NE COUVRAIT CET ETAT, qui est celui de CHAQUE commande dans
           * ses premiers jours : numero colle, zero passage. La carte « Suivi »
           * s y reduisait a un numero seul, et la carte d etat perdait son
           * titre. Un ecran qu on peut retirer sans qu aucune porte ne rougisse
           * est un ecran qui finira par etre retire.
           *
           * LE CONTROLE EST A DEUX SENS, et c est le point : ici le bloc d
           * attente DOIT etre la et la frise des passages ABSENTE ; apres la
           * notification, l inverse. Une sonde qui n exigerait que la presence
           * passerait sur une page qui affiche les DEUX.
           *
           * ET IL ETABLIT LA MISE A JOUR AUTOMATIQUE PAR EXECUTION : la meme
           * URL, sans invalidation de cache ni action du vendeur, rend un autre
           * contenu une fois le transporteur passe. C est la promesse du
           * produit, mesuree sur le HTML servi et non sur une intention.
           */
          const avantScan = await (
            await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(21) })
          ).text();
          controles.push(
            [
              avantScan.includes(numeroEcriture),
              "CONTRE-TEST : la carte de suivi est bien rendue (le numero y est)",
            ],
            [
              avantScan.includes("En attente du transporteur"),
              "sans aucun passage, la page NOMME l attente au lieu d un numero seul",
            ],
            [
              !avantScan.includes("Departed from facility"),
              "et elle n annonce evidemment aucun passage",
            ],

            /*
             * LA CARTE D ETAT NE PEUT PAS RESTER MUETTE.
             *
             * ⚠️ SANS ARRIVEE CALCULABLE, la carte du canevas se reduisait a une
             * ligne sourdine — le PREMIER objet de la page au telephone. Depuis
             * le kit `client_link`, c est le BANDEAU qui dit l etat en une
             * phrase, et il ne depend d aucune estimation : sa presence prouve
             * que la carte parle, et l absence de « Date estimee de livraison »
             * prouve qu on n a rien invente pour la remplir.
             */
            [
              ["Votre commande est en préparation", "Votre colis a été expédié", "Votre colis est en transit", "Votre colis a été livré", "Aucun mouvement depuis"].some((b) => avantScan.includes(b)),
              "sans arrivee calculable, la carte d etat porte son bandeau d etat",
            ],
            [
              !avantScan.includes("Date estimée de livraison"),
              "et AUCUNE arrivee n est annoncee — on ne fabrique pas de date",
            ],
          );

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
                  time_utc: instantISO(-3),
                  description: "Departed from facility",
                  location: "SHENZHEN",
                },
                milestone: [{ key_stage: "Departure", time_utc: instantISO(-3) }],
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

          // LE MEME LIEN, APRES LE PASSAGE DU TRANSPORTEUR. Aucune invalidation
          // n est declenchee entre les deux lectures : la fraicheur tient a ce
          // que cette page est DYNAMIQUE, et c est cette propriete-la qui est
          // mesuree ici, sur le contenu servi et non sur un en-tete.
          const apresScan = await (
            await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(22) })
          ).text();
          controles.push(
            [
              apresScan.includes("Departed from facility"),
              "le MEME lien rend le passage du transporteur, sans que personne n ait invalide quoi que ce soit",
            ],
            [
              !apresScan.includes("En attente du transporteur"),
              "et le bloc d attente a disparu — les deux etats ne coexistent jamais",
            ],
          );

          /*
           * ── LE PASSAGE REMONTE-T-IL JUSQU AUX ECRANS DU VENDEUR ? ──────────
           *
           * ⚠️ CE BLOC MANQUAIT, ET C EST WASSIM QUI A POSE LA QUESTION le
           * 04/09/2026 : « sois sur que quand un utilisateur met une commande
           * avec le numero de suivi, ca auto-update sur la page finale client
           * ET dans commandes ET dans envois cote utilisateur ».
           *
           * La sonde s arretait a la page CLIENT. Or la chaine ne s y arrete
           * pas : `appliquer_etat_colis` (migration 090) ecrit aussi
           * `orders.status`, avec un `greatest()` qui implemente EN BASE la
           * regle « le statut ne recule jamais ». Rien ne verifiait cette
           * seconde ecriture, ni son affichage — le vendeur aurait pu voir
           * « Preparation » sur une commande que son client voit « en transit ».
           *
           * ⚠️ LES DEUX CONTRE-TESTS VIENNENT EN PREMIER, et ils ne sont pas
           * decoratifs : « la page ne dit plus Preparation » est trivialement
           * vrai d une page qui ne rend RIEN — une redirection vers la
           * connexion, par exemple, ce qui est exactement ce qu on obtient si
           * le cookie a expire en cours de sonde.
           */
          // ⚠️ UNE SESSION FRAICHE, PAS CELLE DU DEBUT DE SUITE. Le jeton
          // d acces vaut une heure et ce bloc arrive bien plus tard : le
          // cookie initial lisait 307, donc la connexion et non l ecran.
          const cookieSuivi = await ouvrirSessionVendeur();
          if (cookieSuivi) {
            const entetesSuivi = { cookie: cookieSuivi, ...visiteur(24) };

            const { data: commandeApres } = await service
              .from("orders")
              .select("status")
              .eq("id", commandeFumee)
              .maybeSingle();

            const listeFiltree = await fetch(
              `${base}/fr/commandes?q=${encodeURIComponent(numeroEcriture)}`,
              { headers: entetesSuivi, redirect: "manual" },
            );
            const htmlListe = listeFiltree.status === 200 ? await listeFiltree.text() : "";

            const envois = await fetch(`${base}/fr/envois`, {
              headers: entetesSuivi,
              redirect: "manual",
            });
            const htmlEnvois = envois.status === 200 ? await envois.text() : "";

            controles.push(
              [
                listeFiltree.status === 200 && htmlListe.includes("Client de fumee"),
                `CONTRE-TEST : l ecran Commandes repond a la session (statut ${listeFiltree.status})`,
              ],
              [
                envois.status === 200 && htmlEnvois.length > 2000,
                `CONTRE-TEST : l ecran Envois repond a la session (statut ${envois.status})`,
              ],
              /*
               * LA SECONDE ECRITURE. Le colis a avance — c est deja verifie
               * plus haut — mais c est la COMMANDE qu on regarde ici : sans
               * cette ligne, le suivi vivrait dans `tracked_parcels` sans que
               * la commande ne bouge, et les deux ecrans du vendeur mentiraient
               * en accord parfait avec eux-memes.
               */
              [
                commandeApres !== null && commandeApres.status !== "preparation",
                `le suivi a fait AVANCER la commande elle-meme (${commandeApres?.status ?? "illisible"})`,
              ],
              /*
               * Le numero de suivi est un critere de recherche declare au
               * brief, au meme titre que le nom du client et la reference.
               * Le verifier ici plutot qu ailleurs a un avantage : c est le
               * SEUL moment de la sonde ou un vrai numero existe en base.
               */
              [
                htmlListe.includes("Client de fumee"),
                "et le vendeur retrouve sa commande EN CHERCHANT LE NUMERO DE SUIVI",
              ],
              [
                htmlEnvois.includes(numeroEcriture),
                "l ecran Envois porte le numero du colis suivi",
              ],
            );
          }

          /*
           * LE CONTRE-TEST DE LA CARTE D ETAT : une arrivee ANNONCEE.
           *
           * Sans lui, « le surtitre Statut est la » serait vrai d une page qui
           * l afficherait TOUJOURS, y compris par-dessus une vraie date — et
           * c est precisement la substitution que la decision 26 interdit. Une
           * troisieme notification, portant cette fois une fourchette
           * d arrivee, doit faire basculer la carte dans l autre sens.
           */
          const corpsEta = JSON.stringify({
            event: "TRACKING_UPDATED",
            data: {
              number: numeroEcriture,
              carrier: 3011,
              track_info: {
                latest_status: { status: "InTransit" },
                latest_event: {
                  time_utc: instantISO(-2),
                  description: "Arrived at destination country",
                  location: "PARIS",
                },
                time_metrics: {
                  estimated_delivery_date: { from: jourISO(-1), to: jourISO(2) },
                },
              },
            },
          });
          const signatureEta = createHash("sha256")
            .update(corpsEta + "/" + CLE_SUIVI, "utf8")
            .digest("hex");
          await fetch(`${base}/api/suivi/notification`, {
            method: "POST",
            headers: { "content-type": "application/json", sign: signatureEta },
            body: corpsEta,
          });
          const avecEta = await (
            await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(23) })
          ).text();
          controles.push(
            [
              avecEta.includes("Date estimée de livraison"),
              "CONTRE-TEST : quand le transporteur annonce une arrivee, la carte la porte",
            ],
            [
              avecEta.includes(">Date estimée<"),
              "et la carte de livraison la reprend sur sa ligne — une seule verite, deux endroits",
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

  // LES COMPTES DES SONDES, ET L INTERRUPTEUR QU ELLES ONT BAISSE. Le laisser a
  // zero fermerait les inscriptions du projet jusqu a ce que quelqu un s en
  // apercoive — c est-a-dire jusqu a ce qu un vrai vendeur n arrive pas a
  // s inscrire, sans que rien ne le signale.
  if (comptesJetables.length > 0) {
    const { data: tous } = await service.auth.admin.listUsers({ perPage: 200 });
    for (const u of tous?.users ?? []) {
      if (u.email && comptesJetables.includes(u.email)) {
        await service.auth.admin.deleteUser(u.id);
      }
    }
  }
  await service.from("system_settings").delete().eq("key", "inscriptions_ouvertes");

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

// ── CE QUE LE SERVEUR RACONTE DE LUI-MÊME ─────────────────────────────────
//
// ⚠️ POSÉ APRÈS UN CONSTAT, PAS PAR PRÉCAUTION. Le scan HawkScan du
// 03/09/2026 a relevé `X-Powered-By: Next.js` sur 15 chemins — dont
// `/robots.txt`, `/sitemap.xml` et les pages légales, c'est-à-dire ce qu'un
// inconnu atteint en premier. Next le pose par DÉFAUT ; l'absence de
// `poweredByHeader: false` suffisait, et aucun contrôle ne pouvait le voir.
//
// ⚠️ ET C'EST UNE PROTECTION QUI TIENT À UNE LIGNE DE CONFIGURATION, donc
// exactement le genre qui disparaît sans bruit à la prochaine réécriture de
// `next.config.ts` (L-029). D'où un contrôle qui INTERROGE LA RÉPONSE.
//
// L'inventaire est délibérément varié : une page rendue, deux fichiers
// statiques, la page publique et une redirection. Le défaut a été relevé sur
// des chemins qu'aucun contrôle « page d'accueil » n'aurait touchés.
{
  const chemins = [
    "/fr",
    "/robots.txt",
    "/sitemap.xml",
    "/fr/conditions",
    "/p/inexistant-pour-les-entetes",
    "/fr/commandes",
  ];
  const brutes = await Promise.all(
    chemins.map(async (c) => [c, await fetch(`${base}${c}`, { redirect: "manual" })]),
  );
  const reponses = brutes.map(([c, r]) => [c, r.headers]);
  const bavards = reponses.filter(([, h]) => h.get("x-powered-by") !== null).map(([c]) => c);

  /*
   * ⚠️ CE CONTRE-TEST MANQUAIT, ET IL A COUTE CHER. Jusqu au 08/09/2026 ce
   * bloc lisait les en-tetes de `/robots.txt` et `/sitemap.xml` SANS JAMAIS
   * REGARDER LEUR STATUT — et les deux repondaient 404 en production depuis le
   * premier deploiement. Il inspectait donc consciencieusement les en-tetes
   * d une page d ERREUR, en se croyant sur les fichiers, et il etait VERT.
   *
   * C est la forme la plus courante du defaut sur ce projet : un controle qui
   * ne peut pas devenir rouge pour la chose qu il touche. Les statuts attendus
   * sont declares ici, chemin par chemin.
   */
  const STATUTS_ATTENDUS = new Map([
    ["/fr", 200],
    ["/robots.txt", 200],
    ["/sitemap.xml", 200],
    ["/fr/conditions", 200],
    // Un jeton inconnu rend 404 : c est le contrat de la page publique.
    ["/p/inexistant-pour-les-entetes", 404],
    // Sans session, l espace vendeur renvoie vers la connexion.
    ["/fr/commandes", 307],
  ]);
  const inattendus = brutes
    .filter(([c, r]) => r.status !== STATUTS_ATTENDUS.get(c))
    .map(([c, r]) => `${c}:${r.status} (attendu ${STATUTS_ATTENDUS.get(c)})`);
  controles.push([
    inattendus.length === 0,
    `CONTRE-TEST : les ${chemins.length} chemins inspectes rendent le statut attendu` +
      (inattendus.length ? ` — ECART sur ${inattendus.join(", ")}` : ""),
  ]);

  // ⚠️ LE CONTRE-TEST VIENT EN PREMIER. « Aucun en-tête interdit » est vrai
  // d'un serveur éteint, d'une URL fautive et d'une liste vide. Il faut donc
  // d'abord établir que ces réponses PORTENT des en-têtes qu'on sait présents.
  const muettes = reponses
    .filter(([, h]) => h.get("x-content-type-options") !== "nosniff")
    .map(([c]) => c);
  controles.push([
    chemins.length > 0 && muettes.length === 0,
    `CONTRE-TEST : les ${chemins.length} reponses inspectees portent bien nosniff` +
      (muettes.length ? ` — MANQUANT sur ${muettes.join(", ")}` : ""),
  ]);
  controles.push([
    bavards.length === 0,
    "aucune reponse ne nomme le framework (x-powered-by)" +
      (bavards.length ? ` — ENCORE PRESENT sur ${bavards.join(", ")}` : ""),
  ]);
}

// ── LE SEO EST-IL REELLEMENT SERVI ? ───────────────────────────────────────
//
// ⚠️ TOUT CE BLOC MESURE UN ETAT QUI N EXISTAIT PAS AVANT LE 08/09/2026.
// Releve sur la production : `/robots.txt` 404, `/sitemap.xml` 404, zero
// `canonical`, zero `hreflang`, zero JSON-LD. Le produit servait trois langues
// sans jamais dire a un moteur qu elles sont les traductions les unes des
// autres — donc Google en choisissait UNE et la servait a tout le monde.
//
// ⚠️ CE QUI EST MESURE ICI EST L EFFET, PAS LE MOTIF. Une suite Vitest verifie
// que le CODE pose ces balises ; elle ne peut pas voir ce que Next en fait au
// rendu. Les deux sont necessaires et aucune ne remplace l autre — une
// regression de configuration ne touche pas une ligne de code source.
{
  const CHEMINS_INDEXABLES = ["", "/conditions", "/confidentialite", "/signalement", "/docs"];
  const LANGUES_SERVIES = ["fr", "en", "zh-CN"];

  const robots = await fetch(`${base}/robots.txt`);
  const corpsRobots = await robots.text();
  const plan = await fetch(`${base}/sitemap.xml`);
  const corpsPlan = await plan.text();

  controles.push(
    [robots.status === 200, `robots.txt repond 200 (statut ${robots.status})`],
    [plan.status === 200, `sitemap.xml repond 200 (statut ${plan.status})`],
    // CONTRE-TEST : un 200 qui rendrait la page d erreur du produit passerait
    // le controle ci-dessus sans etre un fichier robots.
    [
      /^\s*User-Agent:/im.test(corpsRobots) && corpsRobots.includes("Sitemap:"),
      `CONTRE-TEST : robots.txt est un VRAI robots (${corpsRobots.length} o, porte User-Agent et Sitemap)`,
    ],
    [
      corpsRobots.includes("Disallow: /api/"),
      "robots.txt ferme /api/, qui ne porte aucune balise ou ecrire un noindex",
    ],
  );

  // LE PLAN DE SITE CONTIENT EXACTEMENT LES URL ATTENDUES, NI PLUS NI MOINS.
  const urlsPlan = [...corpsPlan.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  /*
   * ⚠️ DEUX REGIMES DEPUIS LE BLOG (08/09/2026) : douze URL trilingues, plus
   * six qui n existent QU EN FRANCAIS. Les compter ensemble ferait passer ce
   * controle de 12 a 18 sans que personne ne relise pourquoi — on les declare
   * donc separement, pour que l ajout d une langue au blog se voie ici.
   */
  const CHEMINS_FRANCAIS = [
    "/blog",
    "/blog/envoyer-photos-client-sans-lien-qui-expire",
    "/blog/suivre-un-colis-sans-boutique-en-ligne",
    "/blog/cest-ou-mon-colis-arreter-de-repondre",
    "/blog/photos-controle-sans-dossier-partage",
    "/blog/vendre-sans-boutique-ce-quil-faut-vraiment",
  ];
  const attendues = [
    ...CHEMINS_INDEXABLES.flatMap((c) => LANGUES_SERVIES.map((l) => `/${l}${c}`)),
    ...CHEMINS_FRANCAIS.map((c) => `/fr${c}`),
  ].sort();
  const trouvees = urlsPlan
    .map((u) => {
      try {
        return new URL(u).pathname;
      } catch {
        return u;
      }
    })
    .sort();
  controles.push([
    trouvees.length === attendues.length && trouvees.every((v, i) => v === attendues[i]),
    `le plan de site liste EXACTEMENT les ${attendues.length} URL indexables` +
      (trouvees.length === attendues.length ? "" : ` — trouve ${trouvees.length}`),
  ]);

  /*
   * ⚠️ LE CONTROLE QUI COMPTE LE PLUS DE TOUT CE BLOC.
   *
   * Chaque `public_token` donne acces A VIE aux photos d un client. Le publier
   * dans un plan de site reviendrait a publier la liste des jetons — une fuite
   * definitive, indexee, et hors de notre portee une fois aspiree.
   *
   * Il ne cherche pas seulement « /p/ » : il verifie qu AUCUNE des surfaces
   * privees n y figure, chacune nommee. Un motif unique se ferait contourner
   * par la premiere surface privee ajoutee sous un autre prefixe.
   */
  /*
   * ⚠️ ON COMPARE DES CHEMINS EXTRAITS, PAS DES SOUS-CHAINES DU XML.
   *
   * La premiere version cherchait la sous-chaine « /p/ » dans le document. Une
   * falsification a montre qu elle laissait passer : un chemin declare « /p »
   * produit les URL `/fr/p`, `/en/p`, `/zh-CN/p` — aucune ne contient « /p/ ».
   * La garde censee empecher la publication des jetons se serait tue sur la
   * forme exacte du defaut qu elle vise.
   *
   * Les segments sont donc compares APRES le prefixe de langue, et l egalite
   * compte autant que le prefixe : « /p » comme « /p/quelquechose ».
   */
  const SEGMENTS_INTERDITS = ["p", "commandes", "admin", "connexion", "inscription", "bienvenue", "api"];
  const fuites = trouvees
    .map((chemin) => chemin.split("/").filter((x) => x !== ""))
    .filter((seg) => seg.length >= 2 && SEGMENTS_INTERDITS.includes(seg[1]))
    .map((seg) => `/${seg.join("/")}`);
  controles.push([
    fuites.length === 0,
    "AUCUNE surface privee dans le plan de site" +
      (fuites.length ? ` — FUITE : ${fuites.join(", ")}` : ""),
  ]);

  // CANONIQUE ET HREFLANG SUR CHAQUE PAGE INDEXABLE, DANS CHAQUE LANGUE.
  const pages = await Promise.all(
    CHEMINS_INDEXABLES.flatMap((c) =>
      LANGUES_SERVIES.map(async (l) => {
        const chemin = `/${l}${c}`;
        return [chemin, await (await fetch(`${base}${chemin}`)).text()];
      }),
    ),
  );

  const sansCanonique = pages.filter(([, h]) => !h.includes('rel="canonical"')).map(([c]) => c);
  controles.push([
    pages.length === CHEMINS_INDEXABLES.length * LANGUES_SERVIES.length && sansCanonique.length === 0,
    `les ${pages.length} pages indexables portent une canonique` +
      (sansCanonique.length ? ` — MANQUANTE sur ${sansCanonique.join(", ")}` : ""),
  ]);

  /*
   * L AUTO-REFERENCE ET LA RECIPROCITE, EPROUVEES SUR LE HTML SERVI.
   *
   * Sans auto-reference, Google n ignore pas la ligne : il ignore le JEU
   * ENTIER. C est la panne la plus silencieuse du sujet — tout parait en place
   * et rien ne s applique. On exige donc, sur chaque page : les trois langues,
   * le x-default, ET que la page se cite ELLE-MEME.
   */
  const hreflangIncomplets = pages
    .filter(([chemin, html]) => {
      const langue = chemin.split("/")[1];
      /*
       * ⚠️ LE DRAPEAU `i` N EST PAS UNE COMMODITE : SANS LUI CETTE SONDE EST
       * FAUSSE, et elle l a ete a sa premiere execution.
       *
       * Next rend l attribut React `hrefLang` TEL QUEL dans le HTML —
       * `<link rel="alternate" hrefLang="fr" ...>`, avec un L majuscule. Ma
       * premiere version cherchait `hreflang="` en minuscules et a declare les
       * DOUZE pages incompletes, sur un produit parfaitement correct.
       *
       * C est valide : HTML5 traite les noms d attributs sans tenir compte de
       * la casse, donc un navigateur comme un moteur lisent `hreflang`. Le
       * defaut etait dans la mesure, pas dans le produit — et une sonde qui se
       * trompe dans le sens ALARMISTE fait perdre autant de temps qu une sonde
       * qui se trompe dans le sens rassurant, avec en prime le risque qu on
       * « corrige » un produit qui n avait rien.
       */
      const vus = [...html.matchAll(/hreflang="([^"]+)"/gi)].map((m) => m[1]);
      const toutes = LANGUES_SERVIES.every((l) => vus.includes(l));
      return !(toutes && vus.includes("x-default") && vus.includes(langue));
    })
    .map(([c]) => c);
  controles.push([
    hreflangIncomplets.length === 0,
    "chaque page cite les 3 langues, le x-default ET ELLE-MEME (auto-reference)" +
      (hreflangIncomplets.length ? ` — INCOMPLET sur ${hreflangIncomplets.join(", ")}` : ""),
  ]);

  // UN SEUL <h1> PAR PAGE. Zero est une occasion perdue, deux brouillent le
  // sujet de la page — et les deux ne se voient que sur le HTML rendu.
  const h1Fautifs = pages
    .map(([c, h]) => [c, (h.match(/<h1[\s>]/g) ?? []).length])
    .filter(([, n]) => n !== 1)
    .map(([c, n]) => `${c}:${n}`);
  controles.push([
    h1Fautifs.length === 0,
    "exactement un <h1> par page indexable" +
      (h1Fautifs.length ? ` — ECART : ${h1Fautifs.join(", ")}` : ""),
  ]);

  // DESCRIPTIONS UNIQUES. Avant le 08/09, les trois pages legales HERITAIENT
  // de celle de la landing : Google affichait « Reunissez photos, videos et
  // suivi du colis... » sous « Conditions d utilisation ».
  const parLangue = new Map();
  for (const [chemin, html] of pages) {
    const langue = chemin.split("/")[1];
    const d = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
    if (!parLangue.has(langue)) parLangue.set(langue, []);
    parLangue.get(langue).push([chemin, d]);
  }
  const doublons = [];
  for (const liste of parLangue.values()) {
    const vues = new Map();
    for (const [chemin, d] of liste) {
      if (d === "") doublons.push(`${chemin}:VIDE`);
      else if (vues.has(d)) doublons.push(`${chemin} = ${vues.get(d)}`);
      else vues.set(d, chemin);
    }
  }
  controles.push([
    doublons.length === 0,
    "chaque page a sa PROPRE description, dans chaque langue" +
      (doublons.length ? ` — PARTAGEE : ${doublons.join(" | ")}` : ""),
  ]);

  /*
   * ⚠️ LA PAGE PUBLIQUE NE DOIT RIEN GAGNER DE TOUT CECI.
   *
   * Decision 23 du brief : aucune image de partage sur `/p/[token]`. Un apercu
   * enrichi montrerait la photo ou le pseudo du client DANS la conversation,
   * donc a qui n ouvre pas le lien — et les messageries le mettent en cache sur
   * leurs serveurs. Fuite silencieuse, hors de notre portee.
   *
   * Une passe SEO est exactement le moment ou quelqu un ajoute un Open Graph
   * « pour bien faire ». Ce controle existe pour que ce jour-la soit ROUGE.
   */
  const publique = await (await fetch(`${base}/p/inexistant-pour-le-seo`)).text();
  controles.push([
    !publique.includes('property="og:') && !publique.includes('name="twitter:'),
    "la page publique ne porte AUCUN Open Graph ni Twitter Card (decision 23)",
  ]);
  controles.push([
    !publique.includes('rel="alternate"'),
    "ni hreflang : sa langue est celle du VENDEUR, elle n a pas de traduction",
  ]);
  // ── LE BLOG : SERVI EN FRANCAIS, ET REFUSE AILLEURS ──────────────────────
  //
  // ⚠️ LE BLOG EXISTE PARCE QUE LE SEO TECHNIQUE NE SUFFIT PAS. Le socle pose
  // le 08/09/2026 rend le site ELIGIBLE ; ce qui decide du classement est le
  // contenu. Le produit avait douze URL et aucune page qui reponde a une
  // question.
  //
  // ⚠️ ET IL N EXISTE QU EN FRANCAIS, ce qui est la contrainte la plus facile a
  // casser sans s en apercevoir. Declarer `hreflang="en"` sur un article
  // pointerait vers une URL qui rend 404 — et Google n ignore pas la ligne
  // fautive, il ignore le JEU ENTIER. Une suite unitaire garde le MOTIF dans le
  // code ; ce bloc-ci mesure ce qui est REELLEMENT servi.
  {
    const SLUGS = [
      "envoyer-photos-client-sans-lien-qui-expire",
      "suivre-un-colis-sans-boutique-en-ligne",
      "cest-ou-mon-colis-arreter-de-repondre",
      "photos-controle-sans-dossier-partage",
      "vendre-sans-boutique-ce-quil-faut-vraiment",
    ];

    const index = await fetch(`${base}/fr/blog`, { redirect: "manual" });
    controles.push([index.status === 200, `/fr/blog repond 200 (statut ${index.status})`]);

    // ⚠️ LE REFUS DES AUTRES LANGUES EST LA PROPRIETE, PAS UN EFFET DE BORD.
    // Servir le francais sous /en/blog serait pire que refuser : une page
    // indexable qui ment sur sa langue, dans un <html lang="en">.
    const autres = await Promise.all(
      ["en", "zh-CN"].map(async (l) => [l, await fetch(`${base}/${l}/blog`, { redirect: "manual" })]),
    );
    const servies = autres.filter(([, r]) => r.status !== 404).map(([l, r]) => `${l}:${r.status}`);
    controles.push([
      servies.length === 0,
      "le blog REFUSE les langues qu il ne parle pas (404)" +
        (servies.length ? ` — SERVI sur ${servies.join(", ")}` : ""),
    ]);

    // LES CINQ ARTICLES REPONDENT, ET UN SLUG INCONNU REND 404.
    const articles = await Promise.all(
      SLUGS.map(async (s) => [s, await fetch(`${base}/fr/blog/${s}`, { redirect: "manual" })]),
    );
    const absents = articles.filter(([, r]) => r.status !== 200).map(([s, r]) => `${s}:${r.status}`);
    controles.push([
      absents.length === 0,
      `les ${SLUGS.length} articles repondent 200` + (absents.length ? ` — ${absents.join(", ")}` : ""),
    ]);
    const inconnu = await fetch(`${base}/fr/blog/ce-slug-n-existe-pas`, { redirect: "manual" });
    controles.push([
      inconnu.status === 404,
      `CONTRE-TEST : un slug inconnu rend 404 (statut ${inconnu.status})`,
    ]);

    // LE HTML DE CHAQUE ARTICLE.
    const pagesArticles = await Promise.all(
      SLUGS.map(async (s) => [s, await (await fetch(`${base}/fr/blog/${s}`)).text()]),
    );

    const h1Fautifs = pagesArticles
      .map(([s, h]) => [s, (h.match(/<h1[\s>]/g) ?? []).length])
      .filter(([, n]) => n !== 1)
      .map(([s, n]) => `${s}:${n}`);
    controles.push([
      h1Fautifs.length === 0,
      "exactement un <h1> par article" + (h1Fautifs.length ? ` — ECART : ${h1Fautifs.join(", ")}` : ""),
    ]);

    /*
     * ⚠️ LE TITRE DE RECHERCHE TIENT EN 60 CARACTERES.
     *
     * Mesure sur les cinq premiers articles : TROIS depassaient une fois le
     * suffixe ajoute, dont deux a 83 et 84. Google tronque autour de 60, et il
     * tronque LA FIN — l endroit ou l on met naturellement le mot vise. D ou un
     * `titreMeta` distinct du <h1>, qui n a pas cette contrainte.
     */
    /*
     * ⚠️ ON DECODE AVANT DE COMPTER, ET LA PREMIERE VERSION NE LE FAISAIT PAS.
     * Elle a declare deux titres trop longs (68 et 61) alors qu ils font 57 et
     * 55 : le HTML ecrit chaque apostrophe `&#x27;`, soit SIX caracteres au
     * lieu d un. Google, lui, decode avant d afficher. La sonde mesurait donc
     * l encodage, pas le titre — et se trompait dans le sens ALARMISTE, ce qui
     * pousse a « corriger » un texte qui n avait rien.
     */
    const decode = (t) =>
      t
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
    const tropLongs = pagesArticles
      .map(([s, h]) => [s, decode(/<title>([^<]*)<\/title>/.exec(h)?.[1] ?? "").length])
      .filter(([, n]) => n > 60)
      .map(([s, n]) => `${s} (${n})`);
    controles.push([
      tropLongs.length === 0,
      "aucun titre d article ne depasse 60 caracteres" +
        (tropLongs.length ? ` — TRONQUE : ${tropLongs.join(", ")}` : ""),
    ]);

    // UN SEUL HREFLANG PAR ARTICLE, PLUS LE X-DEFAULT : la page se cite
    // elle-meme et sert de repli, sans promettre de traduction.
    const hreflangFautifs = pagesArticles
      .filter(([, h]) => {
        const vus = [...h.matchAll(/hreflang="([^"]+)"/gi)].map((m) => m[1]);
        return !(vus.includes("fr") && vus.includes("x-default") && !vus.includes("en") && !vus.includes("zh-CN"));
      })
      .map(([s]) => s);
    controles.push([
      hreflangFautifs.length === 0,
      "chaque article declare fr + x-default, et AUCUNE autre langue" +
        (hreflangFautifs.length ? ` — FAUX sur ${hreflangFautifs.join(", ")}` : ""),
    ]);

    // LE GRAPHE D ARTICLE EST PARSABLE, ET IL NE NOMME PERSONNE.
    const graphesCasses = [];
    const avecAuteur = [];
    for (const [s, h] of pagesArticles) {
      const bloc = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h);
      if (bloc === null) {
        graphesCasses.push(`${s}:ABSENT`);
        continue;
      }
      try {
        const g = JSON.parse(bloc[1]);
        if (g["@type"] !== "Article") graphesCasses.push(`${s}:@type=${g["@type"]}`);
        if ("author" in g) avecAuteur.push(s);
      } catch {
        graphesCasses.push(`${s}:JSON INVALIDE`);
      }
    }
    controles.push([
      graphesCasses.length === 0,
      `les ${SLUGS.length} articles portent un graphe Article PARSABLE` +
        (graphesCasses.length ? ` — ${graphesCasses.join(", ")}` : ""),
    ]);
    // Le brief interdit d exposer une personne ; l organisation suffit a
    // repondre a « qui dit ca ».
    controles.push([
      avecAuteur.length === 0,
      "aucun graphe ne nomme un auteur" + (avecAuteur.length ? ` — ${avecAuteur.join(", ")}` : ""),
    ]);

    // LE PLAN DE SITE ANNONCE LE BLOG EN FRANCAIS, ET SEULEMENT EN FRANCAIS.
    const planBlog = [...corpsPlan.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => {
        try {
          return new URL(m[1]).pathname;
        } catch {
          return m[1];
        }
      })
      .filter((c) => c.includes("/blog"));
    const attenduBlog = ["/fr/blog", ...SLUGS.map((s) => `/fr/blog/${s}`)].sort();
    controles.push([
      planBlog.length === attenduBlog.length && [...planBlog].sort().every((v, i) => v === attenduBlog[i]),
      `le plan de site annonce les ${attenduBlog.length} URL du blog, toutes en francais` +
        (planBlog.length === attenduBlog.length ? "" : ` — trouve ${planBlog.length}`),
    ]);
  }

  // ── LES DONNEES STRUCTUREES ET L APERCU DE PARTAGE ───────────────────────
  //
  // ⚠️ MESURE AVANT CETTE PASSE : `application/ld+json` apparaissait ZERO fois
  // dans le HTML servi, et il n y avait aucune balise Open Graph.
  //
  // ⚠️ ON EXIGE QUE LE GRAPHE SOIT PARSABLE, PAS QU IL SOIT PRESENT. Un bloc
  // `<script type="application/ld+json">` qui contient du JSON casse est
  // strictement equivalent a pas de bloc du tout pour un moteur — mais un
  // controle de presence le declarerait bon. C est la difference entre chercher
  // un mot et interroger un effet.
  {
    const parLangue = await Promise.all(
      LANGUES_SERVIES.map(async (l) => [l, await (await fetch(`${base}/${l}`)).text()]),
    );

    const graphes = [];
    const casses = [];
    for (const [langue, html] of parLangue) {
      const bloc = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
      if (bloc === null) {
        casses.push(`${langue}:ABSENT`);
        continue;
      }
      try {
        graphes.push([langue, JSON.parse(bloc[1])]);
      } catch {
        casses.push(`${langue}:JSON INVALIDE`);
      }
    }

    controles.push([
      casses.length === 0 && graphes.length === LANGUES_SERVIES.length,
      `les ${LANGUES_SERVIES.length} landings portent un JSON-LD PARSABLE` +
        (casses.length ? ` — ${casses.join(", ")}` : ""),
    ]);

    // Les trois entites, et leurs liens. Un graphe qui decrit trois choses sans
    // relation ne repond pas a « qui edite ce site ».
    const incomplets = graphes
      .filter(([, g]) => {
        const types = (g["@graph"] ?? []).map((x) => x["@type"]);
        return !["Organization", "WebSite", "SoftwareApplication"].every((t) => types.includes(t));
      })
      .map(([l]) => l);
    controles.push([
      graphes.length > 0 && incomplets.length === 0,
      "chaque graphe porte Organization + WebSite + SoftwareApplication" +
        (incomplets.length ? ` — INCOMPLET sur ${incomplets.join(", ")}` : ""),
    ]);

    // LA LANGUE DU GRAPHE SUIT CELLE DE LA PAGE. Un graphe qui annonce `fr` sur
    // la page chinoise contredirait hreflang, et deux signaux qui se
    // contredisent valent moins qu un seul.
    const languesFausses = graphes
      .filter(([langue, g]) => {
        const site = (g["@graph"] ?? []).find((x) => x["@type"] === "WebSite");
        const declarees = site?.inLanguage ?? [];
        return declarees[0] !== langue;
      })
      .map(([l]) => l);
    controles.push([
      languesFausses.length === 0,
      "le graphe annonce la langue de SA page en premier" +
        (languesFausses.length ? ` — FAUX sur ${languesFausses.join(", ")}` : ""),
    ]);

    /*
     * ⚠️ AUCUN PRIX DANS LES DONNEES STRUCTUREES, ET CE CONTROLE EST UNE
     * PROTECTION DE PRODUIT AUTANT QUE DE SEO.
     *
     * Google demande un bloc `offers` pour ses resultats enrichis, donc la
     * pression pour l ajouter est reelle et reviendra. Le produit ne connait
     * AUCUNE notion de prix — ni table, ni code de facturation, c est une
     * contrainte verrouillee. Declarer « price: 0 » affirmerait dans un format
     * lisible par une machine ce que la base n a jamais enregistre, et cette
     * affirmation deviendrait fausse en phase 2 AVANT que quiconque pense a la
     * relire. Une donnee structuree perimee circule ; une absence, non.
     */
    const avecPrix = graphes
      .filter(([, g]) => JSON.stringify(g).includes('"offers"') || JSON.stringify(g).includes('"price"'))
      .map(([l]) => l);
    controles.push([
      avecPrix.length === 0,
      "aucun prix declare dans le JSON-LD (le produit n en connait aucun)" +
        (avecPrix.length ? ` — PRESENT sur ${avecPrix.join(", ")}` : ""),
    ]);

    // L APERCU DE PARTAGE, SUR LES DOUZE PAGES INDEXABLES.
    const sansApercu = pages
      .filter(([, html]) => !html.includes('property="og:title"'))
      .map(([c]) => c);
    controles.push([
      sansApercu.length === 0,
      `les ${pages.length} pages indexables portent un apercu de partage` +
        (sansApercu.length ? ` — MANQUANT sur ${sansApercu.join(", ")}` : ""),
    ]);

    // ⚠️ LE FORMAT D OPEN GRAPH N EST PAS CELUI DE HREFLANG, et la confusion
    // est le defaut ordinaire du sujet : `zh_CN` avec un souligne ici, `zh-CN`
    // avec un tiret la-bas. Un format errone fait ignorer la balise en silence.
    const LOCALES_ATTENDUES = { fr: "fr_FR", en: "en_US", "zh-CN": "zh_CN" };
    const localesFausses = pages
      .filter(([chemin, html]) => {
        const langue = chemin.split("/")[1];
        return !html.includes(`content="${LOCALES_ATTENDUES[langue]}"`);
      })
      .map(([c]) => c);
    controles.push([
      localesFausses.length === 0,
      "chaque apercu declare sa locale au format Open Graph (souligne)" +
        (localesFausses.length ? ` — FAUSSE sur ${localesFausses.join(", ")}` : ""),
    ]);

    // CONTRE-TEST : la page publique ne doit porter AUCUN graphe non plus.
    controles.push([
      !publique.includes("application/ld+json"),
      "la page publique ne porte aucun JSON-LD (elle ne se decrit a personne)",
    ]);
  }
}

// ── LE COOKIE DE LANGUE N'EST PAS LISIBLE EN JAVASCRIPT ────────────────────
//
// ⚠️ RELEVÉ PAR LE MÊME SCAN, sur 18 chemins : `NEXT_LOCALE` partait sans
// `HttpOnly`. Le justifier par « il ne contient qu'une langue » serait L-029 ;
// ce qui a été établi, c'est que RIEN ne l'écrit ni ne le lit côté navigateur.
// Le pourquoi complet, et ce qui casserait le jour où un sélecteur de langue
// arrive, sont dans `src/middleware.ts`.
//
// ⚠️ L'ORDRE DES DEUX CONTRÔLES EST LA MOITIÉ DU TRAVAIL : « aucun cookie sans
// HttpOnly » est trivialement vrai d'une réponse qui ne pose AUCUN cookie. Si
// next-intl cessait de le poser — ou si notre middleware cessait d'être
// atteint — la garde resterait verte sur un produit changé.
{
  const posesFr = (await fetch(`${base}/fr`, { redirect: "manual" })).headers.getSetCookie();
  const posesEn = (await fetch(`${base}/en`, { redirect: "manual" })).headers.getSetCookie();
  const langueFr = posesFr.find((c) => c.startsWith("NEXT_LOCALE="));
  const langueEn = posesEn.find((c) => c.startsWith("NEXT_LOCALE="));

  controles.push([
    langueFr !== undefined && langueEn !== undefined,
    "CONTRE-TEST : le cookie de langue est bien pose sur /fr ET sur /en",
  ]);
  controles.push([
    langueFr?.startsWith("NEXT_LOCALE=fr") === true && langueEn?.startsWith("NEXT_LOCALE=en") === true,
    "CONTRE-TEST : il porte la langue de l URL, donc la detection marche encore",
  ]);
  controles.push([
    /;\s*HttpOnly/i.test(langueFr ?? "") && /;\s*HttpOnly/i.test(langueEn ?? ""),
    "le cookie de langue est HttpOnly sur les deux langues",
  ]);
  // `SameSite=lax` est un DÉFAUT de next-intl qu'on écrase en reposant le
  // cookie : sans ce contrôle, l'oublier dans `middleware.ts` le ferait
  // silencieusement retomber sur le défaut du navigateur.
  controles.push([
    /;\s*SameSite=lax/i.test(langueFr ?? "") && /;\s*SameSite=lax/i.test(langueEn ?? ""),
    "le cookie de langue garde SameSite=lax en le reposant",
  ]);
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
  // ── LA CSP DE DÉFENSE EN PROFONDEUR EST SERVIE, SUR LES DEUX SURFACES ──
  //
  // ⚠️ AJOUTÉE APRÈS COUP : la surface n avait AUCUNE CSP `script-src` avant le
  // 02/09/2026. Ces directives ferment le chargement d un script EXTERNE
  // injecté, l injection de `<base>`, le détournement de formulaire et le
  // greffon. Vérifié au navigateur route par route (zéro violation) ; ce
  // contrôle empêche seulement qu elle DISPARAISSE en silence — l en-tête est
  // gated production, donc actif sur ce serveur de fumée (`next start`).
  //
  // ⚠️ ON N EXIGE PAS DE NONCE : la page publique et la connexion sont rendues
  // STATIQUEMENT pour le budget LCP, et le nonce de Next force le dynamique.
  // C est un arbitrage assumé, pas un oubli — d où `'unsafe-inline'`, borné par
  // l absence totale de `dangerouslySetInnerHTML` et de script tiers.
  ...(() => {
    const attendues = [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    return [enTetesLanding, enTetesPublique].flatMap((entetes, i) => {
      const surface = i === 0 ? "landing" : "page publique";
      const csp = entetes.get("content-security-policy") ?? "";
      const manquantes = attendues.filter((d) => !csp.includes(d));
      return [
        [
          manquantes.length === 0,
          `CSP complète sur la ${surface}` +
            (manquantes.length ? ` — manque : ${manquantes.join(", ")}` : ""),
        ],
        // ⚠️ LES DEUX ORIGINES TIERCES LÉGITIMES SONT DÉCLARÉES : sans elles, la
        // galerie (R2) et l auth (Supabase) casseraient. Les retirer par
        // mégarde doit rougir ici, pas se découvrir chez un client.
        [
          csp.includes("r2.cloudflarestorage.com") && /connect-src[^;]*supabase/.test(csp),
          `CSP ${surface} : R2 (médias) et Supabase (auth) autorisés`,
        ],
      ];
    });
  })(),
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
/*
 * ⚠️ LE MOTIF NE PRESUME PLUS DU DOSSIER, ET C EST NEXT 16 QUI L A APPRIS.
 *
 * Les feuilles etaient servies depuis `/_next/static/css/` ; Next 16 les emet
 * sous `/_next/static/chunks/`. Le motif d origine n a alors plus rien trouve,
 * et TOUS les controles de style qui suivent se sont mis a mesurer une chaine
 * vide — sans une seule erreur. Seul le contre-test « 0 feuille(s) servie(s) »
 * a parle, et c est exactement ce pour quoi il existe.
 *
 * On cherche donc n importe quel `.css` sous `/_next/static/`, quel que soit le
 * dossier que la prochaine version choisira.
 */
const feuilles = [...fr.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
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

  /*
   * --- LA TYPOGRAPHIE CHINOISE SURVIT AU BUILD ---
   *
   * ⚠️ CES DEUX REGLES SONT LE GENRE QU UNE PURGE EFFACE SANS BRUIT. Elles ne
   * sont referencees par aucune classe du markup : `:lang(zh-CN)` ne
   * ressemble a rien que Tailwind reconnaisse, et une famille declaree dans
   * une variable ne s emploie que par `var()`. Les perdre ne casse RIEN — ca
   * rend seulement le chinois en police substituee, avec des ideogrammes qui
   * se touchent et une graisse synthetique. Personne ne le verrait avant un
   * vrai lecteur chinois.
   *
   * On les cherche donc dans le CSS SERVI, pas dans `globals.css` : un fichier
   * source prouve qu un texte existe, jamais qu il est arrive jusqu au
   * navigateur (L-032).
   */
  [
    css.includes("PingFang SC"),
    "la pile de polices CJK est dans le CSS servi (aucune de nos deux polices ne couvre les ideogrammes)",
  ],
  [
    /lang\(zh-CN\)/.test(css) && /letter-spacing:0/.test(css),
    "la regle typographique chinoise est servie : l espacement negatif ferait SE TOUCHER les ideogrammes",
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
/*
 * ⚠️ LA VALEUR ARBITRAIRE FAIT PARTIE DU NOM, ET L OUBLIER RENDAIT LA SONDE
 * FAUSSE — releve le 08/09/2026 en ecrivant `border-l-[3px]`, la PREMIERE
 * classe de cette forme du projet.
 *
 * Sans le second groupe, le motif s arretait au `[` et inventoriait
 * « border-l » : une classe que PERSONNE n a ecrite, que Tailwind n a donc
 * aucune raison de servir, et que la sonde reclamait au serveur. Elle criait
 * au loup sur du code correct — le meme defaut que le commentaire cite en
 * L-031, dans l autre sens.
 */
const MOTIF_CLASSE = /\b(?:bg|text|border|ring|fill|stroke|divide|decoration|outline|accent|shadow|from|via|to)-[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:-\[[^\]\s]+\])?/g;

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

/*
 * ⚠️ TAILWIND ECHAPPE LES CARACTERES QU UN SELECTEUR CSS NE PEUT PAS PORTER
 * NUS. `border-l-[3px]` s ecrit `.border-l-\[3px\]` dans la feuille produite —
 * chercher le nom tel qu il est ecrit dans le code ne trouverait jamais rien,
 * et la sonde declarerait « jamais servie » une classe parfaitement servie.
 */
const echappee = (c) => c.replace(/[[\]().%#!,:>+~*/]/g, (x) => "\\" + x);
const servie = (c) => SUITES_SERVIES.some((suite) => css.includes(`${echappee(c)}${suite}`));

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


// --- LES CIBLES TACTILES DU PIED SONT SERVIES, PAS SEULEMENT ECRITES ---
//
// ⚠️ LE CONTROLE UNITAIRE GARDE LE CODE ; CELUI-CI GARDE L EFFET. Les trois
// pieds de page portent `min-h-11` et une marge negative qui annule le surplus
// dans le flux — mais aucune des deux n entre dans MOTIF_CLASSE ci-dessus, qui
// ne connait que les prefixes de couleur et de bordure. Si Tailwind cessait de
// produire `-my-[14.5px]`, une valeur ARBITRAIRE, la marge disparaitrait, le
// pied gonflerait de 29 px et la suite unitaire resterait verte : elle lit le
// code, pas la feuille. C est exactement L-032 — « il repond » est la propriete
// que tous les residus possedent.
//
// MESURE D ORIGINE, au navigateur pilote le 09/09/2026 a 390 px reels : les
// liens legaux rendaient 15 px de haut sur la landing et 16 sur les autres
// surfaces, contre les 44 points qu impose le brief §8. Les LARGEURS, elles,
// depassaient deja 44 partout — seule la hauteur manquait.
//
// ⚠️ ET LA REGLE GLOBALE DE `globals.css` NE POUVAIT PAS LES COUVRIR : son
// `@media (pointer: coarse)` vise `button`, `a[role="button"]`, `[role="tab"]`
// et les cases a cocher, jamais un `<a>` de navigation. L etendre a tout `a`
// donnerait 44 px de haut au moindre lien INLINE dans le corps des conditions,
// et casserait la mise en page du texte qu il traverse.
{
  const CLASSES_TACTILES = ["min-h-11", "-my-3.5", "-my-[14.5px]"];
  const absentes = CLASSES_TACTILES.filter((c) => !servie(c));
  controles.push([
    absentes.length === 0,
    absentes.length === 0
      ? `les ${CLASSES_TACTILES.length} classes de cible tactile du pied sont SERVIES par la feuille`
      : `cible tactile ECRITE mais NON SERVIE (le pied gonflerait en silence) : ${absentes.join(", ")}`,
  ]);

  // Et elles sont bien portees par les liens REELLEMENT servis. On lit le pied
  // du HTML rendu, pas le composant : c est la seule facon d etablir que la
  // classe a traverse le rendu jusqu au navigateur du client.
  const surfaces = ["/fr", "/fr/conditions", "/fr/blog"];
  const sansPlancher = [];
  for (const chemin of surfaces) {
    const html = await (await fetch(`${base}${chemin}`)).text();
    const debutPied = html.lastIndexOf("<footer");
    const pied = debutPied === -1 ? "" : html.slice(debutPied, html.indexOf("</footer>", debutPied));
    const liens = [...pied.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    const nus = liens.filter((l) => !l.includes("min-h-11"));
    if (debutPied === -1 || liens.length === 0) sansPlancher.push(`${chemin}:AUCUN LIEN DE PIED`);
    else if (nus.length > 0) sansPlancher.push(`${chemin}:${nus.length}/${liens.length} sans plancher`);
  }
  controles.push([
    sansPlancher.length === 0,
    sansPlancher.length === 0
      ? `les liens de pied des ${surfaces.length} surfaces publiques portent le plancher de 44 px`
      : `liens de pied SANS plancher tactile : ${sansPlancher.join(", ")}`,
  ]);
}


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

/*
 * L ADRESSE QUI N EXISTE PAS — DANS LES DEUX LANGUES.
 *
 * ⚠️ MESURE DU 03/09/2026 : `/fr/pas-une-route` et `/en/pas-une-route` rendaient
 * la page generique de Next — « 404: This page could not be found », en ANGLAIS
 * EN DUR, en Times New Roman, hors du canevas, y compris sous une locale `fr`.
 * Le produit interdit pourtant toute chaine visible en dur.
 *
 * IL A FALLU `app/global-not-found.tsx` ET UN DRAPEAU EXPERIMENTAL, parce que
 * ce depot n a pas de layout racine — deux racines distinctes, c est le budget
 * de la page publique. Quatre autres montages ont ete essayes et mesures ; le
 * detail est dans `src/app/global-not-found.tsx` et dans `next.config.ts`.
 *
 * CE CONTROLE EST DONC AUSSI CELUI DU DRAPEAU. Un drapeau experimental peut
 * changer de nom ou disparaitre a la prochaine montee de Next : ce jour-la, le
 * produit se remettrait a servir la page anglaise EN SILENCE, et c est
 * exactement le genre de retour en arriere que personne ne remarque.
 *
 * ON INTERROGE LE RENDU, pas la charge : les libelles de l ecran vivent aussi
 * dans le payload, et la page de Next y est embarquee comme composant de repli.
 */
const erreursFr = catalogue.erreurs;
const erreursEn = JSON.parse(readFileSync(join(racine, "messages", "en.json"), "utf8")).erreurs;

const lireIntrouvable = async (langue) => {
  const r = await fetch(`${base}/${langue}/pas-une-route-du-tout`, { redirect: "manual" });
  const html = await r.text();
  const titre = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) ?? [, ""])[1];
  return { statut: r.status, html, rendu: rendu(html), titre };
};
const introuvableFrancais = await lireIntrouvable("fr");
const introuvableAnglais = await lireIntrouvable("en");

controles.push(
  [
    introuvableFrancais.statut === 404,
    `une adresse inexistante rend 404 (statut ${introuvableFrancais.statut})`,
  ],
  [
    introuvableFrancais.rendu.includes(erreursFr.introuvableTitre),
    `et elle rend NOTRE ecran, pas celui de Next (titre servi : « ${introuvableFrancais.titre} »)`,
  ],
  // LE CONTROLE QUI GARDE LE DRAPEAU. La page de Next est en anglais en dur :
  // si elle reapparait dans le RENDU, le montage est retombe.
  [
    !introuvableFrancais.rendu.includes("This page could not be found"),
    "la page generique de Next n est plus RENDUE",
  ],
  // L AUTRE LANGUE, ET C EST LA MOITIE DU SUJET : c est une page ANGLAISE qui
  // etait servie, donc un controle mono-langue laisserait passer l inverse du
  // defaut — du francais servi a un visiteur `en`.
  [
    introuvableAnglais.rendu.includes(erreursEn.introuvableTitre),
    `en anglais aussi (titre servi : « ${introuvableAnglais.titre} »)`,
  ],
  [
    !introuvableAnglais.rendu.includes(erreursFr.introuvableTitre),
    "et la version anglaise ne porte aucun mot de la francaise",
  ],
  // L ATTRIBUT `lang` SUIT, sinon un lecteur d ecran prononcerait l anglais
  // avec la phonetique francaise. Il vient d un en-tete pose par le middleware :
  // sans lui l ecran retomberait sur la langue par defaut, donc sur du francais
  // servi a un anglophone — l exact miroir du defaut corrige.
  [
    /<html[^>]*lang="fr"/.test(introuvableFrancais.html),
    "l attribut lang de l ecran francais vaut bien fr",
  ],
  [
    /<html[^>]*lang="en"/.test(introuvableAnglais.html),
    "et celui de l ecran anglais vaut en",
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
/*
 * ⚠️ QUAND UN CONTROLE ECHOUE, ON MONTRE CE QUE LE SERVEUR A DIT.
 *
 * Le journal du serveur n etait imprime que s il ne DEMARRAIT pas. Un echec de
 * controle, lui, restait opaque : le 02/09/2026, `/fr/admin` a rendu 500 a un
 * administrateur pendant une passe de portes, et deux passes suivantes sont
 * revenues vertes. Sans la trace du serveur, il ne restait qu a choisir entre
 * « regression » et « incident » — c est-a-dire a deviner, ou a relancer
 * jusqu au vert, ce que ce projet interdit.
 *
 * On n elargit PAS le transport resilient a la place : sa liste est
 * volontairement etroite, et y ajouter le 500 transformerait l enrobage en
 * machine a cacher les defauts. Un 500 est aussi la forme d une vraie erreur
 * applicative. Ce qu il faut, ce n est pas le retenter — c est le LIRE.
 */
if (echecs > 0 && journal.trim() !== "") {
  console.log("\n— Fin du journal du serveur, pour attribuer les echecs ci-dessus —");
  console.log(journal.slice(-3000));
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} ecart(s).`);
process.exit(echecs === 0 ? 0 : 1);

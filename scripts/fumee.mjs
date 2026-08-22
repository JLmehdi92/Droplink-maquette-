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
// Ce script n est pas dans les portes de qualite : il demarre un serveur et
// coute une trentaine de secondes. Il se lance a la main (`pnpm fumee`) apres
// `pnpm build`, avant de clore un lot.
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:net";
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
    chemin: "/fr/signalement",
    statut: 404,
    libelle: "signalement SANS adresse d'abus configuree",
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
  { chemin: "/", statut: 200, final: "/fr", libelle: "racine negociee vers une langue" },
  { chemin: "/FR", statut: 200, final: "/fr", libelle: "casse de la langue normalisee" },
  { chemin: "/de", statut: 404, libelle: "langue non supportee" },
  { chemin: "/zz", statut: 404, libelle: "segment inconnu" },
  { chemin: "/fr/nexiste-pas", statut: 404, libelle: "route inconnue" },
];

let echecs = 0;

console.log("— Statuts —");
for (const { chemin, statut, final, libelle } of cas) {
  const r = await suivre(chemin);
  const statutOk = r.statut === statut;
  const finalOk = final === undefined || r.final === final;
  const ok = statutOk && finalOk;
  if (!ok) echecs += 1;
  console.log(
    `${ok ? "OK   " : "ECHEC"} ${chemin.padEnd(20)} ${r.chaine.join("  ->  ").padEnd(34)} ` +
      `${ok ? "" : `attendu ${statut}${final === undefined ? "" : ` sur ${final}`} — `}${libelle}`,
  );
}

const fr = await (await fetch(`${base}/fr`)).text();
const en = await (await fetch(`${base}/en`)).text();

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
// mot de passe, ni SSO, ni certification qu on ne possede pas. Le controle
// porte sur le HTML SERVI, pas sur le fichier source, parce que c est le HTML
// que le visiteur recoit.
const inscription = await (await fetch(`${base}/fr/inscription`)).text();
controles.push(
  [!/type="password"/.test(inscription), "aucun champ mot de passe"],
  // FRONTIERES DE MOT OBLIGATOIRES, et pas de `/i` sur les acronymes. Le motif
  // precedent, `/SSO|SOC2|Enterprise/i`, matchait « crossOrigin » et
  // « associer » : deux faux positifs sur une page parfaitement
  // correcte. Un controle qui crie au loup finit par etre ignore, et c est
  // alors qu il laisse passer le vrai cas.
  [!/SSO/.test(inscription), "aucune mention de SSO"],
  [!/SOC ?2/i.test(inscription), "aucune certification SOC2 revendiquee"],
  [!/Enterprise/.test(inscription), "aucun vocabulaire d'entreprise"],
  [!/Corporate/i.test(inscription), "aucun « Corporate Email »"],
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
const { createClient } = await import("@supabase/supabase-js");
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const NOTE_SENTINELLE = "prix-achat-fumee-7d2e9c41";
let jetonFumee = null;
let commandeFumee = null;
let profilFumee = null;

try {
  const courriel = `fumee-${Date.now()}@exemple.test`;
  const { data: utilisateur } = await service.auth.admin.createUser({
    email: courriel,
    email_confirm: true,
  });

  if (utilisateur?.user) {
    const { data: profil } = await service
      .from("profiles")
      .select("id")
      .eq("user_id", utilisateur.user.id)
      .maybeSingle();
    profilFumee = profil?.id ?? null;

    const { data: shop } = await service
      .from("shops")
      .select("id")
      .eq("owner_id", profilFumee)
      .maybeSingle();

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

  if (jetonFumee) {
        const reponse = await fetch(`${base}/p/${jetonFumee}`, { headers: visiteur(11) });
        const html = await reponse.text();

        controles.push(
          [reponse.status === 200, "la page publique repond sur un jeton valide"],
          [html.includes("Client de fumee"), "elle porte bien le contenu de la commande"],

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
            `poids du HTML public : ${(Buffer.byteLength(html) / 1024).toFixed(1)} Ko (budget 300)`,
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
          [delaiCoupure < 30, `la coupure prend ${delaiCoupure.toFixed(1)} s (seuil 30)`],
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
        const balayeur = visiteur(31);
        let dernierStatut = 0;
        for (let i = 0; i <= PLAFOND_PUBLIC; i += 1) {
          dernierStatut = (await fetch(`${base}/p/${jetonFumee}`, { headers: balayeur })).status;
        }
        const voisin = await fetch(`${base}/p/${jetonFumee}`, {
          headers: visiteur(32),
        });

        controles.push(
          [dernierStatut === 404, `le plafond public mord (statut ${dernierStatut} au-dela de ${PLAFOND_PUBLIC})`],
          [voisin.status === 200, "une autre adresse n est pas penalisee : le compteur est par adresse"],
          // Le refus emprunte le MEME chemin de sortie que tout le reste :
          // repondre 429 distinguerait « tu vas trop vite sur un jeton qui
          // existe » de « ce jeton n existe pas », donc rendrait le balayage
          // informatif.
          [dernierStatut !== 429, "un refus de quota ne se distingue pas d un jeton inconnu"],
        );
      }

      // ── LES DEUX ROUTES MACHINE DU SUIVI ──
      //
      // `/api` est EXCLU du matcher du middleware : ces deux routes ne sont
      // protegees par rien d autre que leur propre garde. Le controle porte donc
      // sur l EFFET — ce que le serveur repond reellement, et ce qui arrive en
      // base — parce que « il repond » est la propriete que tous les residus
      // possedent.
      const { createHash } = await import("node:crypto");

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

      controles.push(
        [sansSignature.status === 401, "une notification SANS signature est refusee"],
        [mauvaiseSignature.status === 401, "une signature fausse est refusee"],
        [corpsFalsifie.status === 401, "un corps modifie apres signature est refuse"],
        [signee.status === 200, `une notification signee est acceptee (${signee.status})`],
        [
          corpsSignee !== null && corpsSignee.colis === 0,
          "et elle dit COMBIEN de colis ont ete touches — ici zero, le numero n existe pas",
        ],
      );

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
  if (profilFumee) {
    const { data: p } = await service.from("profiles").select("user_id").eq("id", profilFumee).maybeSingle();
    if (p?.user_id) await service.auth.admin.deleteUser(p.user_id);
  }
}

console.log("\n— Contenu rendu —");
// --- En-tetes de securite, sur le RESEAU et non dans la configuration ---
//
// Un `headers()` ecrit dans `next.config.ts` peut etre correct et ne rien
// produire : mauvais motif de chemin, plugin qui le remplace, build qui ne le
// reprend pas. Ce qui fait autorite est ce que le serveur REPOND.
const enTetesPublique = (await fetch(`${base}/p/inexistant-pour-les-entetes`)).headers;
const enTetesLanding = (await fetch(`${base}/fr`)).headers;

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

arreter();
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} ecart(s).`);
process.exit(echecs === 0 ? 0 : 1);

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
import { existsSync } from "node:fs";
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

// Secrets POSES POUR CE SERVEUR, et differents de ceux de production. Ce qu on
// eprouve est le SCHEMA — « la porte est-elle fermee, et s ouvre-t-elle avec la
// bonne cle » — pas le secret lui-meme.
const SECRET_CRON = "fumee-cron-secret-0123456789";
const CLE_SUIVI = "fumee-cle-suivi-abcdef0123456789";

const serveur = spawn("pnpm", ["start", "--port", String(port)], {
  cwd: racine,
  shell: true,
  env: {
    ...process.env,
    QUOTA_PUBLIQUE_PAR_MINUTE: String(PLAFOND_PUBLIC),
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
const controles = [
  [fr.includes("Un lien. Toute la commande."), "titre francais rendu"],
  [en.includes("One link. The whole order."), "titre anglais rendu"],
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

      if (jetonFumee) {
        const reponse = await fetch(`${base}/p/${jetonFumee}`);
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
        // LA BALISE DE CONSULTATION, de bout en bout.
        //
        // `x-forwarded-for` est pose ici parce que c est ce que fait le bord en
        // production. Sans adresse exploitable, le produit REFUSE d ecrire
        // plutot que de fusionner tous les visiteurs sous une cle commune : le
        // controle passerait alors sur un comportement qui n est pas celui qui
        // sera servi.
        const enTetes = { "x-forwarded-for": "203.0.113.7", "user-agent": "sonde-fumee/1" };

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

        controles.push(
          [balise.status === 204, "la balise de consultation repond 204"],
          [apres === 1, `une vue enregistree (compte : ${apres})`],
          [apresDeux === 1, `la seconde consultation du jour ne compte pas (compte : ${apresDeux})`],
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
        const balayeur = { "x-forwarded-for": "198.51.100.4" };
        let dernierStatut = 0;
        for (let i = 0; i <= PLAFOND_PUBLIC; i += 1) {
          dernierStatut = (await fetch(`${base}/p/${jetonFumee}`, { headers: balayeur })).status;
        }
        const voisin = await fetch(`${base}/p/${jetonFumee}`, {
          headers: { "x-forwarded-for": "198.51.100.99" },
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

/**
 * LA COUPURE DE SUSPENSION COUPE-T-ELLE EN PRODUCTION ? — sonde de déploiement.
 *
 * ⚠️ C'EST LA CAPACITÉ TECHNIQUE QUI FONDE NOTRE STATUT D'HÉBERGEUR, et son
 * mode de défaillance est SILENCIEUX. La chaîne est :
 *
 *     suspension en base → la fonction de lecture publique filtre
 *                        → invalidation du cache → la page cesse de répondre
 *
 * Si un maillon manque, RIEN N'ÉCHOUE : le statut est écrit, l'audit consigne,
 * l'écran d'administration affiche « suspendu » — et la page publique continue
 * d'être servie. Tout dit que le compte est coupé. Il ne l'est pas.
 *
 * ⚠️ POURQUOI CETTE SONDE EXISTE ALORS QUE `pnpm fumee` PROUVE DÉJÀ LA COUPURE.
 * La fumée la prouve contre un `next start` local, sur la machine qui vient
 * d'écrire en base. En production s'intercalent un bord (Railway), un
 * enregistrement DNS, et le cache HTTP de la plateforme — trois endroits où une
 * réponse peut survivre à l'écriture qui aurait dû la tuer. « Ça marche en
 * local » est exactement la propriété que possède un produit dont la coupure ne
 * coupe pas en ligne (L-032).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CONTRE-TEST VIENT EN PREMIER, ET IL EN FAUT DEUX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. LA PAGE RÉPOND AVANT. Sans ce contrôle, « elle ne répond plus » serait
 *    vrai d'un jeton mal recopié, d'une commande jamais créée, d'un
 *    déploiement en panne — et l'on certifierait une coupure qui n'a jamais eu
 *    lieu.
 * 2. LA PAGE REVIENT APRÈS. Sans lui, une sonde passerait à 100 % sur un
 *    produit qui répond 404 à tout le monde en permanence.
 *
 * ⚠️ ET LE DÉLAI NE SE MESURE QUE SI L'ÉVÉNEMENT A EU LIEU. Une sonde qui
 * chronomètre l'écart entre l'écriture et la requête sans regarder ce que la
 * requête a rendu certifie un seuil sur un événement qui ne s'est pas produit :
 * défaut réel, constaté le 30/08/2026 sur la sonde locale.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE SONDE ÉTABLIT SUR LE CACHE, ET CE QU'ELLE N'ÉTABLIT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le brief demande de prouver que la page EST mise en cache AVANT de prétendre
 * mesurer une invalidation — sinon on mesure le vide. Ici la réponse est plus
 * simple, et elle est RELEVÉE plutôt que supposée : la sonde lit `Cache-Control`
 * sur la réponse servie. Tant qu'elle porte `no-store`, il n'y a aucun cache à
 * invalider sur cette route, et la coupure est directe. Le jour où cet en-tête
 * changerait, ce contrôle rougirait — c'est lui, et non un commentaire, qui
 * porte l'hypothèse.
 *
 *   node scripts/verifier-coupure.mjs https://droplink.fr
 *
 * Le jeu de mesure est créé puis SUPPRIMÉ par la sonde elle-même : elle
 * n'emprunte le compte de personne, et surtout pas celui d'un vrai vendeur —
 * suspendre un compte réel couperait les pages de ses clients pendant la mesure.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchResilient } from "./transport.mjs";

config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("http")) {
  console.error(
    "Usage : node scripts/verifier-coupure.mjs <base-url>\n" +
      "Exemple : node scripts/verifier-coupure.mjs https://droplink.fr",
  );
  process.exit(2);
}

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const cle = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !cle) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises : la\n" +
      "suspension s'écrit en base, elle ne se demande pas au produit.",
  );
  process.exit(2);
}

const service = createClient(url, cle, { auth: { persistSession: false } });

/** Seuil fixé AVANT la mesure, comme l'exige le protocole du projet. */
const SEUIL_S = 30;

const controles = [];
const constate = (ok, libelle) => controles.push([ok, libelle]);

/*
 * L'adresse du visiteur est posée en `x-real-ip` parce que le déploiement tourne
 * en `BORD_DE_CONFIANCE=railway`. Elle n'a d'effet que sur le plafond, et
 * Railway la réécrit de toute façon — mesuré le 04/09. Elle est ici pour que la
 * sonde ressemble à un vrai visiteur, pas pour contourner quoi que ce soit.
 */
const visiteur = { "user-agent": "sonde-coupure/1", accept: "text/html" };

/*
 * ⚠️ `fetchResilient` ET NON `fetch` — un contrôle qui échoue par intermittence
 * doit être BORNÉ, pas relancé jusqu'au vert. Ici un hoquet de transport lève,
 * donc il INTERROMPT la mesure : la sonde rendrait un écart en n'ayant rien
 * mesuré, et l'interruption tomberait entre la suspension et la réactivation,
 * c'est-à-dire à l'endroit le moins lisible du parcours.
 *
 * Le module ne réessaie qu'une COUPURE de transport — quand `fetch` rejette,
 * sans aucune réponse HTTP. Un 404 est une RÉPONSE, et c'est exactement celle
 * qu'on mesure : la réessayer masquerait le défaut au lieu de l'aléa.
 */
const lire = async (chemin) => {
  const r = await fetchResilient(`${base}${chemin}`, { headers: visiteur, redirect: "manual" });
  // Le corps doit être consommé, sinon la connexion reste ouverte et les
  // mesures de délai suivantes paient l'attente de la précédente.
  await r.arrayBuffer().catch(() => undefined);
  return { statut: r.status, cache: r.headers.get("cache-control") ?? "" };
};

let compte = null;
let profil = null;
let jeton = null;
let commande = null;

try {
  // ── LE JEU DE MESURE ──
  //
  // Même forme d'adresse que la sonde de fumée, DÉLIBÉRÉMENT : son ramasseur de
  // comptes abandonnés (`fumee-<horodatage>@exemple.test`, plus d'une heure)
  // nettoiera derrière celle-ci si elle est tuée en cours de route. Une adresse
  // à nous inventerait un second résidu que personne ne ramasse.
  const courriel = `fumee-${Date.now()}@exemple.test`;
  const { data: utilisateur, error: erreurCompte } = await service.auth.admin.createUser({
    email: courriel,
    email_confirm: true,
    password: "Chariot-Lilas-Tempete-91",
  });
  if (erreurCompte !== null || !utilisateur?.user) {
    throw new Error(
      `compte de mesure non créé : ${erreurCompte?.message ?? "aucune erreur, aucun utilisateur"}`,
    );
  }
  compte = utilisateur.user.id;

  const { data: p } = await service
    .from("profiles")
    .select("id")
    .eq("user_id", compte)
    .maybeSingle();
  profil = p?.id ?? null;
  if (profil === null) throw new Error("profil introuvable après création du compte");

  const { data: shop } = await service
    .from("shops")
    .select("id")
    .eq("owner_id", profil)
    .maybeSingle();
  if (!shop?.id) throw new Error("boutique introuvable après création du compte");

  const { data: cmd, error: erreurCommande } = await service
    .from("orders")
    .insert({
      shop_id: shop.id,
      customer_label: "Client de mesure",
      product_ref: "REF-COUPURE",
    })
    .select("id, public_token")
    .single();
  if (erreurCommande !== null || !cmd) {
    throw new Error(`commande de mesure non créée : ${erreurCommande?.message ?? "aucune ligne"}`);
  }
  commande = cmd.id;
  jeton = cmd.public_token;

  /*
   * ⚠️ IL FAUT UN VRAI MÉDIA, ET C'EST UN DÉFAUT QUE CETTE SONDE A EU.
   *
   * Le premier jet interrogeait `/p/<jeton>/media/<ID DE LA COMMANDE>` sur une
   * commande qui n'avait aucun média. La route rend 404 dans ce cas — pour
   * cause d'identifiant qui ne désigne rien, pas pour cause de suspension. Le
   * contrôle « les médias sont coupés eux aussi » était donc VERT sur un
   * produit dont la route média n'aurait jamais coupé : un ensemble vide passe
   * tout.
   *
   * La route s'appuie sur `lire_medias_publics`, une fonction DISTINCTE de
   * `lire_commande_publique` — elle refait le filtre de suspension pour son
   * propre compte. Rien ne garantit que les deux restent d'accord, et c'est
   * précisément ce que ce contrôle doit surveiller : une coupure à moitié faite
   * n'a pas eu lieu, puisque c'est l'URL de la photo qui circule, un client
   * enregistrant une image et non une page.
   */
  const idMedia = crypto.randomUUID();
  const { error: erreurMedia } = await service.from("order_media").insert({
    id: idMedia,
    order_id: commande,
    type: "photo",
    cle: `medias/${shop.id}/${commande}/${idMedia}.jpg`,
    cle_vignette: `medias/${shop.id}/${commande}/${idMedia}.vignette.webp`,
    cle_couverture: `medias/${shop.id}/${commande}/${idMedia}.couverture.webp`,
    largeur: 1200,
    hauteur: 1600,
    taille_octets: 240000,
    position: 0,
  });
  if (erreurMedia !== null) {
    throw new Error(
      `média de mesure non créé : ${erreurMedia.message}. Sans lui, le contrôle sur ` +
        "les médias serait vert sans rien avoir éprouvé.",
    );
  }

  console.log(`  jeu de mesure : ${courriel} — /p/${jeton}`);

  // ── CONTRE-TEST 1 : LA PAGE RÉPOND AVANT ──
  const avant = await lire(`/p/${jeton}`);
  constate(avant.statut === 200, `CONTRE-TEST : la page répond AVANT la suspension (${avant.statut})`);

  // ── CONTRE-TEST 1 bis : LA ROUTE MÉDIA RÉPOND AVANT ──
  //
  // Sans lui, le 404 d'après la suspension serait indistinguable d'un 404 pour
  // n'importe quelle autre raison — clé mal formée, média absent, R2 non
  // configuré.
  const mediasAvant = await lire(`/p/${jeton}/media/${idMedia}`);
  constate(
    mediasAvant.statut === 200,
    `CONTRE-TEST : la route média répond AVANT la suspension (${mediasAvant.statut})`,
  );

  // ── CE QUE DIT L'EN-TÊTE DE CACHE, RELEVÉ ET NON SUPPOSÉ ──
  constate(
    /no-store/.test(avant.cache),
    `la page publique interdit la mise en cache : « ${avant.cache || "(aucun en-tête)"} »`,
  );

  if (avant.statut !== 200) {
    throw new Error(
      "la page ne répond pas avant la suspension : toute mesure de coupure serait " +
        "un artefact. On s'arrête ici plutôt que de rendre un vert trompeur.",
    );
  }

  // ── LA COUPURE ──
  const depart = Date.now();
  const { error: erreurSuspension } = await service
    .from("profiles")
    .update({ status: "suspended" })
    .eq("id", profil);
  if (erreurSuspension !== null) {
    throw new Error(`suspension non écrite : ${erreurSuspension.message}`);
  }

  /*
   * ON INTERROGE JUSQU'À LA COUPURE, DANS LA LIMITE DU SEUIL — pas une fois.
   *
   * Un tir unique ne distingue pas « pas encore propagé » de « ne coupe
   * jamais » : les deux rendent 200. En bouclant, le délai relevé est le vrai
   * délai de propagation, et son absence est un échec BORNÉ plutôt qu'un
   * soupçon.
   */
  let pendant = { statut: 0, cache: "" };
  let delai = 0;
  const echeance = depart + SEUIL_S * 1000;
  for (;;) {
    pendant = await lire(`/p/${jeton}`);
    delai = (Date.now() - depart) / 1000;
    if (pendant.statut !== 200 || Date.now() >= echeance) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const coupe = pendant.statut === 404;
  constate(coupe, `la suspension coupe la page (statut ${pendant.statut})`);
  constate(
    coupe && delai < SEUIL_S,
    coupe
      ? `la coupure prend ${delai.toFixed(1)} s (seuil ${SEUIL_S})`
      : `délai NON MESURABLE : la page répond encore (${pendant.statut}) après ${delai.toFixed(1)} s`,
  );

  /*
   * LES MÉDIAS AUSSI. Une coupure à moitié faite est une coupure qui n'a pas eu
   * lieu : la page peut cesser de répondre pendant que les photos restent
   * atteignables par leur URL directe — et c'est l'URL directe qui circule,
   * puisqu'un client enregistre une image, pas une page.
   */
  const medias = await lire(`/p/${jeton}/media/${idMedia}`);
  constate(medias.statut !== 200, `les médias sont coupés eux aussi (statut ${medias.statut})`);

  // ── CONTRE-TEST 2 : LA RÉACTIVATION REND LA PAGE, SUR LE MÊME LIEN ──
  const { error: erreurRetour } = await service
    .from("profiles")
    .update({ status: "active" })
    .eq("id", profil);
  if (erreurRetour !== null) {
    throw new Error(`réactivation non écrite : ${erreurRetour.message}`);
  }

  let apres = { statut: 0, cache: "" };
  const echeanceRetour = Date.now() + SEUIL_S * 1000;
  for (;;) {
    apres = await lire(`/p/${jeton}`);
    if (apres.statut === 200 || Date.now() >= echeanceRetour) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  constate(
    apres.statut === 200,
    `CONTRE-TEST : la réactivation rétablit la page SUR LE MÊME LIEN (${apres.statut})`,
  );
} catch (erreur) {
  constate(false, `la sonde s'est interrompue : ${erreur.message}`);
} finally {
  // Le jeu de mesure ne survit pas à la mesure. La suppression du compte
  // emporte profil, boutique et commande par cascade.
  if (compte !== null) {
    const { error } = await service.auth.admin.deleteUser(compte);
    if (error !== null) {
      console.error(
        `⚠️ compte de mesure ${compte} NON supprimé : ${error.message} — il compterait ` +
          "dans les écrans d'administration, où il fausserait une métrique de verdict.",
      );
    }
  }
}

/*
 * ⚠️ UN ENSEMBLE VIDE PASSE TOUT. Le plancher dit combien de contrôles cette
 * sonde DOIT rendre : sans lui, une interruption précoce sortirait « 0 écart »
 * en n'ayant rien éprouvé.
 */
const PLANCHER = 7;

console.log("");
for (const [ok, libelle] of controles) console.log(`  ${ok ? "OK  " : "ÉCART"} ${libelle}`);

const ecarts = controles.filter(([ok]) => !ok).length;
const insuffisant = controles.length < PLANCHER;
console.log(
  `\n${controles.length} contrôle(s), ${ecarts} écart(s)` +
    (insuffisant ? ` — INSUFFISANT, il en faut ${PLANCHER}` : ""),
);
process.exit(ecarts > 0 || insuffisant ? 1 : 0);

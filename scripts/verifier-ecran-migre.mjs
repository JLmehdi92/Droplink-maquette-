/**
 * LA CHECK-LIST D UN ECRAN MIGRE, EXECUTEE.
 *
 * ⚠️ POURQUOI UN OUTIL PLUTOT QUE ONZE MESURES A LA MAIN. La refonte du design
 * migre une vingtaine d ecrans, et la consigne de Wassim est la meme pour
 * chacun : bureau, telephone a 390 px, les trois langues, `prefers-reduced-motion`,
 * puis les portes. Refaire la check-list a la main a chaque ecran, c est
 * l oublier au troisieme — et l oubli ne se voit pas, puisqu il ne produit
 * aucune ligne.
 *
 * ⚠️ IL EMULE REELLEMENT LE TACTILE, et il l AFFIRME. `setDeviceMetricsOverride`
 * change la mise en page, PAS la nature du pointeur : sans
 * `setTouchEmulationEnabled`, `@media (pointer: coarse)` ne s applique jamais et
 * le plancher de 44 px de `globals.css` non plus. La sonde rend `coarse` dans
 * son rapport ; un rapport ou il vaut `false` ne decrit pas un telephone.
 *
 * ⚠️ IL SE SERT CONTRE LA BASE DE TESTS, JAMAIS LA PRODUCTION. Il cree son
 * compte, mesure, et le purge. L ordre de chargement `.env.test.local` d abord
 * est une propriete de securite, pas un detail (L-032).
 *
 * Usage :
 *   node scripts/verifier-ecran-migre.mjs <base> "<routes>" [largeurs] [dossier de captures]
 *   node scripts/verifier-ecran-migre.mjs http://localhost:3000 "/fr/commandes" 1440,390
 */
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { VERDICT_POLICES, exigerPolices } from "./sonde-polices.mjs";

config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const routes = (process.argv[3] ?? "")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
/*
 * ⚠️ LA CAPTURE EXISTE PARCE QUE LES NOMBRES NE DISENT PAS TOUT. Le rapport
 * etablit qu un ecran ne deborde pas, qu il a un seul `h1` et aucune cible sous
 * 44 px — il ne dit RIEN de sa ressemblance avec la reference, qui est
 * pourtant la consigne : « comparer a la page de reference, valeur par valeur ».
 * Deux fois deja, un ecran a passe tous les seuils en rendant autre chose que
 * ce qui etait dessine.
 *
 * Elle est FACULTATIVE et hors du chemin par defaut : une capture ne se compare
 * pas toute seule, c est un oeil qui la lit.
 */
const dossierCaptures = process.argv[5] ?? null;
const largeurs = (process.argv[4] ?? "1440,390")
  .split(",")
  .map((l) => Number(l.trim()))
  .filter((l) => Number.isFinite(l));

if (base === "" || routes.length === 0) {
  console.error('usage : node scripts/verifier-ecran-migre.mjs <base> "/fr/commandes,/fr/envois" [1440,390]');
  process.exit(1);
}

const urlSupabase = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const refProd = process.env["SUPABASE_PROJECT_REF"];
if (refProd !== undefined && (urlSupabase ?? "").includes(refProd)) {
  console.error(`ARRET : la base visee est la PRODUCTION (${urlSupabase}).`);
  process.exit(1);
}

const service = createClient(urlSupabase, process.env["SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false },
});
const publiable = createClient(urlSupabase, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
  auth: { persistSession: false },
});

/*
 * ⚠️ LE `finally` NE SUFFIT PAS : UN PROCESSUS TUÉ N'Y PASSE PAS. Mesuré le
 * 17/09/2026 : la base de tests ne portait plus qu'UN compte, un « ecran-… »
 * laissé par un passage arrêté en cours de route la veille. Chaque mesure en
 * ajoutait un second — 2 boutiques, 2 comptes, 8 commandes au lieu de 4 — et
 * quatre écrans d'administration sont sortis rouges au bureau : « 1 boutique au
 * total » s'appariait soudain à « 124 boutiques au total », l'accord du nom ne
 * les séparant plus. Rien n'était cassé, sauf le jeu de mesure.
 *
 * Un passage purge donc, avant de créer le sien, les comptes de sonde de plus de
 * trente minutes : aucune mesure ne dure autant, et un compte plus jeune peut
 * appartenir à un passage qui tourne encore.
 */
const ABANDON_MS = 30 * 60 * 1000;
{
  const { data: liste, error: eListe } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (eListe) throw new Error(eListe.message);
  for (const u of liste.users) {
    if (!/^ecran-[a-z0-9]+@droplink-tests\.invalid$/.test(u.email ?? "")) continue;
    if (Date.now() - Date.parse(u.created_at) < ABANDON_MS) continue;
    const { error: eSuppr } = await service.auth.admin.deleteUser(u.id);
    if (eSuppr) throw new Error(`compte de sonde abandonné ${u.email} : ${eSuppr.message}`);
    console.error(`[sonde] compte abandonné purgé : ${u.email} (${u.created_at})`);
  }
}

const MOT_DE_PASSE = "Chariot-Lilas-Tempete-91";
const marque = Math.random().toString(36).slice(2, 8);
const courriel = `ecran-${marque}@droplink-tests.invalid`;
const { data: cree, error: eCree } = await service.auth.admin.createUser({
  email: courriel,
  password: MOT_DE_PASSE,
  email_confirm: true,
});
if (eCree) throw new Error(eCree.message);

/*
 * ⚠️ LE COMPTE DE MESURE EST SUPPRIMÉ DANS UN `finally`, ET IL NE L'ÉTAIT PAS.
 * La suppression vivait à la dernière ligne : tout passage interrompu — police
 * de repli, écran qui rend 404, mesure qui lève — laissait derrière lui un
 * compte ADMINISTRATEUR, sa boutique, ses quatre commandes et leurs médias.
 * Mesuré le 14/09/2026 : la liste admin des commandes, première à lister TOUTE
 * la plateforme, montrait une trentaine de comptes « ecran-… » accumulés, et
 * chacun déplaçait les chiffres des écrans suivants. Personne ne les voyait,
 * parce qu'aucun écran ne listait ce que la sonde laissait.
 */
try {

const { data: profil } = await service
  .from("profiles")
  .select("id")
  .eq("user_id", cree.user.id)
  .single();
/*
 * `ONBOARDING=1` : LE TYPE DE COMPTE RESTE NUL. `/bienvenue` renvoie aux
 * commandes tout compte qui l'a déjà déclaré : sans cette variable, la sonde
 * mesurerait la liste des commandes en croyant mesurer l'onboarding.
 */
await service
  .from("profiles")
  .update({ account_type: process.env["ONBOARDING"] === "1" ? null : "reseller", role: "admin" })
  .eq("id", profil.id);
const { data: shop } = await service.from("shops").select("id").eq("owner_id", profil.id).single();
/* ⚠️ LA DESCRIPTION EST POSEE, SINON LE CHAMP MESURE SON CAS VIDE. Elle
   apparait sur l ecran de marque ET dans l en-tete de la page client : sans
   elle, ni le compteur ni la deuxieme ligne de l en-tete ne sont exerces. */
await service
  .from("shops")
  .update({
    name: "Atelier de verification",
    description: "Vetements · Sneakers · Accessoires",
    /* ⚠️ LES TROIS RESEAUX SONT POSES, SINON LA PAGE CLIENT MESURE LEUR ABSENCE.
       L en-tete de boutique et la carte « Une question ? » ne rendent rien
       sans lien configure : le kit les dessine, et la sonde ne pouvait alors
       ni rougir sur leurs puces ni verifier leurs cibles tactiles. */
    instagram_url: "https://instagram.com/atelier.verification",
    tiktok_url: "https://www.tiktok.com/@atelier.verification",
    whatsapp_url: "https://wa.me/33612345678",
    /* ⚠️ LA PAGE CLIENT NE SE MESURE PAS EN ANGLAIS PAR SON URL : elle vit hors
       de `[locale]` et prend la langue de la BOUTIQUE. `LANGUE_BOUTIQUE=en`
       est donc le seul moyen de la verifier dans une autre langue. */
    default_language: process.env["LANGUE_BOUTIQUE"] ?? "fr",
  })
  .eq("id", shop.id);
/*
 * ⚠️ QUATRE COMMANDES, UNE PAR STATUT, ET PAS UNE SEULE.
 *
 * Avec une seule ligne en transit, la sonde ne voyait qu UNE pastille de statut
 * sur quatre et des compteurs a zero — donc elle ne pouvait pas rougir sur une
 * teinte oubliee ni sur un chiffre a deux caracteres. Un jeu qui n exerce qu un
 * cas certifie ce cas et se tait sur les autres.
 */
const { data: commandes } = await service
  .from("orders")
  .insert(
    [
      ["Client de verification", "REF-V", "en_transit", "DLKMESURE0001FR"],
      ["Cliente en preparation", "REF-P", "preparation", ""],
      ["Client expedie", "REF-E", "expedie", ""],
      ["Cliente livree", "REF-L", "livre", "DLKMESURE0002CN"],
    ].map(([customer_label, product_ref, status, tracking_number]) => ({
      shop_id: shop.id,
      customer_label,
      product_ref,
      status,
      tracking_number,
    })),
  )
  .select("id, public_token");

/*
 * ⚠️ LES ECRANS DE DETAIL ONT UN IDENTIFIANT DANS LEUR URL, et on ne peut pas
 * l ecrire a l avance. Le jeton `{commande}` dans une route est remplace par
 * l identifiant de la premiere commande creee : sans lui, `/fr/commandes/[id]`
 * — l editeur, l ecran le plus dense du produit — n etait tout simplement pas
 * mesurable par cet outil.
 */
const idCommande = commandes?.[0]?.id ?? "";
/* Le jeton public de la meme commande, pour mesurer `/p/[token]` dans la
   foulee : c est la seule page du produit dont l URL n est pas devinable. */
const jetonPublic = commandes?.[0]?.public_token ?? "";

/*
 * `LIEN_BLOQUE` : LA PREMIERE COMMANDE A SON LIEN BLOQUE PAR L ADMINISTRATION (168), pour les
 * planches `#commandes-bloquee` et `#commande-bloquee…`. `1` : bloque seul. `attente` : une
 * contestation attend. `refusee` : une contestation refusee, avec la reponse de DropLink. Les
 * textes sont ceux de la planche, mot pour mot, sans quoi la soustraction mesurerait le jeu.
 * Ecrit par le client de SERVICE : la mesure prepare un etat, elle n eprouve pas un droit.
 */
const lienBloque = process.env["LIEN_BLOQUE"];
if (lienBloque !== undefined && lienBloque !== "" && idCommande !== "") {
  const bloqueLe = new Date(Date.now() - 7 * 86400000).toISOString();
  await service
    .from("orders")
    .update({ admin_blocked_at: bloqueLe, admin_block_reason: "Signalement d’un ayant droit concernant les photos de cette commande." })
    .eq("id", idCommande);
  if (lienBloque === "attente" || lienBloque === "refusee") {
    await service.from("link_contests").insert({
      order_id: idCommande,
      shop_id: shop.id,
      blocked_at: bloqueLe,
      message: "Ce produit est le mien : voici la facture d’achat auprès de mon fournisseur, datée du 2 septembre.",
      ...(lienBloque === "refusee"
        ? {
            status: "refusee",
            decided_at: new Date(Date.now() - 86400000).toISOString(),
            admin_response: "La facture jointe ne correspond pas au produit signalé.",
          }
        : {}),
    });
  }
}

/*
 * ⚠️ DEUX COLIS, DONT UN SILENCIEUX, PARCE QU UN ECRAN VIDE NE MESURE RIEN.
 *
 * Sans eux, `/envois` rendait son etat vide : la sonde y voyait une carte et une
 * phrase, donc elle ne pouvait rougir ni sur une pastille d etat, ni sur une
 * ligne de tableau, ni sur la carte ambree du silence — c est-a-dire sur tout ce
 * que cet ecran existe pour montrer. Un jeu qui n exerce que le cas vide
 * certifie le cas vide.
 *
 * Le second colis n a pas bouge depuis 14 jours : c est au-dela du seuil de dix
 * jours du brief, donc il declenche reellement la famille ambree du silence.
 */
const jours = (n) => new Date(Date.now() - n * 86400000).toISOString();
/*
 * LE MEME JOUR, LE MOIS DERNIER — relatif, jamais ecrit en dur.
 *
 * Il sert au badge d evolution, qui compare le mois en cours au MEME intervalle
 * du mois precedent. Une date fixe aurait expire comme celle de la sonde de
 * fumee, qui a bascule le 12/09 au matin parce que son dernier mouvement avait
 * atteint le seuil du silence.
 */
const moisDernier = () => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString();
};
/*
 * ⚠️ UNE INSERTION DE JEU DE MESURE QUI ECHOUE DOIT ARRETER LA SONDE.
 *
 * Celle-ci ignorait son erreur : `carrier_code` de `tracked_parcels` est un
 * ENTIER — l identifiant du fournisseur de suivi — et on y ecrivait le texte
 * « la-poste ». Postgres refusait (22P02), la sonde continuait, l ecran des
 * envois rendait son etat VIDE, et le rapport disait « aucun debordement,
 * aucune cible trop petite » — sur un tableau qui n existait pas. C est la
 * meme famille que la sonde qui mesurait l ecran de connexion en croyant
 * mesurer le tableau de bord : des chiffres coherents et faux.
 */
const { data: colis, error: eColis } = await service
  .from("tracked_parcels")
  .insert([
    {
      shop_id: shop.id,
      tracking_number: "DLKMESURE0001FR",
      carrier_code: 100003,
      normalized_status: "en_transit",
      // ⚠️ `created_at` EST POSE SUR LES TROIS COLIS, PAS SEULEMENT SUR CELUI
      // QUI EN A BESOIN. PostgREST construit son INSERT par lot sur l UNION des
      // cles de toutes les lignes, et met NULL partout ou une ligne ne porte pas
      // la colonne : ajouter la date au seul troisieme colis faisait echouer
      // l insertion des deux premiers sur la contrainte `not null`. Le message
      // designe alors la colonne, jamais la ligne fautive.
      created_at: jours(3),
      first_movement_at: jours(3),
      last_movement_at: jours(1),
      query_count: 4,
      /*
       * UNE ARRIVEE ANNONCEE, POUR QUE LA COLONNE « PROCHAINE ETAPE » AIT
       * QUELQUE CHOSE A RENDRE.
       *
       * ⚠️ RELATIVE A L INSTANT DU PASSAGE, jamais ecrite en dur. Une sonde de
       * fumee portait « 2026-09-02 » et a EXPIRE le 12/09 : son dernier
       * mouvement avait alors dix jours, soit le seuil du silence, la page a
       * retire la prevision comme elle le doit, et le contre-test est passe au
       * rouge sans qu aucun defaut du produit soit en cause. Une valeur de jeu
       * de mesure qui depend du calendrier ne mesure pas ce qu elle croit.
       */
      estimated_from: jours(-1),
      estimated_to: jours(-2),
    },
    {
      /*
       * UN COLIS DU MOIS DERNIER, POUR QUE LE BADGE D EVOLUTION AIT DE QUOI SE
       * CALCULER.
       *
       * ⚠️ SANS LUI, LE BADGE NE S AFFICHE JAMAIS ET ON NE PEUT PAS PROUVER
       * QU IL FONCTIONNE. La regle du produit veut qu une evolution disparaisse
       * quand le mois precedent est vide — passer de 0 a 5 n est pas « +500 % ».
       * Le jeu de mesure creait donc tous ses colis le meme jour, le badge etait
       * legitimement absent, et rien ne distinguait « la regle s applique » de
       * « le calcul est casse ». Un contre-test qui ne rend jamais l element
       * qu il verifie ne verifie rien.
       *
       * `created_at` est FORCE : la colonne porte un `default now()`, et sans
       * valeur explicite ce colis naitrait ce mois-ci comme les autres.
       */
      shop_id: shop.id,
      tracking_number: "DLKMESURE0003FR",
      carrier_code: 100001,
      normalized_status: "livre",
      created_at: moisDernier(),
      first_movement_at: moisDernier(),
      last_movement_at: moisDernier(),
      query_count: 7,
    },
    {
      shop_id: shop.id,
      tracking_number: "DLKMESURE0002CN",
      carrier_code: 190094,
      normalized_status: "en_transit",
      created_at: jours(21),
      first_movement_at: jours(21),
      last_movement_at: jours(14),
      query_count: 12,
    },
    {
      /*
       * ⚠️ UN COLIS LIVRE DANS LA FENETRE, POUR QUE LE TEMPS MOYEN DE LIVRAISON
       * AIT QUELQUE CHOSE A MOYENNER.
       *
       * Le seul autre colis livre du jeu nait le MOIS DERNIER — il sert au badge
       * d evolution des envois —, donc il tombe hors des fenetres de 7 et 30
       * jours de l ecran des analyses. Sans celui-ci, `delai_moyen_livraison`
       * rend `null` sur deux periodes sur trois et la tuile est legitimement
       * absente : on ne pouvait pas distinguer « la regle s applique » de « le
       * calcul est casse ».
       *
       * Six jours entre le premier et le dernier mouvement : une valeur qui se
       * lit, et qui n est pas un compte rond.
       */
      shop_id: shop.id,
      tracking_number: "DLKMESURE0004FR",
      carrier_code: 100003,
      normalized_status: "livre",
      created_at: jours(9),
      first_movement_at: jours(9),
      last_movement_at: jours(3),
      query_count: 5,
    },
  ])
  .select("id");

if (eColis) throw new Error("jeu de mesure : colis non crees — " + eColis.message);
if (colis === null || commandes === null) throw new Error("jeu de mesure : lecture vide");

const { error: eLien } = await service.from("order_parcels").insert(
  colis.map((c, i) => ({ order_id: commandes[i % commandes.length].id, parcel_id: c.id })),
);
if (eLien) throw new Error("jeu de mesure : colis non rattaches — " + eLien.message);
/*
 * ⚠️ DES POINTS DE PASSAGE, SINON LA FRISE DE L EDITEUR MESURE SON CAS VIDE.
 *
 * Le jeu creait deux colis SANS aucun `parcel_checkpoints`. La frise verticale
 * de `/fr/commandes/{commande}` rend alors ses quatre etapes sans date et sans
 * note — c est-a-dire exactement ce qu elle rend pour une commande neuve. La
 * sonde ne pouvait donc rougir ni sur un chevauchement de date, ni sur une note
 * trop longue, ni sur une etape mal datee : elle certifiait le vide, et c est la
 * meme famille que le `carrier_code` refuse en silence juste au-dessus.
 *
 * Les etapes sont DANS LE DESORDRE a l insertion, volontairement : c est la
 * lecture qui doit les ordonner, et une lecture qui compte sur l ordre
 * d insertion marche jusqu au jour ou deux scans arrivent dans le mauvais sens.
 */
const { error: ePoints } = await service.from("parcel_checkpoints").insert([
  {
    parcel_id: colis[0].id,
    occurred_at: jours(1),
    location: "Roissy, France",
    description: "Colis arrive au centre de tri international et pris en charge",
    stage: "en_transit",
  },
  {
    parcel_id: colis[0].id,
    occurred_at: jours(3),
    location: "Guangzhou, Chine",
    description: "Colis remis au transporteur",
    stage: "expedie",
  },
  {
    parcel_id: colis[1].id,
    occurred_at: jours(21),
    location: null,
    description: "Colis enregistre",
    stage: "expedie",
  },
]);
if (ePoints) throw new Error("jeu de mesure : points de passage non crees — " + ePoints.message);

/*
 * ⚠️ DES MEDIAS ET DES EVENEMENTS, SINON L EDITEUR MESURE SES DEUX PANNEAUX
 * VIDES — ET ON DECLARERAIT COMME « DONNEE ABSENTE » CE QUI N EST QU UN JEU DE
 * MESURE PAUVRE.
 *
 * `/fr/commandes/{commande}` porte une grille de vignettes et un journal. Sans
 * une seule ligne dans `order_media` ni dans `order_events`, les deux rendent
 * leur etat vide : la soustraction au kit signalait alors cinq vignettes et
 * quatre lignes de journal comme MANQUANTES, et la tentation etait de les
 * declarer « la base ne les porte pas » — alors que la base les porte depuis
 * les migrations 013 et 023. C est le meme defaut que les deux colis absents
 * du 12/09, une table plus loin.
 *
 * Les cles designent des objets qui N EXISTENT PAS dans le bucket, et c est
 * sans consequence : la signature est calculee hors ligne, la boite de la
 * vignette est rendue et mesuree, seul le pixel de l image manque. On mesure de
 * la geometrie, pas des photos.
 */
const { data: medias, error: eMedias } = await service
  .from("order_media")
  .insert(
    [0, 1, 2, 3, 4].map((i) => {
      /*
       * ⚠️ DEUX REGLES EN BASE BORNENT CETTE CLE, ET AUCUNE N EST DANS LE CODE
       * QUI ECRIT. Un declencheur (098) verifie l APPARTENANCE — le prefixe
       * `medias/<boutique>/<commande>/` — et une contrainte (097) verifie la
       * FORME : trois UUID puis une extension connue, la vignette devant etre
       * DERIVEE de la cle du media. Inventer une cle « qui a l air bonne »
       * echoue sur `DL039` ou sur `order_media_cle_canonique`. C est
       * exactement l interet de les avoir mises en base.
       */
      const base = `medias/${shop.id}/${commandes[0].id}/${randomUUID()}`;
      return {
        order_id: commandes[0].id,
        type: i === 4 ? "video" : "photo",
        cle: base + (i === 4 ? ".mp4" : ".jpg"),
        cle_vignette: base + ".vignette.webp",
        largeur: 1200,
        hauteur: 1200,
        taille_octets: 120000 + i,
        // ⚠️ POSE SUR LES CINQ LIGNES : PostgREST construit son INSERT par lot
        // sur l UNION des cles, et une seule ligne porteuse mettrait NULL
        // ailleurs.
        duree_s: i === 4 ? 42 : null,
        position: i,
      };
    }),
  )
  .select("id");
if (eMedias) throw new Error("jeu de mesure : medias non crees — " + eMedias.message);

/* La couverture est une PROPRIETE DE LA COMMANDE, pas du media : l editeur
   dessine sa pastille depuis `orders.cover_media_id`, et sans elle aucune des
   cinq vignettes ne rend l etat « couverture ». */
const { error: eCouverture } = await service
  .from("orders")
  .update({ cover_media_id: medias[0].id })
  .eq("id", commandes[0].id);
if (eCouverture) throw new Error("jeu de mesure : couverture non posee — " + eCouverture.message);

/*
 * QUATRE EVENEMENTS, COMME LE KIT — et de QUATRE TYPES DIFFERENTS.
 *
 * Quatre lignes du meme type ne prouveraient qu un gabarit. Chacune porte ici
 * une charge utile distincte, parce que c est la charge qui fait varier le
 * detail affiche — et le detail est la seule partie de la ligne qui peut
 * deborder.
 */
const { error: eEvts } = await service.from("order_events").insert([
  { order_id: commandes[0].id, type: "commande_creee", actor: "vendeur", occurred_at: jours(3), payload: {} },
  { order_id: commandes[0].id, type: "media_ajoute", actor: "vendeur", occurred_at: jours(3), payload: { nombre: 5 } },
  { order_id: commandes[0].id, type: "commande_modifiee", actor: "vendeur", occurred_at: jours(2), payload: { champ: "tracking_number" } },
  { order_id: commandes[0].id, type: "qc_approuve", actor: "client", occurred_at: jours(1), payload: {} },
]);
if (eEvts) throw new Error("jeu de mesure : evenements non crees — " + eEvts.message);

/*
 * ⚠️ DES OUVERTURES DE LIENS, ETALEES SUR PLUSIEURS JOURS.
 *
 * Le graphe « Liens clients » de l ecran des analyses compte une ligne par
 * visiteur ET PAR JOUR — c est la definition de la metrique, pas un detail
 * d implementation (migration 018). Sans ces lignes il rend une grille de
 * barres a zero : la sonde ne peut alors rougir ni sur une barre trop haute,
 * ni sur un axe mal date, ni sur le compteur qui les surmonte.
 *
 * Les empreintes sont DISTINCTES par ligne : l unicite porte sur
 * (commande, ip, agent, jour), et quatre lignes identiques n en feraient
 * qu une — le graphe serait plat et on croirait le calcul faux.
 *
 * `views_count` de la commande suit par declencheur : c est lui que lisent les
 * tuiles et le classement des plus consultees, et le poser a la main ici en
 * ferait une seconde source.
 */
const { error: eVues } = await service.from("link_views").insert(
  [1, 2, 2, 3, 5, 5, 5, 6].map((quand, i) => ({
    order_id: commandes[i % 2].id,
    viewed_at: jours(quand),
    ip_hash: `mesure-ip-${i}`,
    user_agent_hash: `mesure-ua-${i}`,
    country: i % 2 === 0 ? "FR" : "BE",
  })),
);
if (eVues) throw new Error("jeu de mesure : vues non creees — " + eVues.message);

/*
 * ⚠️ DEUX ARBITRAGES DE CONTROLE QUALITE, SINON LA TUILE « TAUX DE VALIDATION »
 * RESTE A « — » ET NE PROUVE RIEN.
 *
 * Le taux se calcule sur ce qui a ete REPONDU — approuve plus refuse —, et les
 * quatre commandes du jeu naissent en `en_attente`. La tuile rendait donc
 * legitimement un tiret, et rien ne distinguait « la regle du null s applique »
 * de « le calcul est casse ». Un refus ET une approbation : un taux de 50 %,
 * qui n est ni 0 ni 100, donc qui ne peut pas coincider par hasard avec une
 * borne.
 */
const { error: eQc } = await service
  .from("orders")
  .update({ qc_status: "approuve" })
  .eq("id", commandes[0].id);
if (eQc) throw new Error("jeu de mesure : qc non pose — " + eQc.message);
const { error: eQc2 } = await service
  .from("orders")
  .update({ qc_status: "refuse" })
  .eq("id", commandes[1].id);
if (eQc2) throw new Error("jeu de mesure : qc non pose — " + eQc2.message);

/*
 * ⚠️ LA DATE DE MISE A JOUR DES COLIS EST FIXEE — ET SUR CELLE DU KIT.
 *
 * L en-tete des envois affiche « Derniere mise a jour » du colis le plus
 * recent. Laissee a l instant du passage, elle changeait la largeur de son bloc
 * CHAQUE MINUTE (« 21:33 » n a pas la largeur de « 11:11 ») et CHAQUE MOIS
 * (« septembre » contre « mai ») : le bouton « Actualiser » glissait de zero a
 * treize pixels, sa declaration mourait un passage sur deux, et en octobre la
 * date entiere serait sortie de l appariement.
 *
 * ELLE SE POSE ICI, EN FIN DE JEU, ET PAS A L INSERTION : le declencheur
 * `tracked_parcels_updated_at` la reecrit a chaque point de passage insere.
 * Une transaction le suspend le temps d une ecriture et le retablit — si
 * quoi que ce soit echoue, le `rollback` le rend actif, jamais a moitie.
 * Quatre dates DISTINCTES, parce que la liste est triee sur cette colonne :
 * des dates egales laissaient l ordre a l identifiant, tire au hasard.
 */
{
  const urlBase = process.env["SUPABASE_DB_URL"] ?? "";
  if (urlBase === "" || (refProd !== undefined && urlBase.includes(refProd))) {
    throw new Error("jeu de mesure : SUPABASE_DB_URL absente ou visant la production");
  }
  const { default: pg } = await import("pg");
  const connexion = new pg.Client({ connectionString: urlBase });
  await connexion.connect();
  try {
    await connexion.query("begin");
    await connexion.query("alter table public.tracked_parcels disable trigger tracked_parcels_updated_at");
    const { rowCount } = await connexion.query(
      `update public.tracked_parcels p
          set updated_at = v.date
         from (values ('DLKMESURE0001FR', timestamptz '2025-09-08 14:32:00+02'),
                      ('DLKMESURE0002CN', timestamptz '2025-09-08 14:31:00+02'),
                      ('DLKMESURE0004FR', timestamptz '2025-09-08 14:30:00+02'),
                      ('DLKMESURE0003FR', timestamptz '2025-09-08 14:29:00+02')) as v(numero, date)
        where p.shop_id = $1 and p.tracking_number = v.numero`,
      [shop.id],
    );
    await connexion.query("alter table public.tracked_parcels enable trigger tracked_parcels_updated_at");
    if (rowCount !== 4) throw new Error(`jeu de mesure : ${rowCount} colis dates sur 4`);
    await connexion.query("commit");
  } catch (erreur) {
    await connexion.query("rollback");
    throw erreur;
  } finally {
    await connexion.end();
  }
}

console.error(
  `[jeu] ${commandes.length} commandes, ${colis.length} colis dont un silencieux, 3 points de passage, ` +
    `${medias.length} medias dont une couverture, 4 evenements, 8 ouvertures de lien.`,
);

/*
 * `DEUX_ETAPES=1` : LE COMPTE DE MESURE ACTIVE LA DOUBLE AUTHENTIFICATION, et la
 * session servie au navigateur est une session NEUVE, donc `aal1`. C'est le seul
 * moyen de rendre l'écran `/verification` — il renvoie ailleurs toute session
 * qui n'a rien à vérifier. Le facteur est enrôlé et vérifié sur un client à
 * part, avec un code calculé selon la RFC 6238 : un vrai facteur, pas un décor.
 */
if (process.env["DEUX_ETAPES"] === "1") {
  const { createHmac } = await import("node:crypto");
  const codeTotp = (secret) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const c of secret.replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
    const octets = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
    const compteur = Buffer.alloc(8);
    compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const h = createHmac("sha1", Buffer.from(octets)).update(compteur).digest();
    const o = h[19] & 15;
    return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
  };
  const enroleur = createClient(urlSupabase, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
    auth: { persistSession: false },
  });
  await enroleur.auth.signInWithPassword({ email: courriel, password: MOT_DE_PASSE });
  const { data: facteur, error: eEnrole } = await enroleur.auth.mfa.enroll({ factorType: "totp", friendlyName: "mesure" });
  if (eEnrole) throw new Error("jeu de mesure : enrôlement impossible — " + eEnrole.message);
  const { error: eVerif } = await enroleur.auth.mfa.challengeAndVerify({
    factorId: facteur.id,
    code: codeTotp(facteur.totp.secret),
  });
  if (eVerif) throw new Error("jeu de mesure : facteur non vérifié — " + eVerif.message);
  console.error("[jeu] double authentification activée : la session servie sera aal1.");
}

/*
 * `RECUPERATION=1` : LA SESSION SERVIE EST CELLE D'UN LIEN DE RÉINITIALISATION.
 * `/nouveau-mot-de-passe` n'accepte qu'une session dont la méthode est `otp` —
 * celle qu'ouvre le lien reçu par email —, et renvoie toute autre à la
 * connexion : la sonde mesurerait la connexion en croyant mesurer l'écran. Le
 * lien est RÉEL — généré par l'API d'administration de la base de tests, puis
 * vérifié comme le navigateur le ferait —, jamais une session maquillée.
 */
async function ouvrirSession() {
  if (process.env["RECUPERATION"] !== "1") {
    return publiable.auth.signInWithPassword({ email: courriel, password: MOT_DE_PASSE });
  }
  const { data: lien, error: eLien } = await service.auth.admin.generateLink({ type: "recovery", email: courriel });
  if (eLien) throw new Error("jeu de mesure : lien de récupération impossible — " + eLien.message);
  const reponse = await publiable.auth.verifyOtp({ token_hash: lien.properties.hashed_token, type: "recovery" });
  if (reponse.error) throw new Error("jeu de mesure : lien de récupération refusé — " + reponse.error.message);
  console.error("[jeu] session ouverte par un lien de récupération (méthode otp).");
  return reponse;
}
const { data: sess } = await ouvrirSession();

/*
 * ⚠️ LE COOKIE DE SESSION N EST PAS `sb-access-token`. Supabase le nomme
 * `sb-<ref>-auth-token` et y met la session ENTIERE, encodee en base64 avec un
 * prefixe litteral. Poser deux cookies aux noms inventes ne leve rien : le
 * middleware ne trouve pas de session, redirige vers la connexion, et la sonde
 * mesure l ecran de connexion en croyant mesurer le tableau de bord. C est
 * exactement ce qui s est produit au premier essai.
 *
 * Au-dela de 3180 octets le cookie est decoupe en `.0`, `.1`, … — un compte
 * reel depasse cette borne des que ses metadonnees grossissent.
 */
const s = sess.session;
const ref = new URL(urlSupabase).hostname.split(".")[0];
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
const valeurCookie = "base64-" + Buffer.from(JSON.stringify(mince)).toString("base64");
const cookies =
  valeurCookie.length <= 3180
    ? [{ name: `sb-${ref}-auth-token`, value: valeurCookie }]
    : (valeurCookie.match(/.{1,3180}/g) ?? []).map((m, i) => ({
        name: `sb-${ref}-auth-token.${i}`,
        value: m,
      }));

const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const nav = new WebSocket(webSocketDebuggerUrl);
let compteur = 0;
const attentes = new Map();
/* Les ÉVÉNEMENTS du navigateur, par session : console, exceptions, réseau. */
const ecouteurs = new Map();
nav.addEventListener("message", (m) => {
  const j = JSON.parse(m.data);
  if (j.method !== undefined && j.sessionId !== undefined) ecouteurs.get(j.sessionId)?.(j.method, j.params);
  if (attentes.has(j.id)) {
    const { resoudre, rejeter } = attentes.get(j.id);
    attentes.delete(j.id);
    if (j.error) rejeter(new Error(JSON.stringify(j.error)));
    else resoudre(j.result);
  }
});
await new Promise((r) => nav.addEventListener("open", r, { once: true }));
const brut = (methode, params, sessionId) =>
  new Promise((resoudre, rejeter) => {
    const id = ++compteur;
    attentes.set(id, { resoudre, rejeter });
    nav.send(JSON.stringify({ id, method: methode, params, sessionId }));
  });

/**
 * Le releve d un ecran a une largeur. Tout ce que la consigne demande, et rien
 * de plus : les nombres qu on compare a la reference, et les regles qui ne se
 * negocient pas.
 */
const RELEVE = `(() => {
  const de = document.documentElement;
  /*
   * ⚠️ CE QUI N EST PAS RENDU N EST PAS UNE POLICE TROP PETITE. La sonde
   * comptait les feuilles de TOUT le document, masquees comprises : a 390 px
   * elle signalait les 11 px du bloc de compte de la barre laterale, qui est en
   * \`display: none\` a cette largeur, et a 1440 px les 10 px de la barre
   * d onglets du telephone, masquee elle aussi. Cinq faux positifs a chaque
   * ecran, aux DEUX largeurs — et cinq faux positifs apprennent a ignorer le
   * sixieme, qui serait vrai.
   *
   * \`getClientRects().length === 0\` est le test qui le dit : il vaut zero pour
   * tout ce que la mise en page ne place pas, sans qu il faille enumerer les
   * facons de masquer un element.
   */
  const rendu = (e) => e.getClientRects().length > 0;
  const feuilles = [...document.querySelectorAll('body *')].filter(
    (e) => e.children.length === 0 && (e.textContent || '').trim().length > 1 &&
           !['SCRIPT','STYLE','TITLE'].includes(e.tagName) && rendu(e));
  const interactifs = [...document.querySelectorAll('a,button,input,select,textarea')];
  const boite = (e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.width), h: Math.round(r.height) }; };
  const aside = document.querySelector('aside');
  const main = document.querySelector('main');
  const cartes = [...document.querySelectorAll('div,section,article')]
    .filter((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return parseFloat(c.borderRadius) >= 12 && r.width > 180 && r.height > 60; })
    .map((e) => getComputedStyle(e).borderRadius);
  const rayons = {}; for (const r of cartes) rayons[r] = (rayons[r] || 0) + 1;
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    /*
     * ⚠️ CE QU ON A REELLEMENT SOUS LES YEUX, ET POURQUOI IL FAUT LE DEMANDER.
     * La sonde a mesure QUATRE ecrans d administration qui rendaient le 404
     * generique de Next, et son rapport a annonce pour chacun « aucun
     * debordement, aucune police sous 11,5 px, aucune cible sous 44 ». C etait
     * vrai : une page de 404 ne deborde pas. La cause n etait pas un defaut du
     * produit mais le PLAFOND DE DEBIT de l administration, que douze requetes
     * enchainees declenchent — le refus est deliberé, c est la mesure qui le
     * prenait pour un ecran.
     *
     * Meme famille que le jeu de mesure muet : des chiffres coherents et faux.
     * Un titre et un decompte de balises suffisent a le dire, et l appelant en
     * fait une ERREUR plutot qu une ligne de rapport.
     */
    titre: document.title.slice(0, 80),
    corps_utile: document.body.innerText.trim().length,
    largeur_doc: de.scrollWidth, largeur_vue: de.clientWidth,
    debordement: de.scrollWidth > de.clientWidth,
    /*
     * QUI DÉBORDE, quand le document déborde (18/09/2026) : « il déborde de
     * 298 px » ne dit pas où chercher. Les éléments les plus profonds dont le
     * bord droit dépasse la fenêtre, hors de tout conteneur qui les contient
     * (défilement ou coupe) — ceux-là seuls poussent le document.
     */
    depassent: de.scrollWidth <= de.clientWidth ? [] : [...document.querySelectorAll('body *')]
      .filter((e) => { const r = e.getBoundingClientRect(); if (r.width === 0 || r.right <= de.clientWidth + 1) return false;
        for (let n = e.parentElement; n !== null && n !== document.body; n = n.parentElement) {
          const c = getComputedStyle(n); if (c.overflowX !== 'visible') return false; }
        return ![...e.children].some((f) => f.getBoundingClientRect().right > de.clientWidth + 1); })
      .slice(0, 6)
      .map((e) => (e.tagName + '.' + (e.className || '').toString().split(' ').filter(Boolean).slice(0, 4).join('.')).slice(0, 90)
        + ' droite=' + Math.round(e.getBoundingClientRect().right) + ' largeur=' + Math.round(e.getBoundingClientRect().width)),
    /* SI LE FILTRE NE TROUVE PERSONNE (le coupable vit sous un conteneur
       coupant, ou c'est une ombre, une transformation) : les éléments les plus
       à droite, SANS filtre, pour qu'un débordement ne reste jamais anonyme. */
    depassent_brut: de.scrollWidth <= de.clientWidth ? [] : [...document.querySelectorAll('body *')]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > de.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 6)
      .map(({ e, r }) => (e.tagName + '.' + (e.className || '').toString().split(' ').filter(Boolean).slice(0, 5).join('.')).slice(0, 100)
        + ' droite=' + Math.round(r.right) + ' transform=' + getComputedStyle(e).transform.slice(0, 30))
      .concat([...document.querySelectorAll('body *')]
        .filter((e) => { const c = getComputedStyle(e); if (c.overflowX !== 'visible' || e.clientWidth === 0) return false;
          const r = e.getBoundingClientRect(); return e.scrollWidth > e.clientWidth + 1 && r.left + e.scrollWidth > de.clientWidth + 1; })
        .filter((e, i, l) => !l.some((f) => f !== e && e.contains(f)))
        .slice(0, 4)
        .map((e) => 'CONTENU QUI DEBORDE SA BOITE : ' + (e.tagName + '.' + (e.className || '').toString().split(' ').filter(Boolean).slice(0, 5).join('.')).slice(0, 100)
          + ' « ' + (e.textContent || '').trim().slice(0, 30) + ' » boite=' + e.clientWidth + ' contenu=' + e.scrollWidth)),
    h1: document.querySelectorAll('h1').length,
    /*
     * ⚠️ UN DESSIN DECORATIF N A PAS DE TEXTE A LIRE, ET LA GARDE LE CROYAIT.
     *
     * Mesure le 18/09/2026 : la maquette d application de la landing — une
     * IMAGE de l espace vendeur, marquee aria-hidden, rendue a l echelle 0,30
     * au telephone — a fait rendre DIX-HUIT defauts de plancher. Ses libelles
     * sont ecrits 10 a 11 px et affiches a trois pixels : personne ne les lit,
     * et c est le propos. Les agrandir casserait le dessin pour rendre lisible
     * ce qui n a pas a l etre.
     *
     * L exclusion se fait PAR MESURE, jamais par exception nommee : on remonte
     * la chaine des ancetres et on ecarte ce qui vit sous un aria-hidden vrai.
     * Un texte cache aux lecteurs d ecran n est pas du contenu — s il l etait,
     * le defaut serait l attribut, pas la taille. Meme geste que pour les
     * cibles tactiles, ecartees par la hauteur de leur label et non par une
     * liste de noms : onze faux positifs apprennent a ignorer le douzieme.
     */
    polices_sous_11_5: feuilles
      .filter((e) => e.closest('[aria-hidden=true]') === null)
      .map((e) => ({ texte: (e.textContent || '').trim().slice(0, 30), px: parseFloat(getComputedStyle(e).fontSize) }))
      .filter((x) => x.px < 11.5),
    /*
     * ⚠️ LES PANNEAUX QUI S OUVRENT SONT MESURES OUVERTS, PARCE QU UNE SONDE
     * QUI NE REGARDE QUE L ETAT DE REPOS NE VOIT JAMAIS LEUR GEOMETRIE.
     *
     * Ce depot a deja paye deux fois a cet endroit : un panneau ancre sur un
     * NOMBRE qui recouvrait sa propre pilule — donc le seul geste qui le
     * referme au doigt — et un autre qui sortait de la carte par la gauche sans
     * sortir de la fenetre, donc sans que rien ne le signale. Les deux se
     * lisent en une mesure : le haut du panneau est-il SOUS le bas de son
     * bouton, et reste-t-il dans la fenetre.
     */
    panneaux: [...document.querySelectorAll('details')].map((d) => {
      const s = d.querySelector('summary');
      const ouvert = d.open;
      d.open = true;
      const pan = [...d.children].find((e) => e !== s);
      const bs = s ? s.getBoundingClientRect() : null;
      const bp = pan ? pan.getBoundingClientRect() : null;
      d.open = ouvert;
      if (!bs || !bp || bp.width === 0) return null;
      /*
       * ⚠️ UN RECOUVREMENT EST UNE INTERSECTION, PAS UN « PLUS HAUT QUE ».
       * La premiere version comparait le haut du panneau au bas du bouton, et
       * signalait donc TOUS les panneaux qui s ouvrent VERS LE HAUT — le menu
       * de compte du bas de colonne, par construction. Un faux positif a chaque
       * ecran apprend a ignorer le vrai, qui est exactement ce que cette sonde
       * existe pour attraper.
       */
      const chevauche =
        bp.top < bs.bottom - 1 &&
        bp.bottom > bs.top + 1 &&
        bp.left < bs.right - 1 &&
        bp.right > bs.left + 1;
      return {
        quoi: (s.textContent || '').trim().slice(0, 20),
        recouvre_son_bouton: chevauche,
        hors_fenetre: bp.right > de.clientWidth + 1 || bp.left < -1,
        largeur: Math.round(bp.width),
      };
    }).filter((x) => x !== null && (x.recouvre_son_bouton || x.hors_fenetre)),
    interlettrage_non_nul: [...document.querySelectorAll('body *')]
      .filter((e) => { const v = getComputedStyle(e).letterSpacing; return v !== 'normal' && v !== '0px'; }).length,
    /*
     * ⚠️ LES CONTROLES \`sr-only\` SONT ECARTES, ET CE N EST PAS UNE INDULGENCE.
     * Un lien d evitement mesure 1x1 tant qu il n a pas le focus : c est sa
     * definition. Le compter parmi les cibles trop petites ferait signaler un
     * defaut a chaque ecran, et treize faux positifs apprennent a ignorer le
     * quatorzieme, qui serait vrai.
     *
     * ⚠️ DEUX AUTRES ECARTS, MESURES ET NON SUPPOSES, AJOUTES LE 12/09/2026 :
     *
     *  1. UN CHAMP ENVELOPPE PAR SON \`<label>\`. La zone reellement touchable
     *     est alors celle du LABEL, pas celle de l \`<input>\` : toucher le
     *     filet, le padding ou l icone met le champ au clavier. La sonde
     *     relevait l input nu — 254 x 23 sur l ecran de connexion — pendant que
     *     la boite fait 56, et \`acces-champs.tsx\` porte le raisonnement en
     *     toutes lettres depuis le 11/09. On ne CROIT pas le commentaire : on
     *     remonte au label et on le MESURE.
     *  2. UN LIEN EN LIGNE DANS LA PROSE. La regle 5 l ecarte explicitement —
     *     « les liens en ligne dans la prose restent a leur hauteur de texte :
     *     les agrandir casserait l interligne du paragraphe ». Le test n est
     *     pas le nom de la balise parente mais la PRESENCE DE TEXTE autour du
     *     lien : « En continuant, vous acceptez nos conditions d utilisation »
     *     en porte, un bouton isole dans sa cellule n en porte pas.
     */
    cibles_sous_44: interactifs
      .filter((e) => { const c = getComputedStyle(e);
        if (c.position === 'absolute' && parseFloat(c.width) <= 2) return false;
        // ⚠️ DOUBLE BARRE : ce code vit dans une CHAINE GABARIT, ou une barre
        // simple devant « s » se perd. L exclusion ne marchait donc que pour une
        // classe seule (18/09/2026).
        if (/(^|\\s)sr-only(\\s|$)/.test(e.className || '')) return false;
        const label = e.closest('label');
        if (label !== null && label.getBoundingClientRect().height >= 44) return false;
        if (e.tagName === 'A') {
          const p = e.parentElement;
          const autour = p === null ? '' : [...p.childNodes]
            .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
          if (autour.length > 2) return false;
        }
        return true; })
      .map((e) => ({ quoi: (e.textContent || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 30), ...boite(e) }))
      .filter((c) => c.h > 0 && c.h < 44),
    /*
     * ⚠️ UNE CIBLE QU ON TOUCHE SANS LA VOIR. Ajoute le 18/09/2026 : le bouton
     * « definir comme couverture » des medias etait a \`opacity-0\` et ne
     * s affichait qu au SURVOL — qui n existe pas au doigt. Sur telephone, il
     * restait touchable, invisible, dans le coin de chaque photo : un pouce
     * changeait la couverture sans avoir vu de bouton. Aucune regle ne le
     * voyait : sa boite faisait bien ses 28 px, son texte etait \`sr-only\`.
     *
     * Inventaire, pas selection : TOUT controle dont l opacite EFFECTIVE (le
     * produit de celles de ses ancetres) est nulle, avec une vraie boite, hors
     * \`sr-only\` et hors d un \`<details>\` ferme (son contenu garde ses boites
     * sans etre peint, et n est pas touchable).
     */
    /*
     * ⚠️ CE QU UN CONTENEUR COUPE SANS LE DIRE. Ajoute le 18/09/2026 : a
     * 1 280 px, le tableau admin des boutiques perdait quatre colonnes — dont
     * « Voir » — sous le \`overflow: hidden\` de son panneau, sans barre de
     * defilement. Le document ne debordait pas ; aucune regle ne le voyait.
     *
     * Inventaire : tout texte ou controle visible qui DEPASSE de plus de 2 px
     * un ancetre en \`overflow\` hidden ou clip, dans l axe coupe. Ecartes :
     * la troncature VOULUE (ellipse, limite de lignes, sur l element ou entre
     * lui et le conteneur), le decoratif (\`aria-hidden\`), le \`sr-only\`, et
     * le contenu d un \`<details>\` ferme.
     */
    rognes: [...new Set([...feuilles, ...interactifs])]
      .filter((e) => { const r = e.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) return false;
        if (e.closest('[aria-hidden=true]') !== null) return false;
        if ((e.className || '').toString().split(' ').includes('sr-only')) return false;
        const d = e.closest('details');
        if (d !== null && !d.open && e.closest('summary') === null) return false;
        for (let n = e; n !== null && n.nodeType === 1; n = n.parentElement) {
          const c = getComputedStyle(n);
          if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false;
          if (c.textOverflow === 'ellipsis' || (c.webkitLineClamp && c.webkitLineClamp !== 'none')) return false;
          if (n === e) continue;
          const coupeX = c.overflowX === 'hidden' || c.overflowX === 'clip';
          const coupeY = c.overflowY === 'hidden' || c.overflowY === 'clip';
          if (!coupeX && !coupeY) continue;
          const p = n.getBoundingClientRect();
          if (coupeX && (r.right > p.right + 2 || r.left < p.left - 2)) { e.__rognePar = n; return true; }
          if (coupeY && (r.bottom > p.bottom + 2 || r.top < p.top - 2)) { e.__rognePar = n; return true; }
        }
        return false; })
      .map((e) => ({ quoi: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40),
        par: (e.__rognePar.tagName + '.' + (e.__rognePar.className || '').toString().split(' ').slice(0, 3).join('.')).slice(0, 70) })),
    /*
     * ⚠️ UN TEXTE QUI SORT DE SA CARTE. Ajoute le 18/09/2026 : a 1 024 px, les
     * valeurs du panneau « Informations de la commande » depassaient la carte —
     * ni le document ne debordait, ni un conteneur ne coupait : aucune regle ne
     * le voyait, la capture si. Tout texte ou controle EN FLUX (ni absolu ni
     * fixe : une pastille posee a cheval est voulue) qui depasse de plus de 2 px,
     * a gauche ou a droite, le cadre VISIBLE d un ancetre (filet ou fond).
     */
    hors_cadre: [...new Set([...feuilles, ...interactifs])]
      .filter((e) => {
        /* L ETENDUE DU TEXTE, pas la boite : une valeur en \`min-w-0\` garde sa
           boite dans la carte pendant que son texte en sort. */
        const plage = document.createRange(); plage.selectNodeContents(e);
        const rt = plage.getBoundingClientRect(), rb = e.getBoundingClientRect();
        /* LE TEXTE SEUL quand il y en a : une cible agrandie par des marges
           negatives (un lien de 44 px) depasse volontairement sa carte ; ce qui
           se VOIT, c est le texte. La boite ne sert qu aux controles sans texte. */
        /* Et sur une FEUILLE seulement : le texte d un lien qui contient un span
           tronque a l ellipse compte aussi la partie que ce span cache. */
        const feuille = e.children.length === 0;
        const r = feuille && rt.width > 0 ? { left: rt.left, right: rt.right, width: rb.width, height: rb.height } : { left: rb.left, right: rb.right, width: rb.width, height: rb.height };
        if (r.width <= 2 || r.height <= 2) return false;
        if (e.closest('[aria-hidden=true]') !== null) return false;
        if ((e.className || '').toString().split(' ').includes('sr-only')) return false;
        const d = e.closest('details');
        if (d !== null && !d.open && e.closest('summary') === null) return false;
        for (let n = e; n !== null && n.nodeType === 1; n = n.parentElement) {
          const c = getComputedStyle(n);
          if (c.position === 'fixed') return false;
          if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false;
        }
        /* LE CADRE EST UNE CARTE : fond ou filet visible, rayon d au moins 12 px,
           au moins 120 px de large. Une pastille posee a cheval sur un petit
           bouton reste permise ; un libelle d axe qui sort de son panneau, non
           (18/09/2026 : les dates de « Liens clients », en absolu, passaient
           sous le panneau voisin a 1 024 px). */
        const visible = (c, n) => { const a = (v) => { const m = v.match(/[0-9.]+/g); return !m || m.length < 4 ? 1 : parseFloat(m[3]); };
          const fond = c.backgroundColor !== 'transparent' && a(c.backgroundColor) > 0.02;
          const filet = parseFloat(c.borderLeftWidth) > 0 && c.borderLeftStyle !== 'none' && a(c.borderLeftColor) > 0.02;
          return (fond || filet) && parseFloat(c.borderTopLeftRadius) >= 12 && n.getBoundingClientRect().width >= 120; };
        for (let n = e; n !== null && n !== document.body && n !== document.documentElement; n = n.parentElement) {
          const c = getComputedStyle(n);
          /* CE QU UN ANCETRE COUPE NE SE VOIT PAS : une ellipse, un defilement
             ou une coupe bornent le texte visible a la boite de cet ancetre. */
          if (c.overflowX !== 'visible') { const q = n.getBoundingClientRect(); r.right = Math.min(r.right, q.right); r.left = Math.max(r.left, q.left); }
          if (n === e || !visible(c, n)) continue;
          const p = n.getBoundingClientRect();
          if (r.right > p.right + 2 || r.left < p.left - 2) { e.__cadre = n; return true; }
        }
        return false; })
      .slice(0, 8)
      .map((e) => ({ quoi: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40),
        cadre: (e.__cadre.tagName + '.' + (e.__cadre.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')).slice(0, 60) })),
    /*
     * ⚠️ DEUX TEXTES QUI SE RECOUVRENT. Ajoute le 18/09/2026 : a 1 280 px, les
     * douze dates de l axe « Evolution des commandes » du tableau de bord se
     * chevauchaient — « 29/0606/0713/07… », illisible. Aucune boite ne sortait
     * de rien : il fallait comparer les TEXTES entre eux. Feuilles visibles,
     * etendue du texte (Range), recouvrement de plus de 2 px dans les deux axes.
     */
    chevauchent: (() => {
      /* Une barre FIXE ou COLLANTE recouvre le contenu qui defile dessous : c est
         son role, pas un chevauchement. Ses textes sortent de la comparaison. */
      const vis = (e) => { for (let n = e; n !== null && n.nodeType === 1; n = n.parentElement) { const c = getComputedStyle(n);
        if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false;
        if (c.position === 'fixed' || c.position === 'sticky') return false; } return true; };
      const textes = feuilles
        .filter((e) => e.closest('[aria-hidden=true]') === null && !(e.className || '').toString().split(' ').includes('sr-only') && vis(e))
        .filter((e) => { const d = e.closest('details'); return d === null || d.open || e.closest('summary') !== null; })
        .map((e) => { const p = document.createRange(); p.selectNodeContents(e); const b = p.getBoundingClientRect();
          /* CE QU UN ANCETRE COUPE NE SE VOIT PAS : une ellipse cache la fin du
             texte, qui ne recouvre donc rien. */
          const r = { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
          for (let n = e; n !== null && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n);
            if (c.overflowX !== 'visible') { const q = n.getBoundingClientRect(); r.left = Math.max(r.left, q.left); r.right = Math.min(r.right, q.right); }
            if (c.overflowY !== 'visible') { const q = n.getBoundingClientRect(); r.top = Math.max(r.top, q.top); r.bottom = Math.min(r.bottom, q.bottom); } }
          r.width = r.right - r.left; r.height = r.bottom - r.top; return { e, r }; })
        .filter((x) => x.r.width > 2 && x.r.height > 2);
      const paires = [];
      for (let i = 0; i < textes.length && paires.length < 6; i++) for (let j = i + 1; j < textes.length && paires.length < 6; j++) {
        const a = textes[i], b = textes[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const dx = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const dy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (dx > 2 && dy > 2) paires.push('« ' + (a.e.textContent || '').trim().slice(0, 20) + ' » sur « ' + (b.e.textContent || '').trim().slice(0, 20) + ' »');
      }
      return paires; })(),
    cibles_invisibles: interactifs
      .filter((e) => { const r = e.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) return false;
        if (/(^|\\s)sr-only(\\s|$)/.test(e.className || '')) return false;
        if (e.type === 'hidden') return false;
        const d = e.closest('details');
        if (d !== null && !d.open && e.closest('summary') === null) return false;
        let opacite = 1;
        for (let n = e; n !== null && n.nodeType === 1; n = n.parentElement) {
          const c = getComputedStyle(n);
          if (c.display === 'none' || c.visibility === 'hidden') return false;
          opacite *= parseFloat(c.opacity);
        }
        return opacite < 0.05; })
      .map((e) => ({ quoi: (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.tagName).trim().slice(0, 40), ...boite(e) })),
    barre_laterale: aside ? { ...boite(aside), filet: getComputedStyle(aside).borderRightColor } : null,
    principal: main ? { ...boite(main), colonnes: getComputedStyle(main).gridTemplateColumns, gap: getComputedStyle(main).gap, maxW: getComputedStyle(main).maxWidth } : null,
    rayons_de_carte: rayons,
  };
})()`;

/**
 * L INVENTAIRE COMPLET DE L ECRAN — le MEME releve que `comparer-au-kit.mjs`,
 * mot pour mot, parce que deux inventaires qui ne relevent pas les memes champs
 * ne se soustraient pas.
 *
 * ⚠️ IL N EXISTAIT PAS, ET C EST CE QUI A PERMIS DE TRICHER SANS LE VOULOIR.
 * `CLAUDE.md` prescrit de comparer les deux inventaires PAR SOUSTRACTION ; le
 * cote kit etait outille, le cote produit non. La soustraction se faisait donc
 * A L OEIL — c est-a-dire sur ce qu on pense a regarder — et des ecrans ont ete
 * declares « mesures au pixel » sans qu une seule taille de texte ait ete
 * comparee.
 *
 * Il ne se rend que sur demande (`INVENTAIRE=<dossier>`) : les rapports de
 * regle n en ont pas besoin, et un fichier de 400 Ko par ecran et par largeur
 * noierait le reste.
 */
const INVENTAIRE = `(() => {
  const norm = (c) => c.replace(/\\s+/g, "");
  /*
   * L OMBRE, DEBARRASSEE DE SES COUCHES VIDES.
   *
   * Tailwind empile TROIS couches dans box-shadow — anneau de decalage, anneau,
   * puis l ombre — et les deux premieres valent « rgba(0, 0, 0, 0) 0px 0px 0px
   * 0px » tant qu aucun anneau n est pose. Elles pesent 70 caracteres a elles
   * seules : la troncature a 80 ne laissait donc passer que du vide suivi du
   * debut d une couleur, et l ombre REELLE du produit n etait jamais comparee.
   *
   * Une couche qui ne peint rien n est pas une ombre, exactement comme un filet
   * de zero pixel n est pas un filet. On la retire AVANT de tronquer.
   */
  const ombreUtile = (v) => {
    if (v === "none" || !v) return "";
    // On ne coupe que sur les virgules HORS parentheses : chaque rgba() en
    // contient trois, et les separer casserait les couleurs.
    const couches = v.split(/,(?![^(]*\\))/).map((s) => s.trim());
    const utiles = couches.filter(
      (s) => !/^rgba\\(0,\\s*0,\\s*0,\\s*0\\)(\\s+0px){3,4}$/.test(s),
    );
    return utiles.join(", ").slice(0, 80);
  };
  /*
   * ⚠️ UNE BOITE N EST PAS UN RENDU. Le contenu d un <details> FERME garde ses
   * boites sous Chrome (il vit sous content-visibility: hidden) sans etre peint :
   * la landing comptait « English », « 中文 » et les cinq liens du menu burger
   * comme rendus, alors que la planche ne monte ses listes qu a l ouverture.
   * checkVisibility() sans option n ecarte que display: none et
   * content-visibility: hidden — rien de ce qui se voit (18/09/2026). Le
   * plancher du telephone, plus haut, garde l ancien test : un menu ferme
   * s ouvre, et ses cibles doivent tenir 44 px.
   */
  const rendu = (e) =>
    e.getClientRects().length > 0 && (typeof e.checkVisibility !== "function" || e.checkVisibility());
  const lignes = [];
  /* ⚠️ LE CORPS LUI-MÊME EST INVENTORIÉ (19/09/2026). Le kit peint le fond des pages publiques
     sur « body » (légal, blog, …) ; « body * » ne le voyait pas, et le produit, qui le peint sur un
     « div », ressortait « en trop ». Un décor ne se compare que s'il est relevé des DEUX côtés. */
  for (const e of [document.body, ...document.querySelectorAll("body *")]) {
    if (!rendu(e)) continue;
    if (["SCRIPT", "STYLE", "SVG", "PATH", "CIRCLE", "LINE", "RECT", "POLYLINE"].includes(e.tagName)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const c = getComputedStyle(e);
    const texte = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim()
      .slice(0, 40);
    lignes.push({
      t: e.tagName.toLowerCase(),
      txt: texte,
      l: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
      // ⚠️ LA FAMILLE COMPTE AUTANT QUE LA TAILLE. Deux textes de meme taille
      // et de meme graisse dans deux polices differentes n ont PAS la meme
      // largeur — et une largeur qui differe de cinq pixels partout se lit
      // comme un defaut de mise en page alors que c est une police de repli.
      famille: c.fontFamily.split(",")[0].replace(/["']/g, ""),
      police: parseFloat(c.fontSize),
      graisse: c.fontWeight,
      interligne: c.lineHeight,
      tracking: c.letterSpacing,
      couleur: norm(c.color),
      fond: norm(c.backgroundColor),
      image: c.backgroundImage === "none" ? "" : c.backgroundImage.slice(0, 90),
      rayon: c.borderRadius,
      filet: norm(c.borderTopWidth + " " + c.borderTopStyle + " " + c.borderTopColor),
      ombre: ombreUtile(c.boxShadow),
      marge: c.padding,
      ecart: c.gap === "normal" ? "" : c.gap,
    });
  }
  return {
    largeur_vue: document.documentElement.clientWidth,
    debordement: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hauteur: document.documentElement.scrollHeight,
    lignes,
  };
})()`;

/*
 * ⚠️ `prefers-reduced-motion` : CET EN-TÊTE L'ANNONÇAIT DEPUIS LE 11/09/2026,
 * ET LA SONDE NE L'ÉMULAIT PAS. Mesuré le 15/09 : aucun `setEmulatedMedia` dans
 * le fichier. La quatrième étape de la vérification d'un écran — « rien ne
 * disparaît, rien ne devient illisible » — n'avait donc jamais été exécutée par
 * l'outil qui se présente comme la check-list exécutée (L-014).
 *
 * Ce qui se mesure : les textes RÉELLEMENT visibles — opacité effective, c'est-à-
 * dire le produit des opacités des ancêtres, et `visibility` — relevés à l'état
 * normal puis après un rechargement sous `reduce`. Un texte visible au repos et
 * invisible sous mouvement réduit est un contenu que l'animation portait, ce que
 * la règle 4 interdit. Et une animation INFINIE encore active sous `reduce` est
 * une animation que le réglage n'a pas coupée.
 */
const VISIBLES = `(() => {
  const opaciteEffective = (e) => {
    let o = 1;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.visibility === 'hidden' || c.display === 'none') return 0;
      o *= parseFloat(c.opacity);
    }
    return o;
  };
  const textes = [...document.querySelectorAll('body *')]
    .filter((e) => e.children.length === 0 && (e.textContent || '').trim().length > 1 &&
                   !['SCRIPT','STYLE','TITLE'].includes(e.tagName) && e.getClientRects().length > 0)
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { texte: (e.textContent || '').trim().slice(0, 40), visible: opaciteEffective(e) >= 0.5,
               place: Math.round(r.left + scrollX) + ',' + Math.round(r.top + scrollY) };
    });
  const infinies = document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity)
    .map((a) => (a.animationName || a.id || a.constructor.name) + ' sur ' +
                ((a.effect.target && (a.effect.target.className?.baseVal ?? a.effect.target.className)) || '?').toString().slice(0, 40));
  return { visibles: textes.filter((t) => t.visible).map((t) => ({ texte: t.texte, place: t.place })), infinies };
})()`;

const dossierInventaire = process.env["INVENTAIRE"] ?? null;

/*
 * `CLIC_PRODUIT="<texte exact d'un bouton>"` : L'ÉTAT QUI S'OUVRE AU CLIC, le
 * pendant de `CLIC_KIT`. Ajouté le 15/09/2026 pour le formulaire de suspension
 * de la fiche de compte, que la sonde ne relevait que replié — donc jamais
 * mesuré. Un bouton introuvable LÈVE : mesurer l'état replié en croyant mesurer
 * l'ouvert certifierait l'état replié.
 */
/*
 * Une SÉQUENCE séparée par « > » depuis le 15/09/2026 : l'activation en deux
 * étapes ne montre son QR code qu'après le mot de passe. Une étape
 * `nom=valeur` remplit le champ `name=nom` — `{motdepasse}` est celui du compte
 * de mesure —, toute autre étape clique le bouton de ce texte exact. Après une
 * soumission, l'attente couvre l'action serveur et son plancher de 1,2 s.
 */
async function cliquerProduit(envoyer, chemin, largeur) {
  const sequence = process.env["CLIC_PRODUIT"];
  if (sequence === undefined || sequence === "") return;
  for (const etape of sequence.split(" > ").map((e) => e.trim()).filter(Boolean)) {
    /* `(recharge)` : l'étape précédente RECHARGE la page une fois la base confirmée (le
       blocage d'un lien, la suspension). Lire pendant le rechargement lève « Inspected
       target navigated » — constaté le 19/09 à 390 px, passé par chance à 1545. On
       laisse partir la navigation, puis on attend un document complet. */
    if (etape === "(recharge)") {
      await new Promise((r) => setTimeout(r, 2500));
      for (const fin = Date.now() + 15_000; Date.now() < fin; ) {
        try {
          const { result: pret } = await envoyer("Runtime.evaluate", {
            expression: "document.readyState",
            returnByValue: true,
          });
          if (pret.value === "complete") break;
        } catch {
          // La page est encore en train de changer sous nous : on réessaie.
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const saisie = /^([\w-]+)=(.*)$/.exec(etape);
    const { result } = await envoyer("Runtime.evaluate", {
      expression: saisie
        ? `(() => {
            // Un textarea aussi — le motif d'un blocage de lien —, avec SON accesseur : celui
            // de HTMLInputElement lève sur un textarea.
            const c = [...document.querySelectorAll('input[name=${JSON.stringify(saisie[1])}], textarea[name=${JSON.stringify(saisie[1])}]')].find((e) => e.getClientRects().length > 0);
            if (!c) return 'absent';
            const poser = Object.getOwnPropertyDescriptor(c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
            poser.call(c, ${JSON.stringify(saisie[2].replaceAll("{motdepasse}", MOT_DE_PASSE))});
            c.dispatchEvent(new Event('input', { bubbles: true }));
            return 'saisi';
          })()`
        : `(() => {
            // Par son texte OU par son nom accessible : une vignette de galerie n'a pas de texte.
            // Et les \`summary\` : les menus du produit sont des \`<details>\` (compte, cloche, « Plus »).
            // Seuls les éléments RENDUS comptent — la colonne du bureau, masquée au téléphone,
            // porte les mêmes libellés.
            // « ~texte » : le contrôle CONTIENT ce texte — un résumé de menu porte des initiales et un libellé masqué.
            // Et un bouton-icône n'a QUE son aria-label, qui porte souvent une donnée du jeu
            // (« Bloquer le lien de #3F2A1C ») : « ~ » s'applique donc à lui aussi.
            const cherche = ${JSON.stringify(etape.replace(/^~/, ""))};
            const contient = ${JSON.stringify(etape.startsWith("~"))};
            const b = [...document.querySelectorAll('button,summary')].filter((e) => e.getClientRects().length > 0).find((e) => {
              const t = (e.textContent || '').trim();
              const a = e.getAttribute('aria-label') || '';
              return contient ? t.includes(cherche) || a.includes(cherche) : t === cherche || a === cherche;
            });
            if (!b) return 'absent';
            b.click();
            return b.type === 'submit' ? 'soumis' : 'clique';
          })()`,
      returnByValue: true,
    });
    if (result.value === "absent") {
      throw new Error(
        `ARRET : ${chemin} a ${largeur} px — ${saisie ? "aucun champ « " + saisie[1] + " »" : "aucun bouton « " + etape + " »"}`,
      );
    }
    await new Promise((r) => setTimeout(r, result.value === "soumis" ? 5000 : 600));
  }
}

const rapport = [];
for (const modele of routes) {
  const chemin = modele
    .replaceAll("{commande}", idCommande)
    .replaceAll("{jeton}", jetonPublic)
    // `{profil}` : la fiche admin du compte de mesure lui-même, le seul compte
    // dont la sonde connaît l'identifiant sans aller le chercher.
    .replaceAll("{profil}", profil.id);
  /*
   * ⚠️ LE NOM DE L INVENTAIRE VIENT DU GABARIT, PAS DE L URL SUBSTITUEE — ET
   * C EST UN DEFAUT PAYE LE 12/09 SUR L EDITEUR.
   *
   * `soustraire-inventaires.mjs` deduit l ECRAN du nom du fichier de releve,
   * et c est sous ce nom que les ecarts se declarent. Nommer d apres l URL
   * servie faisait entrer dans ce nom l identifiant de la commande, tire au
   * hasard a chaque passage : `fr-commandes-3f244afa-…-1675.json` ce coup-ci,
   * un autre le suivant. Aucune declaration n aurait jamais ete relue — la
   * soustraction serait repartie de zero a chaque execution, en silence, et
   * l ecran serait sorti en code 1 pour une raison qui n a rien a voir avec
   * lui.
   *
   * Le gabarit, lui, ne varie pas : `/fr/commandes/{commande}` rend toujours
   * `fr-commandes-commande`.
   */
  /* `ETAT=<nom>` suffixe l'écran : un état ouvert par `CLIC_PRODUIT` a ses
     propres déclarations. Sous le nom de l'état replié, elles mourraient à
     chaque mesure ordinaire de l'écran — et celles du replié à chaque mesure
     de l'ouvert. */
  const etat = process.env["ETAT"];
  const nomEcran =
    modele.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") +
    (etat !== undefined && etat !== "" ? "-" + etat : "");
  for (const largeur of largeurs) {
    const { targetId } = await brut("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await brut("Target.attachToTarget", { targetId, flatten: true });
    const envoyer = (m, p) => brut(m, p, sessionId);
    /*
     * ⚠️ UNE ERREUR QUI N'EXISTE QUE DANS LA CONSOLE N'EST VUE PAR RIEN. Une
     * hydratation qui échoue, un îlot qui lève, une route qui répond 500 à un
     * `fetch` : en production React réduit tout cela à « Minified React error
     * #418 » dans la console, l'écran se rend quand même, et ni la soustraction
     * ni les portes ne lisent la console.
     *
     * Exclues, et nommées : les IMAGES servies par R2. Les clés du jeu de mesure
     * n'existent pas dans le bucket (voir `IMAGES_EN_ATTENTE`), donc leurs URL
     * signées répondent en erreur par construction.
     */
    const erreursNavigateur = [];
    // Un écouteur qui ne reçoit rien conclurait « aucune erreur » : on compte ce qu'il voit.
    let reponsesVues = 0;
    ecouteurs.set(sessionId, (methode, p) => {
      if (methode === "Network.responseReceived") reponsesVues++;
      if (methode === "Runtime.exceptionThrown") {
        const d = p.exceptionDetails;
        erreursNavigateur.push({ genre: "exception", texte: String(d.exception?.description ?? d.text).slice(0, 200) });
      } else if (methode === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert")) {
        erreursNavigateur.push({ genre: "console", texte: p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200) });
      } else if (methode === "Network.responseReceived" && p.response.status >= 400) {
        const imageR2 = p.type === "Image" && /r2\.cloudflarestorage\.com|\.r2\.dev/.test(p.response.url);
        /* LE 404 DU DOCUMENT MESURÉ LUI-MÊME N'EST PAS UNE ERREUR DU NAVIGATEUR : c'est
           la réponse voulue du lien mort et du 404 général, que la fumée vérifie déjà
           (et la requête HEAD qui lit la CSP le reprend). Seul le 404 est écarté — un
           500 sur le document reste signalé, et un 404 non voulu sur un écran normal
           est arrêté plus haut par la garde « un écran qui n'est pas l'écran ». */
        const quatreCentQuatreDuDocument =
          p.response.status === 404 && p.response.url.split("#")[0] === base + chemin;
        if (!imageR2 && !quatreCentQuatreDuDocument) {
          erreursNavigateur.push({ genre: "reseau " + p.response.status, texte: `${p.type} ${p.response.url.slice(0, 160)}` });
        }
      }
    });
    await envoyer("Runtime.enable", {});
    await envoyer("Network.enable", {});
    /* ⚠️ SANS CECI, LA SONDE MESURE LES FEUILLES DU PASSAGE PRECEDENT. Le cache
       du navigateur survit d une cible a l autre, et une correction restait
       invisible : on remesurait indefiniment le meme ecart. */
    await envoyer("Network.setCacheDisabled", { cacheDisabled: true });
    /* `IMAGES_EN_ATTENTE=1` : L'ÉCRAN TEL QU'IL SE REND PENDANT QUE SES IMAGES
       ARRIVENT — l'état que voit un client en 4G, et le seul où une place non
       réservée fait sauter la mise en page. Les requêtes d'images sont
       retenues et ne reçoivent jamais de réponse. Sans cela, le jeu de mesure
       (dont les clés n'existent pas dans le bucket) ne montre que des images EN
       ERREUR, que le navigateur réduit à leur texte alternatif. */
    if (process.env["IMAGES_EN_ATTENTE"] === "1") {
      await envoyer("Fetch.enable", { patterns: [{ resourceType: "Image", requestStage: "Request" }] });
    }
    /*
     * L admin refuse toute requete sans adresse d appelant exploitable.
     *
     * ⚠️ ET L ADRESSE CHANGE A CHAQUE EXECUTION, DEPUIS LE 13/09/2026. Elle
     * etait fixe — 203.0.113.7 — et le plafond de debit de l administration se
     * compte EN BASE, par adresse, sur une fenetre glissante : toutes les
     * mesures de la journee s additionnaient donc sur le meme compteur. Au
     * bout d une dizaine de passages, `/fr/admin` rendait 404, la sonde
     * mesurait cet ecran-la, et son rapport disait « aucun debordement, aucune
     * cible trop petite » — c est le septieme piege, sous un autre visage.
     *
     * Il a ete attrape par la garde de POLICE et non par le controle de
     * contenu : notre page de 404 se rend hors de la mise en page de langue,
     * donc sans les faces d Inter. « Une sonde qui mesure un 404 certifie le
     * 404 » — cette fois-ci elle a refuse de mesurer.
     *
     * Une adresse par execution n affaiblit rien : le plafond lui-meme est
     * eprouve par les suites RLS, qui le prennent pour sujet. Ici il n est
     * qu un obstacle a la mesure.
     */
    const adresseSonde =
      "203.0.113." + (1 + Math.floor(Math.random() * 250)) + "";
    await envoyer("Network.setExtraHTTPHeaders", { headers: { "x-real-ip": adresseSonde } });
    await envoyer("Emulation.setDeviceMetricsOverride", {
      width: largeur,
      height: largeur < 700 ? 844 : 1000,
      deviceScaleFactor: largeur < 700 ? 3 : 1,
      mobile: largeur < 700,
    });
    if (largeur < 700) {
      await envoyer("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await envoyer("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
    }
    const hote = new URL(base).hostname;
    for (const c of cookies) {
      await envoyer("Network.setCookie", { name: c.name, value: c.value, domain: hote, path: "/" });
    }
    await envoyer("Page.enable", {});
    /*
     * ⚠️ LA CSP N'AVAIT ÉTÉ VÉRIFIÉE AU NAVIGATEUR QU'UNE FOIS, LE 02/09/2026 —
     * trois écrans, zéro violation. Depuis, tout le design a été refait : double
     * authentification, écrans d'administration, blog, documentation. Une
     * violation ne casse AUCUNE porte (la fumée n'exécute pas de JavaScript) :
     * un script bloqué ou une image refusée n'existent qu'en production, où la
     * CSP est servie, et seulement dans la console du navigateur.
     *
     * L'écouteur est posé AVANT la navigation, dans chaque nouveau document :
     * il survit donc au rechargement en mouvement réduit.
     */
    await envoyer("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__violationsCSP = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__violationsCSP.push({ directive: e.effectiveDirective, bloque: String(e.blockedURI).slice(0, 120),
            source: (e.sourceFile || '').slice(-80) + ':' + e.lineNumber });
        });`,
    });
    await envoyer("Page.navigate", { url: base + chemin });
    await new Promise((r) => setTimeout(r, 3000));
    await cliquerProduit(envoyer, chemin, largeur);
    /* UNE POLITIQUE ABSENTE NE PRODUIT AUCUNE VIOLATION : sans cet en-tête, « zéro
       violation » serait vrai et ne prouverait rien. Le serveur de mesure est un
       `next start`, donc NODE_ENV=production, donc la CSP doit être servie. */
    {
      const { result: entete } = await envoyer("Runtime.evaluate", {
        expression: `fetch(location.href, { method: 'HEAD', credentials: 'include' }).then((r) => r.headers.get('content-security-policy') || '')`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (!/default-src/.test(entete.value ?? "")) {
        throw new Error(`ARRET : ${chemin} a ${largeur} px est servi SANS Content-Security-Policy — aucune violation ne pourrait etre relevee.`);
      }
    }
    const { result } = await envoyer("Runtime.evaluate", {
      expression: RELEVE,
      returnByValue: true,
    });
    /*
     * ⚠️ UN ECRAN QUI N EST PAS L ECRAN ARRETE LA SONDE.
     *
     * Quatre ecrans d administration ont ete mesures alors qu ils rendaient le
     * 404 generique de Next, et le rapport a annonce pour chacun « aucun
     * debordement, aucune police sous 11,5 px, aucune cible sous 44 ». C etait
     * vrai — une page de 404 ne deborde pas. La cause n etait meme pas un
     * defaut : le PLAFOND DE DEBIT de l administration refuse douze requetes
     * enchainees, et ce refus est deliberé. C est la mesure qui prenait un
     * refus pour un ecran.
     *
     * On ne DEVINE pas quel ecran on regarde : on exige un document qui porte
     * du contenu et un titre qui n est pas celui d une page d erreur.
     */
    const vu = result.value;
    /* ⚠️ LE PLANCHER SE COMPTE EN SIGNES, ET LE CHINOIS EN PORTE TROIS FOIS MOINS.
       Mesure le 14/09/2026 : /zh-CN/mot-de-passe-oublie rendait son ecran
       complet en 100 caracteres, sous le plancher de 120 — la sonde le prenait
       pour une page d erreur. Un ideogramme porte un mot : le plancher chinois
       est au tiers. */
    const plancher = chemin.startsWith("/zh") ? 40 : 120;
    /* `ECRAN_ERREUR=1` : L ECRAN MESURE EST UNE PAGE D ERREUR, et c est voulu —
       le 404 general et les frontieres d erreur, portes sur `ui_kits/erreurs`
       le 14/09/2026. La garde ne se leve que sur demande explicite, et le
       plancher de contenu, lui, reste : une page blanche n est pas un 404. */
    const erreurAttendue = process.env["ECRAN_ERREUR"] === "1";
    const estErreur =
      (!erreurAttendue &&
        /^404|This page could not be found|n.existe pas|does not exist/i.test(vu.titre ?? "")) ||
      vu.corps_utile < (erreurAttendue ? 40 : plancher);
    if (estErreur) {
      throw new Error(
        `ARRET : ${chemin} a ${largeur} px ne rend pas l ecran attendu — titre ` +
          `${JSON.stringify(vu.titre)}, ${vu.corps_utile} caracteres de contenu. ` +
          `Sur /admin, c est le plafond de debit : mesurer moins d ecrans a la fois.`,
      );
    }
    /* ⚠️ LA POLICE AVANT TOUT LE RESTE. Un ecran rendu dans la police de repli
       donne des largeurs fausses d environ 7 %, et rien ne le dit : c est le
       defaut du 12/09, cote kit. Il vaut ici aussi — `next/font` sert Inter
       depuis notre domaine, mais un build sans ses fichiers la perdrait. */
    {
      const { result: v } = await envoyer("Runtime.evaluate", {
        expression: VERDICT_POLICES,
        returnByValue: true,
      });
      exigerPolices(v.value, `${chemin} a ${largeur} px`);
    }
    rapport.push({ chemin, largeur, ...vu });
    /*
     * ⚠️ LE PLANCHER TÉLÉPHONE ÉTAIT UNE LIGNE DE RAPPORT, PAS UNE PORTE — et
     * il est tombé le jour même où on l'a mis à l'épreuve.
     *
     * `CLAUDE.md` prescrit depuis le 11/09/2026 « aucun débordement, aucune
     * cible sous 44 px, aucune police sous 11,5 px » au pas 2 de la
     * vérification. Ces trois mesures étaient RELEVÉES et poussées dans le
     * rapport — puis lues à l'œil, dans un JSON de trois cents lignes. Mesuré
     * le 17/09/2026 en portant les illustrations de la landing : la sonde a
     * listé CINQ textes à 11 px et elle est sortie en CODE 0. Une règle qu'on
     * vérifie en relisant une liste n'est pas vérifiée : c'est L-018 dans sa
     * forme exacte — constater qu'une déclaration existe ne prouve jamais que
     * son absence bloque.
     *
     * ⚠️ LE SEUIL EST LA LARGEUR TÉLÉPHONE, PAS TOUTES LES LARGEURS, et c'est
     * délibéré : la règle des 11,5 px est écrite « sur téléphone » (au bureau,
     * une légende de 11 px est le corps du design system). Le débordement, lui,
     * serait un défaut à toute largeur — il n'est gardé ici qu'à 390 parce que
     * c'est là qu'il a été MESURÉ sur les 37 écrans. Étendre une garde à des
     * largeurs qu'on n'a pas mesurées fabrique un mur de rouge, et un mur de
     * rouge s'apprend à s'ignorer.
     *
     * Allumée après avoir mesuré : les 37 relevés à 390 px — 33 écrans et
     * leurs 4 états ouverts au clic — sortent sans un seul défaut.
     */
    if (largeur <= 480) {
      const defauts = [];
      if (vu.debordement) {
        defauts.push(`le document DÉBORDE : ${vu.largeur_doc} px rendus dans ${vu.largeur_vue}`);
      }
      for (const p of vu.polices_sous_11_5 ?? []) {
        defauts.push(`police ${p.px} px (plancher 11,5) — « ${p.texte} »`);
      }
      for (const c of vu.cibles_sous_44 ?? []) {
        defauts.push(`cible tactile de ${c.h} px (plancher 44) — « ${c.quoi} »`);
      }
      for (const c of vu.cibles_invisibles ?? []) {
        defauts.push(`cible INVISIBLE (opacite nulle, touchable) — « ${c.quoi} » ${c.l}x${c.h}`);
      }
      if (defauts.length > 0) {
        process.exitCode = 1;
        console.error(
          `[plancher] ${chemin} a ${largeur} px : ${defauts.length} defaut(s)\n` +
            defauts.map((d) => "    " + d).join("\n"),
        );
      } else {
        console.error(`[plancher] ${chemin} a ${largeur} px : aucun debordement, aucune police sous 11,5, aucune cible sous 44`);
      }
    }
    {
      /* LE ROGNAGE, À TOUTE LARGEUR : un contenu coupé l'est aussi bien à
         1 280 qu'à 390, et c'est entre les deux que le défaut des boutiques
         vivait (18/09/2026). */
      const rognes = vu.rognes ?? [];
      if (rognes.length > 0) {
        process.exitCode = 1;
        console.error(
          `[rognage] ${chemin} a ${largeur} px : ${rognes.length} element(s) coupe(s)\n` +
            rognes.map((x) => `    « ${x.quoi} » coupe par ${x.par}`).join("\n"),
        );
      } else {
        console.error(`[rognage] ${chemin} a ${largeur} px : rien n est coupe`);
      }
      /* LE DÉBORDEMENT ET LE PANNEAU HORS FENÊTRE, À TOUTE LARGEUR aussi. Ils
         n'étaient rouges qu'au téléphone ; le balayage du 18/09/2026 a trouvé
         /commandes et /envois qui défilaient de côté à 1 024 et 1 280, et le
         menu du compte hors de l'écran à 768, sur les onze écrans vendeur. */
      const cadre = vu.hors_cadre ?? [];
      if (cadre.length > 0) {
        process.exitCode = 1;
        console.error(
          `[cadre] ${chemin} a ${largeur} px : ${cadre.length} texte(s) sortent de leur carte\n` +
            cadre.map((x) => `    « ${x.quoi} » sort de ${x.cadre}`).join("\n"),
        );
      } else {
        console.error(`[cadre] ${chemin} a ${largeur} px : aucun texte ne sort de sa carte`);
      }
      const chev = vu.chevauchent ?? [];
      if (chev.length > 0) {
        process.exitCode = 1;
        console.error(`[chevauchement] ${chemin} a ${largeur} px : ${chev.length} paire(s) de textes se recouvrent\n` + chev.map((x) => "    " + x).join("\n"));
      } else {
        console.error(`[chevauchement] ${chemin} a ${largeur} px : aucun texte n en recouvre un autre`);
      }
      const hors = (vu.panneaux ?? []).filter((x) => x.hors_fenetre);
      if (vu.debordement || hors.length > 0) {
        process.exitCode = 1;
        console.error(
          `[largeur] ${chemin} a ${largeur} px : ` +
            (vu.debordement ? `le document DEBORDE (${vu.largeur_doc} pour ${vu.largeur_vue})` : "") +
            (hors.length ? ` panneau(x) hors de la fenetre : ${hors.map((x) => x.quoi).join(", ")}` : "") +
            ((vu.depassent ?? []).length
              ? "\n" + vu.depassent.map((x) => "    " + x).join("\n")
              : (vu.depassent_brut ?? []).length
                ? "\n    (aucun coupable hors conteneur ; les plus a droite, sans filtre :)\n" + vu.depassent_brut.map((x) => "    " + x).join("\n")
                : ""),
        );
      } else {
        console.error(`[largeur] ${chemin} a ${largeur} px : rien ne deborde, aucun panneau hors de la fenetre`);
      }
    }
    if (process.env["IMAGES_EN_ATTENTE"] === "1") {
      /* Toute image rendue, avec sa boîte : une image qui attend et dont la
         boîte est NULLE dans un sens n'a pas de place réservée — falsifié, la
         photo du visionneur sans ses dimensions rend 0×0.
         ⚠️ LE PREMIER CRITÈRE ÉTAIT « MOINS DE 24 PX », et il a dénoncé le logo de
         la coque publique sur huit pages : 66×22, place réservée à la taille
         exacte de ses attributs. Un petit logo n'est pas une image plate. */
      const { result: imgs } = await envoyer("Runtime.evaluate", {
        expression: `[...document.images].filter((i) => i.getClientRects().length > 0).map((i) => {
          const r = i.getBoundingClientRect();
          return { alt: (i.alt || '').slice(0, 40), l: Math.round(r.width), h: Math.round(r.height), chargee: i.complete && i.naturalWidth > 0,
                   attributs: (i.getAttribute('width') || '-') + 'x' + (i.getAttribute('height') || '-') };
        })`,
        returnByValue: true,
      });
      const plates = imgs.value.filter((i) => !i.chargee && (i.l === 0 || i.h === 0));
      rapport[rapport.length - 1].images_en_attente = { total: imgs.value.length, plates };
      if (plates.length > 0) process.exitCode = 1;
      console.error(`[images] ${chemin} a ${largeur} px : ${imgs.value.length} images, ${plates.length} sans place reservee`);
    }
    if (dossierInventaire !== null) {
      const { result: inv } = await envoyer("Runtime.evaluate", {
        expression: INVENTAIRE,
        returnByValue: true,
      });
      const nomInv = nomEcran + "-" + largeur + ".json";
      await writeFile(join(dossierInventaire, nomInv), JSON.stringify(inv.value, null, 1), "utf8");
      console.error("[inventaire] " + nomInv + " — " + inv.value.lignes.length + " elements");
    }
    if (dossierCaptures !== null) {
      // `captureBeyondViewport` : sans lui on ne capture que le premier ecran,
      // et c est exactement la moitie qu on a deja regardee en la mesurant.
      const { data } = await envoyer("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      });
      const nom = nomEcran + "-" + largeur + ".png";
      await writeFile(join(dossierCaptures, nom), Buffer.from(data, "base64"));
      console.error("[capture] " + nom);
    }
    /* Mouvement réduit : EN DERNIER, pour que l'inventaire et la capture restent
       ceux de l'état normal — c'est lui qu'on compare au kit. Un RECHARGEMENT, et
       non une bascule à chaud : une animation d'entrée ne se rejoue qu'au
       chargement, et c'est elle qui risque de laisser un texte à opacité nulle. */
    const violationsCSP = [];
    {
      const { result: csp } = await envoyer("Runtime.evaluate", { expression: "window.__violationsCSP || null", returnByValue: true });
      if (!Array.isArray(csp.value)) throw new Error(`ARRET : ${chemin} a ${largeur} px — l ecouteur CSP n est pas installe`);
      violationsCSP.push(...csp.value);
    }
    {
      const { result: normal } = await envoyer("Runtime.evaluate", { expression: VISIBLES, returnByValue: true });
      await envoyer("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await envoyer("Page.reload", {});
      await new Promise((r) => setTimeout(r, 3000));
      await cliquerProduit(envoyer, chemin, largeur);
      /* Les chiffres en `#`, comme la soustraction : « il y a 20 s » devient
         « il y a 23 s » entre les deux chargements, et le premier passage l'a
         compté comme un texte disparu — un faux positif qui apprend à ignorer
         le vrai. */
      const forme = (t) => t.replace(/\d+/g, "#");
      /* ⚠️ UN TEXTE PAS ENCORE ARRIVÉ N'A PAS DISPARU. Rejouer un état au clic
         relance ses actions serveur : le 19/09/2026, l'activation en deux étapes
         est sortie avec « 2 textes disparus » à 768 px pendant un balayage qui
         chargeait le serveur, puis en code 0 à trois passages suivants. On relit
         donc jusqu'à dix secondes, et seul ce qui manque ENCORE est un défaut :
         un texte laissé à opacité nulle par une animation ne revient jamais. */
      let emule = false;
      let vuReduit = { visibles: [], infinies: [] };
      let disparus = [];
      for (const fin = Date.now() + 10_000; ; ) {
        const { result: reduit } = await envoyer("Runtime.evaluate", {
          expression: `[matchMedia('(prefers-reduced-motion: reduce)').matches, ${VISIBLES}]`,
          returnByValue: true,
        });
        [emule, vuReduit] = reduit.value;
        // Une émulation qui n'a pas pris ferait mesurer deux fois l'état normal,
        // et conclure « rien ne disparaît » : c'est vrai, et ça ne prouve rien.
        if (emule !== true) throw new Error(`ARRET : ${chemin} a ${largeur} px — prefers-reduced-motion n a pas ete emule`);
        /* ⚠️ UN TEXTE REMPLACÉ À LA MÊME PLACE N'A PAS DISPARU. La clé de secours
           de l'activation en deux étapes est tirée au hasard, et le rechargement
           en tire une autre : lettres comprises, aucune normalisation ne les
           rapproche. Un texte ne compte comme disparu que si AUCUN texte visible
           n'occupe plus sa place. */
        const restants = new Set(vuReduit.visibles.map((v) => forme(v.texte)));
        const placesOccupees = new Set(vuReduit.visibles.map((v) => v.place));
        disparus = [
          ...new Set(
            normal.value.visibles
              .filter((v) => !restants.has(forme(v.texte)) && !placesOccupees.has(v.place))
              .map((v) => forme(v.texte)),
          ),
        ];
        if (disparus.length === 0 || Date.now() > fin) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const ligne = rapport[rapport.length - 1];
      ligne.mouvement_reduit = { disparus, animations_infinies: vuReduit.infinies };
      if (disparus.length > 0 || vuReduit.infinies.length > 0) {
        process.exitCode = 1;
        console.error(
          `[mouvement-reduit] ${chemin} a ${largeur} px : ${disparus.length} texte(s) disparu(s), ` +
            `${vuReduit.infinies.length} animation(s) infinie(s) encore active(s)`,
        );
        for (const t of disparus) console.error(`    disparu : « ${t.slice(0, 60)} »`);
      } else {
        console.error(`[mouvement-reduit] ${chemin} a ${largeur} px : rien ne disparait, aucune animation infinie`);
      }
    }
    {
      const { result: csp } = await envoyer("Runtime.evaluate", { expression: "window.__violationsCSP || []", returnByValue: true });
      violationsCSP.push(...csp.value);
      rapport[rapport.length - 1].violations_csp = violationsCSP;
      if (violationsCSP.length > 0) {
        process.exitCode = 1;
        for (const v of violationsCSP) {
          console.error(`[csp] ${chemin} a ${largeur} px : ${v.directive} bloque ${v.bloque} (${v.source})`);
        }
      } else {
        console.error(`[csp] ${chemin} a ${largeur} px : politique servie, aucune violation`);
      }
    }
    if (reponsesVues === 0) {
      throw new Error(`ARRET : ${chemin} a ${largeur} px — aucune reponse reseau recue par l ecouteur : il n inspecte rien.`);
    }
    rapport[rapport.length - 1].erreurs_navigateur = erreursNavigateur;
    if (erreursNavigateur.length > 0) {
      process.exitCode = 1;
      for (const e of erreursNavigateur) console.error(`[navigateur] ${chemin} a ${largeur} px : ${e.genre} — ${e.texte}`);
    } else {
      console.error(`[navigateur] ${chemin} a ${largeur} px : aucune erreur de console, d'exception ni de requete`);
    }
    ecouteurs.delete(sessionId);
    await envoyer("Target.closeTarget", { targetId });
  }
}
nav.close();

console.log(JSON.stringify(rapport, null, 1));
} finally {
  /*
   * `GARDER_JEU=1` : ON REGARDE LE PRODUIT À LA MAIN, donc le jeu doit survivre à
   * la mesure. C'est la SEULE façon de naviguer sur un produit vivant sans servir
   * la PRODUCTION en local — la base de tests, elle, est jetable.
   *
   * ⚠️ Le compte reste sous le motif `ecran-…@droplink-tests.invalid` : la
   * prochaine sonde le purgera d'elle-même passé trente minutes. Ce n'est donc
   * pas une fuite, c'est un sursis — et la mesure qui suivra retrouvera un jeu
   * propre.
   */
  if (process.env["GARDER_JEU"] === "1") {
    console.error(`[jeu] GARDE : ${courriel} / ${MOT_DE_PASSE} — purge par la prochaine sonde (30 min).`);
  } else {
    await service.auth.admin.deleteUser(cree.user.id);
    console.error("[purge] compte supprime.");
  }
}

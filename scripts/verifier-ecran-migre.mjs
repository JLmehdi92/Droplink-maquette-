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
import { createClient } from "@supabase/supabase-js";

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

const MOT_DE_PASSE = "Chariot-Lilas-Tempete-91";
const marque = Math.random().toString(36).slice(2, 8);
const courriel = `ecran-${marque}@droplink-tests.invalid`;
const { data: cree, error: eCree } = await service.auth.admin.createUser({
  email: courriel,
  password: MOT_DE_PASSE,
  email_confirm: true,
});
if (eCree) throw new Error(eCree.message);

const { data: profil } = await service
  .from("profiles")
  .select("id")
  .eq("user_id", cree.user.id)
  .single();
await service.from("profiles").update({ account_type: "reseller", role: "admin" }).eq("id", profil.id);
const { data: shop } = await service.from("shops").select("id").eq("owner_id", profil.id).single();
await service.from("shops").update({ name: "Atelier de verification" }).eq("id", shop.id);
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
      first_movement_at: jours(3),
      last_movement_at: jours(1),
      query_count: 4,
    },
    {
      shop_id: shop.id,
      tracking_number: "DLKMESURE0002CN",
      carrier_code: 190094,
      normalized_status: "en_transit",
      first_movement_at: jours(21),
      last_movement_at: jours(14),
      query_count: 12,
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

console.error(
  `[jeu] ${commandes.length} commandes, ${colis.length} colis dont un silencieux, 3 points de passage.`,
);

const { data: sess } = await publiable.auth.signInWithPassword({
  email: courriel,
  password: MOT_DE_PASSE,
});

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
nav.addEventListener("message", (m) => {
  const j = JSON.parse(m.data);
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
    h1: document.querySelectorAll('h1').length,
    polices_sous_11_5: feuilles
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
        if (/(^|\s)sr-only(\s|$)/.test(e.className || '')) return false;
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
  const rendu = (e) => e.getClientRects().length > 0;
  const lignes = [];
  for (const e of document.querySelectorAll("body *")) {
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

const dossierInventaire = process.env["INVENTAIRE"] ?? null;

const rapport = [];
for (const modele of routes) {
  const chemin = modele
    .replaceAll("{commande}", idCommande)
    .replaceAll("{jeton}", jetonPublic);
  for (const largeur of largeurs) {
    const { targetId } = await brut("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await brut("Target.attachToTarget", { targetId, flatten: true });
    const envoyer = (m, p) => brut(m, p, sessionId);
    await envoyer("Network.enable", {});
    // L admin refuse toute requete sans adresse d appelant exploitable.
    await envoyer("Network.setExtraHTTPHeaders", { headers: { "x-real-ip": "203.0.113.7" } });
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
    await envoyer("Page.navigate", { url: base + chemin });
    await new Promise((r) => setTimeout(r, 3000));
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
    const estErreur =
      /^404|This page could not be found|n.existe pas|does not exist/i.test(vu.titre ?? "") ||
      vu.corps_utile < 120;
    if (estErreur) {
      throw new Error(
        `ARRET : ${chemin} a ${largeur} px ne rend pas l ecran attendu — titre ` +
          `${JSON.stringify(vu.titre)}, ${vu.corps_utile} caracteres de contenu. ` +
          `Sur /admin, c est le plafond de debit : mesurer moins d ecrans a la fois.`,
      );
    }
    rapport.push({ chemin, largeur, ...vu });
    if (dossierInventaire !== null) {
      const { result: inv } = await envoyer("Runtime.evaluate", {
        expression: INVENTAIRE,
        returnByValue: true,
      });
      const nomInv =
        chemin.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + largeur + ".json";
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
      const nom = chemin.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + largeur + ".png";
      await writeFile(join(dossierCaptures, nom), Buffer.from(data, "base64"));
      console.error("[capture] " + nom);
    }
    await envoyer("Target.closeTarget", { targetId });
  }
}
nav.close();

await service.auth.admin.deleteUser(cree.user.id);
console.error("[purge] compte supprime.");
console.log(JSON.stringify(rapport, null, 1));

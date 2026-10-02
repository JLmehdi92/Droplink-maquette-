// Génère l'administration de la maquette : les dix écrans de droplink2
// (src/app/[locale]/admin/*), avec leurs libellés (messages/fr.json « admin »)
// et leurs règles. Un seul jeu de démonstration, cohérent d'un écran à l'autre :
// les mêmes comptes, les mêmes totaux, le même journal.
// Ce que le produit refuse, la maquette le refuse aussi : aucun contenu de
// commande (ni client, ni référence produit, ni lien), aucune facturation,
// aucune suppression de compte, aucune connexion « à la place de ».
import { writeFileSync } from "node:fs";
import path from "node:path";
const ici = path.dirname(new URL(import.meta.url).pathname);
const racine = path.join(ici, "..");
const ADMIN = "admin@droplink.fr";

/* ---------- outillage ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ic = (n, c = "") => `<svg class="ic${c ? " " + c : ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const nb = (n) => n.toLocaleString("fr-FR").replace(/ /g, " ");
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const date = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const dateH = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} à ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const part = (a, b) => b ? Math.round(a / b * 100) : 0;

/* =====================================================================
   LE JEU DE DÉMONSTRATION
   ===================================================================== */
// [email, boutique, type, statut, plan, commandes, colis, inscrit, langue, filigrane, réseaux, médias, stockage (Mo)]
const COMPTES = [
  ["contact@ateliernord.fr", "Atelier Nord", "reseller", "active", "pro", 186, 152, "2026-06-14", "fr", false, ["Instagram"], 744, 1210],
  ["hello@maisonlou.fr", "Maison Lou", "supplier", "active", "pro", 512, 342, "2026-05-02", "fr", true, ["Instagram", "WhatsApp"], 2310, 4630],
  ["kicks.lab@gmail.com", "Kicks Lab", "supplier", "active", "pro", 388, 271, "2026-05-19", "fr", true, ["Instagram", "TikTok"], 1904, 3820],
  ["contact@lesboxesdesam.fr", "Les Boxes de Sam", "supplier", "active", "pro", 297, 240, "2026-06-01", "fr", false, ["TikTok"], 1288, 2490],
  ["drip.paris@gmail.com", "Drip Paris", "supplier", "active", "pro", 205, 166, "2026-06-22", "en", true, ["Instagram", "Site web"], 1015, 1960],
  ["nora.drops@outlook.fr", "Nora Drops", "reseller", "active", "pro", 143, 118, "2026-07-03", "fr", false, ["Instagram"], 602, 1110],
  ["bijoux.selene@gmail.com", "Bijoux Séléné", "reseller", "active", "pro", 96, 74, "2026-07-28", "fr", true, ["Instagram", "Site web"], 410, 640],
  ["sneakhouse.lyon@gmail.com", "Sneak House Lyon", "supplier", "suspended", "pro", 61, 55, "2026-08-04", "fr", false, ["Instagram"], 288, 590],
  ["studio.kaia@gmail.com", "Studio Kaia", "reseller", "active", "gratuit", 5, 5, "2026-09-21", "fr", false, ["Instagram"], 31, 54],
  ["ines.store@icloud.com", "Inès Store", "reseller", "active", "gratuit", 5, 5, "2026-09-12", "fr", false, ["WhatsApp"], 27, 41],
  ["la.petite.friperie@gmail.com", "La Petite Friperie", "reseller", "active", "gratuit", 5, 5, "2026-09-02", "fr", false, [], 22, 36],
  ["b.collection@gmail.com", "B Collection", "reseller", "suspended", "gratuit", 5, 4, "2026-09-15", "fr", false, ["WhatsApp"], 19, 33],
  ["vintage.rue@gmail.com", "Vintage Rue", "reseller", "active", "gratuit", 4, 3, "2026-09-26", "fr", false, ["Instagram"], 16, 24],
  ["yanis.shop@gmail.com", "Yanis Shop", "reseller", "active", "gratuit", 3, 2, "2026-09-28", "zh-CN", false, [], 9, 14],
  ["mode.atelier9@gmail.com", null, null, "active", "gratuit", 1, 0, "2026-09-29", "fr", false, [], 0, 0],
  ["nouveau.compte82@gmail.com", null, null, "active", "gratuit", 0, 0, "2026-09-30", "fr", false, [], 0, 0],
].map(([email, boutique, type, statut, plan, commandes, colis, inscrit, langue, filigrane, reseaux, medias, stockage], i) => ({ id: `c${i + 1}`, email, boutique, type, statut, plan, commandes, colis, inscrit, langue, filigrane, reseaux, medias, stockage }));
const parEmail = Object.fromEntries(COMPTES.map((c) => [c.email, c]));
// Les totaux de la plateforme : 48 comptes, dont 16 affichés (la liste s'arrête à « Voir la suite »)
const T = {
  comptes: 48, sansType: 3, suspendus: 2, nouveaux30: 19, actifs: 46, boutiquesNommees: 41,
  commandes: 2184, commandesMois: 612, colisMois: 438, stockageGo: "18,4",
  statuts: { preparation: 486, expedie: 197, en_transit: 674, livre: 827 },
  seuilColis: 300, plafondMensuel: 300, gratuitAVie: 5,
};
const TYPE = { supplier: "Fournisseur", reseller: "Revendeur" };
const STATUT = { active: "Actif", suspended: "Suspendu" };
const STATUT_CMD = { preparation: "En préparation", expedie: "Expédiée", en_transit: "En transit", livre: "Livrée" };
// commandes de la plateforme (référence courte, compte, statut, transporteur, date), sans aucun contenu
const COMMANDES = [
  ["6A4D21", "contact@ateliernord.fr", "en_transit", "Colissimo", "2026-09-30T09:12"],
  ["9F2C04", "hello@maisonlou.fr", "preparation", null, "2026-09-30T08:51"],
  ["B71E3A", "kicks.lab@gmail.com", "en_transit", "Chronopost", "2026-09-30T08:22"],
  ["3D8F11", "drip.paris@gmail.com", "expedie", "Mondial Relay", "2026-09-29T19:40"],
  ["C5A2E9", "nora.drops@outlook.fr", "livre", "Colissimo", "2026-09-29T17:05"],
  ["7E0B6D", "vintage.rue@gmail.com", "preparation", null, "2026-09-29T15:33", "bloque"],
  ["2A9C47", "contact@lesboxesdesam.fr", "en_transit", "La Poste", "2026-09-29T11:18"],
  ["E8D350", "hello@maisonlou.fr", "en_transit", "Colissimo", "2026-09-29T10:02"],
  ["0F6B92", "bijoux.selene@gmail.com", "livre", "Mondial Relay", "2026-09-28T18:47"],
  ["5C1E78", "studio.kaia@gmail.com", "expedie", "Colissimo", "2026-09-28T14:26"],
  ["A3F0C2", "kicks.lab@gmail.com", "livre", "Chronopost", "2026-09-28T09:15"],
  ["D9274B", "yanis.shop@gmail.com", "preparation", null, "2026-09-27T21:03"],
  ["41B8E6", "contact@ateliernord.fr", "livre", "Mondial Relay", "2026-09-27T16:40"],
  ["8E5D1A", "drip.paris@gmail.com", "en_transit", "Colissimo", "2026-09-27T12:54"],
].map(([ref, email, statut, transporteur, quand, etat]) => ({ ref, email, statut, transporteur, quand, bloque: etat === "bloque" }));
// le journal : [quand, action, cible, motif]
const JOURNAL = [
  ["2026-09-30T11:42", "comptes_detail", "hello@maisonlou.fr", null],
  ["2026-09-30T11:40", "panneau_alertes", null, null],
  ["2026-09-30T10:18", "contestations_detail", "vintage.rue@gmail.com", null],
  ["2026-09-29T18:05", "compte_blocage_lien", "vintage.rue@gmail.com", "Photos signalées comme reprises d’une autre boutique, en attente de vérification."],
  ["2026-09-29T17:58", "commandes_liste", null, null],
  ["2026-09-28T16:31", "compte_plan", "nora.drops@outlook.fr", "Paiement reçu le 28/09, passage en Pro."],
  ["2026-09-27T14:12", "comptes_doublons", null, null],
  ["2026-09-27T14:09", "compte_suspension", "sneakhouse.lyon@gmail.com", "Signalement fondé : contenus repris sans droits, pages coupées le temps de l’examen."],
  ["2026-09-26T09:44", "parametre_modification", null, "Plafond gratuit à vie : 15 → 5"],
  ["2026-09-25T20:30", "compte_reactivation", "drip.paris@gmail.com", "Justificatifs reçus, signalement non fondé."],
  ["2026-09-24T15:02", "boutiques_liste", null, null],
  ["2026-09-23T11:27", "compte_suspension", "b.collection@gmail.com", "Compte recréé pour contourner le quota gratuit, même WhatsApp qu’un compte existant."],
  ["2026-09-22T10:05", "comptes_liste", null, null],
  ["2026-09-20T17:48", "parametre_modification", null, "Seuil d’alerte colis : 250 → 300"],
].map(([quand, action, cible, motif]) => ({ quand, action, cible, motif }));
const FAMILLE = (a) => /suspension|reactivation/.test(a) ? "suspension" : /^parametre/.test(a) ? "parametre" : "consultation";
const LIBELLE_ACTION = {
  boutiques_liste: "Consultation de la liste des boutiques", commandes_liste: "Consultation de la liste des commandes", compte_blocage_lien: "Blocage du lien d’une commande", compte_deblocage_lien: "Déblocage du lien d’une commande", compte_plan: "Changement de plan d’un compte", contestations_detail: "Lecture d’une contestation", compte_contestation_refusee: "Refus d’une contestation", compte_reactivation: "Réactivation d’un compte", compte_suspension: "Suspension d’un compte", comptes_detail: "Consultation d’une fiche de compte", comptes_liste: "Consultation de la liste des comptes", panneau_alertes: "Consultation des alertes du panneau", parametre_creation: "Création d’un paramètre système", parametre_modification: "Modification d’un paramètre système", comptes_doublons: "Consultation des comptes en doublon",
};
const ICONE_ACTION = (a) => /suspension/.test(a) ? "ban" : /reactivation/.test(a) ? "circle-check" : /parametre/.test(a) ? "sliders-horizontal" : /plan/.test(a) ? "crown" : /blocage|contestation/.test(a) ? "lock" : "eye";
const DOUBLONS = [
  { genre: "Instagram", identifiant: "@kickslab", comptes: ["kicks.lab@gmail.com", "sneakhouse.lyon@gmail.com"] },
  { genre: "WhatsApp", identifiant: "+33 6 12 34 56 78", comptes: ["ines.store@icloud.com", "b.collection@gmail.com"] },
];
// séries : commandes créées par jour (30 jours), colis pris en charge par jour
const serie = (n, base, amp, graine) => Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + amp * Math.sin(i / 3.2 + graine) + (i / n) * base * .35 + ((i * 7919 + graine * 31) % 9) - 4)));
const CMD_JOUR = serie(30, 17, 5, 1.3);
const COLIS_JOUR = serie(30, 12, 4, .4);

/* =====================================================================
   LA COQUE
   ===================================================================== */
const NAV = [
  ["admin", "Vue d'ensemble", "layout-dashboard"], ["admin-commandes", "Commandes", "file-text"], ["admin-comptes", "Comptes", "users"], ["admin-boutiques", "Boutiques", "store"],
  ["admin-statistiques", "Statistiques", "chart-column"], ["admin-journal", "Journal d'audit", "scroll-text"], ["admin-surveillance", "Surveillance", "activity"], ["admin-parametres", "Paramètres système", "settings"],
];
const page = ({ cle, nav = cle, titre, sousTitre, fil = [], actionsTete = "", corps, trace = null, sansTete = false, script = "" }) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titre)} · Administration DropLink</title>
<meta name="robots" content="noindex">
<link rel="preload" href="assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">
</head>
<body class="page-app v4 page-admin">
<!--ICONES-->
<a class="evitement" href="#contenu">Aller au contenu</a>

<!-- Maquette de l'administration (droplink2 : src/app/[locale]/admin/*,
     messages/fr.json « admin »). Elle ne montre aucun contenu de commande, ne
     facture rien, ne supprime aucun compte : comme le produit. -->
<div class="app">
  <aside class="app__barre" data-barre aria-label="Administration">
    <a class="logo app__logo" href="admin.html" aria-label="Administration DropLink">
      <img src="assets/img/symbole-84.png" alt="" width="20" height="28">
      <span>DropLink</span><span class="adm-pastille">Admin</span>
    </a>
    <nav class="app__nav" aria-label="Administration">
      ${NAV.map(([k, l, i]) => `<a href="${k}.html"${k === nav ? ' aria-current="page"' : ""}><i class="app__nav-pastille" aria-hidden="true"></i><span class="app__nav-libelle">${ic(i)}${esc(l)}</span></a>`).join("\n      ")}
    </nav>
    <div class="adm-trace">${ic("shield-check")}<p><b>Tout est tracé</b><span>Chaque consultation de données d’un vendeur est écrite au journal.</span></p></div>
    <details class="compte" data-compte>
      <summary>
        <span class="compte__avatar adm-avatar" aria-hidden="true">${ic("shield")}</span>
        <span class="compte__qui"><b>Administrateur</b><small>${ADMIN}</small></span>
        ${ic("chevrons-up-down")}
      </summary>
      <div class="compte__menu">
        <a href="tableau.html">${ic("layout-dashboard")}Espace vendeur</a>
        <a href="connexion.html">${ic("log-out")}Se déconnecter</a>
      </div>
    </details>
  </aside>

  <div class="app__feuille">
    <header class="app__haut adm-haut">
      <button class="app__menu" type="button" aria-label="Ouvrir le menu" aria-expanded="false" data-menu-app>${ic("menu")}</button>
      <form class="recherche" role="search" action="admin-comptes.html" data-adm-recherche>
        ${ic("search")}
        <input type="search" name="q" placeholder="Adresse email ou nom de boutique…" aria-label="Rechercher un compte" autocomplete="off" spellcheck="false">
      </form>
      <p class="adm-bandeau">${ic("shield-check")}<span>ADMINISTRATION</span></p>
    </header>

    <main id="contenu" class="tableau adm${sansTete ? " etat-ecran" : ""}" data-ecran tabindex="-1">
      ${sansTete ? "" : `<div class="tableau__tete">
        <div>
          <p class="v4-fil"><span>Administration</span>${fil.map(([h, l]) => `${ic("chevron-right")}${h ? `<a href="${h}">${esc(l)}</a>` : `<b>${esc(l)}</b>`}`).join("")}</p>
          <h1>${esc(titre)}</h1>
          ${sousTitre ? `<p>${esc(sousTitre)}</p>` : ""}
        </div>
        ${actionsTete}
      </div>`}
      ${trace ? `<p class="adm-encart">${ic("eye")}<span>${esc(trace)}</span></p>` : ""}
${corps}
    </main>
  </div>
</div>

<div class="adm-info" role="tooltip" hidden data-info-bulle></div>
<p class="toast" role="status" aria-live="polite" data-toast></p>
<script src="admin.js" defer></script>
<script src="v4.js" defer></script>
${script}</body>
</html>
`;
const ecrire = (f, html) => { writeFileSync(path.join(racine, "src", f), html); console.log("écrit", f); };

/* ---------- briques ---------- */
const tuiles = (xs) => `<section class="compteurs compteurs--${xs.length} adm-tuiles" aria-label="Chiffres clés">${xs.map(([t, v, d, ton]) => `<div class="compteur-app"${ton ? ` data-ton="${ton}"` : ""}><p class="compteur-app__titre">${esc(t)}</p><p class="compteur-app__valeur">${v}</p>${d ? `<p class="compteur-app__dessous">${d}</p>` : ""}</div>`).join("")}</section>`;
const badgeStatut = (s) => `<span class="adm-badge" data-statut="${s}"><i></i>${STATUT[s]}</span>`;
const badgeCmd = (s) => `<span class="adm-badge" data-cmd="${s}"><i></i>${STATUT_CMD[s]}</span>`;
const typeDe = (c) => c.type ? TYPE[c.type] : `<span class="adm-sourdine">Non déclaré</span>`;
const nomDe = (c) => c.boutique ? esc(c.boutique) : `<span class="adm-sourdine">Pas encore nommée</span>`;
const avatar = (c) => `<span class="adm-av" style="--h:${[...c.email].reduce((a, x) => a + x.charCodeAt(0), 0) % 360}" aria-hidden="true">${esc((c.boutique || c.email).replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").map((m) => m[0]).join("").slice(0, 2).toUpperCase() || "?")}</span>`;
const colisSeuil = (c) => `<span class="adm-colis${c.colis > T.seuilColis ? " est-depasse" : ""}" data-info="${c.colis} colis pris en charge, seuil d'alerte ${T.seuilColis}"><b>${nb(c.colis)}</b><small>/ ${T.seuilColis}</small><i style="--k:${Math.min(1, c.colis / T.seuilColis).toFixed(3)}"></i></span>`;
// l'anneau : une répartition, avec sa légende (jamais la couleur seule)
const anneau = (titre, total, unite, parts) => {
  const R = 52, C = 2 * Math.PI * R; let acc = 0;
  const arcs = parts.map(([l, v, coul]) => { const k = total ? v / total : 0; const s = `<circle r="${R}" cx="64" cy="64" fill="none" stroke="${coul}" stroke-width="14" stroke-dasharray="${(k * C - 2).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc * C).toFixed(2)}" transform="rotate(-90 64 64)" data-info="${esc(l)} : ${nb(v)} (${part(v, total)} %)"/>`; acc += k; return s; }).join("");
  return `<div class="adm-anneau"><svg viewBox="0 0 128 128" role="img" aria-label="${esc(titre)}"><circle r="${R}" cx="64" cy="64" fill="none" stroke="var(--filet)" stroke-width="14"/>${arcs}</svg><p class="adm-anneau__centre"><b>${nb(total)}</b><span>${esc(unite)}</span></p></div>
  <ul class="adm-legende">${parts.map(([l, v, coul]) => `<li><i style="background:${coul}"></i><span>${esc(l)}</span><b>${nb(v)}</b><small>${part(v, total)} %</small></li>`).join("")}</ul>`;
};
// des barres : une valeur par jour, la dernière est aujourd'hui
const barres = (valeurs, libelle, unite) => {
  const max = Math.max(...valeurs), W = 600, H = 160, l = W / valeurs.length;
  const pas = Math.ceil(max / 4 / 5) * 5, haut = pas * 4;
  const y = (v) => H - v / haut * H;
  return `<div class="adm-graphe"><div class="adm-graphe__plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(libelle)}">
    ${[0, 1, 2, 3, 4].map((i) => `<line x1="0" x2="${W}" y1="${y(i * pas)}" y2="${y(i * pas)}" class="adm-graphe__grille"/>`).join("")}
    ${valeurs.map((v, i) => `<rect x="${(i * l + l * .18).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(l * .64).toFixed(1)}" height="${(H - y(v)).toFixed(1)}" rx="3"${i === valeurs.length - 1 ? ' class="est-dernier"' : ""} style="--i:${i}" data-info="${i === valeurs.length - 1 ? "Aujourd'hui" : `Il y a ${valeurs.length - 1 - i} j`} : ${v} ${unite}"/>`).join("")}
  </svg><div class="adm-graphe__axe"><span>${[0, 1, 2, 3, 4].map((i) => nb(i * pas)).reverse().join("</span><span>")}</span></div></div><p class="adm-graphe__bas"><span>Il y a ${valeurs.length - 1} jours</span><span>Aujourd'hui</span></p></div>`;
};
const lignes = (series, libelle) => {
  const W = 600, H = 160, n = series[0][1].length, max = Math.max(...series.flatMap((s) => s[1]));
  const pas = Math.ceil(max / 4 / 5) * 5, haut = pas * 4;
  const x = (i) => i / (n - 1) * W, y = (v) => H - v / haut * H;
  return `<div class="adm-graphe"><div class="adm-graphe__plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(libelle)}">
    ${[0, 1, 2, 3, 4].map((i) => `<line x1="0" x2="${W}" y1="${y(i * pas)}" y2="${y(i * pas)}" class="adm-graphe__grille"/>`).join("")}
    ${series.map(([, vs, coul], k) => `<path d="${vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${coul}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" class="adm-ligne" style="--k:${k}"/>`).join("")}
  </svg><div class="adm-graphe__axe"><span>${[0, 1, 2, 3, 4].map((i) => nb(i * pas)).reverse().join("</span><span>")}</span></div></div><p class="adm-graphe__bas"><span>Il y a ${n - 1} jours</span><span>Aujourd'hui</span></p>
  <ul class="adm-legende adm-legende--ligne">${series.map(([nom, , coul]) => `<li><i style="background:${coul}"></i><span>${esc(nom)}</span></li>`).join("")}</ul></div>`;
};
const COUL = { violet: "#5B4BF5", vert: "#12A87A", gris: "#A9AEC4", ambre: "#E08A18", corail: "#EF4B57", bleu: "#4F7CF5" };
const filtres = (nom, opts) => `<div class="adm-filtres" role="group" aria-label="${esc(nom)}" data-filtres>${opts.map(([v, l], i) => `<button type="button" aria-pressed="${i === 0}" data-filtre="${v}">${esc(l)}</button>`).join("")}</div>`;
const bloc = (titre, contenu, { classe = "", aide = "", droite = "" } = {}) => `<section class="bloc adm-bloc ${classe}"><header class="bloc__tete"><div><h2>${esc(titre)}</h2>${aide ? `<p class="adm-aide">${aide}</p>` : ""}</div>${droite}</header>${contenu}</section>`;

/* =====================================================================
   VUE D'ENSEMBLE (admin/page.tsx)
   ===================================================================== */
{
  const depasse = COMPTES.filter((c) => c.colis > T.seuilColis);
  const alertes = depasse.map((c) => `<li class="adm-alerte"><i data-ton="erreur">${ic("circle-alert")}</i><div><b>Un compte dépasse le plafond de colis : ${c.colis} sur un seuil de ${T.seuilColis}</b><span>${esc(c.email)} · Chaque colis pris en charge nous est facturé.</span></div><a class="bouton-outil" href="admin-compte.html#${c.id}">Examiner${ic("arrow-right")}</a></li>`).join("")
    + `<li class="adm-alerte"><i data-ton="attente">${ic("users")}</i><div><b>4 comptes, sur 2 identifiants partagés</b><span>Des comptes distincts qui affichent le même Instagram, TikTok, WhatsApp ou site web.</span></div><a class="bouton-outil" href="admin-doublons.html">Voir les doublons${ic("arrow-right")}</a></li>`
    + `<li class="adm-alerte"><i data-ton="attente">${ic("lock")}</i><div><b>Contestation du blocage de #7E0B6D</b><span>Envoyée par le vendeur le 30 sept. 2026 · première sur trois.</span></div><a class="bouton-outil" href="admin-commandes.html#7E0B6D">Examiner${ic("arrow-right")}</a></li>`;
  const corps = `
      ${bloc("Ce qui demande une décision", `<ul class="adm-alertes">${alertes}</ul>`, { classe: "adm-decision" })}
      <h2 class="adm-h2">Volumes</h2>
      ${tuiles([
        ["Commandes créées", nb(T.commandesMois), "ce mois-ci"],
        ["Comptes actifs", nb(T.actifs), `dont ${T.sansType} sans type · ${T.suspendus} suspendus, hors de ce total`],
        ["Boutiques", nb(T.comptes), `dont ${T.boutiquesNommees} avec un nom de boutique`],
        ["Colis pris en charge", nb(T.colisMois), `<span class="adm-facture">FACTURÉ</span> ce mois-ci`, "facture"],
        ["Stockage des médias", `${T.stockageGo} Go`, "Somme des tailles relues côté serveur au dépôt"],
      ])}
      <div class="adm-rangee adm-rangee--2">
        ${bloc("Commandes", barres(CMD_JOUR, "Évolution du nombre de commandes sur les 30 derniers jours", "commandes"), { aide: "Évolution du nombre de commandes sur les 30 derniers jours", droite: `<span class="adm-periode">30 derniers jours</span>` })}
        ${bloc("Statut des commandes", anneau("Répartition des commandes par statut", T.commandes, "commandes", [["En préparation", T.statuts.preparation, COUL.gris], ["Expédiées", T.statuts.expedie, COUL.bleu], ["En transit", T.statuts.en_transit, COUL.violet], ["Livrées", T.statuts.livre, COUL.vert]]), { aide: "Répartition des commandes par statut", classe: "adm-bloc--anneau" })}
      </div>
      ${bloc("Dernières actions d'administration", `<ol class="adm-journal adm-journal--court">${JOURNAL.slice(0, 5).map(ligneJournal).join("")}</ol>`, { droite: `<a class="lien-texte adm-lien" href="admin-journal.html">Tout le journal${ic("arrow-right")}</a>` })}`;
  ecrire("admin.html", page({ cle: "admin", titre: "Vue d'ensemble", sousTitre: "Voici un aperçu global de l'activité sur DropLink.", corps }));
}
function ligneJournal(e) {
  const c = e.cible ? parEmail[e.cible] : null;
  return `<li class="adm-entree" data-famille="${FAMILLE(e.action)}"><i data-ton="${FAMILLE(e.action)}">${ic(ICONE_ACTION(e.action))}</i><div><b>${LIBELLE_ACTION[e.action]}</b>${e.cible ? `<span>Compte visé : ${c ? `<a href="admin-compte.html#${c.id}">${esc(e.cible)}</a>` : esc(e.cible)}</span>` : ""}${e.motif ? `<span class="adm-motif">Motif : ${esc(e.motif)}</span>` : ""}</div><p><time>${dateH(e.quand)}</time><small>Par ${ADMIN}</small></p></li>`;
}

/* =====================================================================
   COMPTES (admin/comptes/page.tsx)
   ===================================================================== */
{
  const rangs = COMPTES.map((c) => `<tr data-statut="${c.statut}" data-cherche="${esc((c.email + " " + (c.boutique || "")).toLowerCase())}">
          <td><a class="adm-qui" href="admin-compte.html#${c.id}">${avatar(c)}<span><b>${esc(c.email)}</b><small>${nomDe(c)}${c.plan === "pro" ? ` <span class="adm-pro">Pro</span>` : ""}</small></span></a></td>
          <td>${typeDe(c)}</td><td>${badgeStatut(c.statut)}</td><td class="adm-nb">${nb(c.commandes)}</td><td>${colisSeuil(c)}</td><td class="adm-date">${date(c.inscrit)}</td>
          <td><a class="bouton-outil adm-ouvrir" href="admin-compte.html#${c.id}">Ouvrir</a></td></tr>`).join("\n");
  const corps = `
      ${tuiles([["Comptes totaux", nb(T.comptes), `dont ${T.sansType} sans type déclaré`], ["Nouveaux inscrits", nb(T.nouveaux30), "sur 30 jours"], ["Comptes actifs", nb(T.actifs), `${part(T.actifs, T.comptes)} % du total`], ["Comptes suspendus", nb(T.suspendus), `${part(T.suspendus, T.comptes)} % du total`, "erreur"]])}
      <div class="adm-rangee adm-rangee--liste">
        ${bloc("Liste des comptes", `
          <div class="adm-outils">${filtres("Filtrer par statut", [["tous", "Tous les statuts"], ["active", "Actifs"], ["suspended", "Suspendus"]])}<label class="recherche-envoi adm-cherche">${ic("search")}<input type="search" placeholder="Adresse email ou nom de boutique…" aria-label="Rechercher un compte" data-cherche></label></div>
          <div class="adm-defil"><table class="adm-table" data-table>
            <thead><tr><th scope="col">Compte</th><th scope="col">Type</th><th scope="col">Statut</th><th scope="col">Commandes</th><th scope="col">Colis</th><th scope="col">Inscrit le</th><th scope="col"><span class="sr">Action</span></th></tr></thead>
            <tbody>${rangs}</tbody>
          </table></div>
          <p class="adm-vide" hidden data-vide>Aucun compte ne correspond à ce filtre.</p>
          <footer class="adm-pied"><span>16 sur 48 comptes</span><button type="button" class="bouton-outil" data-suite>Voir la suite</button></footer>`, { aide: "48 comptes au total" })}
        <div class="adm-colonne">
          ${bloc("Statut des comptes", anneau("Statut des comptes", T.comptes, "comptes", [["Actifs", T.actifs, COUL.vert], ["Suspendus", T.suspendus, COUL.corail]]), { classe: "adm-bloc--anneau" })}
          <a class="bloc adm-doublons-lien v4-carte" href="admin-doublons.html"><span class="adm-doublons-lien__icone">${ic("users")}</span><span><b>Comptes en doublon</b><small>4 comptes, sur 2 identifiants partagés</small></span>${ic("arrow-right")}</a>
        </div>
      </div>`;
  ecrire("admin-comptes.html", page({ cle: "admin-comptes", titre: "Comptes", sousTitre: "Gérez et suivez tous les comptes de DropLink.", fil: [[null, "Comptes"]], trace: "Cette consultation est écrite au journal d'audit, avec les critères employés. Ouvrir un compte y ajoute une entrée.", corps }));
}

/* =====================================================================
   FICHE DE COMPTE (admin/comptes/[id]/page.tsx) : une page, rendue par compte
   ===================================================================== */
{
  const evenements = (c) => {
    const k = c.commandes; if (!k) return [];
    return [["commande_creee", "commandes créées", k], ["commande_modifiee", "modifications de commande", Math.round(k * 2.3)], ["media_ajoute", "médias ajoutés", c.medias], ["qc_approuve", "validations de client", Math.round(k * .52)], ["qc_refuse", "refus de client", Math.round(k * .04)], ["commande_archivee", "commandes archivées", Math.round(k * .31)], ["lien_revoque", "liens révoqués", Math.round(k * .01)]].filter(([, , n]) => n > 0);
  };
  const fiches = COMPTES.map((c) => `<article class="adm-fiche" data-fiche="${c.id}" hidden>
        <header class="adm-fiche__tete">
          ${avatar(c)}
          <div><h2>${esc(c.email)}</h2><p>${c.type ? TYPE[c.type] : "Non déclaré"} · inscrit le ${date(c.inscrit)}</p></div>
          <div class="adm-fiche__etats">${badgeStatut(c.statut)}<span class="adm-plan" data-plan="${c.plan}">${c.plan === "pro" ? ic("crown") + "Pro" : "Gratuit"}</span></div>
        </header>
        <div class="adm-rangee adm-rangee--3">
          ${bloc("Identité", `<dl class="adm-dl"><div><dt>Email</dt><dd>${esc(c.email)}</dd></div><div><dt>Type</dt><dd>${typeDe(c)}</dd></div><div><dt>Rôle</dt><dd>Vendeur</dd></div><div><dt>Boutique</dt><dd>${c.boutique ? esc(c.boutique) : '<span class="adm-sourdine">Non configurée</span>'}</dd></div><div><dt>Langue</dt><dd>${{ fr: "Français", en: "Anglais", "zh-CN": "Chinois simplifié" }[c.langue]}</dd></div><div><dt>Filigrane</dt><dd>${c.filigrane ? "Activé" : "Désactivé"}</dd></div><div><dt>Réseaux configurés</dt><dd>${c.reseaux.length ? c.reseaux.join(", ") : '<span class="adm-sourdine">Aucun</span>'}</dd></div></dl>`)}
          ${bloc("Volumes", `<dl class="adm-dl"><div><dt>Commandes</dt><dd>${nb(c.commandes)}</dd></div><div><dt>Colis</dt><dd>${nb(c.colis)}</dd></div><div><dt>Médias</dt><dd>${nb(c.medias)}</dd></div><div><dt>Stockage</dt><dd>${c.stockage >= 1024 ? (c.stockage / 1024).toFixed(1).replace(".", ",") + " Go" : c.stockage + " Mo"}</dd></div></dl>`)}
          ${bloc("Plafonds", `<div class="adm-plafonds">
            <div class="adm-plafond${c.colis > T.seuilColis ? " est-depasse" : ""}"><p><span>Colis pris en charge</span><b>${c.colis} sur ${T.seuilColis}</b></p><i style="--k:${Math.min(1, c.colis / T.seuilColis).toFixed(3)}"></i>${c.colis > T.seuilColis ? `<small>Dépassé de ${c.colis - T.seuilColis}. Chaque prise en charge nous est facturée par le fournisseur de suivi.</small>` : ""}</div>
            ${c.plan === "gratuit" ? `<div class="adm-plafond${c.commandes >= T.gratuitAVie ? " est-plein" : ""}"><p><span>Commandes à vie</span><b>${c.commandes} sur ${T.gratuitAVie}</b></p><i style="--k:${Math.min(1, c.commandes / T.gratuitAVie).toFixed(3)}"></i></div>` : `<div class="adm-plafond"><p><span>Commandes ce mois (Pro)</span><b>${Math.round(c.commandes * .22)} sur ${T.plafondMensuel}</b></p><i style="--k:${Math.min(1, c.commandes * .22 / T.plafondMensuel).toFixed(3)}"></i></div>`}
          </div>`)}
        </div>
        <div class="adm-rangee adm-rangee--2">
          ${bloc("Ce que ce compte a fait", evenements(c).length ? `<ul class="adm-activite">${evenements(c).map(([, l, n]) => `<li><b>${nb(n)}</b><span>${l}</span></li>`).join("")}</ul>` : `<p class="adm-vide">Ce compte n'a encore rien fait.</p>`, { aide: "Les événements du vendeur, pas les vôtres, et seulement leur nombre. Aucun contenu de commande n'apparaît ici." })}
          <div class="adm-colonne">
            ${bloc("Plan", `<p class="adm-texte">Aucun paiement ne passe par DropLink : une fois le paiement reçu, passez le compte en Pro ici. Un vendeur Pro peut retirer la marque DropLink de ses pages client.</p><div class="adm-plan-ligne"><span>Plan actuel</span><b>${c.plan === "pro" ? "Pro" : "Gratuit"}</b><button type="button" class="bouton-outil" data-dialogue="plan" data-compte="${c.id}">${c.plan === "pro" ? "Repasser en gratuit" : "Passer en Pro"}</button></div>`)}
            ${bloc(c.statut === "active" ? "Suspendre ce compte" : "Réactiver ce compte", `<p class="adm-texte">${c.statut === "active" ? "Ses pages publiques cesseront immédiatement d'être servies. Ses liens ne seront pas détruits : une réactivation les rétablit à l'identique." : "Ses pages redeviendront accessibles sur les mêmes liens que ceux déjà envoyés à ses clients."}</p><button type="button" class="${c.statut === "active" ? "adm-danger" : "bouton-outil"}" data-dialogue="suspension" data-compte="${c.id}">${c.statut === "active" ? "Suspendre ce compte" : "Réactiver ce compte"}</button>`, { classe: c.statut === "active" ? "adm-bloc--danger" : "" })}
            ${bloc("Ce que cette page ne permet pas", `<ul class="adm-interdits"><li>${ic("ban")}<p><b>Supprimer le compte.</b><span>Suspendre est réversible, supprimer ne l'est pas.</span></p></li><li>${ic("ban")}<p><b>Se connecter à sa place.</b><span>La lecture tracée suffit au diagnostic.</span></p></li><li>${ic("ban")}<p><b>Ouvrir ses commandes.</b><span>Leur contenu appartient à son client.</span></p></li></ul>`)}
          </div>
        </div>
      </article>`).join("\n");
  const donnees = JSON.stringify(Object.fromEntries(COMPTES.map((c) => [c.id, { email: c.email, statut: c.statut, plan: c.plan }])));
  const corps = `
      ${fiches}
      <script type="application/json" data-comptes>${donnees}</script>`;
  ecrire("admin-compte.html", page({ cle: "admin-compte", nav: "admin-comptes", titre: "Fiche de compte", fil: [["admin-comptes.html", "Comptes"], [null, "Fiche de compte"]], trace: "L'ouverture de cette fiche a été écrite au journal d'audit, avec votre identité. Le contenu des commandes de ce vendeur n'est accessible depuis nulle part ici.", actionsTete: `<a class="bouton-outil" href="admin-comptes.html">${ic("arrow-left")}Revenir à la liste des comptes</a>`, corps }));
}

/* =====================================================================
   DOUBLONS (admin/comptes/doublons/page.tsx)
   ===================================================================== */
{
  const concernes = new Set(DOUBLONS.flatMap((d) => d.comptes));
  const corps = `
      ${tuiles([["Identifiants partagés", DOUBLONS.length], ["Comptes concernés", concernes.size], ["Dont suspendus", [...concernes].filter((e) => parEmail[e].statut === "suspended").length, null, "erreur"]])}
      <div class="adm-rangee adm-rangee--liste">
        <div class="adm-colonne">
${DOUBLONS.map((d) => bloc(`${d.genre} · ${d.identifiant}`, `<div class="adm-defil"><table class="adm-table"><thead><tr><th scope="col">Compte</th><th scope="col">Statut</th><th scope="col">Inscription</th><th scope="col">Commandes</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody>${d.comptes.map((e) => { const c = parEmail[e]; return `<tr><td><span class="adm-qui">${avatar(c)}<span><b>${esc(c.email)}</b><small>${nomDe(c)}</small></span></span></td><td>${badgeStatut(c.statut)}</td><td class="adm-date">${date(c.inscrit)}</td><td class="adm-nb">${c.commandes}</td><td><a class="bouton-outil adm-ouvrir" href="admin-compte.html#${c.id}" aria-label="Voir la fiche de ${esc(c.email)}">Voir la fiche</a></td></tr>`; }).join("")}</tbody></table></div>`, { droite: `<span class="adm-periode">${d.comptes.length} comptes</span>` })).join("\n")}
        </div>
        ${bloc("Comment un doublon est reconnu", `<dl class="adm-regles"><div><dt>Instagram et TikTok.</dt><dd>Le même nom de compte, quelle que soit l'écriture du lien : majuscules, www, paramètres de partage.</dd></div><div><dt>WhatsApp.</dt><dd>Le même numéro, chiffre pour chiffre. Aucun indicatif n'est deviné.</dd></div><div><dt>Site web.</dt><dd>Le même domaine et le même chemin. L'accueil d'une plateforme partagée, comme Linktree, ne désigne personne et n'est jamais comparé.</dd></div><div><dt>Rien n'est automatique.</dt><dd>Un identifiant partagé n'est pas une preuve : deux associés peuvent en partager un. Aucun compte n'est suspendu par cette liste.</dd></div></dl>`)}
      </div>`;
  ecrire("admin-doublons.html", page({ cle: "admin-doublons", nav: "admin-comptes", titre: "Comptes en doublon", sousTitre: "Des comptes distincts qui affichent le même Instagram, TikTok, WhatsApp ou site web.", fil: [["admin-comptes.html", "Comptes"], [null, "Comptes en doublon"]], trace: "L'ouverture de cette liste a été écrite au journal d'audit, avec votre identité.", actionsTete: `<a class="bouton-outil" href="admin-comptes.html">${ic("arrow-left")}Retour aux comptes</a>`, corps }));
}

/* =====================================================================
   BOUTIQUES (admin/boutiques/page.tsx) : triées par stockage
   ===================================================================== */
{
  const tri = [...COMPTES].sort((a, b) => b.stockage - a.stockage);
  const taille = (mo) => mo >= 1024 ? `${(mo / 1024).toFixed(1).replace(".", ",")} Go` : `${mo} Mo`;
  const maxSt = tri[0].stockage;
  const rangs = tri.map((c) => `<tr data-type="${c.type || "sans"}" data-cherche="${esc((c.email + " " + (c.boutique || "")).toLowerCase())}">
          <td><span class="adm-qui">${avatar(c)}<span><b>${c.boutique ? esc(c.boutique) : '<span class="adm-sourdine">Boutique non configurée</span>'}</b><small>${esc(c.email)}</small></span></span></td>
          <td>${typeDe(c)}</td><td>${c.statut === "suspended" ? '<span class="adm-badge" data-statut="suspended"><i></i>Suspendue</span>' : c.colis > T.seuilColis ? '<span class="adm-badge" data-ton="alerte"><i></i>Plafond dépassé</span>' : '<span class="adm-badge" data-statut="active"><i></i>Active</span>'}</td>
          <td class="adm-nb">${nb(c.commandes)}</td><td class="adm-nb">${nb(c.medias)}</td>
          <td><span class="adm-stock" data-info="${taille(c.stockage)} relus côté serveur"><b>${taille(c.stockage)}</b><i style="--k:${(c.stockage / maxSt).toFixed(3)}"></i></span></td><td>${colisSeuil(c)}</td></tr>`).join("\n");
  const corps = `
      ${tuiles([["Boutiques totales", nb(T.comptes), "une par compte, créée à l'inscription"], ["Boutiques configurées", nb(T.boutiquesNommees), `${part(T.boutiquesNommees, T.comptes)} % du total`], ["Commandes créées", nb(T.commandesMois), "ce mois-ci"], ["Stockage des médias", `${T.stockageGo} Go`, "relu côté serveur au dépôt"]])}
      <div class="adm-rangee adm-rangee--pleine">
        ${bloc("Liste des boutiques", `
          <div class="adm-outils">${filtres("Filtrer par type de compte", [["toutes", "Toutes"], ["supplier", "Fournisseurs"], ["reseller", "Revendeurs"], ["sans", "Non configurées"]])}<label class="recherche-envoi adm-cherche">${ic("search")}<input type="search" placeholder="Nom de boutique ou adresse email…" aria-label="Rechercher une boutique" data-cherche></label></div>
          <div class="adm-defil"><table class="adm-table" data-table>
            <thead><tr><th scope="col">Boutique</th><th scope="col">Type</th><th scope="col">Statut</th><th scope="col">Commandes</th><th scope="col">Médias</th><th scope="col">Stockage</th><th scope="col">Colis</th></tr></thead>
            <tbody>${rangs}</tbody>
          </table></div>
          <p class="adm-vide" hidden data-vide>Aucune boutique ne correspond à ce filtre.</p>
          <footer class="adm-pied"><span>Une boutique par compte · 48 au total</span><button type="button" class="bouton-outil" data-suite>Voir la suite</button></footer>`, { aide: "48 boutiques au total" })}
        ${bloc("Statut des boutiques", anneau("Statut des boutiques", T.comptes, "boutiques", [["Configurées", T.boutiquesNommees, COUL.violet], ["Sans nom", T.comptes - T.boutiquesNommees, COUL.gris]]), { classe: "adm-bloc--anneau" })}
      </div>`;
  ecrire("admin-boutiques.html", page({ cle: "admin-boutiques", titre: "Boutiques", sousTitre: "Gérez et suivez toutes les boutiques utilisant DropLink.", fil: [[null, "Boutiques"]], trace: "Ce que chaque compte occupe, trié par stockage. Cet écran ne montre aucun contenu : ni nom de client, ni référence, ni note. Cette consultation est écrite au journal d'audit, avec les critères employés, filtre compris.", corps }));
}

/* =====================================================================
   COMMANDES (admin/commandes/page.tsx) : aucun contenu, jamais
   ===================================================================== */
{
  const rangs = COMMANDES.map((o) => { const c = parEmail[o.email]; return `<tr data-statut="${o.statut}" id="${o.ref}" data-cherche="${esc((o.ref + " " + o.email + " " + (c.boutique || "")).toLowerCase())}">
          <td class="adm-ref">#${o.ref}${o.bloque ? ' <span class="adm-badge" data-ton="erreur"><i></i>Lien bloqué</span> <button type="button" class="adm-pastille-contest" data-dialogue="contestation" data-ref="' + o.ref + '">' + ic("message-circle") + 'Contestation</button>' : ""}</td>
          <td class="adm-email">${esc(o.email)}</td><td>${nomDe(c)}</td><td>${badgeCmd(o.statut)}</td>
          <td>${o.transporteur ? esc(o.transporteur) : '<span class="adm-sourdine">Aucun transporteur</span>'}</td><td class="adm-date">${dateH(o.quand)}</td>
          <td><div class="adm-actions"><a class="bouton-outil" href="admin-compte.html#${c.id}" aria-label="Voir le compte de ${esc(o.email)}">Voir</a><button type="button" class="bouton-outil" data-dialogue="blocage" data-ref="${o.ref}">${o.bloque ? "Débloquer le lien" : "Bloquer le lien"}</button></div></td></tr>`; }).join("\n");
  const s = T.statuts;
  const corps = `
      ${tuiles([["Total commandes", nb(T.commandes), "avec du contenu réel"], ["En préparation", nb(s.preparation), `${part(s.preparation, T.commandes)} % du total`], ["Expédiées", nb(s.expedie), `${part(s.expedie, T.commandes)} % du total`], ["En transit", nb(s.en_transit), `${part(s.en_transit, T.commandes)} % du total`], ["Livrées", nb(s.livre), `${part(s.livre, T.commandes)} % du total`], ["Créées ce mois-ci", nb(T.commandesMois), "depuis le 1er du mois"]])}
      <div class="adm-rangee adm-rangee--pleine">
        ${bloc("Liste des commandes", `
          <div class="adm-outils">${filtres("Filtrer par statut", [["tous", "Tous les statuts"], ["preparation", "En préparation"], ["expedie", "Expédiée"], ["en_transit", "En transit"], ["livre", "Livrée"]])}<label class="recherche-envoi adm-cherche">${ic("search")}<input type="search" placeholder="Référence, boutique ou adresse…" aria-label="Rechercher une commande" data-cherche></label></div>
          <div class="adm-defil"><table class="adm-table" data-table>
            <thead><tr><th scope="col">#</th><th scope="col">Compte</th><th scope="col">Boutique</th><th scope="col">Statut</th><th scope="col">Transporteur</th><th scope="col">Date</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
            <tbody>${rangs}</tbody>
          </table></div>
          <p class="adm-vide" hidden data-vide>Aucune commande ne correspond à ces filtres.</p>
          <footer class="adm-pied"><span>14 sur ${nb(T.commandes)} commandes</span><button type="button" class="bouton-outil" data-suite>Voir la suite</button></footer>`, { aide: `${nb(T.commandes)} commandes au total` })}
        ${bloc("Répartition des statuts", anneau("Répartition des statuts", T.commandes, "commandes", [["En préparation", s.preparation, COUL.gris], ["Expédiées", s.expedie, COUL.bleu], ["En transit", s.en_transit, COUL.violet], ["Livrées", s.livre, COUL.vert]]), { classe: "adm-bloc--anneau" })}
      </div>`;
  ecrire("admin-commandes.html", page({ cle: "admin-commandes", titre: "Commandes", sousTitre: "Gérez et suivez toutes les commandes créées sur DropLink.", fil: [[null, "Commandes"]], trace: "Cette consultation est écrite au journal d'audit, avec ses critères. La liste ne montre ni le client, ni la référence produit, ni le lien de la commande.", corps }));
}

/* =====================================================================
   STATISTIQUES (admin/statistiques/page.tsx) : que des nombres
   ===================================================================== */
{
  const nouveaux = serie(30, 1, 1, 2.2), actifs = Array.from({ length: 30 }, (_, i) => 31 + Math.round(i * .5 + Math.sin(i / 4) * 1.4));
  const delta = (v) => `<span class="delta" data-ton="${v >= 0 ? "hausse" : "baisse"}">${v >= 0 ? "+" : "−"}${Math.abs(v)} %</span> vs période précédente`;
  const transporteurs = [["Colissimo", 41], ["Mondial Relay", 24], ["Chronopost", 19], ["La Poste", 12], ["Pas encore reconnu", 4]];
  const corps = `
      <div class="adm-outils adm-outils--tete">${filtres("Choisir une vue", [["globale", "Vue globale"], ["utilisation", "Utilisation"], ["croissance", "Croissance"], ["commandes", "Commandes"], ["comptes", "Comptes"]])}${filtres("Choisir la période", [["30", "30 derniers jours"], ["7", "7 derniers jours"], ["90", "90 derniers jours"]])}</div>
      ${tuiles([["Commandes créées", nb(T.commandesMois), delta(38)], ["Liens clients consultés", "1 846", `ouverts au moins une fois · ${delta(29)}`], ["Photos uploadées", "4 912", delta(44)], ["Comptes actifs", nb(T.actifs), `sur ${T.comptes} comptes`], ["Nouveaux comptes", nb(T.nouveaux30), delta(58)], ["Colis pris en charge", nb(T.colisMois), `facturés par le suivi · ${delta(41)}`]])}
      <div class="adm-rangee adm-rangee--2">
        ${bloc("Évolution des commandes créées", barres(CMD_JOUR, "Évolution des commandes créées", "commandes"), { droite: `<span class="adm-periode">30 derniers jours</span>` })}
        ${bloc("Évolution des comptes", lignes([["Comptes actifs", actifs, COUL.violet], ["Nouveaux comptes", nouveaux, COUL.vert]], "Évolution des comptes"))}
      </div>
      <div class="adm-rangee adm-rangee--3">
        ${bloc("Types de compte", anneau("Types de compte", T.comptes, "comptes", [["Fournisseurs", 14, COUL.violet], ["Revendeurs", 31, COUL.bleu], ["Sans type déclaré", 3, COUL.gris]]), { classe: "adm-bloc--anneau" })}
        ${bloc("Transporteurs les plus utilisés", `<p class="adm-aide adm-aide--haut">Sur les ${nb(T.colisMois)} colis suivis</p><ul class="adm-barres-h">${transporteurs.map(([n, p], i) => `<li><span>${esc(n)}</span><i><b style="--k:${(p / 41).toFixed(3)};--i:${i}"></b></i><em>${p} %</em></li>`).join("")}</ul>`)}
        ${bloc("Croissance globale", `<p class="adm-aide adm-aide--haut">Trois derniers mois contre les trois précédents</p><ul class="adm-croissance">${[["Comptes", 38], ["Commandes", 52], ["Colis", 47], ["Photos", 61]].map(([n, v]) => `<li><span>${n}</span><b class="delta" data-ton="hausse">+${v} %</b></li>`).join("")}</ul>`)}
      </div>
      <div class="adm-rangee adm-rangee--3">
        ${tuiles([["Pages client consultées", "6 274", "sur 30 jours"]])}
        ${tuiles([["Taux de liens consultés", "87 %", "ouverts au moins une fois"]])}
        ${tuiles([["Temps moyen de livraison", "3,6 jours", "sur les colis livrés de la période"]])}
      </div>`;
  ecrire("admin-statistiques.html", page({ cle: "admin-statistiques", titre: "Statistiques", sousTitre: "Analysez la croissance et l'utilisation de DropLink.", fil: [[null, "Statistiques"]], corps }));
}

/* =====================================================================
   JOURNAL D'AUDIT (admin/journal/page.tsx)
   ===================================================================== */
{
  const total = 1268, susp = 9, param = 6, consult = total - susp - param;
  const corps = `
      ${tuiles([["Entrées au journal", nb(total), "sur la fenêtre choisie"], ["Suspensions et réactivations", susp, `${part(susp, total)} % du total`], ["Paramètres modifiés", param, `${part(param, total)} % du total`], ["Consultations de données", nb(consult), `${part(consult, total)} % du total`]])}
      <p class="adm-garantie">${ic("lock")}<span>Ce journal ne peut être ni modifié ni effacé, et il survit à la suppression des comptes concernés. Le consulter n'y écrit rien.</span></p>
      <div class="adm-rangee adm-rangee--liste">
        ${bloc("Liste des entrées", `
          <div class="adm-outils">${filtres("Filtrer par famille d'action", [["toutes", "Toutes"], ["suspension", "Suspensions"], ["consultation", "Consultations"], ["parametre", "Paramètres"]])}${filtres("Choisir la fenêtre", [["0", "Depuis le début"], ["7", "7 derniers jours"], ["30", "30 derniers jours"]])}</div>
          <ol class="adm-journal" data-table>${JOURNAL.map(ligneJournal).join("")}</ol>
          <p class="adm-vide" hidden data-vide>Aucune entrée ne correspond à ce filtre.</p>
          <footer class="adm-pied"><span>14 sur ${nb(total)} entrées · ni modifiables ni effaçables</span><button type="button" class="bouton-outil" data-suite>Voir la suite</button></footer>`, { aide: `${nb(total)} entrées au total` })}
        ${bloc("Répartition du journal", anneau("Répartition du journal", total, "entrées", [["Consultations", consult, COUL.violet], ["Suspensions", susp, COUL.corail], ["Paramètres", param, COUL.ambre]]), { classe: "adm-bloc--anneau" })}
      </div>`;
  ecrire("admin-journal.html", page({ cle: "admin-journal", titre: "Journal d'audit", sousTitre: "Consultez toutes les actions d'administration enregistrées sur DropLink.", fil: [[null, "Journal d'audit"]], corps }));
}

/* =====================================================================
   SURVEILLANCE (admin/surveillance/page.tsx)
   ===================================================================== */
{
  const taches = [["Interrogation des transporteurs", 3], ["Veille mutuelle des tâches", 1]];
  const limites = [["Pages publiques", 34, 120, "autorise"], ["Jetons inconnus", 3, 20, "autorise"], ["Administration", 4, 30, "refuse"]];
  const corps = `
      <div class="adm-rangee adm-rangee--2">
        ${bloc("Tâches de fond", `<ul class="adm-taches">${taches.map(([n, m]) => `<li><span class="adm-pouls" aria-hidden="true"></span><div><b>${n}</b><small>Dernier passage il y a ${m} minute${m > 1 ? "s" : ""}</small></div><span class="adm-badge" data-statut="active"><i></i>Actif</span></li>`).join("")}</ul>`)}
        ${bloc("Consommation", `<dl class="adm-dl adm-dl--chiffres"><div><dt>Interrogations du transporteur ce mois</dt><dd>9 214</dd></div><div><dt>Colis pris en charge ce mois <span class="adm-facture">le seul poste facturé</span></dt><dd>${nb(T.colisMois)}</dd></div><div><dt>Suivis abandonnés ce mois</dt><dd>6</dd></div></dl>`)}
      </div>
      ${bloc("Colis pris en charge par jour", barres(COLIS_JOUR, "Colis pris en charge chaque jour sur les 30 derniers jours", "colis"), { aide: "30 derniers jours · la dernière barre est aujourd'hui" })}
      <div class="adm-rangee adm-rangee--2">
        ${bloc("Limitation de débit", `<ul class="adm-limites">${limites.map(([n, v, p, d]) => `<li><p><b>${n}</b><span>${v} / ${p} par minute</span></p><i><b style="--k:${(v / p).toFixed(3)}"></b></i><small>${d === "autorise" ? "Si le compteur tombe en panne, l'accès reste autorisé : l'incident ne concerne pas les clients d'un vendeur." : "Ici, une panne du compteur refuse l'accès. Ça ne pénalise que nous."}</small></li>`).join("")}</ul>`)}
        ${bloc("Non mesuré", `<p class="adm-texte">Aucun mécanisme ne relève ces grandeurs aujourd'hui. Elles apparaîtront ici avec le mécanisme qui les mesure, jamais avant : un chiffre inventé sur cet écran ferait douter de tous les autres.</p><ul class="adm-absents">${["Disponibilité", "Latence", "Charge serveur", "Erreurs serveur"].map((n) => `<li><span>${n}</span><b>Non mesuré</b></li>`).join("")}</ul>`)}
      </div>`;
  ecrire("admin-surveillance.html", page({ cle: "admin-surveillance", titre: "Surveillance", sousTitre: "Ce qui tourne sans personne devant.", fil: [[null, "Surveillance"]], corps }));
}

/* =====================================================================
   PARAMÈTRES SYSTÈME (admin/parametres/page.tsx)
   ===================================================================== */
{
  const nombre = (cle, titre, aide, valeur, min, max, origine) => `<form class="adm-reglage" data-reglage="${cle}" novalidate>
      <div><label for="r-${cle}">${titre}</label><p>${aide}</p><small>Entre ${nb(min)} et ${nb(max)}.</small><small class="adm-origine">${origine}</small></div>
      <div class="adm-reglage__saisie"><input id="r-${cle}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${valeur}" data-initial="${valeur}"><button type="submit" class="bouton-outil" disabled>Enregistrer</button></div>
      <p class="adm-reglage__retour" role="status" aria-live="polite"></p></form>`;
  const inter = (cle, titre, aide, on) => `<div class="adm-reglage adm-reglage--inter"><div><p class="adm-reglage__titre">${titre}</p><p>${aide}</p><small class="adm-origine">Valeur par défaut : personne ne l'a jamais modifiée.</small></div><label class="interrupteur"><input type="checkbox" role="switch" ${on ? "checked" : ""} data-interrupteur="${titre}"><i></i><span class="sr">${titre}</span></label></div>`;
  const constate = (titre, valeur, aide = "") => `<div class="adm-constate"><div><p>${titre}</p>${aide ? `<small>${aide}</small>` : ""}</div><b>${valeur}</b></div>`;
  const modifie = (d) => `Modifié le ${d} par ${ADMIN}.`;
  const corps = `
      <div class="adm-rangee adm-rangee--2">
        ${bloc("Plafonds par compte", nombre("plafond_commandes_mensuel", "Commandes par mois", "Au-delà, la création est refusée", 300, 100, 100000, modifie("20 sept. 2026")) + nombre("plafond_commandes_gratuit_a_vie", "Commandes gratuites (à vie)", "Total sur la vie d'un compte gratuit", 5, 1, 100000, modifie("26 sept. 2026")), { aide: "Vérifiés en base, pas seulement dans l'interface." })}
        ${bloc("Suivi des colis", nombre("budget_suivi_total", "Budget de suivi (à vie)", "Prises en charge que le palier autorise en tout", 200, 0, 1000000, modifie("20 sept. 2026")) + nombre("budget_suivi_deja_consomme", "Déjà consommé ailleurs", "Payé au fournisseur, absent de nos lignes", 7, 0, 1000000, modifie("20 sept. 2026")) + nombre("seuil_colis_par_compte", "Seuil d'alerte colis", "Signale un compte au-delà de ce nombre", 300, 1, 1000000, modifie("20 sept. 2026")) + nombre("retard_veilleur_minutes", "Tâche en retard après", "En minutes sans battement", 30, 5, 10080, "Valeur par défaut : personne ne l'a jamais modifiée."), { aide: "Le seul poste de coût variable du produit." })}
      </div>
      <div class="adm-rangee adm-rangee--2">
        ${bloc("Interrupteurs", inter("inscriptions_ouvertes", "Inscriptions ouvertes", "Fermer n'affecte pas les comptes existants", true) + inter("suivi_actif", "Interrogation des transporteurs", "Couper arrête la facturation à la prise en charge", true), { aide: "Effet immédiat sur toute la plateforme." })}
        ${bloc("Limitation de débit", constate("Jeton inconnu", "20 / min") + constate("Jeton valide", "120 / min") + constate("Dépôts de médias", "60 / min"), { aide: "Par fenêtre d'une minute, comptée en base." })}
      </div>
      ${bloc("Constaté, changé au déploiement", `<div class="adm-constates">${constate("Stockage par compte", "Aucun", "Aucun plafond n'est appliqué") + constate("Médias par commande", "20", "Dont 3 vidéos au maximum") + constate("Poids maximum d'une vidéo", "20 Mo", "En mégaoctets · provisoire, à calibrer") + constate("Silence nommé après", "10 jours", "En jours sans mouvement") + constate("Purge des réponses brutes", "90 jours", "En jours après le dernier mouvement")}</div>`, { aide: "Les valeurs grisées se changent au déploiement." })}
      <p class="adm-garantie">${ic("key-round")}<span><b>Les secrets ne sont pas ici.</b> Clés d'API, jeton de stockage et clé de service ne passent jamais par cet écran ni par la base. Ils vivent uniquement dans les variables d'environnement du serveur.</span></p>`;
  ecrire("admin-parametres.html", page({ cle: "admin-parametres", titre: "Paramètres système", sousTitre: "Chaque modification est écrite au journal d'audit, avec l'ancienne et la nouvelle valeur. Les valeurs grisées se changent au déploiement.", fil: [[null, "Paramètres système"]], corps }));
}

/* =====================================================================
   ERREUR DE L'ADMINISTRATION (admin/error.tsx) : la carte d'état vide du design
   system, comme l'erreur de l'espace vendeur, sans titre de page au-dessus.
   ===================================================================== */
{
  const corps = `
      <section class="etat" aria-labelledby="etat-titre">
        <span class="etat__icone" aria-hidden="true">${ic("triangle-alert")}</span>
        <h1 id="etat-titre">Cet écran n'a pas pu s'afficher</h1>
        <p>Une erreur est survenue de notre côté. Vos données ne sont pas touchées : rien n'a été enregistré ni supprimé.</p>
        <div class="etat__actions">
          <button class="etat__bouton" type="button" data-reessayer="admin.html">${ic("rotate-ccw")}<span>Réessayer</span></button>
          <p class="etat__ref">Référence de l'incident : 2741983056</p>
        </div>
      </section>`;
  ecrire("admin-erreur.html", page({ cle: "admin-erreur", nav: "admin", titre: "Erreur", corps, sansTete: true, script: `<script src="etats.js" defer></script>\n` }));
}

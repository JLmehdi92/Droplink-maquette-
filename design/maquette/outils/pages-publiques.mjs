// Génère les pages publiques de la maquette à partir des SOURCES du produit :
// droplink2/messages/fr.json (tarifs, docs, legal, passerPro) et les articles du
// blog (droplink2/src/contenu/blog). Aucun texte n'est réécrit à la main : la
// maquette dit ce que dit le produit. Deux écarts, et seulement deux :
//  - le tiret long devient une virgule ou deux-points (règle de la maquette) ;
//  - le plan gratuit vaut 5 commandes et 5 colis, la décision en cours.
// Usage : node outils/pages-publiques.mjs ../droplink2
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
const ici = path.dirname(new URL(import.meta.url).pathname);
const racine = path.join(ici, "..");
const produit = path.resolve(process.argv[2] ?? path.join(racine, "..", "droplink2"));
const M = JSON.parse(readFileSync(path.join(produit, "messages", "fr.json"), "utf8"));
const GRATUIT = 5, PRO = 300, PRIX = "20 €";

/* ---------- outillage ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// le tiret long : deux-points dans un titre, virgule dans une phrase
// la typographie française : une espace insécable fine avant ? ! ; et insécable avant : et dans les guillemets,
// sans quoi « ? » ou « » » tombe seul en début de ligne
const fr = (s) => s.replace(/\s+([?!;])/g, "\u202F$1").replace(/\s+:/g, "\u00A0:").replace(/«\s+/g, "«\u00A0").replace(/\s+»/g, "\u00A0»");
const titre = (s) => fr(String(s).replace(/\s+—\s+/g, " : ").replace(/—/g, ":"));
const texte = (s) => fr(String(s).replace(/\s+—\s+/g, ", ").replace(/—/g, ","));
const t = (s) => esc(texte(s));
const tt = (s) => esc(titre(s));
// les balises riches de next-intl : <b>, <lien>, <analyses>
const riche = (s, liens = {}) => t(s)
  .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, "<b>$1</b>")
  .replace(/&lt;(\w+)&gt;(.*?)&lt;\/\1&gt;/g, (_, k, v) => liens[k] ? `<a class="lien-texte" href="${liens[k]}">${v}</a>` : v);
const ic = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const date = (iso) => { const [a, m, j] = iso.split("-"); return `${Number(j)} ${MOIS[Number(m) - 1]} ${a}`; };

/* ---------- la coque publique ---------- */
const NAV = [["index.html#studio", "Comment ça marche", "accueil"], ["tarifs.html", "Tarifs", "tarifs"], ["docs.html", "Documentation", "docs"], ["blog.html", "Blog", "blog"]];
const page = ({ cle, titrePage, description, corps, scripts = [] }) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titrePage)}</title>
<meta name="description" content="${esc(texte(description))}">
<link rel="preload" href="assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">
</head>
<body class="l4 publique publique--${cle}">
<!--ICONES-->
<div class="l4-grain" aria-hidden="true"></div>
<a class="evitement" href="#contenu">Aller au contenu</a>
<div class="sentinelle" data-sentinelle aria-hidden="true"></div>

<header class="entete" data-entete>
  <div class="entete__barre">
    <a class="logo" href="index.html" aria-label="DropLink, accueil">
      <img src="assets/img/symbole-84.png" alt="" width="20" height="28">
      <span>DropLink</span>
    </a>
    <nav class="nav" aria-label="Navigation principale">
      ${NAV.map(([h, l, k]) => `<a href="${h}"${k === cle ? ' aria-current="page"' : ""}>${l}</a>`).join("\n      ")}
    </nav>
    <div class="entete__actions">
      <a class="lien-discret" href="connexion.html">Se connecter</a>
      <a class="bouton bouton--plein bouton--petit" href="inscription.html">Créer un compte</a>
      <button class="bouton-icone menu-bouton" type="button" aria-expanded="false" aria-controls="menu-mobile" aria-label="Ouvrir le menu" data-menu-bouton>
        ${ic("menu")}
      </button>
    </div>
  </div>
  <div class="menu-mobile" id="menu-mobile" hidden data-menu>
    ${NAV.map(([h, l, k]) => `<a href="${h}"${k === cle ? ' aria-current="page"' : ""}>${l}</a>`).join("\n    ")}
    <a href="connexion.html">Se connecter</a>
  </div>
</header>

<main id="contenu" class="pub">
${corps}
</main>

<footer class="pied">
  <div class="conteneur pied__grille">
    <div>
      <a class="logo" href="index.html" aria-label="DropLink, accueil">
        <img src="assets/img/symbole-84.png" alt="" width="20" height="28">
        <span>DropLink</span>
      </a>
      <p class="pied__devise">Un seul lien de suivi pour toute la commande.</p>
    </div>
    <nav aria-label="Produit">
      <h3>Produit</h3>
      <a href="index.html#studio">Comment ça marche</a>
      <a href="tarifs.html">Tarifs</a>
      <a href="docs.html">Documentation</a>
      <a href="blog.html">Blog</a>
    </nav>
    <nav aria-label="${t(M.legal.piedTitre)}">
      <h3>Légal</h3>
      <a href="conditions.html">${t(M.legal.piedConditions)}</a>
      <a href="confidentialite.html">${t(M.legal.piedConfidentialite)}</a>
      <a href="signalement.html">${t(M.legal.piedSignaler)}</a>
    </nav>
  </div>
  <div class="conteneur pied__bas">
    <p>${t(M.navigation.piedDePage.replace("{annee}", "2026"))} · <a class="l4-comparer" href="plan.html">Toutes les pages</a></p>
    <div class="theme" role="group" aria-label="Thème">
      <button type="button" data-theme-choix="light" aria-pressed="false">${ic("sun")}<span class="sr">Clair</span></button>
      <button type="button" data-theme-choix="dark" aria-pressed="false">${ic("moon")}<span class="sr">Sombre</span></button>
    </div>
  </div>
</footer>

<script src="public.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join("\n")}
</body>
</html>
`;
const ecrire = (f, html) => { writeFileSync(path.join(racine, "src", f), html); console.log("écrit", f); };

/* =====================================================================
   TARIFS (tarifs/page.tsx) : les deux plans, puis la comparaison
   ===================================================================== */
{
  const T = M.tarifs, P = M.passerPro;
  const oui = `<svg class="ic tp-oui" role="img" aria-label="Inclus"><use href="#i-check"/></svg>`;
  const lignes = [
    [P.tableau.commandes, `<b>${GRATUIT}</b> au total, à vie`, `<b>${PRO}</b> par mois`],
    [P.tableau.colis, `<b>${GRATUIT}</b> au total, à vie`, `<b>${PRO}</b> par mois`],
    [P.tableau.adresse, `<code class="tp-code">${t(P.tableau.adresseGratuit)}</code>`, `<code class="tp-code tp-code--pro">${t(P.tableau.adressePro)}</code>`],
    [P.tableau.carte, t(P.tableau.carteGratuit), t(P.tableau.cartePro)],
    [P.tableau.medias, oui, oui],
    [P.tableau.couleurs, oui, oui],
  ];
  const inclusG = [P.tableau.medias, P.tableau.couleurs, T.gratuitQuota.replace("{n}", GRATUIT)];
  const inclusP = [T.toutLeGratuit, P.features.lien.titre, P.features.marque.titre, T.proQuota.replace("{n}", PRO)];
  const liste = (xs) => `<ul class="tf-inclus">${xs.map((x) => `<li>${ic("check")}<span>${t(x)}</span></li>`).join("")}</ul>`;
  const corps = `
  <section class="pub-tete conteneur">
    <p class="l4-etiquette"><span>${ic("tag")}</span>${t(T.eyebrow)}</p>
    <h1 class="pub-titre l4-titre"><span class="l4-ligne" style="--l:0">${tt(T.titre)}</span></h1>
    <p class="pub-chapo" data-entree>${t(T.intro)}</p>
  </section>

  <section class="conteneur tf-plans" aria-label="Les deux plans">
    <article class="tf-plan v4-carte" data-anime>
      <header>
        <h2>${t(P.gratuit)}</h2>
        <p class="tf-prix"><b>0 €</b></p>
        <p class="tf-sous">${t(T.gratuitSous)}</p>
      </header>
      ${liste(inclusG)}
      <a class="bouton bouton--second bouton--large" href="inscription.html">${t(T.ctaGratuit)}${ic("arrow-right")}</a>
    </article>
    <article class="tf-plan tf-plan--pro v4-carte" data-anime>
      <header>
        <h2>${ic("crown")}${t(P.pro)}</h2>
        <p class="tf-prix"><b>${PRIX}</b><small>/ mois</small></p>
        <p class="tf-sous">${t(T.proSous)}</p>
      </header>
      ${liste(inclusP)}
      <div class="tf-pro-actions">
        <a class="bouton bouton--marque bouton--large" href="inscription.html">${t(T.ctaPro)}${ic("arrow-right")}</a>
        <p class="tf-note">${t(T.noteCompte)} ${t(T.dejaInscrit)} <a class="lien-texte" href="connexion.html">Se connecter</a></p>
      </div>
    </article>
  </section>

  <section class="conteneur tf-comparer" aria-labelledby="tf-comparer">
    <h2 id="tf-comparer" class="pub-h2">${t(T.comparer)}</h2>
    <div class="tp tf-tp" data-anime>
      <table class="tp__table">
        <caption class="sr">${t(T.comparer)}</caption>
        <colgroup><col class="tp__col-libelle"><col><col class="tp__col-pro"></colgroup>
        <thead><tr>
          <td class="tp__coin"></td>
          <th scope="col"><span class="tp__nom">${t(P.gratuit)}</span><span class="tp__prix"><b>0 €</b></span></th>
          <th scope="col" class="tp__pro"><span class="tp__nom">${t(P.pro)}</span><span class="tp__prix"><b>${PRIX}</b><small>/ mois</small></span></th>
        </tr></thead>
        <tbody>
${lignes.map(([l, g, p], i) => `          <tr style="--i:${i}"><th scope="row">${t(l)}</th><td>${g === oui ? oui : g}</td><td>${p === oui ? oui : p}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </div>
    <p class="tf-question">${t(T.question)} <a class="lien-texte" href="docs.html#plans">${t(T.voirDocs)}${ic("arrow-right")}</a></p>
  </section>`;
  ecrire("tarifs.html", page({ cle: "tarifs", titrePage: texte(T.metaTitre).replace(", DropLink", " · DropLink"), description: T.metaDescription.replace("{prix}", PRIX), corps }));
}

/* =====================================================================
   DOCUMENTATION (docs/page.tsx) : le guide, son sommaire groupé
   ===================================================================== */
{
  const D = M.docs;
  const sommaire = [
    [D.grCommencer, [["presentation", D.presentation], ["demarrer", D.demarrer], ["marque", D.marque]]],
    [D.grUtiliser, [["commande", D.commande], ["medias", D.medias], ["suivi", D.suivi], ["statuts", D.statuts], ["lien", D.lien]]],
    [D.grPiloter, [["envois", D.envois], ["analyses", D.analyses], ["notifications", D.notifications]]],
    [D.grCompte, [["parametres", D.parametres], ["plans", D.plans]]],
    [D.grAide, [["faq", D.faq], ["support", D.support]]],
  ];
  const nav = sommaire.map(([g, items]) => `<p class="doc-nav__groupe">${t(g)}</p>${items.map(([id, l]) => `<a href="#${id}" data-ancre="${id}">${t(l)}</a>`).join("")}`).join("");
  const section = (id, titreS, contenu) => `<section class="doc-section" id="${id}" aria-labelledby="h-${id}"><h2 id="h-${id}">${tt(titreS)}</h2>${contenu}</section>`;
  const p = (s, liens) => `<p>${riche(s, liens)}</p>`;
  const liste = (xs) => `<ul class="doc-liste">${xs.map((x) => `<li>${ic("check")}<span>${t(x)}</span></li>`).join("")}</ul>`;
  const etapes = (xs) => `<ol class="doc-etapes">${xs.map(([a, b], i) => `<li><span>${i + 1}</span><div><b>${tt(a)}</b><p>${b}</p></div></li>`).join("")}</ol>`;
  const encart = (a, b, ton = "info") => `<aside class="doc-encart" data-ton="${ton}">${ic(ton === "alerte" ? "circle-alert" : "sparkles")}<div><b>${tt(a)}</b><p>${t(b)}</p></div></aside>`;
  const tableau = (cols, rows) => `<div class="doc-tableau"><table><thead><tr>${cols.map((c) => `<th scope="col">${t(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => i ? `<td>${t(c)}</td>` : `<th scope="row">${t(c)}</th>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const liens = { lien: "inscription.html", analyses: "#analyses" };
  const statuts = [["attente", D.stPreparation, D.stPreparationE], ["expedie", D.stExpedie, D.stExpedieE], ["transit", D.stTransit, D.stTransitE], ["livre", D.stLivre, D.stLivreE]];
  const faq = [1, 2, 3, 4, 5, 6].map((i) => `<details class="doc-q" name="doc-faq"><summary>${t(D[`faqQ${i}`])}${ic("plus")}</summary><p>${t(D[`faqR${i}`])}</p></details>`).join("");
  const article = `
      <p class="l4-etiquette"><span>${ic("file-text")}</span>${t(D.etiquette)}</p>
      <h1 class="pub-titre doc-titre">${tt(D.titre)}</h1>
      <p class="doc-auteur"><span class="doc-auteur__avatar"><img src="assets/img/symbole-84.png" alt="" width="14" height="20"></span><span><b>${t(D.auteur)}</b><small>${t(D.source)}</small></span><span class="doc-auteur__meta">${ic("calendar-days")}${t(D.misAJour)} 14 septembre 2026<span aria-hidden="true">·</span>${ic("clock")}${t(D.duree)}</span></p>
      <p class="doc-resume"><b>${t(D.resumeEtiquette)}</b> ${riche(D.resume, liens)}</p>

      ${section("presentation", D.presentation, `${p(D.presentationTexte)}
        <div class="doc-flux" aria-label="Le principe">${[D.fluxClient, D.fluxMedias, D.fluxSuivi, D.fluxLien].map((x, i) => `<span class="doc-flux__etape${i === 3 ? " est-lien" : ""}">${t(x)}</span>`).join(ic("arrow-right"))}</div>
        <h3>${t(D.ceQueFait)}</h3>${liste([D.fait1, D.fait2, D.fait3, D.fait4])}
        <h3>${t(D.ceQueFaitPas)}</h3>${p(D.faitPasTexte)}`)}
      ${section("demarrer", D.demarrer, `${etapes([[D.etape1, riche(D.etape1Texte, liens)], [D.etape2, t(D.etape2Texte)], [D.etape3, t(D.etape3Texte)]])}${encart(D.combienTitre, D.combienTexte)}`)}
      ${section("marque", D.marque, `${p(D.marqueTexte, { lien: "client.html" })}${tableau([D.colReglage, D.colEffet], [[D.regLogo, D.regLogoE], [D.regNom, D.regNomE], [D.regCouleur, D.regCouleurE], [D.regSociaux, D.regSociauxE], [D.regFiligrane, D.regFiligraneE]])}`)}
      ${section("commande", D.commande, `${p(D.commandeTexte)}${etapes([[D.blocClient, t(D.blocClientTexte)], [D.blocMedias, t(D.blocMediasTexte)], [D.blocSuivi, t(D.blocSuiviTexte)]])}${encart(D.sauvegardeTitre, D.sauvegardeTexte)}`)}
      ${section("medias", D.medias, `${p(D.mediasTexte)}${liste([D.media1, D.media2, D.media3])}`)}
      ${section("suivi", D.suivi, `${p(D.suiviTexte)}${encart(D.suiviAlerteTitre, D.suiviAlerteTexte, "alerte")}<h3>${t(D.transporteurs)}</h3>${p(D.transporteursTexte, liens)}`)}
      ${section("statuts", D.statuts, `${p(D.statutsTexte)}<div class="doc-statuts">${statuts.map(([k, a, b]) => `<div class="doc-statut"><span class="doc-badge" data-statut="${k}"><i></i>${t(a)}</span><p>${t(b)}</p></div>`).join("")}</div>${encart(D.silenceTitre, D.silenceTexte, "alerte")}`)}
      ${section("lien", D.lien, `${p(D.lienTexte)}${liste([D.clientVoit1, D.clientVoit2, D.clientVoit3, D.clientVoit4, D.clientVoit5, D.clientVoit6])}${encart(D.lienAlerteTitre, D.lienAlerteTexte)}`)}
      ${section("envois", D.envois, p(D.envoisTexte))}
      ${section("analyses", D.analyses, `${p(D.analysesTexte)}${tableau([D.colIndicateur, D.colMesure], [[D.kpiCrees, D.kpiCreesE], [D.kpiLivrees, D.kpiLivreesE], [D.kpiLiens, D.kpiLiensE], [D.kpiDelai, D.kpiDelaiE]])}${p(D.analysesSuite)}`)}
      ${section("notifications", D.notifications, p(D.notificationsTexte))}
      ${section("parametres", D.parametres, liste([D.param1, D.param2, D.param3, D.param4, D.param5, D.param6]))}
      ${section("plans", D.plans, `${p(D.plansTexte.replace("{gratuit}", GRATUIT).replace("{pro}", PRO))}${tableau(["", D.planGratuit, D.planPro.replace("{prix}", PRIX)], [[D.plCommandes, D.plCommandesG.replace("{n}", GRATUIT), D.plCommandesP.replace("{n}", PRO)], [D.plPage, D.plPageG, D.plPageP]])}`)}
      ${section("faq", D.faq, `<div class="doc-faq">${faq}</div>`)}
      ${section("support", D.support, `${p(D.supportTexte)}<p><a class="lien-texte" href="signalement.html">${t(M.legal.piedSignaler)}${ic("arrow-right")}</a></p>`)}

      <aside class="pub-cta v4-carte" data-anime>
        <h2>${t(D.ctaTitre)}</h2>
        <p>${t(D.ctaTexte)}</p>
        <a class="bouton bouton--marque bouton--large" href="inscription.html">${t(D.ctaBouton)}${ic("arrow-right")}</a>
      </aside>`;
  const corps = `
  <div class="conteneur doc">
    <aside class="doc-cote">
      <details class="doc-sommaire" data-sommaire open>
        <summary>${ic("list-filter")}<span>Sommaire</span><b data-sommaire-courant>${t(D.presentation)}</b>${ic("chevron-down")}</summary>
        <nav class="doc-nav" aria-label="${t(D.etiquette)}" data-sommaire-nav>${nav}</nav>
      </details>
    </aside>
    <article class="doc-article">${article}
    </article>
  </div>`;
  ecrire("docs.html", page({ cle: "docs", titrePage: `${texte(D.etiquette)} · DropLink`, description: D.metaDescription, corps }));
}

/* =====================================================================
   BLOG (blog/page.tsx et blog/[slug]/page.tsx)
   ===================================================================== */
{
  const dossier = path.join(produit, "src", "contenu", "blog");
  const articles = readdirSync(dossier).map((f) => {
    const src = readFileSync(path.join(dossier, f), "utf8").replace(/^import type.*$/m, "").replace("export const article: Article =", "module.exports =");
    const m = { exports: {} }; new Function("module", src)(m); return m.exports;
  }).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  const meta = (a) => `<span class="blog-meta">${ic("calendar-days")}<time datetime="${a.date}">${date(a.date)}</time><span aria-hidden="true">·</span>${ic("clock")}${a.minutes} min</span>`;
  const DESCRIPTION = "Ce qu'on apprend en parlant à des vendeurs qui envoient leurs commandes en message privé : les outils, les pièges, et ce qui fait qu'un client cesse de demander où en est son colis.";
  const corpsIndex = `
  <section class="pub-tete conteneur">
    <p class="l4-etiquette"><span>${ic("file-text")}</span>Le blog</p>
    <h1 class="pub-titre l4-titre"><span class="l4-ligne" style="--l:0">Vendre en direct, sans y passer ses soirées</span></h1>
    <p class="pub-chapo" data-entree>${t(DESCRIPTION)}</p>
  </section>
  <section class="conteneur blog-grille" aria-label="Articles">
${articles.map((a, i) => `    <a class="blog-carte v4-carte${i === 0 ? " blog-carte--une" : ""}" href="blog-${a.slug}.html" data-anime>
      <span class="blog-carte__etiquette">${t(a.etiquette)}</span>
      <h2>${tt(a.titre)}</h2>
      <p>${t(a.resume)}</p>
      <span class="blog-carte__pied">${meta(a)}<span class="blog-carte__lire">Lire${ic("arrow-right")}</span></span>
    </a>`).join("\n")}
  </section>`;
  ecrire("blog.html", page({ cle: "blog", titrePage: "Blog · DropLink", description: DESCRIPTION, corps: corpsIndex }));
  for (const a of articles) {
    const blocs = a.blocs.map((b) => ({
      chapeau: () => `<p class="art-chapeau">${t(b.texte)}</p>`,
      titre: () => `<h2>${tt(b.texte)}</h2>`,
      paragraphe: () => `<p>${t(b.texte)}</p>`,
      citation: () => `<blockquote>${t(b.texte)}</blockquote>`,
      liste: () => `<ul>${b.items.map((x) => `<li>${t(x)}</li>`).join("")}</ul>`,
    })[b.type]()).join("\n      ");
    const autres = articles.filter((x) => x.slug !== a.slug).slice(0, 2);
    const corps = `
  <div class="art-progres" aria-hidden="true" data-progres></div>
  <article class="conteneur art">
    <a class="art-retour" href="blog.html">${ic("arrow-left")}Tous les articles</a>
    <p class="l4-etiquette art-etiquette"><span>${ic("file-text")}</span>${t(a.etiquette)}</p>
    <h1 class="pub-titre art-titre">${tt(a.titre)}</h1>
    <p class="art-meta">${meta(a)}</p>
    <div class="art-corps">
      ${blocs}
    </div>
    <aside class="pub-cta v4-carte" data-anime>
      <h2>Un seul lien pour toute la commande</h2>
      <p>${t(M.docs.ctaTexte)}</p>
      <a class="bouton bouton--marque bouton--large" href="inscription.html">${t(M.docs.ctaBouton)}${ic("arrow-right")}</a>
    </aside>
    <nav class="art-suite" aria-label="À lire aussi">
      <p class="art-suite__titre">À lire aussi</p>
      ${autres.map((x) => `<a class="blog-carte v4-carte" href="blog-${x.slug}.html"><span class="blog-carte__etiquette">${t(x.etiquette)}</span><h2>${tt(x.titre)}</h2><span class="blog-carte__pied">${meta(x)}<span class="blog-carte__lire">Lire${ic("arrow-right")}</span></span></a>`).join("\n      ")}
    </nav>
  </article>`;
    ecrire(`blog-${a.slug}.html`, page({ cle: "blog", titrePage: `${titre(a.titreMeta ?? a.titre)} · DropLink`, description: a.description, corps }));
  }
  writeFileSync(path.join(racine, "outils", "articles.json"), JSON.stringify(articles.map((a) => a.slug)));
}

/* =====================================================================
   PAGES LÉGALES (components/page-legale.tsx) et SIGNALEMENT
   ===================================================================== */
{
  const L = M.legal, C = L.conditions, K = L.confidentialite;
  const legale = (cle, titreL, chapeau, sections) => {
    const nav = sections.map(([id, s], i) => `<a href="#${id}" data-ancre="${id}">${i + 1}. ${t(s)}</a>`).join("");
    const corps = `
  <section class="pub-tete conteneur">
    <p class="l4-etiquette"><span>${ic(cle === "conditions" ? "file-text" : "shield")}</span>${t(L.pastille)}</p>
    <h1 class="pub-titre l4-titre"><span class="l4-ligne" style="--l:0">${tt(titreL)}</span></h1>
    ${chapeau ? `<p class="pub-chapo" data-entree>${t(chapeau)}</p>` : ""}
    <p class="leg-meta">${ic("calendar-days")}${t(L.misAJourLe)} : 18 septembre 2026<span aria-hidden="true">·</span>${ic("house")}${t(L.editeur)} ${t(L.editeurNom)}</p>
  </section>
  <div class="conteneur doc leg">
    <aside class="doc-cote">
      <details class="doc-sommaire" data-sommaire open>
        <summary>${ic("list-filter")}<span>${t(L.sommaireTitre)}</span><b data-sommaire-courant>1. ${t(sections[0][1])}</b>${ic("chevron-down")}</summary>
        <nav class="doc-nav" aria-label="${t(L.sommaireTitre)}" data-sommaire-nav>${nav}
          <p class="doc-nav__groupe">${t(L.piedTitre)}</p>
          <a href="conditions.html"${cle === "conditions" ? ' aria-current="page"' : ""}>${t(L.conditionsTitre)}</a>
          <a href="confidentialite.html"${cle === "confidentialite" ? ' aria-current="page"' : ""}>${t(L.confidentialiteTitre)}</a>
        </nav>
      </details>
      <div class="leg-encart v4-carte">
        <b>${t(L.encartSignalerTitre)}</b>
        <p>${t(L.encartSignalerTexte)}</p>
        <a class="lien-texte" href="signalement.html">${t(L.encartSignalerLien)}${ic("arrow-right")}</a>
      </div>
    </aside>
    <article class="doc-article leg-article">
${sections.map(([id, s, ps], i) => `      <section class="doc-section" id="${id}" aria-labelledby="h-${id}"><h2 id="h-${id}"><span class="leg-n">${String(i + 1).padStart(2, "0")}</span>${tt(s)}</h2>${ps.map((x) => `<p>${t(x)}</p>`).join("")}</section>`).join("\n")}
    </article>
  </div>`;
    ecrire(`${cle}.html`, page({ cle, titrePage: `${texte(titreL)} · DropLink`, description: L[`${cle}MetaDescription`], corps }));
  };
  legale("conditions", L.conditionsTitre, null, [
    ["objet", C.objetTitre, [C.objetP1, C.objetP2]],
    ["compte", C.compteTitre, [C.compteP1, C.compteP2]],
    ["contenus", C.contenusTitre, [C.contenusP1, C.contenusP2]],
    ["retrait", C.retraitTitre, [C.retraitP1, C.retraitFormulaire, C.retraitP2]],
    ["disponibilite", C.disponibiliteTitre, [C.disponibiliteP1, C.disponibiliteP2]],
    ["donnees", C.donneesTitre, [C.donneesP1]],
    ["resiliation", C.resiliationTitre, [C.resiliationP1, C.resiliationP2]],
    ["droit", C.droitTitre, [C.droitP1]],
  ]);
  // l'ordre de confidentialite/page.tsx
  const src = readFileSync(path.join(produit, "src", "app", "[locale]", "confidentialite", "page.tsx"), "utf8");
  const ids = [...src.matchAll(/id: "([\w-]+)"/g)].map((m) => m[1]);
  const SECTIONS_K = { collecte: [K.collecteTitre, [K.collecteP1]], "pas-de-compte": [K.pasDeCompteTitre, [K.pasDeCompteP1]], pasDeCompte: [K.pasDeCompteTitre, [K.pasDeCompteP1]], indexation: [K.indexationTitre, [K.indexationP1]], conservation: [K.conservationTitre, [K.conservationP1, K.conservationP2]], droits: [K.droitsTitre, [K.droitsP1]] };
  const ordre = ids.length ? ids : ["collecte", "pasDeCompte", "indexation", "conservation", "droits"];
  legale("confidentialite", L.confidentialiteTitre, L.confidentialiteChapeau, ordre.filter((id) => SECTIONS_K[id]).map((id) => [id, ...SECTIONS_K[id]]));

  const S = L.signalement;
  const corps = `
  <div class="conteneur sig">
    <div class="sig-gauche">
      <p class="l4-etiquette"><span>${ic("shield")}</span>${t(L.signalementSurTitre)}</p>
      <h1 class="pub-titre l4-titre"><span class="l4-ligne" style="--l:0">${tt(L.signalementTitre)}</span></h1>
      <p class="pub-chapo" data-entree>${t(S.intro)}</p>
      <ol class="sig-etapes">
        ${[[S.etape1Titre, S.etape1Texte], [S.etape2Titre, S.etape2Texte], [S.etape3Titre, S.etape3Texte]].map(([a, b], i) => `<li><span>${i + 1}</span><div><b>${t(a)}</b><p>${t(b)}</p></div></li>`).join("\n        ")}
      </ol>
      <aside class="sig-note" role="note">${ic("circle-alert")}<p>${t(S.avertissement)}</p></aside>
    </div>
    <form class="sig-form v4-carte" novalidate data-signalement>
      <div class="sig-champ"><label for="sig-lien">${t(S.lien)}</label><input id="sig-lien" type="url" inputmode="url" placeholder="${t(S.lienExemple)}" required data-sig="lien"><p class="sig-erreur" data-erreur></p></div>
      <div class="sig-champ"><label for="sig-cat">${t(S.categorie)}</label><span class="sig-liste"><select id="sig-cat" data-sig="categorie">
        ${[S.cat_droits, S.cat_illicite, S.cat_donnees, S.cat_autre].map((c) => `<option>${t(c)}</option>`).join("")}
      </select>${ic("chevron-down")}</span></div>
      <div class="sig-champ"><label for="sig-desc">${t(S.description)}</label><textarea id="sig-desc" rows="5" placeholder="${t(S.descriptionExemple)}" required data-sig="description"></textarea><p class="sig-erreur" data-erreur></p></div>
      <div class="sig-champ"><label for="sig-email">${t(S.email)}</label><input id="sig-email" type="email" inputmode="email" autocomplete="email" placeholder="${t(S.emailExemple)}" required data-sig="email"><p class="sig-erreur" data-erreur></p></div>
      <button class="bouton bouton--marque bouton--large" type="submit">${t(S.envoyer)}${ic("arrow-right")}</button>
      <p class="sig-aide">${t(S.ouvreMessagerie)}</p>
      <div class="sig-pret" hidden data-pret>
        <p class="sig-pret__tete">${ic("circle-check")}<b>Votre message est prêt</b></p>
        <dl><div><dt>À</dt><dd><span class="sig-copiable">abus@droplink.fr</span></dd></div><div><dt>Objet</dt><dd data-pret-objet></dd></div></dl>
        <pre class="sig-pret__corps" data-pret-corps></pre>
        <div class="sig-pret__actions"><button type="button" class="bouton bouton--second" data-copier-message>${ic("copy")}Copier le message</button><a class="bouton bouton--plein" data-ouvrir-messagerie href="#">${ic("mail")}Ouvrir ma messagerie</a></div>
        <p class="sig-aide">Rien n'est envoyé tant que vous ne l'envoyez pas vous-même.</p>
      </div>
      <p class="sig-directe">${t(S.adresseDirecte)} <span class="sig-copiable">abus@droplink.fr</span></p>
    </form>
  </div>`;
  ecrire("signalement.html", page({ cle: "signalement", titrePage: `${texte(L.signalementTitre)} · DropLink`, description: L.signalementMetaDescription, corps }));
}

/* =====================================================================
   PLAN DE LA MAQUETTE : ce n'est pas un écran du produit, c'est la
   porte vers les écrans qu'aucun parcours n'atteint dans une maquette
   (administration, e-mails reçus, états d'un lien).
   ===================================================================== */
{
  const articles = JSON.parse(readFileSync(path.join(racine, "outils", "articles.json"), "utf8"));
  const GROUPES = [
    ["globe", "Le site public", "Ce que voit un visiteur avant d'avoir un compte.", [
      ["index.html", "Accueil", "La landing"], ["tarifs.html", "Tarifs", "Gratuit et Pro, comparés"], ["docs.html", "Documentation", "Prise en main, pas à pas"],
      ["blog.html", "Blog", `${articles.length} articles`], ["conditions.html", "Conditions", "Conditions d'utilisation"], ["confidentialite.html", "Confidentialité", "Données et droits"], ["signalement.html", "Signaler un contenu", "Le message préparé pour abus@droplink.fr"]]],
    ["lock-keyhole", "Le compte", "Entrer, revenir, et ce que l'on reçoit par e-mail.", [
      ["connexion.html", "Connexion", "E-mail ou Google"], ["inscription.html", "Inscription", "Création du compte"], ["connexion.html#oubli", "Mot de passe oublié", "Le lien de réinitialisation"],
      ["nouveau-mot-de-passe.html", "Nouveau mot de passe", "Depuis le lien reçu"], ["verification.html", "Vérification en deux étapes", "Le code à six chiffres"], ["bienvenue.html", "Bienvenue", "Les premiers réglages"],
      ["notification.html", "Messages du compte", "Lien envoyé, adresse confirmée, lien expiré"]]],
    ["layout-dashboard", "L'espace vendeur", "Là où le vendeur passe sa journée.", [
      ["tableau.html", "Tableau de bord", "La semaine en un coup d'œil"], ["commandes.html", "Commandes", "La liste, filtres et recherche"], ["commande.html", "Nouvelle commande", "Photos, suivi, lien"],
      ["commande.html#6A4D21", "Fiche d'une commande", "Une commande existante"], ["envois.html", "Suivi d'envois", "Tous les colis en cours"], ["analyses.html", "Analyses", "Vues et commandes"],
      ["marque.html", "Ma marque", "Logo, couleur, réseaux"], ["parametres.html", "Paramètres", "Compte, sécurité, abonnement"], ["passer-pro.html", "Plan Pro", "Ce que le plan Pro change"]]],
    ["link", "La page client", "Ce que reçoit le client, sans compte.", [
      ["client.html", "Page client", "Photos, suivi, aux couleurs du vendeur"], ["client-produit.html", "Page client, autre vendeur", "Une autre marque, un autre accent"], ["lien-invalide.html", "Lien introuvable", "Un lien qui ne mène à rien"]]],
    ["shield", "L'administration", "Réservée à l'équipe, chaque consultation est journalisée.", [
      ["admin.html", "Vue d'ensemble", "L'état de la plateforme"], ["admin-comptes.html", "Comptes", "Plans, suspensions"], ["admin-compte.html#c2", "Fiche d'un compte", "Suspendre, changer de plan"],
      ["admin-doublons.html", "Comptes en doublon", "Mêmes réseaux, comptes distincts"], ["admin-boutiques.html", "Boutiques", "Les marques des vendeurs"], ["admin-commandes.html", "Commandes", "Sans aucun contenu"],
      ["admin-statistiques.html", "Statistiques", "Que des nombres"], ["admin-journal.html", "Journal", "Qui a consulté quoi"], ["admin-surveillance.html", "Surveillance", "Limitation de débit, tâches"], ["admin-parametres.html", "Paramètres", "Plafonds et suivi"]]],
    ["circle-alert", "Les états", "Ce que le produit montre quand une page charge, échoue ou ne mène à rien.", [
      ["introuvable.html", "Page introuvable", "Une adresse qui ne mène à rien"], ["erreur.html", "Erreur du site", "Réessayer, avec la référence de l'incident"],
      ["erreur-espace.html", "Erreur de l'espace vendeur", "Vos données ne sont pas touchées"], ["commande-introuvable.html", "Commande introuvable", "Retour à la liste"],
      ["chargement.html", "Chargement d'une liste", "Le squelette de l'espace vendeur"], ["commande-chargement.html", "Chargement d'une commande", "Le squelette de la fiche"],
      ["erreur-client.html", "Erreur de la page client", "Le lien reste valable"], ["admin-erreur.html", "Erreur de l'administration", "La même carte, côté équipe"]]],
  ];
  const corps = `
  <section class="pub-tete conteneur">
    <p class="l4-etiquette"><span>${ic("panel-left")}</span>Plan de la maquette</p>
    <h1 class="pub-titre l4-titre"><span class="l4-ligne" style="--l:0">Toutes les pages</span></h1>
    <p class="pub-chapo" data-entree>${t(`Les ${GROUPES.reduce((n, g) => n + g[3].length, 0)} écrans de la maquette, rangés par surface. Certains ne s'atteignent qu'en situation réelle (un e-mail reçu, un rôle d'administrateur) : ils sont tous ici.`)}</p>
  </section>
  <div class="conteneur plan">
${GROUPES.map(([i, titreG, sous, liens]) => `    <section class="plan-groupe" aria-labelledby="g-${i}">
      <header><span class="plan-groupe__ic">${ic(i)}</span><div><h2 id="g-${i}">${t(titreG)}</h2><p>${t(sous)}</p></div><b>${liens.length}</b></header>
      <ul>
${liens.map(([h, l, d]) => `        <li><a href="${h}"><span><b>${t(l)}</b><small>${t(d)}</small></span>${ic("arrow-right")}</a></li>`).join("\n")}
      </ul>
    </section>`).join("\n")}
  </div>`;
  ecrire("plan.html", page({ cle: "plan", titrePage: "Toutes les pages · DropLink", description: "Le plan de la maquette DropLink : chaque écran, rangé par surface.", corps }));
}

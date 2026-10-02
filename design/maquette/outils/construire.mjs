// Construit dist/ : le site statique (une page par fichier de src/), puis une
// version autonome de chaque page (médias et polices inclus) pour l'Artifact.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import path from "node:path";
const ici = path.dirname(new URL(import.meta.url).pathname);
const racine = path.join(ici, "..");
const src = (f) => path.join(racine, "src", f);
// La feuille servie est l'assemblage de ses deux sources : base.css (landing, accès,
// pages publiques) puis app.css (espace vendeur, page client, administration).
writeFileSync(src("styles.css"), ["base.css", "app.css"].map((f) => readFileSync(src(path.join("css", f)), "utf8")).join(""));
const dist = path.join(racine, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, "autonome"), { recursive: true });

const icones = readFileSync(path.join(racine, "assets", "icones.svg"), "utf8");
const pageClient = readFileSync(src("page-client.html"), "utf8").trim();
const GOOGLE_SVG = `<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"/></svg>`;

const champEmail = (s = "") => `<div class="champ-acces" data-champ-email>
          <div class="champ-acces__ligne"><label for="email${s}">Adresse e-mail</label></div>
          <div class="champ-acces__boite"><input id="email${s}" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="vous@exemple.com" required aria-describedby="email${s}-erreur"></div>
          <p class="champ-acces__suggestion" hidden data-suggestion>Vouliez-vous dire <button type="button" data-suggestion-bouton></button> ?</p>
          <p class="champ-acces__erreur" id="email${s}-erreur" data-erreur></p>
        </div>`;
const bouton = (libelle, cours) => `<button class="bouton bouton--marque bouton--large bouton-envoi" type="submit" data-envoi><span class="bouton-envoi__libelle">${libelle}</span><span class="bouton-envoi__cours" aria-hidden="true"><svg class="ic tourne"><use href="#i-loader-circle"/></svg>${cours}</span></button>`;
const google = (pos) => {
  const b = `<a class="bouton bouton--second bouton--large bouton-google" href="https://droplink.fr/fr/connexion">${GOOGLE_SVG}Continuer avec Google</a>`;
  const sep = `<p class="separateur">ou</p>`;
  return pos === "avant" ? `${b}\n      ${sep}` : `${sep}\n      ${b}`;
};
const coque = readFileSync(src("coque.html"), "utf8").trim();
// Posé en tête des écrans de l'espace vendeur, avant tout rendu : la transition entre deux écrans
// démarre au premier rendu de la page d'arrivée, un script différé arriverait trop tard pour lui
// donner son sens (vers le bas ou vers le haut du menu).
// Et les écrans voisins se préparent pendant qu'on survole leur lien : au clic, la page est déjà
// prête, la transition part sans attendre le réseau ni l'analyse de la page.
const TETE_APP = `<script type="speculationrules">
{ "prerender": [{ "where": { "selector_matches": ".app__nav a, .bloc__lien, .alerte, .actions-rapides a, .a-venir a" }, "eagerness": "moderate" }] }
</script>
<script>
(() => {
  const r = document.documentElement;
  // arrivée par le menu : la transition EST l'entrée de l'écran, on n'en joue pas une seconde par-dessus
  try { if (sessionStorage.getItem("dl-sens")) r.dataset.arrivee = "1"; } catch { /* sans stockage, entrée normale */ }
  if (!("onpagereveal" in window)) { r.classList.add("sans-vt"); return; }
  addEventListener("pagereveal", (e) => {
    if (!e.viewTransition) return;
    // une page pré-rendue a lu le stockage AVANT le clic : on relit ici
    try { if (sessionStorage.getItem("dl-sens")) r.dataset.arrivee = "1"; } catch { /* sans stockage, entrée normale */ }
    let sens = null;
    try { sens = sessionStorage.getItem("dl-sens"); sessionStorage.removeItem("dl-sens"); } catch { /* sans stockage, sens par défaut */ }
    r.dataset.sens = sens || "bas";
    e.viewTransition.finished.finally(() => { delete r.dataset.sens; });
  });
})();
</script>`;
// Les entrées attendent que la page soit posée : structure lue, police chargée, une image
// de mise en page passée. Sinon leurs premières images tombent sur la mise en page
// complète et sur le remplacement de la police (jusqu'à 350 ms mesurés au CPU ×4), et
// l'entrée saute. Plafonné : au pire, elles partent à 900 ms comme avant.
const TETE_ATTENTE = `<script>
(() => {
  const r = document.documentElement; r.classList.add("attente");
  let fait = false;
  const partir = () => { if (fait) return; fait = true; requestAnimationFrame(() => requestAnimationFrame(() => r.classList.remove("attente"))); };
  const pose = () => requestAnimationFrame(() => (document.fonts ? document.fonts.ready : Promise.resolve()).then(partir, partir));
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", pose, { once: true }); else pose();
  setTimeout(partir, 900);
  // Une entrée finie, gardée sur sa dernière image (fill both), reste une animation active :
  // l'élément garde son calque, et tout ce qui le chevauche est promu avec lui (47 calques,
  // 24,6 Mpx sur la landing). On la retire en reposant la même dernière image.
  const UNIQUES = { monte: 1, "monte-scene": 1, bulle: 1, "l4-ligne": 0 };
  addEventListener("animationend", (e) => {
    const el = e.target;
    if (!(e.animationName in UNIQUES) || !el.style || el.getAnimations().some((a) => a.playState === "running")) return;
    el.style.animation = "none";
    if (UNIQUES[e.animationName]) el.style.opacity = "1";
  });
})();
</script>`;
const assembler = (f, avant = (s) => s) => avant(readFileSync(src(f), "utf8"))
  .replace('<link rel="stylesheet" href="styles.css">', () => `${TETE_ATTENTE}\n<link rel="stylesheet" href="styles.css">`)
  .replace('<link rel="stylesheet" href="styles.css">\n</head>\n<body class="page-app">', () => `<link rel="stylesheet" href="styles.css">\n${TETE_APP}\n</head>\n<body class="page-app">`)
  .replace(/<!--COQUE:(\w+)-->/, (_, ecran) => coque.replace(`data-nav="${ecran}"`, `data-nav="${ecran}" aria-current="page"`))
  .replace("<!--ICONES-->", () => icones)
  .replaceAll("<!--PAGE_CLIENT-->", () => pageClient)
  .replace(/<!--CHAMP_EMAIL(?::(\w+))?-->/g, (_, s) => champEmail(s ? `-${s}` : ""))
  .replace(/<!--BOUTON:([^:]+):([^>]+?)-->/g, (_, a, b) => bouton(a, b))
  .replace(/<!--GOOGLE:(\w+)-->/g, (_, p) => google(p));

// Les écrans du produit pas encore maquettés : une seule page modèle, leurs vrais titres (messages/fr.json).
const ECRANS = [];
// les pages publiques, générées depuis les sources du produit (outils/pages-publiques.mjs)
const ARTICLES = JSON.parse(readFileSync(path.join(racine, "outils", "articles.json"), "utf8"));
const PUBLIQUES = ["tarifs.html", "docs.html", "blog.html", ...ARTICLES.map((a) => `blog-${a}.html`), "conditions.html", "confidentialite.html", "signalement.html", "nouveau-mot-de-passe.html", "verification.html", "bienvenue.html", "notification.html", "lien-invalide.html", "passer-pro.html", "plan.html", "introuvable.html", "erreur.html", "erreur-client.html", "erreur-espace.html", "commande-introuvable.html", "chargement.html", "commande-chargement.html", "admin-erreur.html", "admin.html", "admin-comptes.html", "admin-compte.html", "admin-doublons.html", "admin-boutiques.html", "admin-commandes.html", "admin-statistiques.html", "admin-journal.html", "admin-surveillance.html", "admin-parametres.html"];
const PAGES = ["index.html", "connexion.html", "inscription.html", "tableau.html", "commandes.html", "envois.html", "analyses.html", "marque.html", "parametres.html", "commande.html", "client.html", "client-produit.html", "ancienne-landing.html", ...PUBLIQUES, ...ECRANS.map(([c]) => `${c}.html`)];
for (const p of PAGES) {
  const e = ECRANS.find(([c]) => `${c}.html` === p);
  const html = e
    ? assembler("ecran.html", (s) => s.replace(/{{cle}}|{{titre}}|{{sousTitre}}|{{icone}}/g, (m) => ({ "{{cle}}": e[0], "{{titre}}": e[1], "{{sousTitre}}": e[2], "{{icone}}": e[3] })[m]))
    : assembler(p);
  writeFileSync(path.join(dist, p), html);
}
for (const f of ["styles.css", "main.js", "acces.js", "film.js", "coque.js", "analytique.js", "tableau.js", "commandes.js", "envois.js", "analyses.js", "marque.js", "parametres.js", "commande.js", "public.js", "compte.js", "admin.js", "etats.js", "client.js", "l4.js", "v4.js"]) cpSync(src(f), path.join(dist, f));
cpSync(path.join(racine, "assets"), path.join(dist, "assets"), { recursive: true, filter: (s) => !s.includes("captures") });

// Versions autonomes : chaque asset devient une data: URI.
const types = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const enData = (rel) => `data:${types[path.extname(rel)]};base64,${readFileSync(path.join(racine, rel)).toString("base64")}`;
const css = readFileSync(src("styles.css"), "utf8").replace(/url\((assets\/[^)]+)\)/g, (_, r) => `url(${enData(r)})`);
let total = 0;
for (const p of PAGES) {
  const seul = readFileSync(path.join(dist, p), "utf8")
    .replace(/<link rel="preload"[^>]*>\n/, "")
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
    // chaque script est collé par une FONCTION : dans une chaîne de remplacement, « $$ » vaudrait « $ »
    .replace(/<script src="([\w-]+\.js)" defer><\/script>/g, (_, f) => `<script>\n${readFileSync(src(f), "utf8")}\n</script>`)
    .replace(/(src)="(assets\/[^"]+)"/g, (_, a, r) => `${a}="${enData(r)}"`);
  writeFileSync(path.join(dist, "autonome", p), seul);
  total += Buffer.byteLength(seul);
}
// La page d'accueil de l'Artifact : l'hôte fournit le squelette.
const accueil = readFileSync(path.join(dist, "autonome", "index.html"), "utf8")
  .replace(/<!doctype html>\n<html lang="fr">\n<head>\n/, "")
  .replace(/<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n/, "")
  .replace(/<title>[^<]*<\/title>/, "<title>Landing DropLink</title>")
  .replace("</head>\n<body>\n", "")
  .replace("</body>\n</html>\n", "");
writeFileSync(path.join(dist, "autonome", "landing-droplink.html"), accueil);
console.log("dist prêt,", PAGES.length, "pages,", (total / 1024 / 1024).toFixed(2), "Mo en autonome");

// DropLink · la coque de l'espace vendeur (maquette)
// Ce que le produit fait réellement dans sa barre du haut et sa barre latérale :
// une recherche qui mène aux Commandes (Ctrl/⌘ K lui donne le focus), une
// cloche à deux familles d'alertes sans état lu, un menu de compte. Rien d'autre.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- annonces de maquette ---------- */
  const toast = $("[data-toast]"); let minuterie = 0;
  const annoncer = (texte) => { toast.textContent = texte; toast.classList.add("est-visible"); clearTimeout(minuterie); minuterie = setTimeout(() => toast.classList.remove("est-visible"), 2600); };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-maquette]");
    if (!a) return;
    e.preventDefault();
    // une commande s'ouvre dans sa fiche, comme dans le produit
    const ref = /^Commande #(\w+)$/.exec(a.dataset.maquette)?.[1];
    if (ref) { aller(`commande.html#${ref}`); return; }
    annoncer(`Maquette : « ${a.dataset.maquette} » s’ouvrirait ici.`);
  });

  /* ---------- recherche globale ---------- */
  // Dans le produit, c'est un formulaire GET vers /commandes?q= : l'écran
  // Commandes s'enregistre ici pour filtrer sur place, les autres y renvoient.
  const champ = $("[data-recherche-champ]");
  // au téléphone le champ fait 180 px : le texte d'aide complet y était coupé en plein mot
  const etroit = matchMedia("(max-width: 640px)"), aideLongue = champ.placeholder;
  const poserAide = () => { champ.placeholder = etroit.matches ? "Rechercher…" : aideLongue; };
  etroit.addEventListener("change", poserAide); poserAide();


  let surPlace = null;
  $("[data-touche]").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); champ.focus(); champ.select(); } });
  $("[data-recherche]").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = champ.value.trim();
    if (surPlace) { surPlace(q); return; }
    try { sessionStorage.setItem("dl-recherche", q); } catch { /* sans stockage, la liste s'ouvre sans filtre */ }
    aller("commandes.html");
  });

  /* ---------- la cloche : deux familles d'alertes, pas d'état lu ---------- */
  const bouton = $("[data-alertes-bouton]"), panneau = $("[data-alertes-panneau]");
  const alertes = (ouvrir) => { panneau.hidden = !ouvrir; bouton.setAttribute("aria-expanded", String(ouvrir)); };
  bouton.addEventListener("click", (e) => { e.stopPropagation(); alertes(panneau.hidden); });
  document.addEventListener("click", (e) => { if (!panneau.hidden && !e.target.closest("[data-alertes]")) alertes(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !panneau.hidden) { alertes(false); bouton.focus(); } });

  /* ---------- menu du compte ---------- */
  const compte = $("[data-compte]");
  document.addEventListener("click", (e) => { if (compte.open && !e.target.closest("[data-compte]")) compte.open = false; });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && compte.open) { compte.open = false; compte.querySelector("summary").focus(); } });

  /* ---------- tiroir de navigation (écrans étroits) ---------- */
  const barre = $("[data-barre]"), menu = $("[data-menu-app]");
  const tiroir = (ouvrir) => { barre.classList.toggle("est-ouverte", ouvrir); menu.setAttribute("aria-expanded", String(ouvrir)); menu.querySelector("use").setAttribute("href", ouvrir ? "#i-x" : "#i-menu"); };
  menu.addEventListener("click", () => tiroir(!barre.classList.contains("est-ouverte")));
  document.addEventListener("click", (e) => { if (barre.classList.contains("est-ouverte") && !e.target.closest("[data-barre], [data-menu-app]")) tiroir(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && barre.classList.contains("est-ouverte")) { tiroir(false); menu.focus(); } });

  /* ---------- passer d'un écran à l'autre, sans recharger ----------
     Comme les outils qu'on garde ouverts toute la journée : au clic, seul le
     contenu est remplacé. Le menu, la barre du haut, les polices et les styles
     restent en place, donc rien à retélécharger ni à réanalyser, et l'écran
     suivant est déjà chargé si on a survolé son lien. La transition est une
     animation sur les vrais éléments : la pastille de l'onglet glisse, le
     contenu sort et le suivant entre dans le sens du menu. */
  const ORDRE = ["tableau", "commandes", "commande", "envois", "analyses", "marque", "parametres", "passer-pro"];
  // l'éditeur d'une commande vit sous « Commandes » dans le menu
  const NAV = { commande: "commandes", "passer-pro": "parametres" };
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleDe = (url) => (new URL(url, location.href).pathname.match(/([\w-]+)\.html$/) ?? [])[1];
  const pages = new Map();
  const charger = (url) => {
    const cle = new URL(url, location.href).pathname;
    if (!pages.has(cle)) pages.set(cle, fetch(cle).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); }).then((t) => new DOMParser().parseFromString(t, "text/html")).catch((e) => { pages.delete(cle); throw e; }));
    return pages.get(cle);
  };
  let ecranCourant = new AbortController();
  let enCours = 0;
  const aller = async (url, { pousser = true } = {}) => {
    const de = ORDRE.indexOf(cleDe(location.href)), vers = ORDRE.indexOf(cleDe(url));
    const jeton = ++enCours;
    let doc;
    try { doc = await charger(url); } catch { location.href = url; return; } // hors ligne ou page absente : navigation classique
    if (jeton !== enCours) return; // un clic plus récent a gagné
    const principal = doc.querySelector("main#contenu");
    const scripts = [...doc.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")).filter((s) => s !== "coque.js");
    if (!principal) { location.href = url; return; }
    const remplacer = async () => {
      ecranCourant.abort(); ecranCourant = new AbortController(); surPlace = null;
      if (pousser) history.pushState({ dl: true }, "", url);
      document.title = doc.title;
      const nouveau = document.importNode(principal, true); nouveau.setAttribute("tabindex", "-1");
      if (!reduit) nouveau.style.opacity = "0"; // inséré invisible : sa mise en page se fait pendant que rien ne bouge
      document.querySelector("main#contenu").replaceWith(nouveau);
      document.querySelectorAll("body > [data-page]").forEach((e) => e.remove());
      doc.querySelectorAll("body > [data-page]").forEach((e) => toast.before(document.importNode(e, true)));
      document.querySelectorAll(".app__nav a[data-nav]").forEach((a) => { if (a.dataset.nav === (NAV[ORDRE[vers]] ?? ORDRE[vers])) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      scrollTo(0, 0);
      // un nouvel élément <script> s'exécute à chaque insertion ; les fichiers viennent du cache, dans l'ordre de la page
      for (const src of scripts) {
        await new Promise((ok) => { const s = document.createElement("script"); s.src = src; s.dataset.page = ""; s.onload = s.onerror = ok; document.body.append(s); });
      }
      return nouveau;
    };
    // Animé à la main plutôt qu'en View Transition : celle-ci photographie tout
    // l'écran avant d'animer (1 440 × 2 000 px sur Commandes), et cette photo
    // coûtait une image figée de 100 à 150 ms. Ici on anime les vrais éléments,
    // en opacité et en translation seulement (composités, sans recalcul).
    const sens = vers < de ? -1 : 1;
    racine.dataset.arrivee = "1"; // la transition est l'entrée : pas de seconde animation par-dessus
    const pastille = document.querySelector('.app__nav [aria-current="page"] .app__nav-pastille');
    const avant = pastille?.getBoundingClientRect();
    if (!reduit) {
      const ancien = document.querySelector("main#contenu");
      await ancien.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${-6 * sens}px)` }], { duration: 110, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).finished;
    }
    const nouveau = await remplacer();
    // La première image d'un écran neuf porte toute sa mise en page et ses scripts
    // (jusqu'à 200 ms mesurées au CPU ×4). Si l'entrée démarrait dessus, elle sauterait
    // ses premières images : on laisse passer cette image-là, écran encore invisible.
    if (!reduit) await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const apres = document.querySelector('.app__nav [aria-current="page"] .app__nav-pastille');
    if (!reduit) {
      nouveau.animate([{ opacity: 0, transform: `translateY(${10 * sens}px)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.23,1,.32,1)" });
      nouveau.style.opacity = "";
      if (avant && apres) {
        const b = apres.getBoundingClientRect();
        apres.animate([{ transform: `translateY(${avant.top - b.top}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.23,1,.32,1)" });
      }
    } else nouveau.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "ease-out" });
    delete racine.dataset.arrivee;
    document.querySelector("main#contenu").focus?.({ preventScroll: true });
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target) return;
    const cle = cleDe(a.href);
    if (!ORDRE.includes(cle)) return;
    e.preventDefault();
    const ouvert = barre.classList.contains("est-ouverte");
    if (cle === cleDe(location.href) && !a.hash) { tiroir(false); return; } // déjà sur cet écran
    if (cle === cleDe(location.href) && a.hash) { tiroir(false); location.hash = a.hash; return; }
    if (ouvert) tiroir(false);
    aller(a.href);
  });
  addEventListener("popstate", () => { if (ORDRE.includes(cleDe(location.href))) aller(location.href, { pousser: false }); });
  history.replaceState({ dl: true }, "");
  // l'écran suivant se charge pendant qu'on survole son lien
  const precharger = (e) => { const a = e.target.closest?.("a[href]"); if (a && ORDRE.includes(cleDe(a.href)) && cleDe(a.href) !== cleDe(location.href)) charger(a.href).catch(() => {}); };
  document.addEventListener("pointerover", precharger, { passive: true });
  document.addEventListener("focusin", precharger);
  document.addEventListener("touchstart", precharger, { passive: true });
  document.querySelector("main#contenu")?.setAttribute("tabindex", "-1");

  window.DropLink = {
    annoncer,
    champRecherche: champ,
    rechercherSurPlace: (f) => { surPlace = f; },
    fermerAlertes: () => alertes(false),
    // chaque écran demande son signal : il est coupé quand on le quitte
    ecran: () => ecranCourant.signal,
    aller: (url) => aller(url),
  };
})();

// DropLink · pages publiques (tarifs, docs, blog, légal, signalement)
// La même grammaire que la landing, sans ses démonstrations : thème, en-tête,
// menu, entrées, et ce que chaque page porte en propre (sommaire qui suit la
// lecture, progression d'un article, signalement préparé). Sous
// prefers-reduced-motion, tout est posé dans son état final.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  $$("[data-entree]").forEach((el, i) => el.style.setProperty("--i", i));
  requestAnimationFrame(() => racine.classList.add("pret"));

  /* ---------- thème ---------- */
  const boutonsTheme = $$("[data-theme-choix]");
  const lire = () => { try { return localStorage.getItem("dl-theme"); } catch { return null; } };
  const appliquer = (t) => {
    if (t) racine.setAttribute("data-theme", t);
    const effectif = racine.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    boutonsTheme.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoix === effectif)));
  };
  appliquer(lire());
  boutonsTheme.forEach((b) => b.addEventListener("click", () => {
    try { localStorage.setItem("dl-theme", b.dataset.themeChoix); } catch { /* sans stockage, le choix vaut pour la visite */ }
    appliquer(b.dataset.themeChoix);
  }));

  /* ---------- en-tête et menu ---------- */
  const entete = $("[data-entete]"), sentinelle = $("[data-sentinelle]");
  if (sentinelle) new IntersectionObserver(([e]) => entete.classList.toggle("est-defile", !e.isIntersecting)).observe(sentinelle);
  const menuBouton = $("[data-menu-bouton]"), menu = $("[data-menu]");
  const basculer = (ouvrir) => {
    menu.hidden = !ouvrir;
    menuBouton.setAttribute("aria-expanded", String(ouvrir));
    menuBouton.setAttribute("aria-label", ouvrir ? "Fermer le menu" : "Ouvrir le menu");
    menuBouton.querySelector("use").setAttribute("href", ouvrir ? "#i-x" : "#i-menu");
  };
  menuBouton?.addEventListener("click", () => basculer(menu.hidden));
  $$("a", menu ?? document.createElement("div")).forEach((a) => a.addEventListener("click", () => basculer(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menu && !menu.hidden) { basculer(false); menuBouton.focus(); } });

  /* ---------- cartes : une entrée, une fois, quand on les regarde ---------- */
  $$("[data-anime]").forEach((el) => {
    if (reduit) { el.classList.add("est-vu"); return; }
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { o.disconnect(); el.classList.add("est-vu"); } }, { threshold: .2 });
    o.observe(el);
  });
  // la bordure lumineuse suit le pointeur, comme sur la landing
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", (e) => {
      const c = e.target.closest?.(".v4-carte");
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", `${e.clientX - r.left}px`);
      c.style.setProperty("--my", `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- tableau comparatif : les croix se posent sur le filet d'en-tête ---------- */
  $$(".tp").forEach((tp) => {
    const tete = tp.querySelector("thead");
    const poser = () => tp.style.setProperty("--tp-croix", `${tete.offsetHeight - 5}px`);
    new ResizeObserver(poser).observe(tete); poser();
  });

  /* ---------- sommaire : il suit la lecture ---------- */
  const sommaire = $("[data-sommaire]");
  if (sommaire) {
    const nav = $("[data-sommaire-nav]", sommaire), courant = $("[data-sommaire-courant]", sommaire);
    const liens = $$("a[data-ancre]", nav);
    const sections = liens.map((a) => document.getElementById(a.dataset.ancre)).filter(Boolean);
    // au téléphone, le sommaire est replié : on l'ouvre pour choisir, il se referme au choix
    const etroit = matchMedia("(max-width: 980px)");
    const poser = () => { sommaire.open = !etroit.matches; };
    etroit.addEventListener("change", poser); poser();
    liens.forEach((a) => a.addEventListener("click", () => { if (etroit.matches) sommaire.open = false; }));
    let actif = null;
    const marquer = (id) => {
      if (id === actif) return; actif = id;
      liens.forEach((a) => a.toggleAttribute("data-actif", a.dataset.ancre === id));
      const a = liens.find((x) => x.dataset.ancre === id);
      if (a && courant) courant.textContent = a.textContent;
    };
    // la section active est la dernière dont le titre a passé le tiers haut de l'écran
    const suivre = () => {
      const ligne = innerHeight * .3;
      let id = sections[0]?.id;
      for (const s of sections) if (s.getBoundingClientRect().top <= ligne) id = s.id;
      marquer(id);
    };
    addEventListener("scroll", suivre, { passive: true });
    suivre();
  }

  /* ---------- article : la progression de lecture ---------- */
  const progres = $("[data-progres]");
  if (progres) {
    const art = $(".art-corps");
    const maj = () => {
      const r = art.getBoundingClientRect();
      const k = Math.min(1, Math.max(0, (innerHeight * .4 - r.top) / r.height));
      progres.style.transform = `scaleX(${k.toFixed(4)})`;
    };
    addEventListener("scroll", maj, { passive: true }); maj();
  }

  /* ---------- signalement : le message est préparé, jamais envoyé à votre place ---------- */
  const form = $("[data-signalement]");
  if (form) {
    const champ = (k) => $(`[data-sig="${k}"]`, form);
    const erreur = (el, msg) => {
      const zone = el.closest(".sig-champ").querySelector("[data-erreur]");
      if (zone) zone.textContent = msg;
      el.setAttribute("aria-invalid", msg ? "true" : "false");
      el.closest(".sig-champ").classList.toggle("est-invalide", !!msg);
    };
    const valide = {
      lien: (v) => /^https?:\/\/\S+\.\S+/.test(v) ? "" : "Collez l’adresse complète de la page, commençant par https://.",
      description: (v) => v.trim().length >= 10 ? "" : "Précisez ce qui pose problème.",
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Cette adresse ne semble pas valide.",
    };
    Object.keys(valide).forEach((k) => champ(k).addEventListener("input", () => { if (champ(k).getAttribute("aria-invalid") === "true") erreur(champ(k), valide[k](champ(k).value)); }));
    const pret = $("[data-pret]", form);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fautes = Object.keys(valide).map((k) => { const m = valide[k](champ(k).value); erreur(champ(k), m); return m ? champ(k) : null; }).filter(Boolean);
      if (fautes.length) { fautes[0].focus(); return; }
      const categorie = champ("categorie").value;
      const objet = `Signaler un contenu : ${categorie}`;
      const corps = [`Adresse de la page concernée : ${champ("lien").value.trim()}`, `Nature du signalement : ${categorie}`, `Votre adresse email : ${champ("email").value.trim()}`, "", "Description :", champ("description").value.trim()].join("\n");
      $("[data-pret-objet]", form).textContent = objet;
      $("[data-pret-corps]", form).textContent = corps;
      $("[data-ouvrir-messagerie]", form).href = `mailto:abus@droplink.fr?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
      pret.hidden = false;
      if (!reduit) pret.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.23,1,.32,1)" });
      pret.scrollIntoView({ block: "nearest", behavior: reduit ? "auto" : "smooth" });
    });
    $("[data-copier-message]", form).addEventListener("click", async (e) => {
      const b = e.currentTarget, texteCopie = `À : abus@droplink.fr\nObjet : ${$("[data-pret-objet]", form).textContent}\n\n${$("[data-pret-corps]", form).textContent}`;
      try { await navigator.clipboard.writeText(texteCopie); b.lastChild.textContent = "Message copié"; }
      catch { const r = document.createRange(); r.selectNodeContents($("[data-pret-corps]", form)); getSelection().removeAllRanges(); getSelection().addRange(r); b.lastChild.textContent = "Sélectionné, copiez-le"; }
      setTimeout(() => { b.lastChild.textContent = "Copier le message"; }, 2200);
    });
  }
})();

// DropLink · couche « v4 » des écrans vendeur et des pages d'accès.
// La grammaire de la landing, dosée pour un outil qu'on ouvre toute la
// journée : la matière (grain, filets, bordure qui suit le pointeur) est
// toujours là ; le mouvement (titre révélé, compteurs à rouleaux) ne se joue
// qu'au premier chargement réel, jamais en passant d'un écran à l'autre.
// Sous prefers-reduced-motion, rien ne bouge.
(() => {
  const racine = document.documentElement;
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- une seule fois par chargement de page ---------- */
  if (!window.__v4) {
    window.__v4 = true;
    // le premier écran a droit à son entrée ; ceux qu'on ouvre ensuite par le menu, non
    if (!reduit && !racine.dataset.arrivee) {
      racine.classList.add("v4-entree");
      setTimeout(() => racine.classList.remove("v4-entree"), 1600);
    }
    const grain = document.createElement("div");
    grain.className = "l4-grain"; grain.setAttribute("aria-hidden", "true");
    document.body.prepend(grain);
    // la bordure lumineuse suit le pointeur, sur toutes les cartes, par délégation
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      document.addEventListener("pointermove", (e) => {
        const c = e.target.closest?.(".v4-carte");
        if (!c) return;
        const r = c.getBoundingClientRect();
        c.style.setProperty("--mx", `${e.clientX - r.left}px`);
        c.style.setProperty("--my", `${e.clientY - r.top}px`);
      }, { passive: true });
    }
  }

  /* ---------- à chaque écran ---------- */
  // les cartes qui reçoivent la bordure lumineuse
  document.querySelectorAll(".bloc, .compteurs, .bloc-r, .cv-carte, .formulaire-carte, .acces__corps .formulaire").forEach((c) => c.classList.add("v4-carte"));

  /* ---------- rangées d'onglets qui défilent : un fondu dit qu'il en reste ---------- */
  document.querySelectorAll(".vues-liste:not([data-bords])").forEach((l) => {
    l.dataset.bords = "1";
    const bords = () => {
      const reste = l.scrollWidth - l.clientWidth;
      l.classList.toggle("a-suite", reste > 2 && l.scrollLeft < reste - 2);
      l.classList.toggle("a-avant", reste > 2 && l.scrollLeft > 2);
    };
    l.addEventListener("scroll", bords, { passive: true });
    new ResizeObserver(bords).observe(l); bords();
  });
  // les compteurs en rouleaux, au premier chargement seulement
  if (!racine.classList.contains("v4-entree")) return;
  const rouler = (el) => {
    const textes = [];
    const marcher = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 3) textes.push(c); else if (c.nodeType === 1 && !c.classList.contains("l4-rouleau")) marcher(c); });
    marcher(el);
    let rang = 0;
    textes.forEach((t) => {
      if (!/\d/.test(t.textContent)) return;
      const frag = document.createDocumentFragment();
      for (const ch of t.textContent) {
        if (!/\d/.test(ch)) { frag.append(ch); continue; }
        const r = document.createElement("span");
        r.className = "l4-rouleau"; r.setAttribute("aria-hidden", "true");
        r.innerHTML = `<span style="--d:${rang++ * 70}ms">${"0123456789".split("").map((d) => `<span>${d}</span>`).join("")}</span>`;
        r.dataset.chiffre = ch;
        frag.append(r);
      }
      t.replaceWith(frag);
    });
    if (!rang) return;
    el.setAttribute("aria-label", el.dataset.v4Texte);
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll(".l4-rouleau").forEach((r) => { r.firstElementChild.style.transform = `translateY(${-Number(r.dataset.chiffre)}em)`; })));
  };
  document.querySelectorAll(".compteur-app__valeur, [data-colis-total], .l4-compteur, .reponses__taux b").forEach((el) => {
    if (!el.textContent.trim()) return;
    el.dataset.v4Texte = el.textContent.trim();
    rouler(el);
  });
})();

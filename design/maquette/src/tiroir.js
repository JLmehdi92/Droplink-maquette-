// DropLink · le menu des écrans étroits (espace vendeur et administration).
// Un tiroir qui glisse depuis la gauche, un voile qui l'accompagne, l'icône
// ☰ qui devient ✕, et le geste du pouce : on le repousse vers la gauche pour
// le fermer, il suit le doigt et se décide au lâcher (distance OU vitesse).
// Ouvrir et fermer ne durent pas pareil : on attend l'ouverture, on ne veut
// jamais attendre la fermeture.
// Sous prefers-reduced-motion : un fondu court, aucun déplacement.
(() => {
  const barre = document.querySelector("[data-barre]");
  const bouton = document.querySelector("[data-menu-app]");
  if (!barre || !bouton) return;
  const racine = document.documentElement;
  const feuille = document.querySelector(".app__feuille");
  const etroit = matchMedia("(max-width: 1020px)");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)");

  const voile = document.createElement("div");
  voile.className = "tiroir-voile";
  voile.setAttribute("aria-hidden", "true");
  document.body.append(voile);

  // chaque lien connaît son rang : l'entrée en cascade se règle en CSS
  barre.querySelectorAll(".app__nav a").forEach((a, i) => a.style.setProperty("--rang", String(i)));

  const fermerDedans = barre.querySelector("[data-tiroir-fermer]");
  const estOuvert = () => barre.classList.contains("est-ouverte");

  const poser = (ouvrir, { rendreFocus = false } = {}) => {
    if (ouvrir === estOuvert()) return;
    barre.classList.toggle("est-ouverte", ouvrir);
    voile.classList.toggle("est-visible", ouvrir);
    racine.classList.toggle("tiroir-ouvert", ouvrir);
    bouton.setAttribute("aria-expanded", String(ouvrir));
    bouton.setAttribute("aria-label", ouvrir ? "Fermer le menu" : "Ouvrir le menu");
    // le reste de l'écran ne se tabule pas tant que le tiroir le recouvre
    if (feuille) feuille.inert = ouvrir;
    if (ouvrir) {
      const cible = barre.querySelector('.app__nav [aria-current="page"]') ?? barre.querySelector(".app__nav a");
      cible?.focus({ preventScroll: true });
    } else if (rendreFocus) bouton.focus({ preventScroll: true });
  };

  bouton.addEventListener("click", () => poser(!estOuvert()));
  fermerDedans?.addEventListener("click", () => poser(false, { rendreFocus: true }));
  voile.addEventListener("click", () => poser(false, { rendreFocus: true }));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && estOuvert()) poser(false, { rendreFocus: true }); });
  // passé au-dessus de 1020 px, la barre redevient la colonne fixe : plus de tiroir
  etroit.addEventListener("change", (e) => { if (!e.matches) poser(false); });

  /* ---------- le geste : repousser le tiroir vers la gauche ---------- */
  let depart = null;
  barre.addEventListener("pointerdown", (e) => {
    if (!estOuvert() || e.pointerType === "mouse" || reduit.matches) return;
    depart = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, axe: null, id: e.pointerId };
  });
  barre.addEventListener("pointermove", (e) => {
    if (!depart || e.pointerId !== depart.id) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (!depart.axe) {
      if (Math.hypot(dx, dy) < 8) return;
      // un geste vertical fait défiler le menu, on le laisse au navigateur
      depart.axe = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (depart.axe === "y") { depart = null; return; }
      barre.setPointerCapture(e.pointerId);
      barre.classList.add("est-tire");
      voile.classList.add("est-tire");
    }
    // vers la droite, une résistance : le tiroir est déjà tout ouvert
    depart.dx = dx < 0 ? dx : dx / 6;
    const part = Math.min(1, Math.max(0, -depart.dx / barre.offsetWidth));
    barre.style.transform = `translateX(${depart.dx}px)`;
    voile.style.opacity = String(1 - part);
  });
  const lacher = (e) => {
    if (!depart || e.pointerId !== depart.id) return;
    const { dx, t, axe } = depart;
    depart = null;
    if (axe !== "x") return;
    const vitesse = dx / Math.max(1, performance.now() - t); // px/ms, négatif vers la gauche
    barre.classList.remove("est-tire");
    voile.classList.remove("est-tire");
    barre.style.transform = "";
    voile.style.opacity = "";
    if (dx < -barre.offsetWidth * 0.32 || vitesse < -0.45) poser(false);
  };
  barre.addEventListener("pointerup", lacher);
  barre.addEventListener("pointercancel", lacher);

  window.DropLinkTiroir = {
    ouvrir: () => poser(true),
    fermer: () => poser(false),
    estOuvert,
  };
})();

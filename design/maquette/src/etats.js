// DropLink · écrans d'état (erreur, introuvable, chargement)
// Dans le produit, « Réessayer » relance le rendu de l'écran. Ici, il montre ce
// geste : le bouton passe en cours, puis l'écran qui avait échoué s'affiche.
(() => {
  const racine = document.documentElement;
  racine.classList.add("js");
  try { const t = localStorage.getItem("dl-theme"); if (t) racine.setAttribute("data-theme", t); } catch { /* sans stockage, le thème du système */ }
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-reessayer]").forEach((b) => b.addEventListener("click", () => {
    if (b.getAttribute("aria-busy") === "true") return;
    b.setAttribute("aria-busy", "true");
    setTimeout(() => { location.href = b.dataset.reessayer; }, reduit ? 0 : 650);
  }));
})();

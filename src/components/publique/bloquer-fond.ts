/**
 * LE FOND DE LA PAGE CLIENT NE DÉFILE PAS sous une feuille ou un visionneur (`cl-bloque`,
 * `client.css`).
 *
 * LA LARGEUR DE LA BARRE EST COMPENSÉE, MESURÉE au moment du blocage : une barre classique
 * qui disparaît décalait la page d'une quinzaine de pixels. Une gouttière réservée en CSS
 * (`scrollbar-gutter`) faisait l'inverse là où aucune barre n'était affichée — 7 px de
 * décalage relevés le 02/10/2026. Sans barre (téléphone, barres superposées), l'écart est 0.
 */
export function bloquerFond(): void {
  const racine = document.documentElement;
  const barre = Math.max(0, window.innerWidth - racine.clientWidth);
  racine.style.setProperty("--cl-barre", `${barre}px`);
  racine.classList.add("cl-bloque");
}

export function libererFond(): void {
  const racine = document.documentElement;
  racine.classList.remove("cl-bloque");
  racine.style.removeProperty("--cl-barre");
}

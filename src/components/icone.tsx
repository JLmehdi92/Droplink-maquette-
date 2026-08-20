import { TRACES, type NomIcone } from "@/lib/design/traces-icones";

/**
 * Icône Material Symbols, rendue en SVG plutôt que par une police.
 *
 * Les maquettes emploient `<span class="material-symbols-outlined">nom</span>`,
 * qui exige une police de 312,7 Ko chargée depuis un CDN. Ce composant produit
 * le MÊME dessin — les tracés sont ceux de la police, figés dans le dépôt — sans
 * police ni requête tierce.
 *
 * `aria-hidden` par défaut, et c'est le cas normal : une icône accompagne
 * presque toujours un texte qui dit déjà ce qu'elle illustre. La doubler pour un
 * lecteur d'écran ferait entendre deux fois la même chose. Quand l'icône est
 * SEULE — un bouton qui ne porte qu'un symbole — l'appelant passe un `titre`,
 * et le composant devient alors une image nommée.
 */
export function Icone({
  nom,
  className = "",
  titre,
}: {
  readonly nom: NomIcone;
  readonly className?: string;
  readonly titre?: string;
}) {
  const trace = TRACES[nom];
  if (trace === undefined) {
    // Un nom inconnu ne doit pas faire tomber la page : l'absence d'une icône
    // n'empêche jamais de lire un écran. En développement, l'avertissement
    // désigne le nom fautif — un carré vide, lui, n'apprendrait rien.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[icone] tracé introuvable pour « ${nom} »`);
    }
    return null;
  }

  return (
    <svg
      // Le repère de vue de Material Symbols place l'origine en bas à gauche.
      viewBox="0 -960 960 960"
      // `1em` : l'icône suit la taille du texte qui l'entoure, exactement comme
      // le faisait la police qu'elle remplace.
      width="1em"
      height="1em"
      fill="currentColor"
      className={className}
      role={titre === undefined ? "presentation" : "img"}
      aria-hidden={titre === undefined ? true : undefined}
      aria-label={titre}
    >
      {titre !== undefined ? <title>{titre}</title> : null}
      <path d={trace} />
    </svg>
  );
}

import { Search } from "lucide-react";

/**
 * LE CHAMP DE RECHERCHE DES ÉCRANS D'ADMINISTRATION.
 *
 * UN FORMULAIRE `GET`, SANS JAVASCRIPT. La recherche vit dans l'URL : elle se
 * partage, se recharge, et revient telle quelle avec le bouton retour. Une
 * recherche tenue dans un état client aurait obligé à réécrire la pagination
 * par curseur, qui est déjà dans l'URL.
 *
 * DEUX HABILLAGES, PARCE QU'IL CHANGE DE FOND. Au bureau il est posé sur la
 * zone claire, à droite du titre ; au téléphone il est DANS la bande sombre,
 * sous le titre, et prend donc un contour et un fond translucides — un champ
 * blanc y ferait un bloc lumineux au milieu du noir.
 *
 * LE BOUTON D'ENVOI EST INVISIBLE MAIS FOCUSABLE. Les planches n'en dessinent
 * aucun : un champ seul se valide à Entrée, ce que fait déjà tout formulaire à
 * une entrée. Mais « se valide à Entrée » n'est pas une affordance pour qui
 * navigue au clavier ou au lecteur d'écran, d'où un bouton qui réapparaît dès
 * qu'il reçoit le focus.
 */
export function RechercheAdmin({
  action,
  valeur,
  etiquette,
  exemple,
  chercher,
}: {
  readonly action: string;
  readonly valeur: string;
  readonly etiquette: string;
  readonly exemple: string;
  readonly chercher: string;
}) {
  return (
    <form method="get" action={action} className="relative">
      <label htmlFor="q" className="sr-only">
        {etiquette}
      </label>

      <Search
        aria-hidden="true"
        size={16}
        strokeWidth={1.9}
        className="pointer-events-none absolute top-[14px] left-[13px] text-ds-texte-tenu md:top-[13px]"
      />

      <input
        id="q"
        name="q"
        type="search"
        defaultValue={valeur}
        placeholder={exemple}
        /* LA MÊME PEAU AUX DEUX LARGEURS DEPUIS QUE LE CHROME EST CLAIR. Elle en
           avait deux : blanc translucide sur la bande sombre du téléphone,
           surface de carte au bureau. La bande n'est plus sombre, et deux
           peaux pour un seul champ sont deux valeurs à garder justes. */
        className="h-11 w-full rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte pr-[14px] pl-[38px] text-[15px] text-ds-texte-fort transition-shadow outline-none placeholder:text-ds-texte-tenu focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)] md:w-80 md:text-[14px]"
      />

      <button
        type="submit"
        className="sr-only focus:not-sr-only focus:absolute focus:top-full focus:right-0 focus:z-10 focus:mt-1 focus:flex focus:min-h-11 focus:items-center focus:rounded-ds-control focus:border focus:border-ds-filet-appuye focus:bg-ds-surface-carte focus:px-4 focus:py-2 focus:focus:focus:text-ds-texte-fort"
      >
        {chercher}
      </button>
    </form>
  );
}

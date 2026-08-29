import { Icone } from "@/components/icone";

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

      <Icone
        nom="search"
        className="pointer-events-none absolute top-[14px] left-[13px] text-[16px] text-white/45 md:top-[13px] md:text-gris-inactif"
      />

      <input
        id="q"
        name="q"
        type="search"
        defaultValue={valeur}
        placeholder={exemple}
        className="h-11 w-full rounded-[12px] border border-white/[0.16] bg-white/[0.08] pr-[14px] pl-[38px] font-body-md text-[15px] text-white placeholder:text-white/45 md:h-[42px] md:w-[320px] md:rounded-[11px] md:border-filet-controle md:bg-surface-container-lowest md:text-[14px] md:text-on-surface md:placeholder:text-gris-inactif"
      />

      <button
        type="submit"
        className="sr-only focus:not-sr-only focus:absolute focus:top-full focus:right-0 focus:z-10 focus:mt-1 focus:rounded-[11px] focus:border focus:border-filet-controle focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:font-label-md focus:text-label-md focus:text-on-surface"
      >
        {chercher}
      </button>
    </form>
  );
}

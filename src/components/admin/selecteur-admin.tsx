import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * UNE LISTE DÉROULANTE D'ADMINISTRATION — `AdminSelect` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : boîte de 42 de haut, remplissage 0/14,
 * largeur minimale 180 (168 par défaut), rayon `sm`, filet, ombre `xs` ; libellé
 * 13,5/500 en encre, chevron de 16 en estompé, écart 10.
 *
 * ⚠️ UN `<details>`, PAS UN `<select>`, ET PAS UN COMPOSANT CLIENT. Le kit change
 * de valeur par un `onChange` de React ; ici le choix est un PARAMÈTRE D'URL,
 * donc des liens. Deux conséquences, et les deux sont des gains : la vue se
 * partage et se recharge telle quelle, et les écrans les plus lourds du produit
 * n'embarquent pas un îlot client pour trois valeurs.
 *
 * ⚠️ ET LE MENU EST REPLIÉ PAR DÉFAUT, exactement comme la liste d'un `<select>` :
 * un contrôle qui affiche en permanence tous ses états n'est plus un contrôle,
 * c'est une barre d'onglets.
 *
 * ⚠️ CE QUI EST REPLIÉ RESTE DANS LE DOCUMENT, ET LA SONDE LE VOIT. Un premier
 * commentaire prétendait ici que le menu fermé ne rendait qu'un libellé ; la
 * mesure dit l'inverse — les options d'un `<details>` fermé sont relevées comme
 * celles d'un `<option>`. L'œil ne les voit pas, la comparaison si, et leurs
 * libellés sont donc déclarés là où ils diffèrent de ceux du kit.
 */
export function SelecteurAdmin({
  etiquette,
  courant,
  options,
  largeurMin = 180,
}: {
  /** Nommé pour les lecteurs d'écran : le libellé visible ne dit que la valeur. */
  readonly etiquette: string;
  readonly courant: string;
  readonly options: readonly { readonly valeur: string; readonly libelle: string; readonly href: string }[];
  readonly largeurMin?: number;
}) {
  const choisi = options.find((o) => o.valeur === courant) ?? options[0];

  return (
    <details className="relative shrink-0">
      <summary
        aria-label={etiquette}
        className="flex h-[42px] cursor-pointer list-none items-center justify-between gap-2.5 rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-3.5 text-[13.5px] leading-[normal] font-medium text-ds-texte-fort shadow-ds-xs"
        style={{ minWidth: largeurMin }}
      >
        {choisi?.libelle ?? etiquette}
        <ChevronDown size={16} className="text-ds-texte-tenu" aria-hidden="true" />
      </summary>
      <ul
        className="absolute right-0 z-10 mt-1.5 overflow-hidden rounded-ds-sm border border-ds-filet bg-ds-surface-carte py-1 shadow-ds-md"
        style={{ minWidth: largeurMin }}
      >
        {options.map((o) => (
          <li key={o.valeur}>
            <Link
              href={o.href}
              className={
                "flex min-h-11 items-center px-3.5 text-[13.5px] leading-[normal] whitespace-nowrap hover:bg-ds-surface-creux " +
                (o.valeur === courant ? "font-bold text-ds-accent" : "font-medium text-ds-texte-fort")
              }
              aria-current={o.valeur === courant ? "true" : undefined}
            >
              {o.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

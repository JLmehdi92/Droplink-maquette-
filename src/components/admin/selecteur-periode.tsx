import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * LE SÉLECTEUR DE PÉRIODE DE LA COURBE — `AdminSelect` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : boîte de 42 de haut, remplissage 0/14,
 * largeur minimale 180, rayon `sm`, filet, ombre `xs` ; libellé 13,5/500 en
 * encre, chevron de 16 en estompé, écart 10.
 *
 * ⚠️ UN `<details>`, PAS UN `<select>`, ET PAS UN COMPOSANT CLIENT. Le kit change
 * de période par un `onChange` de React ; ici la période est un PARAMÈTRE
 * D'URL, donc trois liens. Deux conséquences, et les deux sont des gains : la
 * vue se partage et se recharge telle quelle, et l'écran le plus lourd du
 * produit n'embarque pas un îlot de plus pour trois valeurs.
 *
 * ⚠️ ET LE MENU EST REPLIÉ PAR DÉFAUT, exactement comme la liste d'un `<select>`.
 * Déplié, il rendrait trois libellés là où la référence n'en montre qu'un — et
 * ce n'est pas qu'une affaire de mesure : un contrôle qui affiche en permanence
 * ses trois états n'est plus un contrôle, c'est une barre d'onglets.
 */

/** Les trois fenêtres du kit. Fermées : une valeur hors liste n'existe pas. */
export const PERIODES = [7, 30, 90] as const;
export type Periode = (typeof PERIODES)[number];

/** 30 jours, comme le kit à l'ouverture. */
export const PERIODE_PAR_DEFAUT: Periode = 30;

export function lirePeriode(brut: string | undefined): Periode {
  const n = Number(brut);
  return (PERIODES as readonly number[]).includes(n) ? (n as Periode) : PERIODE_PAR_DEFAUT;
}

export async function SelecteurPeriode({
  langue,
  periode,
}: {
  readonly langue: string;
  readonly periode: Periode;
}) {
  const t = await getTranslations("admin.panneau");

  return (
    <details className="relative shrink-0">
      <summary className="flex h-[42px] min-w-[180px] cursor-pointer list-none items-center justify-between gap-2.5 rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-3.5 text-[13.5px] leading-[normal] font-medium text-ds-texte-fort shadow-ds-xs">
        {t("periode", { jours: periode })}
        <ChevronDown size={16} className="text-ds-texte-tenu" aria-hidden="true" />
      </summary>
      <ul className="absolute right-0 z-10 mt-1.5 min-w-[180px] overflow-hidden rounded-ds-sm border border-ds-filet bg-ds-surface-carte py-1 shadow-ds-md">
        {PERIODES.map((valeur) => (
          <li key={valeur}>
            <Link
              href={`/${langue}/admin?jours=${valeur}`}
              className={
                "flex min-h-11 items-center px-3.5 text-[13.5px] leading-[normal] hover:bg-ds-surface-creux " +
                (valeur === periode ? "font-bold text-ds-accent" : "font-medium text-ds-texte-fort")
              }
              aria-current={valeur === periode ? "true" : undefined}
            >
              {t("periode", { jours: valeur })}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

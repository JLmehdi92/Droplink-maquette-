import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Settings } from "lucide-react";

/**
 * « PARAMÈTRES » DANS LES MENUS DE COMPTE, et en rond dans l'en-tête du tableau
 * de bord au téléphone.
 *
 * AU TÉLÉPHONE, LA BARRE D'ONGLETS N'A PLUS DE PLACE : six onglets ne tiennent
 * pas dans 390 px. Le menu de compte ne s'y rend pas non plus. Ce lien rond est
 * donc le chemin du téléphone vers ses paramètres — un geste rare, à deux
 * touchers depuis n'importe quel écran.
 *
 * Il reprend les classes du bouton de déconnexion qu'il côtoie : deux entrées
 * de menu dessinées différemment se liraient comme deux sortes de choses.
 */
const CLASSES = {
  menu: "flex min-h-11 w-full items-center justify-start gap-2.5 rounded-ds-sm px-3 text-[13px] font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-teinte",
  rond: "flex h-11 w-11 items-center justify-center rounded-ds-pill border border-ds-filet bg-ds-surface-carte text-ds-texte-corps transition-colors hover:bg-ds-surface-teinte md:hidden",
} as const;

export async function LienParametres({
  langue,
  variante,
}: {
  readonly langue: string;
  readonly variante: keyof typeof CLASSES;
}) {
  const t = await getTranslations("navigation");
  const libelle = t("parametres");

  return (
    <Link
      href={`/${langue}/parametres`}
      className={CLASSES[variante]}
      {...(variante === "rond" ? { "aria-label": libelle } : {})}
    >
      <Settings aria-hidden="true" size={17} strokeWidth={1.9} />
      {variante === "menu" ? <span>{libelle}</span> : null}
    </Link>
  );
}

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
  menu: "compte__lien",
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
    >
      <Settings aria-hidden="true" size={17} strokeWidth={1.9} />
      <span>{libelle}</span>
    </Link>
  );
}

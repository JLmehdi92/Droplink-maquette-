import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { exigerAdmin } from "@/lib/audit/garde";
import { estLangueSupportee } from "@/i18n/config";

/**
 * ENVELOPPE DE L'ADMINISTRATION.
 *
 * SEGMENT RÉEL `/[locale]/admin/*`, hors du groupe `(app)`. Le groupe n'aurait
 * rien changé à l'URL — donc le filtre du middleware aurait fonctionné — mais
 * ces écrans auraient hérité du layout vendeur : sa navigation, sa redirection
 * vers l'onboarding, ses hypothèses. Un administrateur n'est pas un vendeur en
 * train de regarder ses commandes.
 *
 * CE LAYOUT N'EST PAS LA PROTECTION, il en est une couche. Un layout s'exécute
 * avant les pages qu'il contient, mais une Server Action appelée depuis l'une
 * d'elles NE PASSE PAS par lui : les Server Actions sont des points d'entrée à
 * part entière, atteignables par une requête forgée. Chaque page et chaque
 * action porte donc sa propre garde, et celle-ci est redondante par conception —
 * la défense en profondeur consiste précisément à ne jamais dépendre d'une seule
 * couche.
 *
 * AUCUN LIEN VERS L'ESPACE VENDEUR ni l'inverse : les deux surfaces se
 * ressemblent assez pour qu'on s'y trompe, et une action d'administration lancée
 * en croyant être chez soi serait tracée au nom de son auteur sans qu'il l'ait
 * voulu.
 */
export default async function LayoutAdmin({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  await exigerAdmin();

  const t = await getTranslations("admin");

  return (
    <div className="min-h-dvh bg-surface">
      {/* LA BANDE EST VISUELLEMENT DISTINCTE de l'espace vendeur. Ce n'est pas
          décoratif : les deux surfaces montrent des tableaux qui se ressemblent,
          et savoir en permanence lequel on regarde évite d'agir sur les données
          de quelqu'un d'autre en croyant toucher les siennes. */}
      <nav
        aria-label={t("navigation")}
        className="border-b border-outline-variant bg-inverse-surface"
      >
        <ul className="mx-auto flex w-full max-w-container-max flex-wrap items-center gap-2 px-margin-mobile md:px-margin-desktop">
          <li className="py-3 pr-4 font-label-md text-label-md text-inverse-on-surface">
            {t("bandeau")}
          </li>
          {[
            { href: `/${langue}/admin`, libelle: t("panneau.titre") },
            { href: `/${langue}/admin/comptes`, libelle: t("comptes.titre") },
            { href: `/${langue}/admin/boutiques`, libelle: t("boutiques.titre") },
            { href: `/${langue}/admin/journal`, libelle: t("journal.titre") },
            { href: `/${langue}/admin/surveillance`, libelle: t("surveillance.titre") },
            { href: `/${langue}/admin/parametres`, libelle: t("parametres.titre") },
          ].map((entree) => (
            <li key={entree.href}>
              <Link
                href={entree.href}
                className="flex min-h-[44px] items-center px-3 font-label-md text-label-md text-inverse-on-surface underline-offset-4 hover:underline"
              >
                {entree.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}

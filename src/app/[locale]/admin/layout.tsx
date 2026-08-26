import Link from "next/link";
import { Icone } from "@/components/icone";
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

  const entrees = [
    { href: `/${langue}/admin`, libelle: t("panneau.titre"), icone: "monitoring" as const },
    { href: `/${langue}/admin/comptes`, libelle: t("comptes.titre"), icone: "person" as const },
    { href: `/${langue}/admin/boutiques`, libelle: t("boutiques.titre"), icone: "storefront" as const },
    { href: `/${langue}/admin/journal`, libelle: t("journal.titre"), icone: "gavel" as const },
    {
      href: `/${langue}/admin/surveillance`,
      libelle: t("surveillance.titre"),
      icone: "schedule" as const,
    },
    {
      href: `/${langue}/admin/parametres`,
      libelle: t("parametres.titre"),
      icone: "settings" as const,
    },
  ];

  /*
   * LA COQUILLE DE L'ADMINISTRATION — chrome SOMBRE, et ce n'est pas décoratif.
   *
   * Les deux surfaces montrent des tableaux qui se ressemblent, et savoir en
   * permanence lequel on regarde évite d'agir sur les données de quelqu'un
   * d'autre en croyant toucher les siennes. La colonne noire est ce qui rend la
   * confusion impossible à un coup d'œil.
   *
   * L'ENCART « TOUT EST TRACÉ » EST UN RAPPEL PERMANENT, pas une décoration :
   * chaque consultation de données d'un vendeur écrit une ligne au journal, y
   * compris les LECTURES. Celui qui regarde doit le savoir avant de regarder,
   * pas le découvrir dans le journal.
   *
   * AU TÉLÉPHONE, la colonne devient une bande horizontale défilante. Elle n'y
   * est pas confortable, et c'est assumé : on ne suspend pas un compte dans le
   * métro — la confirmation exige de recopier une adresse, collage bloqué.
   */
  return (
    <div className="min-h-dvh bg-surface md:bg-canvas md:p-5">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col bg-surface md:min-h-[calc(100dvh-40px)] md:flex-row md:overflow-hidden md:rounded-xl">
        <div className="bg-admin px-4 py-4 md:w-[236px] md:shrink-0 md:py-[22px]">
          <div className="mb-4 px-2 md:mb-[26px]">
            <span className="font-headline-md text-[17px] font-extrabold tracking-[-0.02em] text-white">
              DropLink
            </span>
            <span className="mt-0.5 block font-label-sm text-[11px] font-bold tracking-[0.1em] text-tertiary-fixed-dim">
              {t("bandeau")}
            </span>
          </div>

          <nav aria-label={t("navigation")}>
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-[3px] md:overflow-visible">
              {entrees.map((entree) => (
                <li key={entree.href}>
                  <Link
                    href={entree.href}
                    className="flex h-11 items-center gap-[11px] rounded-[11px] px-[13px] font-label-md text-[14px] font-semibold whitespace-nowrap text-white/60 transition-colors hover:bg-white/10 hover:text-white md:h-[42px]"
                  >
                    <Icone nom={entree.icone} className="text-[18px]" />
                    {entree.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden md:block">
            <div className="mt-6 rounded-md bg-[rgba(242,118,94,0.14)] p-3.5">
              <p className="font-label-md text-[12px] font-bold text-tertiary-fixed-dim">
                {t("traceTitre")}
              </p>
              <p className="mt-1 font-body-sm text-[11px] leading-[17px] text-white/50">
                {t("traceTexte")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

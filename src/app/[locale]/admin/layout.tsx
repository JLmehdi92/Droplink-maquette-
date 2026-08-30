import { getTranslations, setRequestLocale } from "next-intl/server";
import { exigerAdmin } from "@/lib/audit/garde";
import { estLangueSupportee } from "@/i18n/config";
import { TraductionsClient } from "@/components/traductions-client";
import { NavigationAdmin, type EntreeAdmin } from "@/components/admin/navigation-admin";

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

  const admin = await exigerAdmin();

  const t = await getTranslations("admin");

  const entrees: readonly EntreeAdmin[] = [
    {
      href: `/${langue}/admin`,
      libelle: t("panneau.titre"),
      court: t("onglets.panneau"),
      icone: "dashboard",
    },
    {
      href: `/${langue}/admin/comptes`,
      libelle: t("comptes.titre"),
      court: t("onglets.comptes"),
      icone: "person",
    },
    {
      href: `/${langue}/admin/boutiques`,
      libelle: t("boutiques.titre"),
      court: t("onglets.boutiques"),
      icone: "storefront",
    },
    {
      href: `/${langue}/admin/journal`,
      libelle: t("journal.titre"),
      court: t("onglets.journal"),
      icone: "bookmark",
    },
    {
      href: `/${langue}/admin/surveillance`,
      libelle: t("surveillance.titre"),
      court: t("onglets.surveillance"),
      icone: "monitoring",
    },
    {
      href: `/${langue}/admin/parametres`,
      libelle: t("parametres.titre"),
      court: t("onglets.parametres"),
      icone: "settings",
    },
  ];

  /*
   * LA COQUILLE DE L'ADMINISTRATION — chrome SOMBRE, et ce n'est pas décoratif.
   *
   * Les deux surfaces montrent des tableaux qui se ressemblent, et savoir en
   * permanence lequel on regarde évite d'agir sur les données de quelqu'un
   * d'autre en croyant toucher les siennes. Le noir est ce qui rend la confusion
   * impossible à un coup d'œil.
   *
   * L'ENCART « TOUT EST TRACÉ » EST UN RAPPEL PERMANENT, pas une décoration :
   * chaque consultation de données d'un vendeur écrit une ligne au journal, y
   * compris les LECTURES. Celui qui regarde doit le savoir avant de regarder,
   * pas le découvrir dans le journal.
   *
   * AU TÉLÉPHONE, LA COLONNE DEVIENT DEUX BLOCS : la marque en haut, la
   * navigation en barre d'onglets tout en bas. C'est le dessin des trois
   * planches mobiles, et il vaut mieux que la bande défilante d'avant — une
   * navigation qu'il faut faire défiler cache la moitié de ses entrées, donc la
   * moitié de la surface.
   *
   * ⚠️ SIX ONGLETS LÀ OÙ LES PLANCHES EN DESSINENT QUATRE. Elles omettent
   * Boutiques et Paramètres ; les porter telles quelles rendrait ces deux écrans
   * INATTEIGNABLES sous 768 px, puisque rien d'autre n'y mène. Un écran
   * inaccessible n'est pas un écart de dessin, c'est une fonction perdue.
   */
  return (
    <div className="min-h-dvh bg-surface md:bg-canvas md:p-5">
      {/* PREMIER ÉLÉMENT FOCUSABLE DE LA PAGE. Au bureau, la colonne pose six
          liens avant le contenu ; les traverser à chaque écran au clavier est
          le genre de coût qu'on ne mesure jamais parce qu'on ne le paie pas
          soi-même. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:font-label-md focus:text-label-md focus:text-on-surface focus:shadow-md"
      >
        {t("allerAuContenu")}
      </a>
      <div className="mx-auto flex w-full min-h-dvh flex-col bg-surface md:min-h-[calc(100dvh-40px)] md:w-full md:max-w-[1400px] md:flex-row md:overflow-hidden md:rounded-page">
        {/* --- LA MARQUE : bande supérieure au téléphone, colonne au bureau --- */}
        <div className="flex flex-col bg-admin px-4 pt-4 md:w-[236px] md:shrink-0 md:py-[22px]">
          <div className="mb-4 flex items-center justify-between md:mb-[26px] md:block md:px-2">
            <div>
              <span className="block font-headline-md text-[16px] leading-[21px] font-extrabold tracking-[-0.02em] text-white md:text-[17px] md:leading-[22px]">
                DropLink
              </span>
              <span className="mt-0.5 block font-headline-md text-[10px] leading-[13px] font-bold tracking-[0.1em] text-corail md:mt-[3px] md:text-[11px] md:leading-[13px]">
                {t("bandeau")}
              </span>
            </div>
            {/* ⚠️ UN ROND VIDE, ET C'EST CE QUE LES PLANCHES DESSINENT — les
                sept, bandeau du téléphone comme colonne du bureau. Il portait
                l'initiale de l'administrateur connecté, au motif que savoir qui
                l'on est vaut mieux qu'un rond ; sauf que l'adresse complète est
                déjà écrite juste à côté, dans le même bloc. L'initiale ne
                répétait qu'une seule lettre de ce qui est déjà lisible.

                `AdminCompteDetailMobile` fait exception dans le canevas : son
                bandeau y porte un avatar de 34 px, fond rgba(255,255,255,.1),
                avec initiale. C'est une variante d'écran que cette coque
                partagée ne peut pas exprimer — écart connu et nommé, plutôt que
                silencieux. */}
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-full bg-white/[0.14] md:hidden"
            />
          </div>

          <NavigationAdmin entrees={entrees} etiquette={t("navigation")} variante="colonne" />

          {/* L'espace pousse le rappel et l'identité en bas de colonne, comme la
              planche : ce sont les deux choses qu'on relit, pas celles qu'on
              parcourt. */}
          <div className="hidden md:block md:flex-grow" />

          <div className="hidden md:block">
            <div className="rounded-[13px] bg-[rgba(242,118,94,0.14)] p-[13px]">
              <p className="font-headline-md text-[12px] leading-[15px] font-bold text-corail">
                {t("traceTitre")}
              </p>
              <p className="mt-1 font-headline-md text-[11px] leading-[17px] font-normal text-white/50">
                {t("traceTexte")}
              </p>
            </div>

            <div className="mt-3.5 flex items-center gap-2.5 p-2">
              <span
                aria-hidden="true"
                className="h-8 w-8 shrink-0 rounded-full bg-white/[0.14]"
              />
              <div className="min-w-0">
                {/* L'ADRESSE, PAS UN PRÉNOM. Le compte est identifié par son
                    email dans le journal ; afficher autre chose ici obligerait à
                    faire la correspondance de tête au moment de relire une
                    trace. */}
                <p className="truncate font-headline-md text-[13px] leading-4 font-semibold text-white">
                  {admin.email}
                </p>
                <p className="font-headline-md text-[11px] leading-[13px] font-normal text-white/[0.44]">
                  {t("roleAdministrateur")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- LE CONTENU, et la barre d'onglets sous lui au téléphone --- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TraductionsClient espaces={["erreurs"]}>{children}</TraductionsClient>

          {/* L'espace n'existe qu'au téléphone : il colle la barre d'onglets au
              bas de l'écran quand la page est courte, sans la rendre fixe — une
              barre fixe masquerait la dernière ligne de tous les tableaux. */}
          <div className="flex-grow md:hidden" />
          <NavigationAdmin entrees={entrees} etiquette={t("navigation")} variante="onglets" />
        </div>
      </div>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { exigerAdmin } from "@/lib/audit/garde";
import { estLangueSupportee } from "@/i18n/config";
import { NavigationAdmin, type EntreeAdmin } from "@/components/admin/navigation-admin";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";

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
 *
 * ⚠️ ET CE SEGMENT N'A PAS DE `loading.tsx` — NE PAS EN REMETTRE UN. Il en a eu
 * un, et il FUYAIT. Next sérialise le repli Suspense d'un segment pendant qu'il
 * résout ce layout : un vendeur ordinaire, connecté, recevait un 404 dont le
 * corps portait le squelette de cette surface. La règle « 404, jamais 403 »
 * existe pour ne pas révéler que l'administration existe ; un squelette la
 * révèle tout aussi bien qu'un 403, et sans un mot de texte — c'est pourquoi le
 * contrôle qui cherchait le TITRE dans le corps du refus restait vert.
 *
 * La seule présence d'un squelette suffit à distinguer cette adresse d'une
 * adresse inventée : renommer ses classes n'y changerait rien. `pnpm fumee`
 * échoue si la marque de la surface reparaît dans un corps de refus, avec son
 * contre-test qui exige de la trouver quand la surface est SERVIE.
 *
 * ⚠️ CETTE MARQUE EST `data-surface="administration"` DEPUIS LE 12/09/2026, ET
 * ELLE ÉTAIT `bg-admin`. La migration du chrome sombre vers le design system a
 * effacé cette classe de tout le dépôt — et avec elle la sentinelle, en
 * silence : le contrôle serait resté vert à vide si son contre-test ne l'avait
 * pas attrapé. *Une sentinelle qui est aussi une valeur d'apparence disparaît
 * le jour où l'apparence change.* Celle-ci n'a pas d'autre emploi que d'être
 * trouvée, donc rien ne peut la faire disparaître par effet de bord.
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
      icone: "panneau",
    },
    {
      href: `/${langue}/admin/commandes`,
      libelle: t("commandes.titre"),
      court: t("onglets.commandes"),
      icone: "commandes",
    },
    {
      href: `/${langue}/admin/comptes`,
      libelle: t("comptes.titre"),
      court: t("onglets.comptes"),
      icone: "comptes",
    },
    {
      href: `/${langue}/admin/boutiques`,
      libelle: t("boutiques.titre"),
      court: t("onglets.boutiques"),
      icone: "boutiques",
    },
    {
      href: `/${langue}/admin/journal`,
      libelle: t("journal.titre"),
      court: t("onglets.journal"),
      icone: "journal",
    },
    {
      href: `/${langue}/admin/surveillance`,
      libelle: t("surveillance.titre"),
      court: t("onglets.surveillance"),
      icone: "veille",
    },
    {
      href: `/${langue}/admin/parametres`,
      libelle: t("parametres.titre"),
      court: t("onglets.parametres"),
      icone: "reglages",
    },
  ];

  /*
   * LA COQUILLE DE L'ADMINISTRATION — chrome CLAIR DEPUIS LE 12/09/2026.
   *
   * ⚠️ CE BLOC DISAIT « chrome SOMBRE, et ce n'est pas décoratif », et
   * argumentait que le noir rendait impossible de confondre l'administration
   * avec l'espace vendeur. L'argument était bon ; le noir vient de l'ANCIEN
   * canevas, et `CLAUDE.md` le déclare mort — « Chrome admin : sombre `#111117`
   * → clair, comme le reste ». C'était le DERNIER aplat sombre du produit.
   *
   * CE QUI REND LA CONFUSION IMPOSSIBLE DANS LE NOUVEAU DESSIN, et le kit le
   * mesure : la colonne porte un eyebrow « ADMINISTRATION » en 11,5/700 à
   * l'interlettrage de 0,12em au-dessus de ses entrées, et l'entrée courante y
   * est peinte du DÉGRADÉ DE MARQUE là où l'espace vendeur emploie un aplat
   * teinté. Ce ne sont pas les mêmes objets, et ils ne se ressemblent pas.
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
    <div data-surface="administration" className="min-h-dvh bg-ds-surface-page">
      {/* PREMIER ÉLÉMENT FOCUSABLE DE LA PAGE. Au bureau, la colonne pose six
          liens avant le contenu ; les traverser à chaque écran au clavier est
          le genre de coût qu'on ne mesure jamais parce qu'on ne le paie pas
          soi-même. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-ds-sm focus:bg-ds-surface-carte focus:px-4 focus:py-2 focus:text-[14px] focus:font-semibold focus:text-ds-texte-fort focus:shadow-ds-md"
      >
        {t("allerAuContenu")}
      </a>

      <div className="flex min-h-dvh w-full flex-col md:flex-row">
        {/* --- LA COLONNE : bande supérieure au téléphone, colonne au bureau ---

            VALEURS MESURÉES SUR LE KIT SERVI À 1690 px : 240 de large, fond de
            carte, `padding 24px 16px 18px`, filet à droite. */}
        <div className="flex flex-col border-b border-ds-filet bg-ds-surface-carte px-4 pt-4 md:w-60 md:shrink-0 md:border-r md:border-b-0 md:px-4 md:pt-6 md:pb-[18px]">
          <div className="mb-4 flex items-center justify-between md:mb-5 md:block md:px-1.5">
            <div>
              <span className="block text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-ds-texte-titre">
                DropLink
              </span>
              {/* ⚠️ 11,5 px ET NON 10. Le kit écrit cet eyebrow à 11 ; le
                  plancher de la règle 5 est 11,5 au téléphone, et cette bande y
                  est rendue. L'interlettrage de 0,12em est celui du design
                  system pour les eyebrows. */}
              <span className="mt-1 block text-[11.5px] leading-[15px] font-bold tracking-[0.12em] text-ds-texte-tenu uppercase">
                {t("bandeau")}
              </span>
            </div>

            {/* AU TÉLÉPHONE, LA DÉCONNEXION EST ICI : la colonne est devenue une
                bande supérieure, et son bloc d'identité — qui porte le bouton au
                bureau — n'y est pas rendu. */}
            <div className="flex items-center gap-2 md:hidden">
              <BoutonDeconnexion langue={langue} variante="sombre-mobile" />
            </div>
          </div>

          <NavigationAdmin entrees={entrees} etiquette={t("navigation")} variante="colonne" />

          {/* L'espace pousse le rappel et l'identité en bas de colonne, comme le
              kit : ce sont les deux choses qu'on relit, pas celles qu'on
              parcourt. */}
          <div className="hidden md:block md:flex-grow" />

          <div className="hidden md:block">
            {/*
              L'ENCART « TOUT EST TRACÉ » EST UN RAPPEL PERMANENT, pas une
              décoration : chaque consultation de données d'un vendeur écrit une
              ligne au journal, y compris les LECTURES. Celui qui regarde doit le
              savoir AVANT de regarder, pas le découvrir dans le journal.

              ⚠️ LE KIT MET ICI UNE CARTE DÉCORATIVE — « DropLink Admin / Tout
              sous contrôle » avec une illustration. On garde SA GÉOMÉTRIE (207
              de large, rayon 20, teinte lavande — le kit y pose un dégradé de
              `#F1F0FE` à `#FAF6FE`, deux valeurs que l oeil ne separe pas sur
              136 px de haut, et l aplat du jeton les vaut —, titre
              15/800, texte 12,5/400) et NOTRE CONTENU : à cet endroit précis, la
              seule phrase qui mérite d'être relue est celle qui dit que tout est
              tracé.
            */}
            <div className="rounded-ds-card-lg bg-ds-surface-teinte p-4">
              <p className="text-[15px] leading-5 font-extrabold text-ds-texte-titre">
                {t("traceTitre")}
              </p>
              <p className="mt-1 text-[12.5px] leading-[17px] text-ds-texte-corps">
                {t("traceTexte")}
              </p>
            </div>

            {/*
              LA DÉCONNEXION COMPTE PLUS ICI QU'AILLEURS. C'est la seule surface
              où l'on lit les données de quelqu'un d'autre, et chaque lecture est
              tracée AU NOM de qui est connecté. Une session d'administration
              laissée ouverte fait donc signer à quelqu'un des consultations
              qu'il n'a pas faites — et le journal est append-only.
            */}
            <div className="mt-3.5 flex items-center gap-2.5 pt-3.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-pill bg-ds-accent text-[13px] font-bold text-ds-texte-sur-marque"
              >
                {(admin.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-grow">
                {/* L'ADRESSE, PAS UN PRÉNOM. Le compte est identifié par son
                    email dans le journal ; afficher autre chose ici obligerait à
                    faire la correspondance de tête au moment de relire une
                    trace. */}
                <p className="truncate text-[13.5px] leading-[18px] font-bold text-ds-texte-fort">
                  {admin.email}
                </p>
                <p className="text-[12px] leading-4 text-ds-texte-sourdine">
                  {t("roleAdministrateur")}
                </p>
              </div>
              <BoutonDeconnexion langue={langue} variante="sombre" />
            </div>
          </div>
        </div>

        {/* --- LE CONTENU, et la barre d'onglets sous lui au téléphone --- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {children}

          {/* L'espace n'existe qu'au téléphone : il colle la barre d'onglets au
              bas de l'écran quand la page est courte. */}
          <div className="flex-grow md:hidden" />
          <NavigationAdmin entrees={entrees} etiquette={t("navigation")} variante="onglets" />
        </div>
      </div>
    </div>
  );
}

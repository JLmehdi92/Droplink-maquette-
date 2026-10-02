import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronsUpDown, Search, Shield, ShieldCheck } from "lucide-react";
import { exigerAdmin } from "@/lib/audit/garde";
import { estLangueSupportee } from "@/i18n/config";
import { NavigationVendeur, type EntreeNavigation } from "@/components/app/navigation-vendeur";
import { BoutonTiroir, CoqueTiroir } from "@/components/app/coque-tiroir";
import { DetailsFermable } from "@/components/app/details-fermable";
import { CoucheV4, ScriptEntreeV4 } from "@/components/app/couche-v4";
import { InfoBulles } from "@/components/admin/info-bulles";
import { LogoDropLink } from "@/components/logo-droplink";
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
  const tn = await getTranslations("navigation");

  const entrees: readonly EntreeNavigation[] = [
    { href: `/${langue}/admin`, libelle: t("panneau.titre"), icone: "tableau", exacte: true },
    { href: `/${langue}/admin/commandes`, libelle: t("commandes.titre"), icone: "adm-commandes" },
    { href: `/${langue}/admin/comptes`, libelle: t("comptes.titre"), icone: "adm-comptes" },
    { href: `/${langue}/admin/boutiques`, libelle: t("boutiques.titre"), icone: "adm-boutiques" },
    { href: `/${langue}/admin/statistiques`, libelle: t("statistiques.titre"), icone: "analyses" },
    { href: `/${langue}/admin/journal`, libelle: t("journal.titre"), icone: "adm-journal" },
    { href: `/${langue}/admin/surveillance`, libelle: t("surveillance.titre"), icone: "adm-surveillance" },
    { href: `/${langue}/admin/parametres`, libelle: t("parametres.titre"), icone: "parametres" },
  ];

  /*
   * LA COQUILLE DE L'ADMINISTRATION — refonte du 02/10/2026 (maquette,
   * `outils/admin.mjs`) : la même colonne que l'espace vendeur, qui devient le
   * même tiroir sous 1 020 px, avec ses huit entrées.
   *
   * ⚠️ LA BARRE D'ONGLETS DU BAS EST PARTIE. Elle avait remplacé une bande
   * défilante qui cachait la moitié des entrées ; le tiroir les montre toutes
   * l'une sous l'autre, ce qui levait l'objection. C'est le dessin de la
   * maquette, et celui de l'espace vendeur depuis l'étape 1.
   *
   * CE QUI LA DISTINGUE DE L'ESPACE VENDEUR, puisqu'elles partagent la colonne :
   * la pastille « Admin » au logo, le bandeau « ADMINISTRATION » de la barre
   * haute, et l'encart « Tout est tracé » — un rappel permanent, pas une
   * décoration : chaque consultation de données d'un vendeur écrit une ligne au
   * journal, LECTURES comprises. Celui qui regarde doit le savoir avant.
   *
   * ⚠️ DEUX ÉLÉMENTS DE LA MAQUETTE NE SONT PAS PORTÉS : le lien « Espace
   * vendeur » de son menu de compte (voir plus haut, aucun lien entre les deux
   * surfaces) et son thème sombre (décision du § 5 de la refonte).
   *
   * LA RECHERCHE DE LA BARRE HAUTE n'ouvre aucun point d'entrée nouveau : c'est
   * un formulaire GET natif vers la liste des comptes, dont la recherche était
   * déjà auditée (critères écrits au journal à chaque consultation).
   */
  return (
    <div data-surface="administration" className="page-app v4 page-admin">
      <ScriptEntreeV4 />
      <CoucheV4 />
      <a href="#contenu" className="evitement">
        {t("allerAuContenu")}
      </a>
      <CoqueTiroir
        libelles={{ ouvrir: tn("ouvrirMenu"), fermer: tn("fermerMenu") }}
        barre={
          <>
            <Link href={`/${langue}/admin`} prefetch={false} className="logo app__logo" aria-label={t("accueil")}>
              <LogoDropLink hauteur={24} />
              <span className="adm-pastille">{t("pastille")}</span>
            </Link>

            <NavigationVendeur
              entrees={entrees}
              etiquette={t("navigation")}
              idPastille="pastille-navigation-admin"
              prefetch={false}
            />

            <div className="adm-trace">
              <ShieldCheck aria-hidden="true" className="ic" />
              <p>
                <b>{t("traceTitre")}</b>
                <span>{t("traceTexte")}</span>
              </p>
            </div>

            {/*
              LA DÉCONNEXION COMPTE PLUS ICI QU'AILLEURS : chaque lecture est
              tracée AU NOM de qui est connecté, et le journal est append-only.
              L'ADRESSE, PAS UN PRÉNOM : le journal identifie le compte par elle.
            */}
            <DetailsFermable className="compte">
              <summary>
                <span className="compte__avatar adm-avatar" aria-hidden="true">
                  <Shield className="ic" />
                </span>
                <span className="compte__qui">
                  <b>{t("roleAdministrateur")}</b>
                  <small>{admin.email}</small>
                </span>
                <ChevronsUpDown aria-hidden="true" className="ic" />
              </summary>
              <div className="compte__menu">
                <BoutonDeconnexion langue={langue} variante="menu" />
              </div>
            </DetailsFermable>
          </>
        }
      >
        <header className="app__haut adm-haut">
          <BoutonTiroir />
          <form className="recherche" role="search" action={`/${langue}/admin/comptes`} method="get">
            <Search aria-hidden="true" className="ic" />
            <input
              type="search"
              name="q"
              placeholder={t("comptes.recherchePlaceholder")}
              aria-label={t("comptes.recherche")}
              autoComplete="off"
              spellCheck={false}
            />
          </form>
          <p className="adm-bandeau">
            <ShieldCheck aria-hidden="true" className="ic" />
            <span>{t("bandeau")}</span>
          </p>
        </header>
        {children}
      </CoqueTiroir>
      <InfoBulles />
    </div>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogoDropLink } from "@/components/logo-droplink";
import { SelecteurLangue } from "@/components/landing/selecteur-langue";
import { signalementDisponible } from "@/lib/contact";

/**
 * LE PIED DES PAGES PUBLIQUES (maquette, `index.html` : `.pied`).
 *
 * Ce que le PRODUIT y ajoute à la maquette, et qui reste :
 * - les mentions légales (obligation LCEN) et un contact ;
 * - le blog en français seulement : `/en/blog` et `/zh-CN/blog` rendent 404,
 *   exprès ;
 * - « Signaler un contenu » seulement si la page de signalement existe ;
 * - le sélecteur de langue, là où la maquette met son choix de thème (le
 *   produit n'a pas de thème sombre).
 * Partent, comme dans la maquette : le formulaire « Restez informé » (il n'était
 * relié à aucune liste) et les icônes de réseaux (décoratives).
 */
export async function PiedPublic({ locale }: { readonly locale: string }) {
  const t = await getTranslations("accueil");
  const signalable = signalementDisponible();
  return (
    <footer className="pied">
      <div className="conteneur pied__grille">
        <div>
          <Link className="logo min-h-11" href={`/${locale}`} aria-label={t("accueil")}>
            <LogoDropLink />
          </Link>
          <p className="pied__devise">{t("pied.devise")}</p>
        </div>
        <nav aria-label={t("pied.produit")}>
          <h3>{t("pied.produit")}</h3>
          <Link className="min-h-11" href={`/${locale}#studio`}>{t("nav.comment")}</Link>
          <Link className="min-h-11" href={`/${locale}/tarifs`}>{t("nav.tarifs")}</Link>
          <Link className="min-h-11" href={`/${locale}/docs`}>{t("pied.documentation")}</Link>
          {locale === "fr" ? <Link className="min-h-11" href="/fr/blog">{t("pied.blog")}</Link> : null}
        </nav>
        <nav aria-label={t("pied.legal")}>
          <h3>{t("pied.legal")}</h3>
          <Link className="min-h-11" href={`/${locale}/conditions`}>{t("pied.conditions")}</Link>
          <Link className="min-h-11" href={`/${locale}/confidentialite`}>{t("pied.confidentialite")}</Link>
          <Link className="min-h-11" href={`/${locale}/mentions-legales`}>{t("pied.mentions")}</Link>
          <Link className="min-h-11" href={`/${locale}/docs#support`}>{t("pied.contact")}</Link>
          {signalable ? <Link className="min-h-11" href={`/${locale}/signalement`}>{t("pied.signalement")}</Link> : null}
        </nav>
      </div>
      <div className="conteneur pied__bas">
        <p>{t("pied.droits", { annee: new Date().getFullYear() })}</p>
        <SelecteurLangue locale={locale} versLeHaut />
      </div>
    </footer>
  );
}

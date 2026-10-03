import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PageLegale } from "@/components/page-legale";
import { routing } from "@/i18n/routing";
import { GrapheJsonLd } from "@/components/seo/graphe-json-ld";
import { donneesPage } from "@/lib/seo/donnees-structurees";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  return {
    title: t("conditionsMetaTitre"),
    description: t("conditionsMetaDescription"),
    alternates: alternatesDe(langue, "/conditions"),
    openGraph: openGraphDe(langue, "/conditions", {
      titre: t("conditionsMetaTitre"),
      description: t("conditionsMetaDescription"),
    }),
  };
}

/**
 * LES CONDITIONS D'UTILISATION — quatorze sections, dans l'ordre de la planche.
 * Le texte vit dans `legal.pages.conditions`, recopié de
 * `ui_kits/legal/contenu-legal-*.js` (29/09/2026) : voir `PageLegale`.
 */
export default async function Conditions({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const t = await getTranslations({ locale: langue, namespace: "legal" });
  const graphe = donneesPage(langue, "/conditions", {
    nom: t("conditionsTitre"),
    description: t("conditionsMetaDescription"),
  });
  return (
    <>
      <GrapheJsonLd graphe={graphe} />
      <PageLegale locale={locale} sorte="conditions" />
    </>
  );
}

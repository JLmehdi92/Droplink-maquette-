import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PageLegale } from "@/components/page-legale";
import { routing } from "@/i18n/routing";
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
    title: t("confidentialiteMetaTitre"),
    description: t("confidentialiteMetaDescription"),
    alternates: alternatesDe(langue, "/confidentialite"),
    openGraph: openGraphDe(langue, "/confidentialite", {
      titre: t("confidentialiteMetaTitre"),
      description: t("confidentialiteMetaDescription"),
    }),
  };
}

/**
 * LA POLITIQUE DE CONFIDENTIALITÉ — dix sections, dans l'ordre de la planche.
 * Le texte vit dans `legal.pages.confidentialite`, recopié du kit : voir
 * `PageLegale`.
 */
export default async function Confidentialite({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PageLegale locale={locale} sorte="confidentialite" />;
}

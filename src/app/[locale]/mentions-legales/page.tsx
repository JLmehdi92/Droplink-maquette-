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
    title: t("mentionsMetaTitre"),
    description: t("mentionsMetaDescription"),
    alternates: alternatesDe(langue, "/mentions-legales"),
    openGraph: openGraphDe(langue, "/mentions-legales", {
      titre: t("mentionsMetaTitre"),
      description: t("mentionsMetaDescription"),
    }),
  };
}

/**
 * LES MENTIONS LÉGALES (29/09/2026) — ce que la LCEN exige d'un éditeur :
 * identité, adresse, immatriculation, contact, directeur de la publication,
 * hébergeurs. Six sections ; le texte vit dans `legal.pages.mentions`.
 */
export default async function MentionsLegales({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  const t = await getTranslations({ locale: langue, namespace: "legal" });
  const graphe = donneesPage(langue, "/mentions-legales", {
    nom: t("mentionsTitre"),
    description: t("mentionsMetaDescription"),
  });
  return (
    <>
      <GrapheJsonLd graphe={graphe} />
      <PageLegale locale={locale} sorte="mentions" />
    </>
  );
}

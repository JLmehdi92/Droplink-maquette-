import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PageLegale, type SectionLegale } from "@/components/page-legale";
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

export default async function Confidentialite({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections: readonly SectionLegale[] = [
    {
      id: "collecte",
      titre: t("confidentialite.collecteTitre"),
      paragraphes: [t("confidentialite.collecteP1")],
    },
    {
      id: "pas-de-compte",
      titre: t("confidentialite.pasDeCompteTitre"),
      paragraphes: [t("confidentialite.pasDeCompteP1")],
    },
    {
      id: "indexation",
      titre: t("confidentialite.indexationTitre"),
      paragraphes: [t("confidentialite.indexationP1")],
    },
    {
      id: "conservation",
      titre: t("confidentialite.conservationTitre"),
      paragraphes: [t("confidentialite.conservationP1"), t("confidentialite.conservationP2")],
    },
    {
      id: "droits",
      titre: t("confidentialite.droitsTitre"),
      paragraphes: [t("confidentialite.droitsP1")],
    },
  ];

  return (
    <PageLegale
      locale={locale}
      sorte="confidentialite"
      titre={t("confidentialiteTitre")}
      chapeau={t("confidentialiteChapeau")}
      sections={sections}
    />
  );
}

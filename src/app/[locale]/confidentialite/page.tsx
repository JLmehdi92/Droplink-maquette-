import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PageLegale } from "@/components/page-legale";
import { routing } from "@/i18n/routing";

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
  return { title: t("confidentialiteTitre") };
}

export default async function Confidentialite({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections = [
    { titre: t("confidentialite.collecteTitre"), texte: t("confidentialite.collecteTexte") },
    { titre: t("confidentialite.pasDeCompteTitre"), texte: t("confidentialite.pasDeCompteTexte") },
    { titre: t("confidentialite.indexationTitre"), texte: t("confidentialite.indexationTexte") },
    { titre: t("confidentialite.conservationTitre"), texte: t("confidentialite.conservationTexte") },
    { titre: t("confidentialite.droitsTitre"), texte: t("confidentialite.droitsTexte") },
  ] as const;

  return <PageLegale locale={locale} titre={t("confidentialiteTitre")} sections={sections} />;
}

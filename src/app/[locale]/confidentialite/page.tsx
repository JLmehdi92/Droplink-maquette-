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
    {
      id: "collecte",
      icone: "database",
      large: true,
      titre: t("confidentialite.collecteTitre"),
      texte: t("confidentialite.collecteTexte"),
    },
    {
      id: "pas-de-compte",
      icone: "person",
      titre: t("confidentialite.pasDeCompteTitre"),
      texte: t("confidentialite.pasDeCompteTexte"),
    },
    {
      id: "indexation",
      icone: "visibility_off",
      titre: t("confidentialite.indexationTitre"),
      texte: t("confidentialite.indexationTexte"),
    },
    {
      id: "conservation",
      icone: "schedule",
      titre: t("confidentialite.conservationTitre"),
      texte: t("confidentialite.conservationTexte"),
    },
    {
      id: "droits",
      icone: "shield_lock",
      titre: t("confidentialite.droitsTitre"),
      texte: t("confidentialite.droitsTexte"),
    },
  ] as const;

  return (
    <PageLegale
      locale={locale}
      titre={t("confidentialiteTitre")}
      sections={sections}
      chapeau={t("confidentialiteChapeau")}
      variante="compact"
    />
  );
}

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
  return { title: t("conditionsTitre") };
}

export default async function Conditions({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections = [
    { titre: t("conditions.objetTitre"), texte: t("conditions.objetTexte") },
    { titre: t("conditions.roleTitre"), texte: t("conditions.roleTexte") },
    { titre: t("conditions.interditTitre"), texte: t("conditions.interditTexte") },
    { titre: t("conditions.retraitTitre"), texte: t("conditions.retraitTexte") },
    { titre: t("conditions.paiementTitre"), texte: t("conditions.paiementTexte") },
    { titre: t("conditions.responsabiliteTitre"), texte: t("conditions.responsabiliteTexte") },
  ] as const;

  return <PageLegale locale={locale} titre={t("conditionsTitre")} sections={sections} />;
}

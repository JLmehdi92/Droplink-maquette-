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

  // L'ordre et les largeurs suivent le rythme de la maquette : une section
  // pleine, deux en regard, une pleine, deux en regard.
  const sections = [
    {
      id: "objet",
      icone: "gavel",
      large: true,
      titre: t("conditions.objetTitre"),
      texte: t("conditions.objetTexte"),
    },
    { id: "role", icone: "shield", titre: t("conditions.roleTitre"), texte: t("conditions.roleTexte") },
    {
      id: "interdit",
      icone: "warning",
      titre: t("conditions.interditTitre"),
      texte: t("conditions.interditTexte"),
    },
    {
      id: "retrait",
      icone: "policy",
      large: true,
      titre: t("conditions.retraitTitre"),
      texte: t("conditions.retraitTexte"),
    },
    {
      id: "paiement",
      icone: "money_off",
      titre: t("conditions.paiementTitre"),
      texte: t("conditions.paiementTexte"),
    },
    {
      id: "limites",
      icone: "balance",
      titre: t("conditions.responsabiliteTitre"),
      texte: t("conditions.responsabiliteTexte"),
    },
  ] as const;

  return (
    <PageLegale
      locale={locale}
      titre={t("conditionsTitre")}
      sections={sections}
      variante="sommaire"
    />
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EnTete } from "@/components/en-tete";
import { PiedDePage } from "@/components/pied-de-page";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
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
  const t = await getTranslations({ locale, namespace: "connexion" });
  // Une page de connexion n a rien a faire dans un index de moteur de recherche.
  return { title: t("titre"), robots: { index: false, follow: false } };
}

export default async function Connexion({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("connexion");

  return (
    <>
      <EnTete locale={locale} />

      <main id="contenu" className="mx-auto w-full max-w-[440px] px-4 py-16 md:py-24">
        <h1 className="font-[family-name:var(--font-titre)] text-3xl font-bold tracking-[-0.02em] text-encre">
          {t("titre")}
        </h1>
        <p className="mt-3 text-base leading-7 text-encre-douce">{t("sousTitre")}</p>

        <div className="mt-8">
          <FormulaireConnexion locale={locale} />
        </div>

        <div className="mt-10 border-t border-trait pt-6">
          <h2 className="text-sm font-semibold text-encre">{t("pasDeCompteTitre")}</h2>
          <p className="mt-1 text-sm leading-6 text-encre-douce">{t("pasDeCompteTexte")}</p>
        </div>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

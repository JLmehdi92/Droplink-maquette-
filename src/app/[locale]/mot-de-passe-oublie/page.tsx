import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireMotDePasseOublie } from "@/components/formulaire-mot-de-passe-oublie";
import { TraductionsClient } from "@/components/traductions-client";
import { PanneauAcces } from "@/components/panneau-acces";
import { routing } from "@/i18n/routing";

/**
 * MOT DE PASSE OUBLIÉ.
 *
 * MÊME COMPOSITION QUE LA CONNEXION — carte-page à rayon 28 (surface PUBLIQUE),
 * colonne de formulaire à 400, volet illustré à droite au-delà de `lg`. Un écran
 * qu'on atteint depuis la connexion et qui y ramène ne doit pas dépayser, et la
 * planche le dessine ainsi.
 *
 * ⚠️ AUCUN BOUTON GOOGLE. Ce n'est pas une porte d'entrée mais la réparation
 * d'un mot de passe : proposer Google ici enverrait vers une identité
 * DIFFÉRENTE de celle qu'on essaie de récupérer, et quelqu'un se retrouverait
 * connecté sans comprendre qu'il n'a rien réparé.
 *
 * ⚠️ AUCUNE MENTION DE CONDITIONS non plus, contrairement à la connexion et à
 * l'inscription : rien n'est accepté ni créé ici.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "motDePasse" });
  return { title: t("oublieTitre"), robots: { index: false, follow: false } };
}

export default async function MotDePasseOublie({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("motDePasse");

  return (
    <div className="min-h-dvh bg-canvas p-3 md:p-7">
      <main
        id="contenu"
        className="mx-auto grid min-h-[calc(100dvh-24px)] w-full max-w-[1384px] overflow-hidden rounded-[24px] bg-surface-container-lowest md:min-h-[calc(100dvh-56px)] md:rounded-page-publique lg:grid-cols-2"
      >
        <div className="flex flex-col px-[22px] pt-7 pb-[26px] md:px-[76px] md:py-10">
          <Link
            href={`/${locale}`}
            className="font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-on-surface md:text-[18px] md:leading-[23px]"
          >
            DropLink
          </Link>

          <div className="flex max-w-[400px] flex-grow flex-col justify-center py-[30px]">
            <h1 className="font-headline-xl text-[32px] leading-[37px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[38px] md:leading-[44px]">
              {t("oublieTitre")}
            </h1>
            <p className="mt-2.5 font-body-md text-[15px] leading-6 text-sourdine">
              <span className="md:hidden">{t("oublieSousTitreCourt")}</span>
              <span className="hidden md:inline">{t("oublieSousTitre")}</span>
            </p>

            <div className="mt-7 md:mt-[34px]">
              <TraductionsClient espaces={["connexion", "motDePasse"]}>
                <FormulaireMotDePasseOublie locale={locale} />
              </TraductionsClient>
            </div>

            <p className="mt-[26px] text-center font-body-md text-[14px] leading-[22px] text-sourdine md:mt-[30px] md:text-left md:text-[13px] md:leading-[21px]">
              <Link
                href={`/${locale}/connexion`}
                className="font-semibold text-violet hover:underline"
              >
                {t("retourConnexion")}
              </Link>
            </p>
          </div>
        </div>

        <PanneauAcces />
      </main>
    </div>
  );
}

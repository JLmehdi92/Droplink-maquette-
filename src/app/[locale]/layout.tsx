import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import "../globals.css";

/*
 * `next/font` télécharge les polices AU BUILD et les sert depuis notre domaine.
 * Aucune requête vers Google au rendu : une dépendance réseau sur le chemin
 * critique échouerait en silence derrière un pare-feu, et le texte partirait
 * dans une police de repli sans que rien ne le signale.
 */
const titre = Plus_Jakarta_Sans({
  variable: "--font-titre",
  subsets: ["latin"],
  display: "swap",
});

const corps = Inter({
  variable: "--font-corps",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Prérendu des deux langues. Sans cette liste, chaque première visite dans une
 * langue paierait un rendu à la demande.
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
  const t = await getTranslations({ locale, namespace: "landing" });
  return {
    title: t("metaTitre"),
    description: t("metaDescription"),
  };
}

export default async function LayoutLangue({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Une langue inconnue arrivant par l'URL doit rendre 404, pas un catalogue de
  // repli : servir du français sous `/de/` créerait une page indexable qui ment
  // sur sa langue.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className={`${titre.variable} ${corps.variable} antialiased`}>
        {/*
         * AUCUN PROVIDER I18N ICI, DÉLIBÉRÉMENT.
         *
         * Un provider racine expédie les mêmes messages à toutes les pages.
         * Mesuré : avec le catalogue entier la landing pesait 31,1 Ko et
         * transportait les libellés du légal et de l'onboarding ; restreinte
         * aux espaces utilisés côté client elle tombait à 23,7 Ko mais portait
         * encore l'onboarding, qu'elle n'emploie pas. Le défaut ne casse rien
         * et CROÎT avec chaque écran client ajouté.
         *
         * Chaque page enveloppe donc elle-même ses composants clients dans
         * `<TraductionsClient espaces={[...]}>`, si bien que le coût d'un
         * nouvel écran reste sur ce nouvel écran.
         */}
        {children}
      </body>
    </html>
  );
}

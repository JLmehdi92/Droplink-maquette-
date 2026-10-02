import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { origineConfiguree } from "@/lib/site";
import "../globals.css";
import "@/styles/refonte/socle.css";
import "@/styles/refonte/app.css";
import { TraductionsClient } from "@/components/traductions-client";
import { MarqueurHydratation, ScriptJs } from "@/components/script-js";

/*
 * `next/font` télécharge les polices AU BUILD et les sert depuis notre domaine.
 * Aucune requête vers Google au rendu : une dépendance réseau sur le chemin
 * critique échouerait en silence derrière un pare-feu, et le texte partirait
 * dans une police de repli sans que rien ne le signale.
 */
const corps = Inter({
  variable: "--font-corps",
  subsets: ["latin"],
  /*
   * ⚠️ L AXE OPTIQUE, PARCE QUE LE KIT LE DEMANDE. Sa feuille charge
   * `Inter:ital,opsz,wght@0,14..32,300..900` ; sans `opsz`, le navigateur rend
   * toutes les tailles au dessin optique de 14, et les mots sortent quelques
   * pixels plus larges des 16 px. Mesure a 1675 px : nos libelles rendaient 3 a
   * 4 px de plus que ceux du kit, a taille et graisse IDENTIQUES — un ecart qui
   * se lit comme un defaut de mise en page alors que c est un axe de police.
   */
  axes: ["opsz"],
  display: "swap",
});

/**
 * Prérendu des deux langues. Sans cette liste, chaque première visite dans une
 * langue paierait un rendu à la demande.
 */
export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * ⚠️ `metadataBase` VIT ICI, ET IL EST LE PRÉALABLE DE TOUT LE RESTE.
 *
 * Mesuré le 08/09/2026 : il n'apparaissait NULLE PART dans `src/` (0
 * occurrence). Sans lui, Next ne peut construire aucune URL absolue — donc ni
 * canonique, ni hreflang, ni Open Graph. Ce n'est pas un réglage de confort,
 * c'est ce qui rend les trois autres possibles.
 *
 * ⚠️ IL LIT `origineConfiguree()` ET NON `origineDuSite()`. La seconde peut
 * atteindre `headers()` sur son chemin de repli, ce qui basculerait cette page
 * — et donc TOUTE l'application — en rendu à la demande. La landing est
 * prérendue et répond en 25 ms depuis l'Europe : ce budget partirait sans
 * qu'aucune porte ne le voie.
 *
 * ⚠️ AUCUN `title.template` ICI, DÉLIBÉRÉMENT. Un gabarit global suffixerait
 * AUSSI les écrans vendeur et admin, dont plusieurs titres sont éprouvés au
 * caractère près par `scripts/fumee.mjs`. Les titres complets sont écrits au
 * catalogue, page par page : plus verbeux, sans effet de bord hors périmètre.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  const origine = origineConfiguree();
  return {
    // `null` en développement, où la variable est souvent absente : on ne
    // devine pas une base, on n'en pose simplement aucune.
    metadataBase: origine === null ? null : new URL(origine),
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
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${corps.variable} antialiased`}>
        <ScriptJs />
        <MarqueurHydratation />
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
         *
         * ⚠️ UNE SEULE EXCEPTION, ET ELLE EST GLOBALE PAR NÉCESSITÉ : l'espace
         * `erreurs`, quatre libellés. Une frontière d'erreur DOIT être un Client
         * Component — elle ne peut donc pas appeler `getTranslations()` et ne
         * reçoit aucune propriété —, et il en faut une sur CHAQUE segment, y
         * compris les surfaces publiques qui n'en avaient aucune : une erreur de
         * rendu y servait la page générique de Next, en anglais.
         *
         * La poser ici plutôt que dans chaque page est ce qui COÛTE LE MOINS :
         * `(app)` et `admin` portaient déjà ce même espace, chacun le sien. Ils
         * ne le portent plus, le voici une fois pour toutes.
         */}
        <TraductionsClient espaces={["erreurs"]}>{children}</TraductionsClient>
      </body>
    </html>
  );
}

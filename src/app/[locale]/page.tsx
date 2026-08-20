import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/en-tete";
import { PiedDePage } from "@/components/pied-de-page";
import { Icone } from "@/components/icone";
import { routing } from "@/i18n/routing";

/**
 * Landing publique, portée sur la maquette `droplink_landing_page_mobile`.
 *
 * STRUCTURE REPRISE À L'IDENTIQUE : en-tête fixe de 64 px en verre, canevas à
 * `pt-20 px-margin-mobile gap-8`, hero centré, visuel de 256 px en `rounded-xl
 * shadow-lg`, grille bento d'une colonne à 16 px d'écart, bandeau séparé par un
 * filet, puis pied de page sur `surface-container`. Les classes sont celles de
 * la maquette, ce qui rend tout écart visible plutôt que devinable.
 *
 * QUATRE ÉCARTS, TOUS IMPOSÉS PAR LE BRIEF ET NON PAR MON GOÛT :
 *
 * 1. LA COPY. La maquette parle de « Logistique Invisible », de généalogie
 *    produit et d'écosystème ERP. Ce n'est pas notre produit, et le
 *    positionnement doit rester générique. Structure conservée, texte réécrit.
 *
 * 2. LES FAUX LOGOS CLIENTS. « Trusted by industry leaders » suivi de
 *    GlobalFreight et TechParts est une affirmation, pas une décoration : ces
 *    clients n'existent pas. L'emplacement et sa géométrie sont conservés, et
 *    accueillent les trois gestes du produit — un contenu vrai, au même endroit.
 *
 * 3. LE RENDU 3D. Three.js et WebGL sont hors périmètre, et l'image était un
 *    bouchon. Le bloc garde ses dimensions exactes et montre ce que le produit
 *    fabrique réellement : un aperçu de la page que reçoit le client.
 *
 * 4. LES ICÔNES. La maquette charge une police de 312,7 Ko depuis un CDN pour
 *    dessiner quelques symboles. Les tracés officiels, figés dans le dépôt,
 *    donnent le même dessin pour une fraction du poids.
 *
 * La carte de verre, elle, est CONSERVÉE : le brief ne l'interdit que sur
 * `/p/[token]`.
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
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default async function Accueil({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  return (
    <>
      <EnTete locale={locale} />

      <main
        id="contenu"
        className="mx-auto flex w-full max-w-container-max flex-col gap-8 px-margin-mobile pt-20 pb-24 md:px-margin-desktop"
      >
        {/* Hero — `flex flex-col gap-6 pt-4 text-center` de la maquette. */}
        <section className="flex flex-col gap-6 pt-4 text-center">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-xl md:text-headline-xl">
            {t("heroTitre")}
          </h1>
          <p className="mx-auto max-w-[640px] font-body-lg text-body-lg text-on-surface-variant">
            {t("heroSousTitre")}
          </p>

          <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3">
            {/* Bouton primaire : remplissage, texte dessus, `shadow-md` qui
                disparaît à l'appui — exactement la spécification du DESIGN.md.
                La couleur vient de l'accent résolu, pas de `secondary` en dur :
                c'est le seul point où la maquette fige ce que le vendeur pilote. */}
            <Link
              href={`/${locale}/inscription`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent-remplissage)] px-6 py-3 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-shadow active:shadow-none"
            >
              {t("ctaPrincipal")}
              <Icone nom="arrow_forward" className="text-lg" />
            </Link>
            {/* Bouton secondaire : bordure de 1,5 px, texte de la même couleur,
                fond transparent. */}
            <Link
              href={`/${locale}/connexion`}
              className="flex w-full items-center justify-center rounded-lg border-[1.5px] border-[var(--accent-interface)] bg-transparent px-6 py-3 font-label-md text-label-md text-[var(--accent-texte)]"
            >
              {t("ctaSecondaire")}
            </Link>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t("gratuitPourLInstant")}
          </p>
        </section>

        {/* Emplacement du visuel : dimensions exactes de la maquette
            (`w-full h-64 rounded-xl overflow-hidden shadow-lg`). Il montre ce
            que le produit fabrique, au lieu d'un rendu 3D hors périmètre. */}
        <section
          aria-hidden="true"
          className="relative h-64 w-full overflow-hidden rounded-xl bg-surface-container-lowest shadow-lg"
        >
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low">
            <div className="w-[220px] rounded-xl bg-surface-container-lowest p-4 shadow-md">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-[var(--accent-remplissage)]" />
                <span className="h-2 w-20 rounded-full bg-surface-container-highest" />
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="block h-12 rounded bg-surface-container-high" />
                ))}
              </div>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i < 2 ? "bg-[var(--accent-remplissage)]" : "bg-surface-container-highest"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Grille bento : une colonne, 16 px d'écart, comme la maquette. */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <h2 className="sr-only">{t("fonctionnalites.titre")}</h2>

          {/* Carte 1 : pastille d'icône de 40 px, titre, texte. */}
          <div className="glass-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
              <Icone nom="image" className="text-2xl" />
            </div>
            <div>
              <h3 className="mb-2 font-headline-md-mobile text-headline-md-mobile text-on-surface">
                {t("fonctionnalites.mediasTitre")}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("fonctionnalites.mediasTexte")}
              </p>
            </div>
          </div>

          {/* Carte 2 : la carte haute de la maquette, avec sa pastille d'état
              en haut à droite et son pied opaque. */}
          <div className="glass-card flex flex-col overflow-hidden rounded-xl p-0 shadow-sm">
            <div className="relative h-40 bg-surface-container-low">
              <div className="absolute inset-0 flex items-center justify-center">
                <Icone nom="local_shipping" className="text-[64px] text-outline-variant" />
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-white/50 bg-white/80 px-3 py-1 font-label-sm text-label-sm text-[var(--accent-texte)] shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                {t("etape2")}
              </div>
            </div>
            <div className="flex flex-col gap-2 bg-surface-container-lowest/90 p-5">
              <div className="mb-1 flex items-center gap-2 text-[var(--accent-texte)]">
                <Icone nom="schedule" className="text-xl" />
                <h3 className="font-headline-md-mobile text-headline-md-mobile text-on-surface">
                  {t("fonctionnalites.suiviTitre")}
                </h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("fonctionnalites.suiviTexte")}
              </p>
            </div>
          </div>

          {/* Carte 3 : filet vertical de 4 px à gauche, pastille et étiquette. */}
          <div className="glass-card flex flex-col gap-4 rounded-xl border-l-4 border-l-[var(--accent-interface)] p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed">
                <Icone nom="palette" className="text-2xl" />
              </div>
              <span className="rounded bg-secondary-fixed px-2 py-1 font-label-sm text-label-sm text-[var(--accent-texte)]">
                {t("commentTitre")}
              </span>
            </div>
            <div>
              <h3 className="mb-2 font-headline-md-mobile text-headline-md-mobile text-on-surface">
                {t("fonctionnalites.marqueTitre")}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("fonctionnalites.marqueTexte")}
              </p>
            </div>
          </div>
        </section>

        {/* Emplacement des faux logos clients de la maquette : même géométrie
            (`py-6 border-t border-outline-variant/30 text-center`), contenu vrai. */}
        <section className="border-t border-outline-variant/30 py-6 text-center">
          <p className="mb-6 font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">
            {t("commentTitre")}
          </p>
          <ol className="mx-auto flex max-w-[720px] flex-col gap-4 text-left md:flex-row md:gap-8">
            {[t("etape1"), t("etape2"), t("etape3")].map((etape, index) => (
              <li key={etape} className="flex flex-1 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-remplissage)] font-label-md text-label-md text-[var(--accent-sur-remplissage)]"
                >
                  {index + 1}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">{etape}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl bg-surface-container p-5 text-center">
          <h2 className="font-headline-md-mobile text-headline-md-mobile text-on-surface">
            {t("destinataireTitre")}
          </h2>
          <p className="mx-auto mt-2 max-w-[640px] font-body-sm text-body-sm text-on-surface-variant">
            {t("destinataireTexte")}
          </p>
        </section>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

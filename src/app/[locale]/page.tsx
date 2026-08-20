import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { EnTete } from "@/components/en-tete";
import { PiedDePage } from "@/components/pied-de-page";

/**
 * Landing publique.
 *
 * La structure vient de la maquette Stitch ; la copy est réécrite intégralement.
 * Celle d'origine vendait un ERP de fret maritime — « Logistique Invisible »,
 * « Généalogie produit », « intégrez DropLink dans votre écosystème ERP » — ce
 * qui n'est ni le produit ni un positionnement neutre.
 *
 * DEUX SECTIONS DE LA MAQUETTE SONT SUPPRIMÉES, PAS REMPLACÉES :
 *
 * 1. « Trusted by industry leaders » avec ses logos GlobalFreight et TechParts.
 *    Nous n'avons aucun client. Une information absente est OMISE, jamais
 *    remplacée par une valeur inventée — et de faux logos de clients ne sont
 *    pas un placeholder, c'est une affirmation fausse sur une page publique.
 * 2. Le rendu 3D du réseau logistique. Three.js est hors scope, et l'image
 *    illustrait un produit que nous ne faisons pas.
 *
 * Le glassmorphism de la maquette est également retiré : géométrie conservée,
 * fonds opaques.
 */
export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("landing");

  const fonctionnalites = [
    { cle: "medias", titre: t("fonctionnalites.mediasTitre"), texte: t("fonctionnalites.mediasTexte") },
    { cle: "suivi", titre: t("fonctionnalites.suiviTitre"), texte: t("fonctionnalites.suiviTexte") },
    { cle: "marque", titre: t("fonctionnalites.marqueTitre"), texte: t("fonctionnalites.marqueTexte") },
  ] as const;

  const etapes = [t("etape1"), t("etape2"), t("etape3")] as const;

  return (
    <>
      <EnTete locale={locale} />

      <main id="contenu" className="mx-auto w-full max-w-[1200px] px-4 md:px-10">
        {/* Hero */}
        <section className="flex flex-col items-start gap-6 py-16 md:py-24 md:max-w-3xl">
          <h1 className="font-[family-name:var(--font-titre)] text-[2rem] font-bold leading-[2.5rem] tracking-[-0.02em] text-encre md:text-[3.25rem] md:leading-[3.75rem]">
            {t("heroTitre")}
          </h1>
          <p className="text-lg leading-8 text-encre-douce md:text-xl md:leading-9">
            {t("heroSousTitre")}
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={`/${locale}/connexion`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--accent-remplissage)] px-6 py-3 text-sm font-semibold text-[var(--accent-sur-remplissage)] shadow-carte transition-shadow hover:shadow-flottant"
            >
              {t("ctaPrincipal")}
            </Link>
            <Link
              href={`/${locale}/connexion`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border-[1.5px] border-[var(--accent-interface)] px-6 py-3 text-sm font-semibold text-[var(--accent-texte)]"
            >
              {t("ctaSecondaire")}
            </Link>
          </div>
          <p className="text-sm text-encre-douce">{t("gratuitPourLInstant")}</p>
        </section>

        {/* Trois fonctionnalités — la grille bento de la maquette, sans le flou */}
        <section aria-labelledby="titre-fonctionnalites" className="border-t border-trait py-16">
          <h2
            id="titre-fonctionnalites"
            className="font-[family-name:var(--font-titre)] text-2xl font-semibold leading-8 text-encre"
          >
            {t("fonctionnalites.titre")}
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {fonctionnalites.map((f) => (
              <li
                key={f.cle}
                className="flex flex-col gap-3 rounded-lg border border-trait bg-surface-carte p-6 shadow-carte"
              >
                <h3 className="font-[family-name:var(--font-titre)] text-lg font-semibold text-encre">
                  {f.titre}
                </h3>
                <p className="text-sm leading-6 text-encre-douce">{f.texte}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Trois gestes */}
        <section aria-labelledby="titre-comment" className="border-t border-trait py-16">
          <h2
            id="titre-comment"
            className="font-[family-name:var(--font-titre)] text-2xl font-semibold leading-8 text-encre"
          >
            {t("commentTitre")}
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {etapes.map((etape, i) => (
              <li key={etape} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-basse text-sm font-semibold text-encre"
                >
                  {i + 1}
                </span>
                <p className="pt-1 text-base leading-6 text-encre-douce">{etape}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Le destinataire n'a jamais de compte — c'est le point qui rassure */}
        <section aria-labelledby="titre-destinataire" className="border-t border-trait py-16">
          <div className="max-w-2xl">
            <h2
              id="titre-destinataire"
              className="font-[family-name:var(--font-titre)] text-2xl font-semibold leading-8 text-encre"
            >
              {t("destinataireTitre")}
            </h2>
            <p className="mt-4 text-base leading-7 text-encre-douce">{t("destinataireTexte")}</p>
          </div>
        </section>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

import { getTranslations } from "next-intl/server";
import { EnTete } from "./en-tete";
import { PiedDePage } from "./pied-de-page";

export interface SectionLegale {
  readonly titre: string;
  readonly texte: string;
}

/**
 * Gabarit commun aux pages légales.
 *
 * L'avertissement « document provisoire » est affiché tant que le texte n'a pas
 * été relu par un avocat. Il n'est pas décoratif : un document juridique
 * présenté comme définitif alors qu'il ne l'est pas engage plus que le même
 * document annoncé comme provisoire.
 *
 * Ces pages sont indexables — contrairement aux pages de commande. Un
 * hébergeur dont les conditions ne sont pas consultables publiquement se prive
 * précisément du statut qu'elles servent à établir.
 */
export async function PageLegale({
  locale,
  titre,
  sections,
  children,
}: {
  locale: string;
  titre: string;
  sections: readonly SectionLegale[];
  children?: React.ReactNode;
}) {
  const t = await getTranslations("legal");

  return (
    <>
      <EnTete locale={locale} />

      <main id="contenu" className="mx-auto w-full max-w-[760px] px-4 py-12 md:px-10 md:py-16">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
          {titre}
        </h1>

        <aside
          role="note"
          className="mt-6 rounded-lg border border-outline-variant bg-surface-container-low p-4"
        >
          <p className="font-label-md text-label-md text-on-surface">{t("avertissementTitre")}</p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{t("avertissementTexte")}</p>
        </aside>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((s) => (
            <section key={s.titre}>
              <h2 className="font-headline-md text-headline-md-mobile text-on-surface">
                {s.titre}
              </h2>
              <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{s.texte}</p>
            </section>
          ))}
          {children}
        </div>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

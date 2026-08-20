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
        <h1 className="font-[family-name:var(--font-titre)] text-3xl font-bold tracking-[-0.02em] text-encre">
          {titre}
        </h1>

        <aside
          role="note"
          className="mt-6 rounded-md border border-trait bg-surface-basse p-4"
        >
          <p className="text-sm font-semibold text-encre">{t("avertissementTitre")}</p>
          <p className="mt-1 text-sm leading-6 text-encre-douce">{t("avertissementTexte")}</p>
        </aside>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((s) => (
            <section key={s.titre}>
              <h2 className="font-[family-name:var(--font-titre)] text-xl font-semibold text-encre">
                {s.titre}
              </h2>
              <p className="mt-2 text-base leading-7 text-encre-douce">{s.texte}</p>
            </section>
          ))}
          {children}
        </div>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

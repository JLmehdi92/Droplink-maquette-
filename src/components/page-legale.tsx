import { getFormatter, getTranslations } from "next-intl/server";
import { Icone } from "./icone";
import { EnTete } from "./en-tete";
import { PiedDePage } from "./pied-de-page";
import type { NomIcone } from "@/lib/design/traces-icones";

export interface SectionLegale {
  readonly id: string;
  readonly titre: string;
  readonly texte: string;
  readonly icone: NomIcone;
  /** Occupe toute la largeur de la grille, comme les sections pleines des maquettes. */
  readonly large?: boolean;
}

/**
 * Date de dernière rédaction de ces textes.
 *
 * Elle est écrite ici et non dans les catalogues de traduction : c'est un FAIT,
 * pas une chaîne à traduire, et le même fait doit valoir dans les deux langues.
 * La mettre à jour est le geste qui accompagne toute modification du contenu
 * légal — une date figée sur un texte modifié affirme un état qui n'existe plus.
 */
const DERNIERE_MAJ = new Date("2026-08-20T00:00:00Z");

/**
 * Gabarit commun aux pages légales, porté sur les maquettes
 * `droplink_cgu_final_harmonization` et
 * `droplink_politique_de_confidentialit_final_harmonization`.
 *
 * DEUX MISES EN PAGE, parce que les deux maquettes en montrent deux :
 *
 * - `sommaire` (CGU) : grille de 12 colonnes, sommaire collant sur 3 colonnes à
 *   partir de `md`, contenu sur 9, cartes de verre en `rounded-xl p-8`.
 * - `compact` (confidentialité) : colonne de 3xl centrée, grille de 2 colonnes,
 *   cartes opaques `bg-surface-container-lowest` bordées, en `rounded-lg p-6`.
 *
 * Le `carte` est CONSERVÉ : le brief ne l'interdit que sur `/p/[token]`.
 *
 * L'avertissement « document provisoire » est affiché tant que le texte n'a pas
 * été relu par un avocat. Il n'est pas décoratif : un document juridique
 * présenté comme définitif alors qu'il ne l'est pas engage plus que le même
 * document annoncé comme provisoire.
 *
 * Ces pages sont indexables — contrairement aux pages de commande. Un hébergeur
 * dont les conditions ne sont pas consultables publiquement se prive précisément
 * du statut qu'elles servent à établir.
 */
export async function PageLegale({
  locale,
  titre,
  chapeau,
  sections,
  variante,
  children,
}: {
  readonly locale: string;
  readonly titre: string;
  readonly chapeau?: string;
  readonly sections: readonly SectionLegale[];
  readonly variante: "sommaire" | "compact";
  readonly children?: React.ReactNode;
}) {
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const dateMaj = format.dateTime(DERNIERE_MAJ, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const avertissement = (
    <aside
      role="note"
      className="rounded-lg border-l-4 border-[var(--accent-interface)] bg-[color-mix(in_srgb,var(--accent-interface)_5%,transparent)] p-4"
    >
      <p className="font-label-md text-label-md text-on-surface">{t("avertissementTitre")}</p>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
        {t("avertissementTexte")}
      </p>
    </aside>
  );

  const carte = (s: SectionLegale) => {
    const cadre =
      variante === "sommaire"
        ? "carte rounded-xl p-8 shadow-sm"
        : "rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-sm";

    return (
      <section
        key={s.id}
        id={s.id}
        className={`${cadre} h-full scroll-mt-24 ${s.large === true ? "md:col-span-2" : ""}`}
      >
        <h2 className="mb-6 flex items-center gap-3 font-headline-md text-headline-md-mobile text-on-surface">
          <span className="flex items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent-interface)_10%,transparent)] p-2 text-[var(--accent-texte)]">
            <Icone nom={s.icone} className="text-[24px]" />
          </span>
          {s.titre}
        </h2>
        <p className="font-body-md text-body-md leading-relaxed text-on-surface-variant">
          {s.texte}
        </p>
      </section>
    );
  };

  return (
    <>
      <EnTete locale={locale} />

      <main
        id="contenu"
        className="mx-auto w-full max-w-container-max px-margin-mobile pt-24 pb-12 md:px-margin-desktop md:pb-16"
      >
        <div
          className={
            variante === "compact"
              ? "mx-auto max-w-3xl"
              : "mx-auto w-full"
          }
        >
          <div className={variante === "compact" ? "mb-12" : "mb-12 text-center"}>
            <h1 className="mb-4 font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-xl md:text-headline-xl">
              {titre}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {t("misAJourLe")} : {dateMaj}
              {chapeau !== undefined ? ` — ${chapeau}` : ""}
            </p>
          </div>

          {variante === "sommaire" ? (
            <div className="relative grid grid-cols-1 items-start gap-8 md:grid-cols-12">
              <aside className="sticky top-24 hidden md:col-span-3 md:block">
                <nav aria-label={t("sommaireTitre")} className="carte rounded-xl p-6 shadow-sm">
                  <ul className="flex flex-col gap-4">
                    {sections.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="block border-l-2 border-transparent pl-3 font-label-md text-label-md text-on-surface transition-colors hover:border-[var(--accent-interface)] hover:text-[var(--accent-texte)]"
                        >
                          {s.titre}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>

              <div className="col-span-1 flex flex-col gap-6 md:col-span-9">
                {avertissement}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {sections.map(carte)}
                </div>
                {children}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {avertissement}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{sections.map(carte)}</div>
              {children}
            </div>
          )}
        </div>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Icone } from "./icone";
import { CoquePublique } from "./coque-publique";
import { signalementDisponible } from "@/lib/contact";

export interface SectionLegale {
  readonly id: string;
  readonly titre: string;
  /** Un ou plusieurs paragraphes. Les planches en posent deux par section. */
  readonly paragraphes: readonly string[];
  /**
   * Ce qui reste À FAIRE RÉDIGER dans cette section.
   *
   * ⚠️ CE N'EST PAS UN OUBLI, C'EST LA PLANCHE. Elle écrit « [DROIT APPLICABLE
   * ET JURIDICTION À FIXER AVEC L'AVOCAT] » en toutes lettres, et c'est plus
   * honnête que d'inventer une clause : un texte juridique présenté comme
   * complet alors qu'il ne l'est pas engage davantage que le même texte annoncé
   * comme incomplet. La lacune est donc RENDUE, dans un style qui interdit de la
   * confondre avec le corps du document.
   */
  readonly lacune?: string;
}

/**
 * Date de dernière rédaction de ces textes.
 *
 * Elle est écrite ici et non dans les catalogues : c'est un FAIT, pas une chaîne
 * à traduire, et le même fait doit valoir dans les deux langues. La mettre à
 * jour est le geste qui accompagne toute modification du contenu légal — une
 * date figée sur un texte modifié affirme un état qui n'existe plus.
 */
const DERNIERE_MAJ = new Date("2026-08-29T00:00:00Z");

/**
 * LES PAGES LÉGALES, portées sur leurs planches.
 *
 * ⚠️ CE GABARIT RENDAIT DES CARTES ; LA PLANCHE REND UN DOCUMENT. L'ancienne
 * version disposait chaque section dans une carte à icône, sur une grille de
 * deux colonnes. Les planches Conditions — bureau et téléphone — dessinent un
 * texte suivi : sur-titre, grand titre, avertissement, puis huit sections en
 * prose, avec un sommaire collant à gauche au bureau. Ce n'est pas une nuance de
 * goût : un document juridique se LIT dans l'ordre, et une grille de cartes en
 * casse la lecture en huit fragments sans début ni fin.
 *
 * LE SOMMAIRE EST UN VRAI SOMMAIRE : ses liens visent les ancres des sections,
 * il disparaît au téléphone — où la planche ne le dessine pas — et la première
 * entrée n'y est PAS marquée « active » à l'arrivée. La planche la peint en
 * violet, mais un marquage figé sur la première section ment dès qu'on défile,
 * et le suivre en JavaScript coûterait un observateur sur une page dont c'est
 * précisément ce qu'on ne veut pas.
 *
 * Ces pages restent indexables — contrairement aux pages de commande. Un
 * hébergeur dont les conditions ne sont pas consultables se prive du statut
 * qu'elles servent à établir.
 */
export async function PageLegale({
  locale,
  surTitre,
  titre,
  chapeau,
  sections,
}: {
  readonly locale: string;
  readonly surTitre: string;
  readonly titre: string;
  readonly chapeau?: string;
  readonly sections: readonly SectionLegale[];
}) {
  const t = await getTranslations("legal");
  const nav = await getTranslations("navigation");
  const format = await getFormatter();
  const dateMaj = format.dateTime(DERNIERE_MAJ, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const corps =
    "font-body-md text-[15px] leading-[25px] text-ardoise-doux md:text-[16px] md:leading-[27px]";

  const encartSignalement = signalementDisponible() ? (
    <div className="rounded-[14px] border border-outline-variant bg-[#fafafc] p-[18px] md:p-4">
      <p className="font-headline-md text-[14px] leading-[18px] font-bold text-on-surface md:text-[13px]">
        {t("encartSignalerTitre")}
      </p>
      <p className="mt-1.5 mb-3 font-body-sm text-[13px] leading-5 text-sourdine">
        {t("encartSignalerTexte")}
      </p>
      <Link
        href={`/${locale}/signalement`}
        className="-my-[13px] inline-flex min-h-11 items-center font-headline-md text-[14px] font-bold text-violet md:text-[13px]"
      >
        {t("encartSignalerLien")}
      </Link>
    </div>
  ) : null;

  return (
    <CoquePublique
      locale={locale}
      action={
        <>
          {/*
            ⚠️ LE TÉLÉPHONE PORTE UN HAMBURGER, PAS LA PILULE — c'est la planche
            mobile qui le dit, et elle a raison : à 390, une pilule « Se
            connecter » dans l'en-tête d'un document juridique propose la seule
            chose que le lecteur n'est pas venu faire.

            IL OUVRE LE SOMMAIRE, et c'est ce qui le sauve d'être un bouton
            mort. La planche mobile retire le sommaire du corps sans dire où il
            passe ; le mettre ici le rend atteignable au téléphone, sur un
            document de huit sections où l'on cherche presque toujours une
            section précise. En `<details>`, donc sans une ligne de JavaScript :
            Échap le referme, le clavier l'atteint, et il fonctionne avant
            l'hydratation.
          */}
          <details name="sommaire-legal" className="relative md:hidden">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-fond-neutre text-on-surface [&::-webkit-details-marker]:hidden">
              <Icone nom="menu" titre={t("sommaireTitre")} className="text-[18px]" />
            </summary>
            <nav
              aria-label={t("sommaireTitre")}
              className="absolute right-0 z-20 mt-2 flex w-[280px] flex-col rounded-[14px] border border-outline-variant bg-surface-container-lowest p-2 shadow-[0_18px_40px_-14px_rgba(14,14,19,0.22)]"
            >
              {sections.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex min-h-11 items-center rounded-[9px] px-3 font-headline-md text-[14px] leading-[22px] font-medium text-ardoise"
                >
                  {i + 1}. {s.titre}
                </a>
              ))}
            </nav>
          </details>

          <Link
            href={`/${locale}/connexion`}
            className="hidden h-10 items-center gap-2 rounded-full bg-primary px-[18px] font-headline-md text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90 md:inline-flex"
          >
            {nav("seConnecter")}
            <Icone nom="open_in_new" className="text-[13px]" />
          </Link>
        </>
      }
    >
      <div className="px-5 pt-[30px] pb-9 md:grid md:grid-cols-[268px_minmax(0,1fr)] md:gap-[60px] md:px-10 md:pt-11 md:pb-[60px]">
        {/* LE SOMMAIRE — collant, et absent du téléphone comme sur la planche. */}
        <aside className="hidden self-start md:sticky md:top-10 md:block">
          <p className="mb-3 ml-3 font-headline-md text-[11px] leading-[13px] font-bold tracking-[0.08em] text-gris-entete">
            {t("sommaireTitre")}
          </p>
          <nav aria-label={t("sommaireTitre")}>
            <ul>
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded-[9px] px-3 py-[7px] font-headline-md text-[14px] leading-[22px] font-medium text-ardoise transition-colors hover:bg-violet-fond hover:text-violet"
                  >
                    {i + 1}. {s.titre}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {encartSignalement === null ? null : <div className="mt-[22px]">{encartSignalement}</div>}
        </aside>

        <div className="md:max-w-[700px]">
          <p className="mb-2.5 text-[11.5px] leading-[15px] font-bold tracking-[0.09em] text-ds-texte-sourdine md:mb-3">
            {surTitre}
          </p>
          <h1 className="mb-2.5 font-headline-xl text-[32px] leading-[37px] font-extrabold tracking-[-0.035em] text-on-surface md:mb-3 md:text-[42px] md:leading-[48px]">
            {titre}
          </h1>
          <p className={corps}>
            {t("misAJourLe")} : {dateMaj}
            {chapeau === undefined ? "" : ` — ${chapeau}`}
          </p>

          {/* L'AVERTISSEMENT EST AMBRE, pas décoratif : un document juridique
              présenté comme définitif alors qu'il ne l'est pas engage plus que
              le même document annoncé comme provisoire. */}
          <aside
            role="note"
            className="mt-[22px] flex gap-[11px] rounded-[14px] border border-attention-filet bg-[#fffaf0] px-4 py-[15px] md:mt-6 md:gap-3 md:px-[18px] md:py-4"
          >
            <Icone
              nom="warning"
              className="mt-0.5 shrink-0 text-[17px] text-attention-icone md:text-[18px]"
            />
            <p className="font-body-sm text-[13px] leading-[21px] text-[#8a6415] md:text-[14px] md:leading-[22px]">
              <strong className="font-semibold">{t("avertissementTitre")}</strong>{" "}
              {t("avertissementTexte")}
            </p>
          </aside>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="mt-8 mb-2.5 font-headline-lg text-[19px] leading-[24px] font-bold tracking-[-0.02em] text-on-surface md:mt-10 md:mb-3 md:text-[22px] md:leading-7">
                {i + 1}. {s.titre}
              </h2>
              {s.paragraphes.map((p) => (
                <p key={p.slice(0, 40)} className={corps}>
                  {p}
                </p>
              ))}
              {s.lacune === undefined ? null : (
                <p className={`${corps} text-gris-entete`}>[{s.lacune}]</p>
              )}
            </section>
          ))}

          {/* AU TÉLÉPHONE L'ENCART DE SIGNALEMENT VIENT EN FIN DE DOCUMENT, là
              où la planche mobile le place : il n'y a pas de colonne pour le
              porter, et le mettre en tête retarderait le texte qu'on vient
              lire. */}
          {encartSignalement === null ? null : (
            <div className="mt-[34px] md:hidden">{encartSignalement}</div>
          )}
        </div>
      </div>
    </CoquePublique>
  );
}

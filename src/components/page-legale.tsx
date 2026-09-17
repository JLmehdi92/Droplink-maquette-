import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Building2, CalendarDays, FileText, Shield } from "lucide-react";
import { LogoMarque } from "@/components/acces/coque-acces";
import { SommaireRepliable } from "@/components/sommaire-repliable";
import { signalementDisponible } from "@/lib/contact";

export interface SectionLegale {
  readonly id: string;
  readonly titre: string;
  /** Un ou plusieurs paragraphes. */
  readonly paragraphes: readonly string[];
}

/**
 * Date de dernière rédaction de ces textes.
 *
 * Elle est écrite ici et non dans les catalogues : c'est un FAIT, pas une chaîne
 * à traduire, et le même fait doit valoir dans toutes les langues. La mettre à
 * jour est le geste qui accompagne toute modification du contenu légal — une
 * date figée sur un texte modifié affirme un état qui n'existe plus.
 */
const DERNIERE_MAJ = new Date("2026-09-18T00:00:00Z");

/**
 * LES PAGES LÉGALES, portées sur le kit `legal`.
 *
 * ⚠️ ON PORTE LA COQUE ET LA TYPOGRAPHIE DU KIT, PAS SON TEXTE. Le kit rédige
 * ses conditions comme un gabarit : un plan Pro à 19,90 € par mois, un
 * prélèvement automatique, l'authentification Apple et la double
 * authentification. La contrainte n° 1 interdit la première moitié ; la seconde
 * décrit des capacités que le produit n'a pas. Le texte du produit reste le
 * sien — il décrit ce que le service fait réellement.
 *
 * ⚠️ LES PASTILLES « À COMPLÉTER » ET LE BANDEAU « À VALIDER PAR UN AVOCAT » SONT
 * RETIRÉS — décision de Wassim du 18/09/2026. Ce qu'ils annonçaient n'a pas
 * disparu pour autant, et c'est le point :
 *
 *  - deux d'entre elles désignaient un fait que le CODE TIENT DÉJÀ, et les
 *    effacer sans l'écrire aurait rendu la page muette sur une durée que la base
 *    applique : la conservation d'un an après fermeture (`conserver_jusqu_au`
 *    vaut `now() + interval '1 year'`, migration 157) et la purge des réponses
 *    brutes à quatre-vingt-dix jours du dernier mouvement (migration 075). Elles
 *    sont devenues de la prose, pas un trou ;
 *  - le droit applicable était une DÉCISION, pas une lacune : droit français,
 *    tribunaux français (Wassim, 18/09/2026) ;
 *  - l'éditeur porte « DropLink », sans forme juridique — son choix, fait en
 *    connaissance de ce que la LCEN demande.
 *
 * ⚠️ CE QUI RESTE VRAI ET QUE PLUS AUCUN ÉCRAN NE DIT : le brief exige toujours
 * une validation par un avocat avant toute ouverture publique. Retirer le
 * bandeau ne l'a pas faite — il a cessé de l'annoncer aux visiteurs, voilà tout.
 *
 * LE SOMMAIRE EST UN VRAI SOMMAIRE, SANS ENTRÉE « ACTIVE ». Le kit suit le
 * défilement en JavaScript pour surligner la section courante ; un marquage
 * figé sur la première ment dès qu'on défile, et le suivi coûterait un îlot
 * client sur une page de texte. Au téléphone il est REPLIÉ en tête du document
 * (15/09/2026) : dépliées, ses dix entrées de 44 px passaient avant le texte.
 *
 * Ces pages restent indexables — contrairement aux pages de commande. Un
 * hébergeur dont les conditions ne sont pas consultables se prive du statut
 * qu'elles servent à établir.
 */
export async function PageLegale({
  locale,
  sorte,
  titre,
  chapeau,
  sections,
}: {
  readonly locale: string;
  /** Les conditions ou la politique de confidentialité : l'icône et la pastille en dépendent. */
  readonly sorte: "conditions" | "confidentialite";
  readonly titre: string;
  readonly chapeau?: string;
  readonly sections: readonly SectionLegale[];
}) {
  const t = await getTranslations("legal");
  const nav = await getTranslations("navigation");
  const landing = await getTranslations("landing");
  const format = await getFormatter();
  const dateMaj = format.dateTime(DERNIERE_MAJ, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const signalable = signalementDisponible();

  /* LES LIENS D'EN-TÊTE ET DE PIED SONT DES CIBLES TACTILES : 44 px au
     téléphone, compensés par la marge négative, et la hauteur de leur texte au
     bureau, comme au kit. */
  const lienEntete =
    "-my-3.5 hidden min-h-11 items-center text-[14.5px] font-medium text-ds-texte-corps hover:text-ds-accent-encre sm:inline-flex md:my-0 md:min-h-0";

  const encartSignalement = signalable ? (
    <div className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4">
      <p className="text-[14px] font-bold text-ds-texte-fort">{t("encartSignalerTitre")}</p>
      <p className="mt-1.5 mb-3 text-[13px] leading-[1.5] text-ds-texte-corps">
        {t("encartSignalerTexte")}
      </p>
      <Link
        href={`/${locale}/signalement`}
        className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-ds-texte-lien hover:text-ds-accent-encre"
      >
        {t("encartSignalerLien")}
      </Link>
    </div>
  ) : null;

  const sommaire = (
    <nav aria-label={t("sommaireTitre")} className="flex flex-col gap-[3px]">
      <span className="px-3 pb-1.5 text-[11.5px] font-bold tracking-[0.08em] text-ds-texte-tenu uppercase">
        {t("sommaireTitre")}
      </span>
      {sections.map((s, i) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="flex min-h-11 items-center rounded-ds-sm px-3 py-2 text-[14px] font-medium text-ds-texte-corps transition-colors hover:bg-ds-surface-teinte hover:text-ds-accent-encre md:block md:min-h-0"
        >
          {`${i + 1}. ${s.titre}`}
        </a>
      ))}
      <div className="mt-[18px] flex flex-col gap-2 border-t border-ds-filet px-3 pt-4">
        <Link
          href={`/${locale}/conditions`}
          className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
        >
          {t("conditionsTitre")}
        </Link>
        <Link
          href={`/${locale}/confidentialite`}
          className="-my-3.5 inline-flex min-h-11 items-center text-[13.5px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
        >
          {t("confidentialiteTitre")}
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FAF9FE_0%,#FBFAFE_60%,#F8F3FD_100%)] bg-fixed leading-[normal]">
      {/*
        L'EN-TÊTE DU KIT, COLLANT ET TRANSLUCIDE. Le flou est autorisé ici : la
        règle 2 ne l'interdit que sur `/p/[token]`, et cette surface est la
        nôtre.
      */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-ds-filet bg-[rgba(255,255,255,0.82)] px-3.5 py-2.5 backdrop-blur-[12px] md:gap-5 md:px-[34px] md:py-4">
        {/* Le saut au contenu doit rester le premier élément focusable. */}
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-ds-sm focus:bg-ds-surface-carte focus:px-4 focus:py-2 focus:text-ds-texte-fort focus:shadow-ds-md"
        >
          {nav("allerAuContenu")}
        </a>
        <Link href={`/${locale}`} className="inline-flex min-h-11 items-center md:min-h-0">
          <LogoMarque hauteur={30} />
        </Link>
        <span className="rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-[11px] py-[5px] text-[12px] font-bold text-ds-accent-encre">
          {t("pastille")}
        </span>
        <span className="flex-1" />
        <Link href={`/${locale}/docs`} className={lienEntete}>
          {landing("menu.docs")}
        </Link>
        <Link href={`/${locale}`} className={lienEntete}>
          {t("accueil")}
        </Link>
        {/* LE SEUL DÉGRADÉ DE L'ÉCRAN — règle 3. */}
        <Link
          href={`/${locale}/inscription`}
          className="degrade-ds-marque inline-flex h-11 items-center gap-2 rounded-ds-pill border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
        >
          {nav("creerCompte")}
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(0,1fr)] items-start gap-7 px-4 pt-6 pb-12 min-[980px]:grid-cols-[268px_minmax(0,1fr)] min-[980px]:gap-12 min-[980px]:px-[34px] min-[980px]:pt-10 min-[980px]:pb-20">
        <aside className="min-[980px]:sticky min-[980px]:top-24">
          {/* Au téléphone replié — dix entrées de 44 px passaient avant le texte —,
              dans la colonne au bureau. Voir `SommaireRepliable`. */}
          <SommaireRepliable titre={t("sommaireTitre")} masque="min-[980px]:hidden">
            {sommaire}
          </SommaireRepliable>
          <div className="hidden min-[980px]:block">{sommaire}</div>

          {/* L'ENCART DE SIGNALEMENT, que le kit n'a pas : la procédure de
              notification et retrait fonde notre statut d'hébergeur (brief
              §12), et c'est ici, à côté des conditions, qu'on la cherche. */}
          {encartSignalement === null ? null : (
            <div className="mt-[22px] hidden min-[980px]:block">{encartSignalement}</div>
          )}
        </aside>

        <article id="contenu" className="max-w-[780px] min-w-0">
          <span className="inline-flex items-center gap-2 rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-3.5 py-[7px] text-[12.5px] font-bold text-ds-accent-encre">
            {sorte === "conditions" ? (
              <FileText aria-hidden="true" size={14} strokeWidth={2} />
            ) : (
              <Shield aria-hidden="true" size={14} strokeWidth={2} />
            )}
            {sorte === "conditions" ? t("conditionsTitre") : t("confidentialiteTitre")}
          </span>
          <h1 className="mt-5 text-[27px] leading-[1.06] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[32px] md:text-[44px]">
            {titre}
          </h1>

          <div className="mt-[18px] mb-[22px] flex flex-wrap items-center gap-4 border-y border-ds-filet pt-3.5 pb-1 text-[12.5px] text-ds-texte-sourdine">
            <span className="flex items-center gap-[7px]">
              <CalendarDays aria-hidden="true" size={14} strokeWidth={1.9} />
              {t("misAJourLe")} : {dateMaj}
            </span>
            <span className="flex items-center gap-[7px]">
              <Building2 aria-hidden="true" size={14} strokeWidth={1.9} />
              {/* Une seule chaîne : deux expressions JSX séparées par un saut de
                  ligne rendent DEUX espaces, et le relevé l'a vu. */}
              {`${t("editeur")} ${t("editeurNom")}`}
            </span>
          </div>

          {chapeau === undefined ? null : (
            <p className="mb-3.5 text-[15.5px] leading-[1.7] text-pretty text-ds-texte-corps">{chapeau}</p>
          )}

          {sections.map((s, i) => (
            <section key={s.id}>
              <h2
                id={s.id}
                className="mt-12 mb-3.5 scroll-mt-24 text-[21px] leading-[1.1] font-extrabold tracking-[-0.035em] text-balance text-ds-texte-fort sm:text-[23px] md:text-[28px]"
              >
                {`${i + 1}. ${s.titre}`}
              </h2>
              {s.paragraphes.map((p) => (
                <p
                  key={p.slice(0, 40)}
                  className="mb-3.5 text-[15.5px] leading-[1.7] text-pretty text-ds-texte-corps"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}

          {/* AU TÉLÉPHONE L'ENCART DE SIGNALEMENT VIENT EN FIN DE DOCUMENT : il
              n'y a pas de colonne pour le porter, et le mettre en tête
              retarderait le texte qu'on vient lire. */}
          {encartSignalement === null ? null : (
            <div className="mt-[34px] min-[980px]:hidden">{encartSignalement}</div>
          )}
        </article>
      </main>

      <footer className="flex flex-wrap items-center gap-[18px] border-t border-ds-filet px-4 py-[26px] md:px-[34px]">
        <LogoMarque hauteur={22} />
        <span className="min-w-20 flex-1" />
        <nav aria-label={t("piedTitre")} className="flex flex-wrap gap-x-[18px]">
          <Link
            href={`/${locale}/conditions`}
            className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
          >
            {t("piedConditions")}
          </Link>
          <Link
            href={`/${locale}/confidentialite`}
            className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
          >
            {t("piedConfidentialite")}
          </Link>
          {signalable ? (
            <Link
              href={`/${locale}/signalement`}
              className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0"
            >
              {t("piedSignaler")}
            </Link>
          ) : null}
        </nav>
        <span className="text-[13px] text-ds-texte-sourdine">
          {nav("piedDePage", { annee: new Date().getFullYear() })}
        </span>
      </footer>
    </div>
  );
}

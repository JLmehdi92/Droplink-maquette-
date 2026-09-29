import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { LogoMarque } from "@/components/acces/coque-acces";
import { signalementDisponible } from "@/lib/contact";

/**
 * LA COQUE DES PAGES PUBLIQUES DE TEXTE — le signalement et le blog.
 *
 * ⚠️ ELLE PORTAIT ENCORE L'ANCIEN CANEVAS LE 14/09/2026 : carte blanche de 1384
 * au rayon 28 posée sur le lavande, « DropLink » écrit en Plus Jakarta Sans, et
 * la garde du rayon de carte-page ne la voyait pas — elle ne balayait que
 * `src/app`. Elle reprend désormais l'en-tête et le pied des pages légales du
 * design system (`legal/signalement.html`, `blog/index.html`, écrites dans le
 * kit ce jour-là) : en-tête collant et translucide, pastille de rubrique,
 * Documentation, Accueil, « Créer un compte » ; pied au logo et aux liens
 * légaux.
 *
 * ⚠️ « CRÉER UN COMPTE » NE PORTE PAS TOUJOURS LE DÉGRADÉ. La règle 3 le réserve
 * à UNE action principale par écran : sur le signalement et sur un article,
 * c'est l'action de la page qui le prend — préparer le signalement, créer sa
 * première commande — et l'en-tête passe en bouton secondaire. Sur l'index du
 * blog, qui n'a pas d'autre action, il le garde.
 *
 * LE LIEN DE SIGNALEMENT DISPARAÎT DU PIED quand aucune adresse n'est
 * configurée — même règle que la page elle-même, qui renvoie 404. Un lien vers
 * une procédure sans destinataire ferait croire qu'un canal existe.
 */
export async function CoquePublique({
  locale,
  pastille,
  enteteSecondaire,
  children,
}: {
  readonly locale: string;
  readonly pastille: string;
  /** Vrai quand la page a sa propre action principale, qui prend le dégradé. */
  readonly enteteSecondaire: boolean;
  readonly children: ReactNode;
}) {
  const nav = await getTranslations("navigation");
  const l = await getTranslations("legal");
  const landing = await getTranslations("landing");
  const signalable = signalementDisponible();


  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FAF9FE_0%,#FBFAFE_60%,#F8F3FD_100%)] bg-fixed leading-[normal]">
      {/* Le flou est autorisé ici : la règle 2 ne l'interdit que sur `/p/[token]`. */}
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
          {pastille}
        </span>
        <span className="flex-1" />
        {/* LES LIENS D'EN-TÊTE ET DE PIED SONT DES CIBLES TACTILES : 44 px au
            téléphone, compensés par la marge négative, et la hauteur de leur
            texte au bureau, comme au kit. */}
        <Link href={`/${locale}/docs`} className="-my-3.5 hidden min-h-11 items-center text-[14.5px] font-medium text-ds-texte-corps hover:text-ds-accent-encre sm:inline-flex md:my-0 md:min-h-0">
          {landing("menu.docs")}
        </Link>
        <Link href={`/${locale}`} className="-my-3.5 hidden min-h-11 items-center text-[14.5px] font-medium text-ds-texte-corps hover:text-ds-accent-encre sm:inline-flex md:my-0 md:min-h-0">
          {l("accueil")}
        </Link>
        <Link
          href={`/${locale}/inscription`}
          className={
            "inline-flex h-11 items-center gap-2 rounded-ds-pill border px-[22px] text-[14px] font-semibold tracking-[-0.02em] transition-shadow " +
            (enteteSecondaire
              ? "border-ds-filet bg-ds-surface-carte text-ds-texte-fort shadow-ds-sm hover:shadow-ds-md"
              : "degrade-ds-marque border-transparent text-ds-texte-sur-marque shadow-ds-brand hover:shadow-ds-brand-hover")
          }
        >
          {nav("creerCompte")}
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
        </Link>
      </header>

      {children}

      <footer className="flex flex-wrap items-center gap-[18px] border-t border-ds-filet px-4 py-[26px] md:px-[34px]">
        <LogoMarque hauteur={22} />
        <span className="min-w-20 flex-1" />
        <nav aria-label={l("piedTitre")} className="flex flex-wrap gap-x-[18px]">
          <Link href={`/${locale}/conditions`} className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
            {l("piedConditions")}
          </Link>
          <Link href={`/${locale}/confidentialite`} className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
            {l("piedConfidentialite")}
          </Link>
          <Link href={`/${locale}/mentions-legales`} className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
            {l("piedMentions")}
          </Link>
          {signalable ? (
            <Link href={`/${locale}/signalement`} className="-my-3.5 inline-flex min-h-11 items-center text-[13px] text-ds-texte-corps hover:text-ds-accent-encre md:my-0 md:min-h-0">
              {l("piedSignaler")}
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

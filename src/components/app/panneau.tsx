import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * LE VOCABULAIRE DE L'ÉCRAN DE DÉTAIL, RELEVÉ DANS LE KIT SERVI.
 *
 * ⚠️ CES VALEURS NE VIENNENT PAS DE `OrderDetail.jsx`, ET C'EST TOUT LE SUJET.
 * Le kit charge ses huit écrans dans un seul document, et `AnalyticsView.jsx`
 * est chargé APRÈS `OrderDetail.jsx`. Les deux déclarent un `function Panel` au
 * niveau global : la seconde déclaration écrase la première, et l'écran de
 * détail rend donc le `Panel` des ANALYSES. Lire le fichier qui porte le nom de
 * l'écran donnait `fontSize: 18`, `letterSpacing: -0.025em` et un en-tête
 * `20px 24px 16px` ; le navigateur rend 19 px, -0,03em et un `padding: 24`
 * uniforme avec 20 px sous l'en-tête. C'est la mesure qui fait foi.
 */

/**
 * LE PANNEAU — `Panel`, mesuré à 1690 px sur le kit servi.
 *
 * Une carte au rayon `card-lg`, filet fin, ombre de carte, `padding: 24`
 * uniforme. L'en-tête se replie (`flex-wrap`) plutôt que de compresser son
 * action : sur les trois langues, le titre chinois est court et le libellé
 * français du bouton est long, et c'est le repli qui évite la troncature.
 */
export function Panneau({
  titre,
  sousTitre,
  icone: Icone,
  action,
  children,
  className,
}: {
  readonly titre: ReactNode;
  readonly sousTitre?: string;
  /**
   * LA PASTILLE D'EN-TÊTE — 44 au rayon pilule, fond teinté, icône 20 à
   * l'accent. C'est celle de `SummaryTile`, que le kit reprend en tête de
   * chaque section de « Ma marque ». Facultative : les panneaux de `/analyses`
   * et du détail de commande n'en portent pas, et en poser une partout ferait
   * de l'icône une décoration plutôt qu'un repère.
   */
  readonly icone?: LucideIcon;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={
        "flex min-w-0 flex-col rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card lg:p-6" +
        (className === undefined ? "" : " " + className)
      }
    >
      <header className="mb-4 flex flex-wrap items-start gap-4 lg:mb-5">
        {Icone === undefined ? null : (
          <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-ds-accent">
            <Icone aria-hidden="true" size={20} strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0 flex-[1_1_210px]">
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-ds-texte-titre lg:text-[19px]">
            {titre}
          </h2>
          {sousTitre === undefined ? null : (
            <p className="mt-1 text-[13px] text-ds-texte-corps">{sousTitre}</p>
          )}
        </div>
        <span className="flex-1" />
        {action}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/**
 * ⚠️ `DetailAction` DU KIT N'A PAS DE COMPOSANT ICI, ET C'EST DÉLIBÉRÉ. Sa
 * géométrie exacte — 48 px de haut, `padding: 0 18px`, écart 10, ombre xs,
 * icône à l'accent — vit dans `BoutonCopier` de l'éditeur, seul bouton de cette
 * famille sur l'écran. Un second exemplaire exporté et jamais monté serait une
 * valeur de plus à garder juste, sans rien pour signaler qu'elle a dérivé. Il
 * naîtra ici le jour où un deuxième écran en pose un.
 */

/**
 * Le lien de retour — `BackLink`, 14/500, écart 9, flèche 17 au trait 1,9.
 *
 * C'est un LIEN EN TEXTE, pas un bouton carré. La distinction compte : posé
 * au-dessus du titre, il fait partie du fil de lecture, là où un bouton bordé
 * se lit comme une action de la barre d'outils.
 *
 * ⚠️ SA ZONE TACTILE EST PORTÉE À 44 px PAR UN REMPLISSAGE VERTICAL compensé
 * par une marge négative : le texte reste sur sa ligne de base, la cible
 * s'agrandit. Sans ça, 19 px de haut au doigt.
 */
export function LienRetour({ href, libelle }: { readonly href: string; readonly libelle: string }) {
  return (
    <Link
      href={href}
      className="-my-3 inline-flex items-center gap-[9px] py-3 text-[14px] font-medium text-ds-texte-corps transition-colors hover:text-ds-texte-fort"
    >
      <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.9} />
      {libelle}
    </Link>
  );
}

/**
 * UNE LIGNE CLÉ-VALEUR — `InfoRow`, `13px 0`, filet bas, libellé 14/400 corps,
 * valeur 14/600 encre.
 *
 * ⚠️ SEUL LE LIEN SE TRONQUE À L'ELLIPSE. Il fait une soixantaine de caractères
 * dans un panneau de 437 ; replié, il pousserait la ligne à deux hauteurs et
 * désalignerait les six lignes du panneau. Il est copiable ailleurs — cette
 * ligne l'IDENTIFIE, elle ne sert pas à le lire.
 *
 * ⚠️ LES AUTRES VALEURS SE REPLIENT, ET C'EST UNE CORRECTION DU 12/09/2026.
 * Elles tronquaient aussi : mesuré à 390 px, « Date de création » rendait
 * « 12 septembre 2026 à 05:… ». Une date coupée n'identifie rien — contrairement
 * à un lien, dont les premiers caractères suffisent à reconnaître lequel c'est.
 */
export function LigneInfo({
  libelle,
  valeur,
  href,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly href?: string;
}) {
  const texte = (
    <>
      <span className="truncate">{valeur}</span>
      <ExternalLink aria-hidden="true" size={14} className="shrink-0 text-ds-accent" />
    </>
  );

  return (
    <div className="flex items-center gap-4 border-b border-ds-filet py-[13px] last:border-b-0">
      <span className="shrink-0 text-[14px] text-ds-texte-corps">{libelle}</span>
      <span className="flex-1" />
      {href === undefined ? (
        <span className="min-w-0 text-right text-[14px] font-semibold text-ds-texte-fort">
          {valeur}
        </span>
      ) : (
        /*
         * ⚠️ LA CIBLE REMPLIT LA HAUTEUR DE LA LIGNE — 21 px de texte plus les
         * 2 × 13 px de remplissage, soit 47. La marge négative annule ce
         * remplissage pour le lien seul : la ligne garde sa hauteur, le doigt
         * gagne 26 px. Mesuré sans elle à 390 px : deux cibles de 21 px.
         */
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-[13px] inline-flex min-w-0 items-center gap-[7px] py-[13px] text-[14px] font-semibold text-ds-texte-lien hover:underline"
        >
          {texte}
        </a>
      )}
    </div>
  );
}

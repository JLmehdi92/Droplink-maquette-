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
  taille = "panneau",
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
  /**
   * LA TAILLE DU TITRE — deux valeurs, et ce n'est pas un réglage esthétique.
   *
   * ⚠️ LE KIT EMPLOIE DEUX COMPOSANTS DIFFÉRENTS. `Panel` porte un titre de
   * 19 px en -0,03em : c'est celui des écrans qui MONTRENT — commandes, envois,
   * analyses, détail. `SectionCard` en porte un de 17 px en -0,025em : c'est
   * celui des écrans qui font REMPLIR un formulaire en étapes numérotées, et
   * `BrandView` n'emploie que celui-là. Mesuré sur la page servie : 17/700,
   * interligne 18,7 px, interlettrage -0,425 px.
   *
   * Les rendre tous à 19 faisait dépasser les cinq titres de `/marque` de deux
   * pixels, et l'écart se propage à toute la colonne.
   */
  readonly taille?: "panneau" | "section";
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
          {/*
            ⚠️ L'INTERLIGNE FAIT PARTIE DE LA MESURE, ET IL MANQUAIT. La taille
            et l'interlettrage avaient bien été relevés sur le kit servi ; pas
            la hauteur de ligne. Le kit laisse ses titres sur la règle de sa
            feuille — 1,1 —, Tailwind applique 1,5 par défaut, et les six
            panneaux de l'éditeur rendaient donc une boîte de 29 px là où le
            kit en rend 21. Huit pixels par titre, six titres : c'est la
            hauteur d'une ligne de contenu qui se décale sur toute la page.
          */}
          <h2
            className={
              "leading-[1.1] font-bold text-ds-texte-titre " +
              (taille === "section"
                ? "text-[16px] tracking-[-0.025em] lg:text-[17px]"
                : "text-[18px] tracking-[-0.03em] lg:text-[19px]")
            }
          >
            {titre}
          </h2>
          {/* 1,55 d'interligne, comme le kit : 20,15 px sur 13. Notre corps de
              page impose 1,5, soit 19,5 — le sous-titre se replie alors une
              ligne plus tôt sur les phrases longues. */}
          {sousTitre === undefined ? null : (
            <p className="mt-1 text-[13px] leading-[1.55] text-ds-texte-corps">{sousTitre}</p>
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
 * `DetailAction` DU KIT — 48 px de haut, `padding: 0 18px`, écart 10, rayon de
 * carte, filet, fond carte, ombre xs, 14/600, icône 17 à l'accent.
 *
 * ⚠️ CE BLOC DISAIT « PAS DE COMPOSANT ICI, ET C'EST DÉLIBÉRÉ », au motif qu'un
 * seul bouton de cette famille existait — celui qui copie le lien. L'éditeur en
 * pose désormais TROIS : copier, partager, et « ajouter des fichiers » dans
 * l'en-tête du panneau des médias. La condition que cette note posait
 * elle-même — « il naîtra le jour où un deuxième écran en pose un » — est donc
 * remplie, et trois copies de la même géométrie, c'est trois endroits où elle
 * peut dériver sans que rien ne le dise.
 *
 * C'est une CLASSE et non un composant : les trois boutons n'ont ni le même
 * contenu ni le même comportement — l'un a trois états, l'autre ouvre un
 * sélecteur de fichiers — et un composant qui les couvrirait tous porterait
 * plus d'options que de géométrie.
 */
export const CLASSE_ACTION_DETAIL =
  "flex h-12 items-center justify-center gap-2.5 rounded-ds-card border border-ds-filet " +
  "bg-ds-surface-carte px-[18px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs " +
  "transition-colors hover:bg-ds-surface-teinte";

/**
 * Le lien de retour — `BackLink`, 14/500, écart 9, flèche 17 au trait 1,9.
 *
 * ⚠️ LE PLANCHER TACTILE EST UN `min-height`, PAS UN REMPLISSAGE — ET LA
 * DIFFÉRENCE A COÛTÉ TROIS CIBLES À 43 px. Le remplissage de 2 × 12 px donnait
 * 45 px tant que le texte occupait une boîte de 21 ; en posant l'interligne du
 * kit (`normal`, donc 17 px), la même cible est tombée à 43. Une cible calculée
 * par addition dépend de tout ce qui l'entoure ; un plancher déclaré ne dépend
 * de rien.
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
      /*
        ⚠️ `leading-[normal]` ET NON `leading-normal` : le second est une valeur
        de l'échelle Tailwind qui vaut 1,5, c'est-à-dire exactement ce qu'on
        corrige. Le kit laisse ses libellés d'interface sur le `normal` du CSS,
        et notre corps de page impose 1,5 : 21 px de boîte au lieu de 17.

        ⚠️ ET LE REMPLISSAGE TACTILE NE VAUT QU'AU TÉLÉPHONE. Il porte la cible
        à 44 px — règle 5 — mais au bureau il donnait 45 px de haut à un lien
        que le kit rend en 17. La règle protège un doigt, pas une souris.
      */
      className="-my-3 inline-flex min-h-11 items-center gap-[9px] py-3 text-[14px] leading-[normal] font-medium text-ds-texte-corps transition-colors hover:text-ds-texte-fort lg:my-0 lg:min-h-0 lg:py-0"
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
      <span className="shrink-0 text-[14px] leading-[normal] text-ds-texte-corps">{libelle}</span>
      <span className="flex-1" />
      {href === undefined ? (
        <span className="min-w-0 text-right text-[14px] leading-[normal] font-semibold text-ds-texte-fort">
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
          className="-my-[13px] inline-flex min-h-11 min-w-0 items-center gap-[7px] py-[13px] text-[14px] leading-[normal] font-semibold text-ds-texte-lien hover:underline lg:min-h-0"
        >
          {texte}
        </a>
      )}
    </div>
  );
}

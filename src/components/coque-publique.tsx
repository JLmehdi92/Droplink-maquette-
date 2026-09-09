import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { signalementDisponible } from "@/lib/contact";

/**
 * LA CARTE-PAGE DES SURFACES PUBLIQUES LÉGALES.
 *
 * Les quatre planches — Conditions et Signalement, bureau et téléphone —
 * dessinent la même coque : une carte blanche de 1384 au rayon 28, posée sur le
 * lavande, qui porte SON PROPRE en-tête et SON PROPRE pied. Ce n'est pas le
 * chrome partagé du produit : c'est la composition de la landing, et ces pages
 * appartiennent à la même surface publique.
 *
 * ⚠️ RAYON 28 ET NON 24. La coupure du canevas est nette : 28 sur les surfaces
 * PUBLIQUES — landing, connexion, inscription, onboarding, conditions,
 * confidentialité, signalement — et 24 sur les surfaces authentifiées. Ces trois
 * pages rendaient jusqu'ici la largeur maximale du produit, sans carte du tout.
 *
 * L'ACTION DE DROITE VARIE et c'est la planche qui le dit : les Conditions
 * portent la pilule noire « Se connecter », le Signalement un simple lien vers
 * les conditions. Elle est donc reçue en propriété plutôt que devinée.
 *
 * LE LIEN DE SIGNALEMENT DISPARAÎT DU PIED quand aucune adresse n'est
 * configurée — même règle que la page elle-même, qui renvoie 404. Un lien vers
 * une procédure sans destinataire ferait croire qu'un canal existe.
 */
export async function CoquePublique({
  locale,
  action,
  children,
}: {
  readonly locale: string;
  readonly action: ReactNode;
  readonly children: ReactNode;
}) {
  const t = await getTranslations("navigation");
  const l = await getTranslations("legal");
  const signalable = signalementDisponible();

  /**
   * ⚠️ `min-h-11` EST LE PLANCHER TACTILE DU BRIEF §8 (44 points), ET LA MARGE
   * NÉGATIVE EN EST LA MOITIÉ INDISSOCIABLE. Mesuré au navigateur le
   * 09/09/2026 à 390 px : ces liens rendaient 16 px de haut. Leur largeur, en
   * revanche, dépassait déjà 44 partout — seule la hauteur manquait, d'où une
   * correction purement verticale, qui évite au passage de faire se chevaucher
   * des cibles espacées de 18 px seulement.
   *
   * `-my-3.5` vaut (44 − 16) / 2 et rend au flux la hauteur exacte qu'il avait :
   * sans elle le pied grandirait de 28 px et la planche du canevas cesserait de
   * décrire le rendu réel. Vérifié après coup : hauteur du pied inchangée,
   * texte déplacé de 0,0 px.
   *
   * ⚠️ LA RÈGLE `@media (pointer: coarse)` DE `globals.css` NE PEUT PAS S'EN
   * CHARGER : elle vise `button` et `a[role="button"]`, jamais un lien de
   * navigation. L'étendre à tout `a` donnerait 44 px de haut au moindre lien
   * INLINE dans le corps des conditions, et disloquerait le texte qu'il
   * traverse.
   */
  const lienPied =
    "-my-3.5 inline-flex min-h-11 items-center font-body-sm text-[12px] leading-4 font-medium text-sourdine transition-colors hover:text-on-surface md:text-[13px]";

  return (
    <div className="min-h-screen bg-canvas px-3 py-3 md:px-7 md:py-7">
      <div className="mx-auto w-full max-w-[1384px] rounded-[24px] bg-surface-container-lowest md:rounded-page-publique">
        <header className="flex items-center justify-between gap-4 border-b border-outline-variant px-5 py-4 md:px-10 md:py-[22px]">
          {/* Le saut au contenu doit rester le premier élément focusable. */}
          <a
            href="#contenu"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:text-on-surface focus:shadow-md"
          >
            {t("retourAccueil")}
          </a>

          <Link
            href={`/${locale}`}
            className="font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-on-surface md:text-[18px] md:leading-[23px]"
          >
            DropLink
          </Link>

          {action}
        </header>

        <main id="contenu">{children}</main>

        {/* LE PIED EST EN COLONNE AU TÉLÉPHONE, en rangée au bureau : les deux
            planches mobiles empilent la marque et les liens, centrés. */}
        <footer className="flex flex-col items-center gap-3.5 border-t border-outline-variant px-5 py-[22px] md:flex-row md:justify-between md:gap-6 md:px-10 md:py-[26px]">
          <span className="font-headline-md text-[15px] leading-[19px] font-extrabold tracking-[-0.02em] text-on-surface">
            DropLink
          </span>
          <nav aria-label={l("piedTitre")} className="flex gap-[18px] md:gap-[26px]">
            <Link href={`/${locale}/conditions`} className={lienPied}>
              {l("piedConditions")}
            </Link>
            <Link href={`/${locale}/confidentialite`} className={lienPied}>
              {l("piedConfidentialite")}
            </Link>
            {signalable ? (
              <Link href={`/${locale}/signalement`} className={lienPied}>
                {l("piedSignaler")}
              </Link>
            ) : null}
          </nav>
        </footer>
      </div>
    </div>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * En-tête des pages publiques, portée sur la barre supérieure des maquettes.
 *
 * Barre OPAQUE, posée sur un filet. Le flou a disparu de tout le produit avec
 * le canevas Claude Design : il n'y en a nulle part sur les 41 planches. Une
 * barre translucide sans flou laisserait le contenu défiler derrière elle en
 * clair, ce qui est pire que les deux.
 *
 * DEUX ÉCARTS. L'avatar utilisateur est retiré : ces pages sont vues par des
 * visiteurs non connectés, et une silhouette de compte laisserait croire qu'une
 * session existe. Le bouton « menu » l'est aussi : il n'ouvre rien tant qu'il
 * n'y a pas de navigation à ouvrir, et un bouton inerte s'apprend vite comme un
 * bouton mort.
 */
export async function EnTete({ locale }: { locale: string }) {
  const t = await getTranslations("navigation");

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-margin-mobile shadow-sm transition-all duration-200 md:px-margin-desktop">
      {/* Le saut au contenu doit être le premier élément focusable de la page. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:text-on-surface focus:shadow-md"
      >
        {t("retourAccueil")}
      </a>

      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}`}
          className="font-headline-md text-headline-md-mobile font-bold tracking-[-0.02em] text-on-surface"
        >
          DropLink
        </Link>
      </div>

      <nav className="flex items-center gap-2">
        <Link
          href={`/${locale}/connexion`}
          className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
        >
          {t("seConnecter")}
        </Link>
        <Link
          href={`/${locale}/inscription`}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--accent-remplissage)] px-4 py-2 font-label-md text-label-md text-[var(--accent-sur-remplissage)] shadow-md transition-shadow active:shadow-none"
        >
          {t("creerUnCompte")}
        </Link>
      </nav>
    </header>
  );
}

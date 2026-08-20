import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * En-tête des pages publiques de marque DropLink.
 *
 * L'avatar utilisateur de la maquette est retiré : cette page est vue par des
 * visiteurs non connectés, et afficher une silhouette de compte donnerait à
 * croire qu'une session existe.
 *
 * Pas de `backdrop-blur` : la maquette en met sur un fond uni, où le flou n'a
 * rien à flouter et coûte cher sur un mobile d'entrée de gamme.
 */
export async function EnTete({ locale }: { locale: string }) {
  const t = await getTranslations("navigation");

  return (
    <header className="border-b border-trait bg-surface-carte">
      {/* Le saut au contenu doit être le premier élément focusable de la page. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-carte focus:px-4 focus:py-2 focus:text-encre focus:shadow-flottant"
      >
        {t("retourAccueil")}
      </a>

      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 md:px-10">
        <Link
          href={`/${locale}`}
          className="font-[family-name:var(--font-titre)] text-xl font-bold tracking-[-0.02em] text-encre"
        >
          DropLink
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href={`/${locale}/connexion`}
            className="inline-flex min-h-[44px] items-center rounded-md px-4 py-2 text-sm font-semibold text-encre-douce hover:text-encre"
          >
            {t("seConnecter")}
          </Link>
          <Link
            href={`/${locale}/connexion`}
            className="inline-flex min-h-[44px] items-center rounded-md bg-[var(--accent-remplissage)] px-4 py-2 text-sm font-semibold text-[var(--accent-sur-remplissage)]"
          >
            {t("creerUnCompte")}
          </Link>
        </nav>
      </div>
    </header>
  );
}

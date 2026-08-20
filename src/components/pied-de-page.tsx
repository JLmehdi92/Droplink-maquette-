import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signalementDisponible } from "@/lib/contact";

/**
 * Pied de page public, porté sur celui de la maquette.
 *
 * CLASSES REPRISES : `w-full py-8 bg-surface-container flex flex-col
 * items-center gap-4 px-margin-mobile text-center border-t
 * border-outline-variant/50`, liens en `font-body-sm text-body-sm
 * text-on-surface-variant hover:text-secondary transition-colors opacity-80
 * hover:opacity-100`.
 *
 * DEUX ÉCARTS. La maquette liste « Support », « Privacy » et « Terms » : le
 * premier ne mène nulle part, et un lien mort sur une landing est une promesse
 * non tenue dès le premier clic. Il est remplacé par « Signaler un contenu »,
 * qui n'est pas décoratif : la procédure de notification et retrait est ce qui
 * fonde notre statut d'hébergeur. Et ce lien DISPARAÎT tant qu'aucune adresse
 * n'est configurée — une procédure sans destinataire promet un recours qui
 * n'aboutit nulle part.
 *
 * Le `mb-16` de la maquette est retiré avec la barre de navigation basse qu'il
 * dégageait : elle est explicitement supprimée sur la landing, jusque dans les
 * commentaires de la maquette elle-même.
 */
export async function PiedDePage({ locale }: { locale: string }) {
  const t = await getTranslations("pied");
  const annee = new Date().getFullYear();
  const signalement = signalementDisponible();

  return (
    <footer className="flex w-full flex-col items-center gap-4 border-t border-outline-variant/50 bg-surface-container px-margin-mobile py-8 text-center md:px-margin-desktop">
      <div className="mb-2 flex justify-center">
        <span className="font-headline-md text-headline-md-mobile font-bold text-on-surface">
          DropLink
        </span>
      </div>

      <nav className="flex flex-wrap justify-center gap-4">
        <Link
          href={`/${locale}/conditions`}
          className="font-body-sm text-body-sm text-on-surface-variant opacity-80 transition-colors hover:text-[var(--accent-texte)] hover:opacity-100"
        >
          {t("conditions")}
        </Link>
        <Link
          href={`/${locale}/confidentialite`}
          className="font-body-sm text-body-sm text-on-surface-variant opacity-80 transition-colors hover:text-[var(--accent-texte)] hover:opacity-100"
        >
          {t("confidentialite")}
        </Link>
        {signalement ? (
          <Link
            href={`/${locale}/signalement`}
            className="font-body-sm text-body-sm text-on-surface-variant opacity-80 transition-colors hover:text-[var(--accent-texte)] hover:opacity-100"
          >
            {t("signaler")}
          </Link>
        ) : null}
      </nav>

      <div className="font-body-sm text-body-sm text-on-surface-variant">
        © {annee} DropLink. {t("droits")}
      </div>
    </footer>
  );
}

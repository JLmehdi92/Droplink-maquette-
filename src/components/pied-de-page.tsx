import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signalementDisponible } from "@/lib/contact";

/**
 * Pied de page public.
 *
 * Les liens « Product », « Company », « API Docs » de la maquette sont retirés :
 * aucune de ces pages n'existe, et un lien mort sur une landing est une
 * promesse non tenue dès le premier clic.
 *
 * « Signaler un contenu » est en revanche OBLIGATOIRE et non décoratif : la
 * procédure de notification et retrait est ce qui fonde notre statut
 * d'hébergeur.
 */
export async function PiedDePage({ locale }: { locale: string }) {
  const t = await getTranslations("pied");
  const annee = new Date().getFullYear();
  // Le lien de signalement n a de sens que si une adresse existe. Un lien vers
  // une procedure sans destinataire est pire qu une absence de lien.
  const signalement = signalementDisponible();

  return (
    <footer className="mt-8 border-t border-trait bg-surface-basse">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-10">
        <p className="font-[family-name:var(--font-titre)] text-lg font-bold text-encre">DropLink</p>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href={`/${locale}/conditions`} className="text-sm text-encre-douce hover:text-encre">
            {t("conditions")}
          </Link>
          <Link
            href={`/${locale}/confidentialite`}
            className="text-sm text-encre-douce hover:text-encre"
          >
            {t("confidentialite")}
          </Link>
          {signalement ? (
            <Link href={`/${locale}/signalement`} className="text-sm text-encre-douce hover:text-encre">
              {t("signaler")}
            </Link>
          ) : null}
        </nav>

        <p className="text-sm text-encre-douce">
          © {annee} DropLink. {t("droits")}
        </p>
      </div>
    </footer>
  );
}

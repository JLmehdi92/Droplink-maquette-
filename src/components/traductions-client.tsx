import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Expédie au navigateur les seuls espaces de traduction dont CETTE page a
 * besoin.
 *
 * POURQUOI PAS UN PROVIDER UNIQUE À LA RACINE. Un provider racine expédie les
 * mêmes messages à toutes les pages. Mesuré en servant les pages : avec le
 * catalogue entier, la landing pesait 31,1 Ko et transportait les libellés des
 * mentions légales et de l'onboarding. En restreignant à ce que les composants
 * clients utilisent, elle est descendue à 23,7 Ko — mais elle portait encore
 * l'onboarding, qu'aucun composant de la landing n'emploie.
 *
 * Le défaut ne casse rien et CROÎT : chaque écran client ajouté au produit
 * alourdirait toutes les pages, y compris la landing, qui est l'écran d'entrée
 * ouvert en 4G depuis un message privé. Un provider par page fait que le coût
 * d'un nouvel écran reste sur ce nouvel écran.
 *
 * Les Server Components n'ont pas besoin de ce composant : `getTranslations()`
 * résout côté serveur et n'expédie que le texte rendu.
 */
export async function TraductionsClient({
  espaces,
  children,
}: {
  readonly espaces: readonly string[];
  readonly children: React.ReactNode;
}) {
  const complet = (await getMessages()) as unknown as Record<string, unknown>;

  const restreint: Record<string, unknown> = {};
  for (const espace of espaces) {
    const bloc = complet[espace];
    if (bloc !== undefined) restreint[espace] = bloc;
  }

  return <NextIntlClientProvider messages={restreint}>{children}</NextIntlClientProvider>;
}

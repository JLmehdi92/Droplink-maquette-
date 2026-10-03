import { getFormatter, getLocale } from "next-intl/server";
import { avecPremierDuMois } from "@/lib/format/premier-du-mois";

/**
 * `getFormatter` de next-intl, avec « 1er » dans les dates françaises.
 * ⚠️ LE SEUL POINT D'ENTRÉE : `tests/unit/premier-du-mois.test.ts` refuse tout
 * autre import de `getFormatter` ou `useFormatter` dans `src/`.
 */
export async function getFormateur(options?: { locale?: string }): Promise<Awaited<ReturnType<typeof getFormatter>>> {
  const format = await getFormatter(options);
  const langue = options?.locale ?? (await getLocale());
  return avecPremierDuMois(langue, format);
}

/** Le type du formateur, pour les fonctions qui le reçoivent en paramètre. */
export type Formateur = Awaited<ReturnType<typeof getFormateur>>;

import { useFormatter, useLocale } from "next-intl";
import { avecPremierDuMois } from "@/lib/format/premier-du-mois";

/** `useFormatter` de next-intl, avec « 1er » dans les dates françaises (voir `formateur.ts`). */
export function useFormateur(): ReturnType<typeof useFormatter> {
  return avecPremierDuMois(useLocale(), useFormatter());
}

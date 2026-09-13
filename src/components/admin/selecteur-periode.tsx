import { getTranslations } from "next-intl/server";
import { SelecteurAdmin } from "@/components/admin/selecteur-admin";

/**
 * LA FENÊTRE DE LA COURBE DU PANNEAU — le `AdminSelect` de `Overview` du kit.
 *
 * Les trois valeurs sont celles du kit, et la liste est FERMÉE : une valeur hors
 * liste retombe sur 30 plutôt que de lever. Le paramètre vient d'une URL, donc
 * d'une entrée externe — même principe que le Zod posé sur « ce qui vient de
 * notre formulaire », et la liste fermée tient lieu de schéma.
 */

export const PERIODES = [7, 30, 90] as const;
export type Periode = (typeof PERIODES)[number];

/** 30 jours, comme le kit à l'ouverture. */
export const PERIODE_PAR_DEFAUT: Periode = 30;

export function lirePeriode(brut: string | undefined): Periode {
  const n = Number(brut);
  return (PERIODES as readonly number[]).includes(n) ? (n as Periode) : PERIODE_PAR_DEFAUT;
}

export async function SelecteurPeriode({
  langue,
  periode,
}: {
  readonly langue: string;
  readonly periode: Periode;
}) {
  const t = await getTranslations("admin.panneau");

  return (
    <SelecteurAdmin
      etiquette={t("periodeEtiquette")}
      courant={String(periode)}
      options={PERIODES.map((valeur) => ({
        valeur: String(valeur),
        libelle: t("periode", { jours: valeur }),
        href: `/${langue}/admin?jours=${valeur}`,
      }))}
    />
  );
}

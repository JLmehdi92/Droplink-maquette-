import { getTranslations } from "next-intl/server";
import { Anneau } from "@/components/admin/anneau";
import type { RepartitionAdmin } from "@/lib/audit/panneau";

/**
 * LA RÉPARTITION DES COMMANDES DE LA PLATEFORME PAR STATUT.
 *
 * ⚠️ QUATRE PARTS LÀ OÙ LE KIT EN DESSINE CINQ. Ses « Problème » et « Annulées »
 * n'existent pas : la décision 4 arrête la frise à quatre étapes — préparation,
 * expédié, en transit, livré — et la granularité vit dans le DÉTAIL du suivi.
 * Inventer deux états pour remplir un anneau leur donnerait une existence que la
 * base ne leur accorde pas.
 *
 * L'ordre est celui de la frise, du plus avancé au moins avancé — comme le kit,
 * qui ouvre sur « Livrées ». C'est l'ordre dans lequel on lit un avancement.
 */
const PARTS = [
  { cle: "livre", trait: "var(--color-ds-succes)" },
  { cle: "enTransit", trait: "var(--color-ds-info)" },
  { cle: "expedie", trait: "var(--color-ds-accent)" },
  { cle: "preparation", trait: "var(--color-ds-alerte)" },
] as const;

export async function AnneauStatuts({ repartition }: { readonly repartition: RepartitionAdmin }) {
  const t = await getTranslations("admin.panneau");

  const valeurs = {
    livre: repartition.livre,
    enTransit: repartition.enTransit,
    expedie: repartition.expedie,
    preparation: repartition.preparation,
  } as const;

  return (
    <Anneau
      total={repartition.total}
      unite={t("statutsUnite")}
      part={(pourcent) => t("statutPart", { part: pourcent })}
      parts={PARTS.map((p) => ({
        cle: p.cle,
        trait: p.trait,
        libelle: t(`statut.${p.cle}`),
        valeur: valeurs[p.cle],
      }))}
    />
  );
}

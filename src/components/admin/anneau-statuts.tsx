import { getTranslations } from "next-intl/server";
import { Anneau } from "@/components/admin/anneau";
import type { RepartitionAdmin } from "@/lib/audit/panneau";

/**
 * L'ANNEAU DES STATUTS DE COMMANDE — dans l'ordre et aux couleurs de la
 * maquette : en préparation, expédiées, en transit, livrées. Que des nombres :
 * aucune commande n'y est nommée, donc aucune lecture à tracer.
 */
const PARTS = [
  { cle: "preparation", trait: "var(--st-attente)" },
  { cle: "expedie", trait: "var(--adm-expedie)" },
  { cle: "enTransit", trait: "var(--st-transit)" },
  { cle: "livre", trait: "var(--st-livre)" },
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
      etiquette={t("statutsAide")}
      total={repartition.total}
      unite={t("statutsUnite")}
      part={(pourcent) => t("statutPart", { part: pourcent })}
      parts={PARTS.map((p) => ({ cle: p.cle, trait: p.trait, libelle: t(`statut.${p.cle}`), valeur: valeurs[p.cle] }))}
    />
  );
}

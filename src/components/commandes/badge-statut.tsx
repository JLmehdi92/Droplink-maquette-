import type { LigneCommande } from "@/lib/commandes/liste";

/**
 * Pastille de statut, reprise de la maquette `gestion_d_inventaire_envois` :
 * `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full` avec un point de
 * couleur devant le libellé.
 *
 * Les couleurs viennent des tokens du thème, JAMAIS de l'accent du vendeur : un
 * statut doit se lire pareil chez tout le monde. Un vendeur qui choisit un rouge
 * saturé verrait sinon « livré » et « en transit » porter la même couleur que
 * « refusé ».
 */
const TEINTES = {
  neutre: "bg-fond-neutre text-ardoise",
  pointNeutre: "bg-gris-inactif",
  info: "bg-violet-fond text-violet-encre",
  pointInfo: "bg-violet",
  succes: "bg-succes-fond text-succes",
  pointSucces: "bg-succes",
  alerte: "bg-alerte-fond-vif text-alerte",
  pointAlerte: "bg-alerte-puce",
} as const;

type Teinte = "neutre" | "info" | "succes" | "alerte";

const TEINTE_STATUT: Record<LigneCommande["statut"], Teinte> = {
  preparation: "neutre",
  expedie: "info",
  en_transit: "info",
  livre: "succes",
};

const TEINTE_QC: Record<LigneCommande["qc"], Teinte> = {
  en_attente: "neutre",
  approuve: "succes",
  refuse: "alerte",
};

function classes(teinte: Teinte): { fond: string; point: string } {
  switch (teinte) {
    case "info":
      return { fond: TEINTES.info, point: TEINTES.pointInfo };
    case "succes":
      return { fond: TEINTES.succes, point: TEINTES.pointSucces };
    case "alerte":
      return { fond: TEINTES.alerte, point: TEINTES.pointAlerte };
    case "neutre":
      return { fond: TEINTES.neutre, point: TEINTES.pointNeutre };
  }
}

export function BadgeStatut({
  libelle,
  teinte,
}: {
  readonly libelle: string;
  readonly teinte: Teinte;
}) {
  const { fond, point } = classes(teinte);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-sm text-label-sm ${fond}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${point}`} />
      {libelle}
    </span>
  );
}

export function teinteExpedition(statut: LigneCommande["statut"]): Teinte {
  return TEINTE_STATUT[statut];
}

export function teinteQc(statut: LigneCommande["qc"]): Teinte {
  return TEINTE_QC[statut];
}

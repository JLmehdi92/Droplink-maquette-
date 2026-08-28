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

/**
 * DEUX TAILLES, PARCE QUE LES DEUX PLANCHES EN DESSINENT DEUX.
 *
 *   bureau   `padding: 4px 10px`, 12 px, point de 6 px, écart de 6 px ;
 *   téléphone `padding: 3px 9px`,  11 px, point de 5 px, écart de 5 px.
 *
 * Ce n'est pas de la coquetterie : sur la carte de 390 px, la puce partage sa
 * ligne avec « 7 photos · 12 vues », et la version bureau y déborde.
 */
export function BadgeStatut({
  libelle,
  teinte,
  taille = "bureau",
}: {
  readonly libelle: string;
  readonly teinte: Teinte;
  readonly taille?: "bureau" | "telephone";
}) {
  const { fond, point } = classes(teinte);
  const petit = taille === "telephone";
  return (
    <span
      className={
        // `whitespace-nowrap` : le tableau se rétrécit désormais au lieu de
        // défiler, et « Sans mouvement · 14 j » se replierait en deux lignes
        // dans une puce arrondie de 26 px de haut.
        "inline-flex shrink-0 items-center rounded-full font-label-sm font-semibold whitespace-nowrap " +
        // La hauteur de ligne est celle du rendu naturel, comme sur la planche :
        // avec les 1,5 du corps de texte, la puce passait de 23 à 26 px.
        (petit
          ? "gap-[5px] px-[9px] py-[3px] text-[11px] leading-[1.25] "
          : "gap-1.5 px-2.5 py-1 text-[12px] leading-[1.25] ") +
        fond
      }
    >
      <span
        className={
          (petit ? "h-[5px] w-[5px] " : "h-1.5 w-1.5 ") + "shrink-0 rounded-full " + point
        }
      />
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

import { AlertTriangle, CircleCheck, CircleDot, Clock, Truck, type LucideIcon } from "lucide-react";
import type { LigneCommande } from "@/lib/commandes/liste";

/**
 * LA PASTILLE DE STATUT — le `Badge` du design system, tel que `OrdersView` le
 * pose : `padding: 7px 12px`, 12 px, gras, rayon pilule, ET UNE ICÔNE.
 *
 * ⚠️ UNE ICÔNE, PLUS UN POINT DE COULEUR. L'ancienne pastille portait une puce
 * ronde de 6 px : elle disait « il y a un statut », l'icône dit LEQUEL. C'est le
 * seul endroit de la ligne où l'information tient sans être lue.
 *
 * Les couleurs viennent des tokens du design system, JAMAIS de l'accent du
 * vendeur : un statut doit se lire pareil chez tout le monde. Un vendeur qui
 * choisit un rouge saturé verrait sinon « livré » et « en transit » porter la
 * même couleur que « bloqué ».
 *
 * ⚠️ UNE SEULE TAILLE, LÀ OÙ IL Y EN AVAIT DEUX. Les anciennes planches
 * dessinaient une pastille plus petite au téléphone (11 px) ; le design system
 * n'en dessine qu'une, et 11 px passerait sous le plancher de 11,5 px que sa
 * propre règle 5 impose. La pastille de 12 px tient sur la carte de 390 px —
 * mesuré — parce que la ligne qu'elle partage ne porte plus qu'un texte court.
 *
 * ⚠️ « PRÉPARATION » RESTE NEUTRE ALORS QUE LE KIT PEINT SON « EN ATTENTE » EN
 * AMBRE, et c'est une divergence assumée. Dans le kit, « En attente » est un
 * statut parmi cinq d'une liste de démonstration. Dans le produit, TOUTE
 * commande fraîchement créée est en préparation : peindre ce statut en ambre
 * peindrait la majorité de la liste, et noierait le seul signal qui appelle
 * vraiment un geste — « sans mouvement ». C'est la règle du produit appliquée à
 * son propre dessin : *une alerte qui se déclenche partout est une alerte qu'on
 * apprend à ignorer*.
 */

const TEINTES = {
  neutre: "bg-ds-surface-creux text-ds-texte-corps",
  info: "bg-ds-info-fond text-ds-info",
  succes: "bg-ds-succes-fond text-ds-succes-encre",
  /*
   * AMBRE, PAS ROUGE. Un colis immobile n'est pas une erreur : c'est une
   * attente qu'il faut relancer. Le rouge du design system (`ds-erreur`) est
   * réservé à ce qui a ÉCHOUÉ.
   */
  alerte: "bg-ds-alerte-fond text-ds-alerte-encre",
  /* Le lien bloqué par l'administration (168) : ce qui a ÉCHOUÉ côté client, donc le rouge. */
  erreur: "bg-ds-erreur-fond text-ds-erreur-encre",
} as const;

type Teinte = keyof typeof TEINTES;

const TEINTE_STATUT: Record<LigneCommande["statut"], Teinte> = {
  preparation: "neutre",
  expedie: "info",
  en_transit: "info",
  livre: "succes",
};

/** Les icônes de `STATUS` dans `ui_kits/seller_app/OrdersView`, portées sur nos
 *  quatre étapes plus le silence. */
const ICONE_STATUT: Record<LigneCommande["statut"], LucideIcon> = {
  preparation: Clock,
  expedie: Truck,
  en_transit: CircleDot,
  livre: CircleCheck,
};

export function BadgeStatut({
  libelle,
  teinte,
  Icone,
  compacte = false,
  largeurFixe = false,
}: {
  readonly libelle: string;
  readonly teinte: Teinte;
  readonly Icone: LucideIcon;
  /**
   * La pastille des « Dernières commandes » du tableau de bord : le `Badge` du
   * kit à 11 / 700, `padding 5px 11px`, SANS icône — la ligne porte déjà une
   * vignette, une référence et un nom.
   */
  readonly compacte?: boolean;
  /**
   * Les cartes de statut de la documentation : 104 px de large, libellé centré —
   * le `minWidth: 104` que le kit pose sur la pastille elle-même, pour que les
   * quatre textes voisins commencent à la même abscisse.
   */
  readonly largeurFixe?: boolean;
}) {
  if (compacte) {
    return (
      <span
        className={
          "inline-flex shrink-0 items-center gap-1.5 rounded-ds-pill px-[11px] py-[5px] text-[11.5px] leading-[normal] lg:text-[11px] font-bold tracking-[-0.02em] whitespace-nowrap " +
          (largeurFixe ? "min-w-[104px] justify-center " : "") +
          TEINTES[teinte]
        }
      >
        {libelle}
      </span>
    );
  }
  return (
    <span
      className={
        // `whitespace-nowrap` : le tableau se rétrécit au lieu de défiler, et
        // « Sans mouvement · 14 j » se replierait en deux lignes dans une pilule.
        "inline-flex shrink-0 items-center gap-1.5 rounded-ds-pill px-3 py-[7px] " +
        // ⚠️ -0,02em ET NON -0,01. Mesuré sur le kit servi : ses pastilles de statut
    // rendent `letter-spacing: -0.24px` à 12 px, soit -0,02em. La nôtre en
    // rendait -0,12 — quatre pixels de large en plus sur « En transit ».
    "text-[12px] leading-[1.25] font-bold tracking-[-0.02em] whitespace-nowrap " +
        TEINTES[teinte]
      }
    >
      <Icone aria-hidden="true" size={13} strokeWidth={2.2} />
      {libelle}
    </span>
  );
}

export function teinteExpedition(statut: LigneCommande["statut"]): Teinte {
  return TEINTE_STATUT[statut];
}

export function iconeExpedition(statut: LigneCommande["statut"]): LucideIcon {
  return ICONE_STATUT[statut];
}

/** Le silence n'est pas une étape de l'énumération : c'est le statut courant
 *  PLUS une durée. Son icône dit l'attente, pas l'échec. */
export const ICONE_SILENCE: LucideIcon = AlertTriangle;

import "server-only";
import type { ClientAdmin } from "@/lib/audit/comptes";
import type { EtatTache } from "@/lib/audit/panneau";

/**
 * L'ÉCRAN DE SURVEILLANCE.
 *
 * SON TITRE DE MAQUETTE EST ABANDONNÉ — « Global Logistics Health » : nous
 * n'exploitons aucune logistique. Et son CONTENU l'est presque entièrement :
 * elle affiche une disponibilité à 99,98 %, 18 245 websockets actifs, 12,4k
 * IOPS, une courbe de charge en temps réel et un flux de latences d'API. Le
 * produit ne mesure aucune de ces grandeurs, et n'a pas même de websockets.
 *
 * INVENTER UN CHIFFRE SUR L'ÉCRAN OÙ L'ON DÉCIDE EST LE PIRE ENDROIT POSSIBLE.
 * Un tableau de bord dont on découvre qu'une valeur était fausse cesse de servir
 * à quoi que ce soit — y compris pour les valeurs qui étaient vraies.
 *
 * CE QUI N'EST PAS MESURÉ EST NOMMÉ, PAS OMIS, et la liste vient de la
 * CONFIGURATION — jamais d'une valeur absente. Déduire « pas de valeur donc pas
 * mesuré » deviendrait faux le jour où une grandeur vaut légitimement zéro.
 * C'est l'inverse de la règle de la page publique, et c'est voulu : un client
 * consulte, un administrateur décide. Omettre la disponibilité lui ferait croire
 * qu'elle est surveillée.
 */

export interface Indicateur {
  /** Regroupement d'affichage : `suivi`, `limitation`. */
  readonly genre: string;
  /** Clé de traduction, jamais un libellé. */
  readonly indicateur: string;
  readonly valeur: number;
}

/**
 * Ce que le produit NE mesure PAS, et qu'il faut dire.
 *
 * La liste est ici, en dur, parce qu'elle décrit une décision et non un état :
 * chaque entrée disparaîtra le jour où un mécanisme la relèvera, et ce jour-là
 * c'est le code qui devra changer — pas une valeur en base qui pourrait dériver
 * sans que personne ne s'en aperçoive.
 */
export const NON_MESURE: readonly string[] = [
  "disponibilite",
  "latence",
  "charge_serveur",
  "erreurs_5xx",
] as const;

export interface Surveillance {
  readonly indicateurs: readonly Indicateur[];
  readonly taches: readonly EtatTache[];
  /**
   * Vrai quand AUCUNE tâche n'a jamais battu.
   *
   * TROIS ÉTATS, PAS DEUX. « Jamais déployé » n'est pas « en retard » : une
   * tâche posée ce matin n'a pas encore eu son premier passage, et la signaler
   * enverrait chercher une panne dans un mécanisme inexistant. Une alerte qui se
   * trompe est une alerte qu'on apprend à ignorer.
   */
  readonly aucuneTacheDeployee: boolean;
  readonly nonMesure: readonly string[];
}

export async function lireSurveillance(
  supabase: ClientAdmin,
  retardMinutes: number,
): Promise<Surveillance> {
  // Les deux lectures sont indépendantes : les enchaîner doublerait la latence
  // d'un écran qu'on ouvre précisément quand quelque chose semble aller mal.
  const [sante, taches] = await Promise.all([
    supabase.rpc("sante_infrastructure"),
    supabase.rpc("etat_veilleur", { p_retard_minutes: retardMinutes }),
  ]);

  // JAMAIS DE `catch` MUET, et surtout pas ici : un écran de surveillance qui
  // affiche zéro au lieu d'une erreur ferait conclure que tout va bien. C'est
  // exactement l'inverse de ce qu'il sert à établir.
  if (sante.error !== null) {
    throw new Error("lecture des indicateurs impossible : " + sante.error.message);
  }
  if (taches.error !== null) {
    throw new Error("lecture des tâches impossible : " + taches.error.message);
  }

  const lignesTaches: EtatTache[] = (taches.data ?? []).map((t) => ({
    source: t.source,
    dernierBattement: t.dernier_battement,
    minutes: Number(t.minutes),
    etat: t.etat === "en_retard" ? "en_retard" : "actif",
  }));

  return {
    indicateurs: (sante.data ?? []).map((i) => ({
      genre: i.genre,
      indicateur: i.indicateur,
      valeur: Number(i.valeur),
    })),
    taches: lignesTaches,
    aucuneTacheDeployee: lignesTaches.length === 0,
    nonMesure: NON_MESURE,
  };
}

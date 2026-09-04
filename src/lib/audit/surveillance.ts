import "server-only";
import type { ClientAdmin } from "@/lib/audit/comptes";
import type { EtatTache } from "@/lib/audit/panneau";
import { TACHES_ATTENDUES } from "@/lib/veille/taches";
import { lectureIllisible } from "@/lib/reseau/panne";

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

/**
 * LES TÂCHES DE FOND QUE LE PRODUIT DÉPLOIE.
 *
 * ⚠️ LA LISTE A DÉMÉNAGÉ dans `lib/veille/taches.ts`, et ce n'est pas du
 * rangement. Elle a désormais DEUX lecteurs — cet écran, et le veilleur qui
 * envoie les alertes. Deux copies se seraient séparées le jour où une tâche est
 * ajoutée à l'une, et la panne non vue aurait été celle que la seconde liste
 * devait couvrir. Elle est ré-exportée ici pour que les appelants existants ne
 * changent pas, jamais redéfinie.
 *
 * Ce commentaire disait aussi qu'il n'y avait qu'UNE tâche, et que la « veille
 * mutuelle entre deux planificateurs » du brief (§3, décision 11) n'était pas
 * implémentée. Elle l'est depuis les migrations 128 et 129 : `veille-mutuelle`
 * est la seconde, et l'écran la montre désormais avec son propre état.
 */
export { TACHES_ATTENDUES };

/** Une tâche telle que l'écran la montre : trois états, jamais deux. */
export interface TacheSurveillee {
  readonly source: string;
  readonly etat: "actif" | "en_retard" | "jamais_executee";
  /** Minutes depuis le dernier battement. `null` quand il n'y en a jamais eu. */
  readonly minutes: number | null;
}

/** Un jour de la frise des colis pris en charge. */
export interface JourDeColis {
  readonly jour: string;
  readonly n: number;
}

/**
 * ⚠️ TROIS SECTIONS PEUVENT VALOIR `null` — « pas lisible en ce moment ».
 *
 * Cet écran est celui qu'on ouvre PRÉCISÉMENT quand quelque chose semble aller
 * mal : le perdre entier parce qu'une de ses trois lectures a bronché est le
 * pire moment possible. La règle est celle de `lib/reseau/panne.ts`, partagée
 * avec le panneau — quatrième occurrence du même défaut, donc un seul endroit.
 */
export interface Surveillance {
  readonly indicateurs: readonly Indicateur[] | null;
  readonly taches: readonly EtatTache[] | null;
  readonly nonMesure: readonly string[];
  /**
   * Les tâches ATTENDUES, chacune avec son état — y compris jamais exécutée.
   *
   * ⚠️ `null` QUAND LES BATTEMENTS SONT ILLISIBLES, et c'est le contrôle qui
   * distingue cet écran du panneau. La jointure est menée par l'inventaire :
   * sur une liste vide, CHAQUE tâche attendue ressortirait « jamais exécutée ».
   * Sur l'écran dont tout le rôle est de dire si les planificateurs battent, ce
   * serait une alerte inventée — et *une alerte qui se trompe est une alerte
   * qu'on apprend à ignorer.*
   */
  readonly surveillees: readonly TacheSurveillee[] | null;
  readonly colisParJour: readonly JourDeColis[] | null;
}

/** Combien de jours la frise des colis couvre. La planche en dessine 14. */
export const JOURS_DE_FRISE = 14;

export async function lireSurveillance(
  supabase: ClientAdmin,
  retardMinutes: number,
): Promise<Surveillance> {
  // Les deux lectures sont indépendantes : les enchaîner doublerait la latence
  // d'un écran qu'on ouvre précisément quand quelque chose semble aller mal.
  const [sante, taches, colis] = await Promise.all([
    supabase.rpc("sante_infrastructure"),
    supabase.rpc("etat_veilleur", { p_retard_minutes: retardMinutes }),
    supabase.rpc("colis_par_jour_admin", { p_jours: JOURS_DE_FRISE }),
  ]);

  // JAMAIS DE `catch` MUET, et ce n'en est pas un : une panne de transport est
  // ÉCRITE au journal et NOMMÉE à l'écran, tandis qu'une erreur applicative
  // continue de lever. Un écran de surveillance qui afficherait zéro au lieu
  // d'une erreur ferait conclure que tout va bien, ce qui est l'inverse exact
  // de ce qu'il sert à établir.
  const santeIllisible = lectureIllisible(sante, "des indicateurs");
  const tachesIllisibles = lectureIllisible(taches, "des tâches");
  const colisIllisibles = lectureIllisible(colis, "des colis par jour");

  const lignesTaches: EtatTache[] | null = tachesIllisibles
    ? null
    : (taches.data ?? []).map((t) => ({
        source: t.source,
        dernierBattement: t.dernier_battement,
        minutes: Number(t.minutes),
        etat: t.etat === "en_retard" ? "en_retard" : "actif",
      }));

  return {
    indicateurs: santeIllisible
      ? null
      : (sante.data ?? []).map((i) => ({
          genre: i.genre,
          indicateur: i.indicateur,
          valeur: Number(i.valeur),
        })),
    taches: lignesTaches,
    nonMesure: NON_MESURE,
    // L'INVENTAIRE MÈNE LA JOINTURE, pas les battements : c'est ce qui fait
    // apparaître une tâche attendue dont aucune ligne n'existe.
    //
    // ⚠️ MAIS SEULEMENT SI LES BATTEMENTS ONT ÉTÉ LUS. Sur une lecture muette,
    // cette même jointure affirmerait « jamais exécutée » pour CHAQUE tâche
    // attendue — l'alerte inventée, sur l'écran fait pour les porter.
    surveillees:
      lignesTaches === null
        ? null
        : TACHES_ATTENDUES.map((source) => {
            const vue = lignesTaches.find((t) => t.source === source);
            return vue === undefined
              ? { source, etat: "jamais_executee" as const, minutes: null }
              : { source, etat: vue.etat, minutes: vue.minutes };
          }),
    colisParJour: colisIllisibles
      ? null
      : (colis.data ?? []).map((j) => ({ jour: j.jour, n: Number(j.n) })),
  };
}

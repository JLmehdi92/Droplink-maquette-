import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * LE PANNEAU D'ADMINISTRATION.
 *
 * LES ALERTES AVANT LES COMPTEURS. Un panneau qui enterre ses alertes sous des
 * chiffres oblige à chercher ce qui devrait sauter aux yeux — et l'ordre est
 * porté par la donnée, pas par le gabarit, pour qu'un écran futur doive le
 * changer exprès.
 *
 * LE STOCKAGE EST « INDISPONIBLE » TANT QU'ON NE SAIT PAS LE MESURER, jamais
 * « 0 o ». Zéro affirme qu'on a mesuré ; l'absence de mesure n'affirme rien.
 * Et la décision vient de la CONFIGURATION, pas de la valeur : déduire
 * « zéro donc indisponible » deviendrait faux le jour où un compte a réellement
 * zéro octet, ce qui est le cas de tout compte neuf.
 *
 * C'est l'inverse de la règle de la page publique, et c'est voulu : là-bas une
 * information absente est OMISE, ici elle est NOMMÉE. Un client consulte, un
 * administrateur décide — omettre le stockage lui ferait croire qu'il n'y a rien
 * à surveiller.
 */

/** Seuils par défaut, employés tant qu'aucun paramètre n'a été écrit. */
export const SEUIL_COLIS_DEFAUT = 1_200;
export const RETARD_VEILLEUR_MINUTES_DEFAUT = 90;

export interface Alerte {
  readonly genre: string;
  readonly gravite: "critique" | "attention";
  readonly sujet: string;
  readonly valeur: number;
  readonly seuil: number;
}

export interface CompteursAdmin {
  readonly comptes: number;
  readonly comptesActifs: number;
  readonly comptesSuspendus: number;
  readonly comptesSansType: number;
  readonly colisPrisEnChargeCeMois: number;
  readonly colisAbandonnesCeMois: number;
}

/**
 * L'état d'une tâche de fond. TROIS états, pas deux.
 *
 * `jamais-deploye` n'apparaît dans aucune ligne : c'est l'ABSENCE de ligne qui
 * le signifie, et l'appelant le déduit. Sans ce troisième état, un veilleur
 * jamais mis en service se présenterait comme « en retard », et l'on chercherait
 * une panne dans un mécanisme inexistant.
 */
export interface EtatTache {
  readonly source: string;
  readonly dernierBattement: string;
  readonly minutes: number;
  readonly etat: "actif" | "en_retard";
}

export interface Panneau {
  readonly alertes: readonly Alerte[];
  readonly compteurs: CompteursAdmin;
  readonly taches: readonly EtatTache[];
  /**
   * Vrai quand AUCUNE tâche n'a jamais battu.
   *
   * Ce n'est pas une alerte, c'est un CONSTAT : rien n'a été déployé. Le
   * distinguer d'un retard évite d'envoyer chercher une panne là où il n'y a
   * simplement rien à trouver.
   */
  readonly aucuneTacheDeployee: boolean;
  /**
   * Le stockage est-il mesurable ?
   *
   * LA RÉPONSE VIENT DE LA CONFIGURATION, jamais d'une valeur observée. Tant
   * qu'aucun mécanisme de mesure n'existe, l'écran doit écrire « indisponible ».
   */
  readonly stockageMesurable: boolean;
}

export type ClientAdmin = SupabaseClient<Database>;

export async function lirePanneau(
  supabase: ClientAdmin,
  seuils: { colis: number; retardMinutes: number },
): Promise<Panneau> {
  // Les trois lectures sont indépendantes : les enchaîner tripleraient la
  // latence du premier écran que voit un administrateur.
  const [alertes, compteurs, taches] = await Promise.all([
    supabase.rpc("alertes_admin", {
      p_seuil_colis: seuils.colis,
      p_retard_minutes: seuils.retardMinutes,
    }),
    supabase.rpc("compteurs_admin"),
    supabase.rpc("etat_veilleur", { p_retard_minutes: seuils.retardMinutes }),
  ]);

  // JAMAIS DE `catch` MUET, et surtout pas ici : un panneau qui affiche zéro
  // alerte au lieu d'une erreur ferait conclure que tout va bien.
  if (alertes.error !== null) {
    throw new Error("lecture des alertes impossible : " + alertes.error.message);
  }
  if (compteurs.error !== null) {
    throw new Error("lecture des compteurs impossible : " + compteurs.error.message);
  }
  if (taches.error !== null) {
    throw new Error("lecture des tâches impossible : " + taches.error.message);
  }

  const c = (compteurs.data ?? [])[0];
  if (c === undefined) throw new Error("compteurs illisibles : aucune ligne");

  const lignesTaches: EtatTache[] = (taches.data ?? []).map((t) => ({
    source: t.source,
    dernierBattement: t.dernier_battement,
    minutes: Number(t.minutes),
    etat: t.etat === "en_retard" ? "en_retard" : "actif",
  }));

  return {
    alertes: (alertes.data ?? []).map((a) => ({
      genre: a.genre,
      gravite: a.gravite === "critique" ? "critique" : "attention",
      sujet: a.sujet,
      valeur: Number(a.valeur),
      seuil: Number(a.seuil),
    })),
    compteurs: {
      comptes: Number(c.comptes),
      comptesActifs: Number(c.comptes_actifs),
      comptesSuspendus: Number(c.comptes_suspendus),
      comptesSansType: Number(c.comptes_sans_type),
      colisPrisEnChargeCeMois: Number(c.colis_pris_en_charge_ce_mois),
      colisAbandonnesCeMois: Number(c.colis_abandonnes_ce_mois),
    },
    taches: lignesTaches,
    aucuneTacheDeployee: lignesTaches.length === 0,
    // AUCUN MÉCANISME DE MESURE DU STOCKAGE N'EXISTE ENCORE. La valeur est donc
    // « indisponible », et elle le restera tant que ce drapeau ne changera pas —
    // pas tant qu'un compte affichera zéro. Il arrivera avec le lot des médias,
    // qui apportera le relevé des tailles réelles côté serveur.
    stockageMesurable: false,
  };
}

/** Lit les seuils configurés, ou rend les défauts. */
export async function lireSeuils(
  supabase: ClientAdmin,
): Promise<{ colis: number; retardMinutes: number }> {
  const [colis, retard] = await Promise.all([
    supabase.rpc("lire_parametre_entier", {
      p_cle: "seuil_colis_par_compte",
      p_defaut: SEUIL_COLIS_DEFAUT,
    }),
    supabase.rpc("lire_parametre_entier", {
      p_cle: "retard_veilleur_minutes",
      p_defaut: RETARD_VEILLEUR_MINUTES_DEFAUT,
    }),
  ]);

  // UNE LECTURE EN ÉCHEC RETOMBE SUR LE DÉFAUT plutôt que de casser l'écran :
  // un seuil est un réglage, pas une autorisation. Le raisonnement serait
  // inverse pour une garde, où l'échec doit refuser.
  return {
    colis: colis.error === null && colis.data !== null ? Number(colis.data) : SEUIL_COLIS_DEFAUT,
    retardMinutes:
      retard.error === null && retard.data !== null
        ? Number(retard.data)
        : RETARD_VEILLEUR_MINUTES_DEFAUT,
  };
}

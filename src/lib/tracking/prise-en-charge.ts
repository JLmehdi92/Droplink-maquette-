import "server-only";
import { creerClientSysteme } from "@/lib/supabase/system";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { dixSeptTrack } from "./provider/dix-sept-track";
import { ingererEtat } from "./ingestion";

/**
 * LA PRISE EN CHARGE D'UN NUMÉRO CHEZ LE FOURNISSEUR.
 *
 * C'EST LE SEUL GESTE QUI SE PAIE. Le fournisseur facture à la prise en charge,
 * pas à l'interrogation : appeler cette fonction une fois de trop, c'est payer
 * une fois de trop. Elle n'est donc appelée QUE quand la base a dit qu'elle
 * venait de créer la ligne — et cette décision est prise par un seul ordre SQL,
 * pas par un « lire puis écrire » que deux sauvegardes simultanées feraient
 * doubler.
 *
 * ELLE NE LÈVE JAMAIS. Un vendeur qui colle un numéro de suivi enregistre sa
 * commande ; que notre fournisseur soit injoignable ne doit pas transformer sa
 * sauvegarde en erreur. L'échec est enregistré, pas propagé.
 *
 * PREMIÈRE INTERROGATION IMMÉDIATE, ET C'EST DÉLIBÉRÉ. Un vendeur qui colle un
 * numéro et ne voit rien pendant quatre heures conclut que ça ne marche pas — et
 * il a raison de le conclure, puisque rien ne le détrompe.
 */

export type ResultatPriseEnCharge =
  | { readonly statut: "pris-en-charge"; readonly avecEtat: boolean }
  | { readonly statut: "refuse"; readonly motif: string }
  | { readonly statut: "indisponible"; readonly motif: string };

export async function prendreEnCharge(
  parcelId: string,
  numero: string,
  transporteur: number | null,
): Promise<ResultatPriseEnCharge> {
  const systeme = creerClientSysteme();

  /*
   * L'INTERRUPTEUR PASSE AVANT L'APPEL PAYANT, et il est posé ICI parce que
   * c'est le seul endroit par lequel les DEUX chemins passent : le numéro que le
   * vendeur vient de coller, et la reprise de la tâche de fond. Le poser dans la
   * cadence seule aurait laissé la dépense ouverte par le geste le plus
   * fréquent — et l'écran d'administration aurait annoncé une coupure qui ne
   * coupait que la moitié.
   *
   * `indisponible` ET NON `refuse` : rien n'est marqué, `registered_at` reste
   * nulle, et le colis est donc repris tel quel le jour où l'on rouvre. Un refus
   * aurait abandonné le suivi pour de bon — une décision d'exploitation
   * deviendrait une perte de données pour le vendeur.
   *
   * ⚠️ EN CAS D'ÉCHEC DE LECTURE, ON LAISSE COURIR. Le défaut de la fonction en
   * base est déjà « ouvert » ; le répéter ici évite qu'une base momentanément
   * illisible coupe le suivi de tout le monde en silence. Couper serait le choix
   * prudent pour la facture et le pire pour le produit, et personne ne verrait
   * la différence entre les deux avant des semaines.
   */
  const { data: actif, error: erreurInterrupteur } = await systeme.rpc("lire_suivi_actif");
  if (erreurInterrupteur !== null) {
    console.error(
      "[suivi] interrupteur illisible, prise en charge laissée ouverte — " +
        erreurInterrupteur.message,
    );
  } else if (actif === false) {
    return { statut: "indisponible", motif: "interrupteur-coupe" };
  }

  const inscription = await dixSeptTrack
    .prendreEnCharge(numero, transporteur)
    .catch(() => ({ statut: "indisponible" as const, motif: "exception" }));

  if (inscription.statut === "refuse") {
    // REFUSÉ POUR DE BON — numéro invalide, transporteur indétectable. On
    // abandonne le suivi TOUT DE SUITE plutôt que de le réessayer seize fois :
    // un refus de forme ne devient pas vrai en insistant, et chaque tentative
    // se paie.
    const { error: erreurMarque } = await systeme.rpc("marquer_prise_en_charge", {
      p_parcel_id: parcelId,
      p_abandonne: true,
    });

    // L'ERREUR ÉTAIT JETÉE ICI. Émettre « suivi abandonné » sans que l'abandon
    // soit écrit produit un colis toujours actif que nos compteurs déclarent
    // mort : il continuera d'être interrogé — donc payé — et il ne figurera plus
    // dans ce qu'on regarde pour s'en apercevoir.
    if (erreurMarque !== null) {
      console.error(
        "[suivi] abandon à la prise en charge non écrit pour " +
          numero.slice(0, 4) +
          " — " +
          erreurMarque.message,
      );
      return { statut: "indisponible", motif: "abandon-non-ecrit" };
    }

    await emettre(
      EVENEMENTS.SUIVI_ABANDONNE,
      { sujet: "suivi:" + numero.slice(0, 4) },
      { motif: inscription.motif, a_la_prise_en_charge: true },
    );
    return { statut: "refuse", motif: inscription.motif };
  }

  if (inscription.statut === "indisponible") {
    // PAS ABANDONNÉ. Une panne réseau n'est pas un numéro invalide : la tâche de
    // fond reprendra. Rien n'est marqué, donc rien n'est perdu — c'est
    // exactement pour cela que `registered_at` reste nulle.
    return { statut: "indisponible", motif: inscription.motif };
  }

  const { error: erreurPriseEnCharge } = await systeme.rpc("marquer_prise_en_charge", {
    p_parcel_id: parcelId,
    p_abandonne: false,
  });

  // Le fournisseur a bien pris le numéro — donc c'est payé — mais notre trace ne
  // s'est pas écrite. On le NOMME et on continue : `registered_at` restée nulle
  // fera reprendre la cadence, ce qui est le comportement correct. Le taire
  // laisserait croire à une prise en charge complète.
  if (erreurPriseEnCharge !== null) {
    console.error(
      "[suivi] prise en charge payée mais non enregistrée pour " +
        numero.slice(0, 4) +
        " — " +
        erreurPriseEnCharge.message,
    );
  }

  await emettre(
    EVENEMENTS.COLIS_PRIS_EN_CHARGE,
    { sujet: "suivi:" + numero.slice(0, 4) },
    { transporteur: transporteur ?? -1 },
  );

  // L'INTERROGATION IMMÉDIATE. Elle est séparée de la prise en charge parce que
  // celle-ci ne rend pas l'état du colis : elle l'enregistre. Sans ce second
  // appel, l'écran resterait vide jusqu'au premier passage de la tâche de fond.
  const etat = await dixSeptTrack
    .interroger(numero, transporteur)
    .catch(() => ({ statut: "indisponible" as const, motif: "exception" }));

  const ingestion = await ingererEtat(numero, etat);

  return { statut: "pris-en-charge", avecEtat: ingestion.statut === "applique" };
}

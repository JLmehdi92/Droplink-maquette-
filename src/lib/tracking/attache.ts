import "server-only";
import { after } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { prendreEnCharge } from "./prise-en-charge";

/**
 * L'ATTACHE D'UN COLIS À UNE COMMANDE, déclenchée par la saisie du numéro.
 *
 * DEUX TEMPS, ET C'EST TOUT L'INTÉRÊT :
 *
 *  1. LA BASE attache le colis et dit s'il vient d'être CRÉÉ. Ce booléen décide
 *     si l'on paie une prise en charge, et il est produit par un seul ordre SQL —
 *     un « lire puis écrire » côté application ferait payer deux fois sur un
 *     double clic.
 *  2. L'APPEL AU FOURNISSEUR part APRÈS LA RÉPONSE, par `after()`. Le vendeur
 *     tape son numéro et voit « enregistré » tout de suite ; il n'attend pas les
 *     douze secondes que le fournisseur peut mettre à répondre. Sans cela, la
 *     sauvegarde automatique de l'éditeur — celle qui se déclenche 800 ms après
 *     la frappe — deviendrait le geste le plus lent du produit.
 *
 * `after()` s'exécute une fois la réponse envoyée, dans le même processus. Ce
 * n'est PAS une file d'attente : si le processus est gelé avant, le travail est
 * perdu. C'est acceptable ICI et seulement ici, parce que la tâche de fond
 * reprendra le colis — `registered_at` restée nulle est précisément le signal
 * qui le lui dira. Aucun événement d'usage ne dépend de ce chemin.
 */

type ClientAttache = Awaited<ReturnType<typeof creerClientServeur>>;

export type ResultatAttache =
  | { readonly statut: "attache"; readonly parcelId: string; readonly nouveau: boolean }
  | { readonly statut: "detache" }
  | { readonly statut: "echec"; readonly motif: string };

export async function attacherColis(
  supabase: ClientAttache,
  orderId: string,
): Promise<ResultatAttache> {
  // Le numéro est RELU EN BASE, jamais repris de l'appelant : c'est la valeur
  // qui vient d'être écrite qui fait foi, et elle a pu être normalisée ou
  // refusée en chemin. Prendre en charge un numéro que la base n'a pas retenu
  // serait payer pour un colis qui n'existe pas.
  const { data: commande, error: lecture } = await supabase
    .from("orders")
    .select("tracking_number, carrier_code")
    .eq("id", orderId)
    .maybeSingle();

  if (lecture !== null || commande === null) return { statut: "echec", motif: "lecture" };

  const numero = (commande.tracking_number ?? "").trim();
  const transporteur = (commande.carrier_code ?? "").trim();

  const { data, error } = await supabase.rpc("attacher_colis", {
    p_order_id: orderId,
    p_numero: numero,
    p_transporteur: transporteur,
  });

  if (error !== null) return { statut: "echec", motif: error.code ?? "ecriture" };

  const ligne = Array.isArray(data) ? data[0] : null;
  if (ligne === null || ligne === undefined || ligne.parcel_id === null) {
    // Numéro effacé : le colis est détaché, pas supprimé. Il garde ses points de
    // passage, qu'une autre commande peut porter — le groupage est le cas normal.
    return { statut: "detache" };
  }

  const parcelId = ligne.parcel_id;
  const nouveau = ligne.cree === true;

  if (nouveau) {
    // LE SEUL ENDROIT DU PRODUIT QUI DÉPENSE DE L'ARGENT. Il est franchi
    // uniquement quand la BASE a dit que la ligne venait d'être créée.
    const brut = transporteur === "" ? null : Number.parseInt(transporteur, 10);
    const codeTransporteur = brut === null || Number.isNaN(brut) ? null : brut;

    try {
      after(async () => {
        await prendreEnCharge(parcelId, numero, codeTransporteur);
      });
    } catch (erreur) {
      // `after()` LÈVE hors d'un contexte de requête. Ça n'arrive pas depuis une
      // Server Action, mais ça arrive depuis un test ou un script — et un appel
      // au fournisseur ne doit JAMAIS faire échouer la sauvegarde d'un vendeur.
      //
      // La reprise est déjà prévue et n'est pas une consolation : `registered_at`
      // reste nulle, ce qui est exactement le signal que la tâche de fond
      // attend. Rien n'est perdu, la prise en charge est seulement différée.
      console.warn(
        "[suivi] prise en charge non programmée (hors contexte de requête) : " +
          (erreur instanceof Error ? erreur.message : String(erreur)) +
          ". La tâche de fond la reprendra — `registered_at` est restée nulle.",
      );
    }
  }

  return { statut: "attache", parcelId, nouveau };
}

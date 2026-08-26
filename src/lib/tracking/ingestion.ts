import "server-only";
import { creerClientSysteme } from "@/lib/supabase/system";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { assemblerPassages } from "./checkpoints";
import { normaliser } from "./normalize";
import type { ReponsePort } from "./provider/port";

/**
 * L'INGESTION D'UN ÉTAT DE COLIS.
 *
 * Elle est appelée par DEUX chemins — la notification poussée par le
 * transporteur et la tâche de fond qui interroge — et c'est exactement pour cela
 * qu'elle existe : deux chemins qui écriraient chacun leur version finiraient
 * par diverger, et la divergence ne se verrait que chez le client.
 *
 * LE CLIENT SYSTÈME, pas le client admin. `system.ts` sert les chemins SANS
 * HUMAIN : un webhook n'est personne. L'auditer noierait les vraies
 * consultations humaines de données de tiers, qui sont ce que l'audit doit
 * rendre visible.
 *
 * ELLE NE DÉCIDE PAS DU RECUL. L'étape candidate est calculée à partir des
 * seules données du fournisseur, en partant du bas ; c'est la BASE qui applique
 * `greatest(actuel, candidat)`. Une règle applicative peut être oubliée dans un
 * nouveau chemin de code — une règle en base ne peut pas l'être.
 */

export type ResultatIngestion =
  | { readonly statut: "applique"; readonly colis: number; readonly inconnu: boolean }
  | { readonly statut: "vide"; readonly colis: number }
  | { readonly statut: "ignore"; readonly motif: string };

export async function ingererEtat(
  numero: string,
  reponse: ReponsePort,
  /**
   * Empreinte de la notification reçue, pour n'en tenir compte qu'une fois.
   *
   * ABSENTE POUR LA CADENCE, ET C'EST DÉLIBÉRÉ. Nous interrogeons alors de notre
   * propre initiative, et recevoir deux fois la même réponse pour un colis qui
   * n'a pas bougé est le cas NORMAL — c'est même la définition d'un colis bloqué
   * en douane. Dédupliquer là empêcherait `query_count` d'avancer, donc la
   * fenêtre d'abandon de se fermer, donc ferait interroger ce colis pour
   * toujours, à nos frais.
   */
  empreinteNotification?: string,
): Promise<ResultatIngestion> {
  const propre = numero.trim();
  if (propre === "") return { statut: "ignore", motif: "numero-vide" };

  const systeme = creerClientSysteme();

  if (empreinteNotification !== undefined && empreinteNotification !== "") {
    const { data: dejaVue, error: erreurVue } = await systeme.rpc("notification_deja_vue", {
      p_cle: empreinteNotification,
    });

    // FAIL-CLOSED SUR LE COMPTEUR DE COÛT. Si la déduplication est indisponible,
    // on n'ingère pas : traiter quand même reviendrait à rouvrir exactement le
    // défaut qu'on vient de fermer, et le fournisseur réémettra. Refuser coûte
    // un retard ; accepter coûte de l'argent, sans trace de la raison.
    if (erreurVue !== null) return { statut: "ignore", motif: "deduplication-indisponible" };
    if (dejaVue === true) return { statut: "ignore", motif: "rejeu" };
  }

  if (reponse.statut === "vide") {
    // FACTURÉ MAIS SANS EFFET. Le compteur avance — c'est le seul poste de coût
    // variable du produit — et rien d'autre ne bouge. Un numéro fraîchement
    // collé n'est simplement pas encore scanné.
    const { data, error } = await systeme.rpc("compter_interrogation_vide", { p_numero: propre });
    if (error !== null) return { statut: "ignore", motif: "ecriture" };

    await emettre(EVENEMENTS.INTERROGATION_VIDE, { sujet: "suivi:" + propre.slice(0, 4) });
    return { statut: "vide", colis: data ?? 0 };
  }

  if (reponse.statut !== "ok") return { statut: "ignore", motif: reponse.statut };

  const passages = assemblerPassages(
    reponse.etat.points.map((p) => ({
      instant: p.instant,
      description: p.description,
      lieu: p.lieu,
      etape: p.etape,
    })),
  );

  // Calculée DEPUIS LE BAS : cette valeur est un candidat, pas une décision. La
  // base la compare à l'existant et garde la plus avancée.
  const { etape, inconnu } = normaliser("preparation", {
    statut: reponse.etat.statutBrut,
    jalons: reponse.etat.jalons,
  });

  const { data, error } = await systeme.rpc("appliquer_etat_colis", {
    p_numero: propre,
    p_etape: etape,
    p_statut_brut: reponse.etat.statutBrut ?? "",
    // La chaîne vide vaut absence : une signature Postgres ne dit rien de la
    // nullité de ses arguments, et le générateur de types les décrit tous comme
    // non nuls. La convention est la même que pour `enregistrer_vue`.
    p_transporteur: reponse.etat.transporteur === null ? "" : String(reponse.etat.transporteur),
    p_points: passages.points.map((p) => ({
      instant: p.instant.toISOString(),
      description: p.description,
      lieu: p.lieu ?? "",
      etape: p.etape ?? "",
    })),
    p_estimation_du: reponse.etat.estimationDu ?? "",
    p_estimation_au: reponse.etat.estimationAu ?? "",
    p_brut: reponse.brut as never,
    /*
     * LE DÉPART RÉEL, calculé AVANT le plafond d'affichage.
     *
     * `assemblerPassages` borne la liste à trente points — sans quoi la page
     * publique d'un colis parti d'Asie porte quarante lignes dont trente-cinq
     * disent la même chose. Le plafond garde les plus RÉCENTES, donc il coupe
     * justement celle qui date le départ.
     *
     * Cette valeur était CALCULÉE PUIS JETÉE ICI, et la base recalculait le
     * minimum depuis la table tronquée. Mesuré sur quarante points : dix jours
     * d'écart, rendus au client. Le module pur avait raison depuis le début ;
     * c'est l'appelant qui perdait son travail.
     */
    p_premier_mouvement:
      passages.premierMouvement === null ? "" : passages.premierMouvement.toISOString(),
  });

  if (error !== null) return { statut: "ignore", motif: "ecriture" };

  const colis = data ?? 0;

  if (colis > 0) {
    /*
     * CE POINT N'ÉMET PLUS « COLIS PRIS EN CHARGE », ET C'EST UNE CORRECTION DE
     * COMPTEUR, PAS DE STYLE.
     *
     * L'ingestion est appelée à CHAQUE passage de cadence et à chaque
     * notification poussée. Émettre ici la prise en charge faisait compter les
     * INTERROGATIONS — un colis long en produit des dizaines — sous le nom du
     * seul geste que le fournisseur facture. Le compteur qui devait dire si le
     * coût variable du produit tient mesurait autre chose, en le surestimant.
     * La vraie prise en charge est émise une fois, dans `prise-en-charge.ts`.
     *
     * « Premier scan » était pire encore : il était choisi quand l'étape valait
     * « livré ». Il comptait donc des LIVRAISONS. Ce que cette fonction sait,
     * c'est l'étape atteinte — jamais la transition, que la base calcule sans
     * la lui rendre. On nomme donc ce qu'on observe.
     *
     * Le numéro de suivi NE PART PAS vers l'analytics : c'est une donnée du
     * client d'un vendeur, et quatre caractères suffisent à relier deux
     * événements entre eux sans identifier personne.
     */
    await emettre(
      EVENEMENTS.ETAPE_FRANCHIE,
      { sujet: "suivi:" + propre.slice(0, 4) },
      { etape, colis, statut_inconnu: inconnu },
    );
  }

  // UN STATUT NON TRADUIT EST NOMMÉ, pas avalé. Le fournisseur peut ajouter une
  // valeur demain sans nous prévenir, et le seul moment où on peut s'en
  // apercevoir est celui-ci.
  if (inconnu) {
    console.warn(
      "[suivi] statut non traduit reçu du fournisseur : " +
        JSON.stringify(reponse.etat.statutBrut) +
        ". Le colis n'a pas bougé d'étape — la valeur brute est conservée en base.",
    );
  }

  return { statut: "applique", colis, inconnu };
}

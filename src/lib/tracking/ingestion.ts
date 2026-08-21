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
): Promise<ResultatIngestion> {
  const propre = numero.trim();
  if (propre === "") return { statut: "ignore", motif: "numero-vide" };

  const systeme = creerClientSysteme();

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
  });

  if (error !== null) return { statut: "ignore", motif: "ecriture" };

  const colis = data ?? 0;

  if (colis > 0) {
    // Émis APRÈS l'écriture. Le numéro de suivi NE PART PAS vers l'analytics :
    // c'est une donnée du client d'un vendeur, et quatre caractères suffisent à
    // relier deux événements entre eux sans identifier personne.
    await emettre(
      etape === "livre" ? EVENEMENTS.PREMIER_SCAN : EVENEMENTS.COLIS_PRIS_EN_CHARGE,
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

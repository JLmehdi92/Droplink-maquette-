import "server-only";
import { celluleCsv } from "@/lib/commandes/export-csv";
import { lireTransporteur } from "@/lib/tracking/transporteurs";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * L'EXPORT CSV DES COLIS DU VENDEUR CONNECTÉ.
 *
 * ⚠️ IL NE PORTE AUCUN LIEN PUBLIC, ET C'EST LA DIFFÉRENCE QUI LE REND
 * ACCEPTABLE. L'export des COMMANDES sort les `public_token` — il est donc
 * plafonné, compté, et son écran affiche un avertissement au téléchargement,
 * parce qu'un lien public transfère une CAPACITÉ, définitivement (décision 15).
 * Celui-ci sort un numéro de suivi, un transporteur, un état et des dates :
 * rien qui donne accès à quoi que ce soit. Le numéro de suivi est déjà connu du
 * transporteur et du client.
 *
 * C'est pour cette raison que la case à cocher de l'écran Envois existe : une
 * case est la promesse d'une action groupée, et celle-ci est la seule qui ne
 * coûte rien et n'ouvre aucune capacité. « Resynchroniser » dépenserait le
 * palier de prises en charge à vie ; « archiver » n'a pas de sens sur un colis,
 * qui peut porter plusieurs commandes.
 *
 * LA LECTURE SE FAIT SOUS RLS, AVEC LA SESSION. Employer le service-role ici
 * produirait un fichier contenant les colis de tous les vendeurs, qui SORT de
 * l'application.
 */

const COLONNES = [
  "numero_de_suivi",
  "transporteur",
  "etat",
  "commandes_liees",
  "premier_mouvement",
  "dernier_mouvement",
  "dernier_point",
  "interrogations",
] as const;

/**
 * ⚠️ LE MÊME PLAFOND QUE L'EXPORT DES COMMANDES, et pour la même raison : un
 * fichier sans borne se construit ENTIÈREMENT en mémoire avant d'être envoyé.
 * À 9 600 colis, ce n'est pas le disque du vendeur qui souffre, c'est le
 * serveur qui les assemble.
 */
const PLAFOND_LIGNES = 5000;

export interface ResultatExportEnvois {
  readonly csv: string;
  readonly lignes: number;
  readonly tronque: boolean;
}

/**
 * @param selection identifiants cochés. Vide = tout ce que le vendeur possède.
 *
 * ⚠️ UNE SÉLECTION VIDE EXPORTE TOUT, ET CE N'EST PAS UN PIÈGE : le bouton
 * n'apparaît que lorsqu'une case est cochée — la barre de lot est révélée par
 * `:has(:checked)`, en CSS. Une sélection vide ne peut donc arriver que d'une
 * URL forgée à la main, et le comportement le plus sûr y est d'exporter ce que
 * l'appelant possède déjà, sous RLS, plutôt que de rendre un fichier vide qu'il
 * prendrait pour une perte de données.
 */
export async function exporterEnvois(
  selection: readonly string[],
): Promise<ResultatExportEnvois> {
  const supabase = await creerClientServeur();

  let requete = supabase
    .from("tracked_parcels")
    .select(
      "tracking_number, carrier_code, normalized_status, first_movement_at, last_movement_at, dernier_point, query_count, order_parcels(orders(customer_label))",
    )
    .order("updated_at", { ascending: false })
    .limit(PLAFOND_LIGNES + 1);

  if (selection.length > 0) requete = requete.in("id", selection);

  const { data, error } = await requete;
  if (error !== null || data === null) {
    throw new Error("export des envois impossible : " + (error?.message ?? "réponse vide"));
  }

  const tronque = data.length > PLAFOND_LIGNES;
  const lignes = tronque ? data.slice(0, PLAFOND_LIGNES) : data;

  const corps = lignes.map((l) => {
    const clients = l.order_parcels
      .map((op) => op.orders?.customer_label ?? null)
      .filter((n): n is string => n !== null && n.trim() !== "");
    return [
      celluleCsv(l.tracking_number),
      celluleCsv(lireTransporteur(l.carrier_code)?.nom ?? null),
      celluleCsv(l.normalized_status),
      celluleCsv(clients.join(" · ")),
      celluleCsv(l.first_movement_at),
      celluleCsv(l.last_movement_at),
      celluleCsv(l.dernier_point),
      celluleCsv(l.query_count),
    ].join(",");
  });

  return {
    /* ⚠️ LE BOM EST OBLIGATOIRE. Sans lui, Excel lit le fichier en ANSI et rend
       « Crème » en « CrÃ¨me » — sur la colonne qui porte les pseudos des clients,
       donc exactement là où le vendeur reconnaît ses commandes. */
    csv: "﻿" + [COLONNES.join(","), ...corps].join("\r\n") + "\r\n",
    lignes: lignes.length,
    tronque,
  };
}

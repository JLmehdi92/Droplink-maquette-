import "server-only";
import { lienPageClient } from "@/lib/liens/page-client";
import type { ClientLecture } from "@/lib/commandes/liste";
import { referenceCourte } from "@/lib/commandes/reference";

/**
 * « EXPORTER MES DONNÉES » — tout ce que le compte a produit, dans un fichier.
 *
 * LU SOUS RLS, AVEC LA SESSION DU VENDEUR, jamais par le client de service : un
 * export produit un fichier qui SORT de l'application, c'est le pire endroit où
 * contourner l'isolation. Chaque requête ne voit que les lignes du vendeur, et
 * ce module n'écrit aucun filtre de propriété qui pourrait être faux.
 *
 * ⚠️ CE QUI N'EST PAS DANS LE FICHIER, ET POURQUOI — la liste est la règle :
 *  - `internal_notes` : la DÉCISION 15 du brief, verrouillée. Elles portent le
 *    prix d'achat, et « le vendeur ne décide pas de la fuite, il décide d'un
 *    export — deux gestes différents, parfois séparés de plusieurs mois ». Le
 *    kit dessine un export de « toutes vos données » ; le produit gagne.
 *  - `notify_email` : l'adresse du CLIENT FINAL, pas celle du vendeur. Un
 *    fichier qui circule n'a pas à emporter les adresses de ses clients.
 *  - `unsubscribe_token` : une CAPACITÉ, celle de désabonner le client.
 *  - `ip_hash`, `user_agent_hash` des vues : des empreintes de visiteurs, qui
 *    ne décrivent pas le vendeur et se recoupent entre fichiers.
 *  - les clés de stockage R2 et les réponses brutes du transporteur : de la
 *    mécanique interne, pas des données du compte.
 *
 * ⚠️ LE LIEN PUBLIC Y EST, comme dans le CSV des commandes et pour la même
 * raison : c'est ce que le vendeur envoie. Il transfère une capacité — la route
 * porte donc le même plafond de débit que l'export CSV, et l'écran le dit.
 *
 * BORNÉ : au-delà de `PLAFOND_COMMANDES`, le fichier le dit (`tronque`) plutôt
 * que de faire tomber le serveur. Le plafond couvre la volumétrie visée par le
 * brief — 9 600 commandes pour un seul vendeur.
 */

const PAGE = 1000;
export const PLAFOND_COMMANDES = 10_000;

async function toutLire<T>(
  lire: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  plafond: number,
): Promise<{ lignes: T[]; tronque: boolean }> {
  const lignes: T[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await lire(de, de + PAGE - 1);
    if (error !== null) throw new Error("export des données : " + error.message);
    const page = data ?? [];
    lignes.push(...page);
    if (lignes.length >= plafond) return { lignes: lignes.slice(0, plafond), tronque: true };
    if (page.length < PAGE) return { lignes, tronque: false };
  }
}

/** Par paquets d'identifiants : une URL PostgREST ne porte pas dix mille UUID. */
async function parPaquets<T>(
  ids: readonly string[],
  lire: (paquet: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const lignes: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await lire(ids.slice(i, i + 200));
    if (error !== null) throw new Error("export des données : " + error.message);
    lignes.push(...(data ?? []));
  }
  return lignes;
}

export type ExportDonnees = {
  readonly format: "droplink-export-1";
  readonly genereLe: string;
  readonly tronque: boolean;
  readonly exclus: readonly string[];
  readonly compte: unknown;
  readonly boutique: unknown;
  readonly commandes: readonly unknown[];
  readonly colis: readonly unknown[];
};

export async function exporterDonnees(
  supabase: ClientLecture,
  origine: string,
  /** Le nom de lien de la boutique, `null` si aucun n'a ete pose. */
  nomDeLien: string | null,
): Promise<ExportDonnees> {
  const [compte, boutique] = await Promise.all([
    supabase.from("profiles").select("email, nom_affiche, account_type, locale, created_at").single(),
    supabase
      .from("shops")
      .select(
        "name, description, accent_color, default_language, watermark_enabled, instagram_url, tiktok_url, whatsapp_url, site_url, created_at",
      )
      .single(),
  ]);
  if (compte.error !== null) throw new Error("export des données : " + compte.error.message);
  if (boutique.error !== null) throw new Error("export des données : " + boutique.error.message);

  const { lignes: commandes, tronque } = await toutLire(
    (de, a) =>
      supabase
        .from("orders")
        .select(
          "id, public_token, customer_label, product_ref, tracking_number, carrier_code, status, qc_status, views_count, last_viewed_at, created_at, updated_at, archived_at",
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(de, a),
    PLAFOND_COMMANDES,
  );
  const ids = commandes.map((c) => c.id);

  const [medias, evenements, vues, rattachements] = await Promise.all([
    parPaquets(ids, (p) =>
      supabase
        .from("order_media")
        .select("order_id, type, position, largeur, hauteur, taille_octets, duree_s, source, created_at")
        .in("order_id", p)
        .order("position"),
    ),
    parPaquets(ids, (p) =>
      supabase.from("order_events").select("order_id, type, actor, occurred_at").in("order_id", p).order("occurred_at"),
    ),
    parPaquets(ids, (p) =>
      supabase.from("link_views").select("order_id, viewed_on, country").in("order_id", p).order("viewed_on"),
    ),
    parPaquets(ids, (p) => supabase.from("order_parcels").select("order_id, parcel_id").in("order_id", p)),
  ]);

  const { lignes: colis } = await toutLire(
    (de, a) =>
      supabase
        .from("tracked_parcels")
        .select(
          "id, tracking_number, carrier_code, normalized_status, registered_at, first_movement_at, last_movement_at, estimated_from, estimated_to, abandoned_at",
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(de, a),
    PLAFOND_COMMANDES,
  );
  const points = await parPaquets(
    colis.map((c) => c.id),
    (p) =>
      supabase
        .from("parcel_checkpoints")
        .select("parcel_id, occurred_at, location, description, stage")
        .in("parcel_id", p)
        .order("occurred_at"),
  );

  // L'identifiant interne d'un colis ne sort pas : il ne sert qu'à rattacher.
  const numeroDuColis = new Map(colis.map((c) => [c.id, c.tracking_number]));
  const grouper = <T extends { order_id: string }>(lignes: readonly T[]) => {
    const parCommande = new Map<string, Omit<T, "order_id">[]>();
    for (const { order_id, ...reste } of lignes) {
      const liste = parCommande.get(order_id) ?? [];
      liste.push(reste);
      parCommande.set(order_id, liste);
    }
    return parCommande;
  };
  const mediasPar = grouper(medias);
  const evenementsPar = grouper(evenements);
  const vuesPar = grouper(vues);
  const colisPar = new Map<string, string[]>();
  for (const r of rattachements) {
    const numero = numeroDuColis.get(r.parcel_id);
    if (numero === undefined) continue;
    colisPar.set(r.order_id, [...(colisPar.get(r.order_id) ?? []), numero]);
  }
  const pointsPar = new Map<string, Omit<(typeof points)[number], "parcel_id">[]>();
  for (const { parcel_id, ...reste } of points) {
    pointsPar.set(parcel_id, [...(pointsPar.get(parcel_id) ?? []), reste]);
  }

  return {
    format: "droplink-export-1",
    genereLe: new Date().toISOString(),
    tronque,
    exclus: ["notes_internes", "email_de_notification_du_client", "jetons_de_desabonnement", "empreintes_des_visiteurs"],
    compte: compte.data,
    boutique: boutique.data,
    commandes: commandes.map(({ id, public_token, ...c }) => ({
      reference: referenceCourte(id),
      lien_public: lienPageClient(origine, public_token, nomDeLien),
      ...c,
      colis: colisPar.get(id) ?? [],
      medias: mediasPar.get(id) ?? [],
      evenements: evenementsPar.get(id) ?? [],
      vues: vuesPar.get(id) ?? [],
    })),
    colis: colis.map(({ id, ...c }) => ({ ...c, points_de_passage: pointsPar.get(id) ?? [] })),
  };
}

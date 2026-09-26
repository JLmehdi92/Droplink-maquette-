import { z } from "zod";

/**
 * LE QUOTA DE COMMANDES ATTEINT — reconnu, puis dit au vendeur.
 *
 * ⚠️ TROUVÉ EN CLIQUANT TOUT LE SAAS, LE 26/09/2026. La base refuse une commande de
 * trop avec un code à elle — `DL067` pour le quota À VIE d'un compte gratuit
 * (migrations 175-176, 192), `DL035` pour le plafond MENSUEL (095, 192) —, et le
 * produit ne le reconnaissait nulle part :
 *  - « Créer une commande » levait une erreur brute : le vendeur gratuit, au moment
 *    précis où l'offre Pro le concerne, recevait une page d'erreur ;
 *  - « Dupliquer » rangeait le refus parmi les pannes d'écriture et revenait à la
 *    liste sans un mot — le bouton semblait ne rien faire.
 *
 * Le refus revient désormais à la liste des commandes par l'URL (`?quota=…`), où un
 * bandeau le dit en clair (planche `OrdersView`, `#quota-atteint`, `#quota-mensuel`).
 * Aucune autre erreur n'emprunte ce chemin : une panne reste une panne.
 */
export const QUOTAS_ATTEINTS = ["gratuit", "mensuel"] as const;
export type QuotaAtteint = (typeof QUOTAS_ATTEINTS)[number];

/**
 * ENSEMBLE FERMÉ, comme le résultat d'un lot : la valeur vient de la barre d'adresse
 * et choisit une clé de traduction. Une valeur inconnue n'affiche rien.
 */
export const EtatQuota = z.enum(QUOTAS_ATTEINTS).nullable().catch(null);

const PAR_CODE: Readonly<Record<string, QuotaAtteint>> = { DL067: "gratuit", DL035: "mensuel" };

/** Le quota que la base a opposé à une création, ou `null` pour toute autre erreur. */
export function quotaDepuisErreur(
  erreur: { readonly code?: string | null } | null | undefined,
): QuotaAtteint | null {
  const code = erreur?.code;
  if (typeof code !== "string") return null;
  return PAR_CODE[code] ?? null;
}

/*
 * LE QUOTA DE COLIS, À PART : `DL070` (gratuit, à vie) et `DL051` (Pro, ce mois-ci),
 * opposés à l'ATTACHE d'un colis (125, 181, 197, 198). Il ne refuse pas une commande —
 * le numéro s'enregistre —, il empêche le SUIVI de démarrer. Le mélanger aux codes de
 * création ferait rediriger une sauvegarde de numéro vers la liste des commandes.
 */
const PAR_CODE_COLIS: Readonly<Record<string, QuotaAtteint>> = { DL070: "gratuit", DL051: "mensuel" };

/** Le quota de colis que la base a opposé à une attache, ou `null` pour toute autre cause. */
export function quotaColisDepuisCode(code: string | null | undefined): QuotaAtteint | null {
  if (typeof code !== "string") return null;
  return PAR_CODE_COLIS[code] ?? null;
}

/** La liste des commandes, qui dit le quota atteint. */
export function cheminQuotaAtteint(langue: string, quota: QuotaAtteint): string {
  return `/${langue}/commandes?quota=${quota}`;
}

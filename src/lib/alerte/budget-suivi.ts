import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";
import type { FournisseurSuivi, QuotaPort } from "@/lib/tracking/provider/port";
import { publierCarteDiscord, type CarteDiscord } from "./discord";

/**
 * L'ANNONCE D'UNE UNITÉ DÉPENSÉE — décision de Wassim, 20/09/2026.
 *
 * « a chaque quota utilisé sur notre compte 17track jpense en vrai, et quand
 * y'aura énormément de gens sur le saas on réduira a 50 dans le quota restant »
 *
 * ── POURQUOI À CHAQUE UNITÉ, ET NON À UN SEUIL ─────────────────────────────
 *
 * Un seuil ne se déclenche qu'une fois, et il se déclenche TARD. À 190 unités
 * restantes sur 200 À VIE, chaque prise en charge est un événement rare : à 5
 * colis à vie par compte gratuit (210), trente-huit inscrits suffisent à tout
 * consommer — et un seul compte Pro, en un mois. Tant que le produit est en
 * phase de validation, voir passer chaque unité vaut mieux qu'une alerte unique —
 * et c'est le choix de Wassim, qui a ajouté la suite : quand le volume montera,
 * on passera au seuil des 50 restantes. La bascule se fera ICI, et nulle part
 * ailleurs.
 *
 * ── ⚠️ LE NOMBRE VIENT DU FOURNISSEUR (30/09/2026) ─────────────────────────
 *
 * DÉFAUT RÉEL, SIGNALÉ PAR MEHDI : l'alerte a annoncé « 197 restantes sur 200
 * (3 utilisées) » quand le tableau de bord de 17TRACK en montrait 190. Le nombre
 * venait de `etat_budget_suivi()`, qui compte les colis que NOTRE base a gardés
 * plus un décalage réglé à la main (180). Les lignes effacées — comptes
 * supprimés, « Supprimer mes données », anciennes suites sur la production — ne
 * sont plus comptées, et l'argent, lui, est parti. La 180 le disait : « notre
 * base ne peut pas connaître ce chiffre ».
 *
 * Le solde se lit donc chez le fournisseur (`getquota`, une lecture de compte qui
 * ne se paie pas). Notre base ne sert plus que de REPLI quand il est injoignable,
 * et la carte dit alors qu'il s'agit d'une estimation et pourquoi : un nombre de
 * repli présenté comme le solde serait l'erreur d'origine, recommencée.
 *
 * ── TROIS RÈGLES, ET ELLES SE TIENNENT ─────────────────────────────────────
 *
 * 1. CETTE FONCTION NE LÈVE JAMAIS. Elle est appelée juste après que le
 *    fournisseur a accepté un numéro — c'est-à-dire APRÈS la dépense. Faire
 *    échouer la prise en charge parce qu'une notification n'est pas partie
 *    reviendrait à payer une unité et à la perdre : le pire des deux mondes.
 *
 * 2. ELLE N'AFFIRME RIEN QU'ELLE N'AIT LU, ET DIT D'OÙ ELLE LE TIENT. Si aucune
 *    des deux lectures n'aboutit, on ne poste pas un message avec des nombres
 *    inventés : on NOMME l'échec dans le journal du serveur et on s'arrête.
 *
 * 3. `non_configure` SE DIT UNE FOIS, PAS À CHAQUE COLIS. Tant que l'URL du
 *    webhook n'est pas posée, chaque prise en charge écrirait la même ligne :
 *    un journal noyé se lit comme un journal vide.
 */

/** Le numéro n'est jamais écrit en entier : il identifie le colis d'un client. */
const EMPREINTE = 4;

/** Les couleurs d'APLAT du design system : succès, avertissement, erreur. */
const COULEURS = { large: 0x12a87a, moyen: 0xe08a18, bas: 0xef4b57 } as const;

/** Au-dessus de la moitié, tout va bien ; sous le cinquième, il faut agir. */
const SEUILS = { large: 0.5, moyen: 0.2 } as const;

const CASES_JAUGE = 20;

type Solde = {
  readonly total: number;
  readonly utilisees: number;
  readonly restantes: number;
  readonly aujourdhui: number | null;
  /** `null` quand le fournisseur a répondu ; sinon, pourquoi on a dû estimer. */
  readonly estimation: string | null;
};

let absenceDejaSignalee = false;

export async function annoncerBudgetDeSuivi(
  systeme: SupabaseClient<Database>,
  numero: string,
  fournisseur: Pick<FournisseurSuivi, "lireQuota" | "nom"> = dixSeptTrack,
): Promise<void> {
  const solde = await lireSolde(systeme, fournisseur);
  if (solde === null) return;

  // LE NOM VIENT DU PORT : ce fichier ne connaît pas le fournisseur (frontière
  // gardée par `suivi-frontiere`). Il ne sert qu'au salon de l'exploitant.
  const issue = await publierCarteDiscord(carte(solde, numero, fournisseur.nom.toUpperCase()));

  if (issue.statut === "envoye") return;

  if (issue.statut === "non_configure") {
    if (absenceDejaSignalee) return;
    absenceDejaSignalee = true;
    console.warn(
      "[budget] " +
        issue.manquant.join(", ") +
        " n'est pas configuré : les alertes de budget de suivi sont PERDUES. " +
        "Il reste " +
        String(solde.restantes) +
        " prises en charge à vie, et rien ne préviendra quand elles s'épuiseront.",
    );
    return;
  }

  // `refuse` : Discord a été joint et n'a pas voulu. On le nomme — une alerte
  // perdue en silence est exactement la défaillance que ce mécanisme existe
  // pour empêcher.
  console.error("[budget] alerte de budget non remise : " + issue.motif);
}

/** Le fournisseur d'abord ; notre base seulement s'il ne répond pas. */
async function lireSolde(
  systeme: SupabaseClient<Database>,
  fournisseur: Pick<FournisseurSuivi, "lireQuota">,
): Promise<Solde | null> {
  // `try` ET NON `.catch()` : un double qui LÈVERAIT de façon synchrone passerait
  // avant le `.catch`, et la règle 1 — ne jamais lever — tomberait.
  let lu: QuotaPort;
  try {
    lu = await fournisseur.lireQuota();
  } catch {
    lu = { statut: "indisponible", motif: "exception" };
  }

  if (lu.statut === "ok") {
    return { total: lu.total, utilisees: lu.utilisees, restantes: lu.restantes, aujourdhui: lu.aujourdhui, estimation: null };
  }

  const { data, error } = await systeme.rpc("etat_budget_suivi");
  const etat = error === null && Array.isArray(data) ? data[0] : undefined;
  if (etat === undefined) {
    // Jamais de repli sur des nombres par défaut : voir la règle 2.
    console.error(
      "[budget] solde de suivi illisible — fournisseur : " +
        lu.motif +
        ", base : " +
        (error?.message ?? "état vide") +
        ". Aucune alerte envoyée.",
    );
    return null;
  }

  return {
    total: etat.total,
    utilisees: Number(etat.utilisees),
    restantes: etat.restantes,
    aujourdhui: null,
    estimation: lu.motif,
  };
}

function carte(solde: Solde, numero: string, source: string): CarteDiscord {
  const part = solde.total > 0 ? solde.restantes / solde.total : 0;
  const couleur = part >= SEUILS.large ? COULEURS.large : part >= SEUILS.moyen ? COULEURS.moyen : COULEURS.bas;
  const pleines = Math.round(part * CASES_JAUGE);
  const jauge = "█".repeat(pleines) + "░".repeat(CASES_JAUGE - pleines) + "  " + String(Math.round(part * 100)) + " % restant";

  const champs: CarteDiscord["champs"][number][] = [
    { nom: "Restantes", valeur: "**" + String(solde.restantes) + "**", enLigne: true },
    { nom: "Utilisées", valeur: String(solde.utilisees), enLigne: true },
    { nom: "Palier", valeur: String(solde.total) + " à vie", enLigne: true },
  ];
  if (solde.aujourdhui !== null) {
    champs.push({ nom: "Aujourd'hui", valeur: String(solde.aujourdhui), enLigne: true });
  }
  champs.push({ nom: "Jauge", valeur: "`" + jauge + "`" });
  if (solde.estimation !== null) {
    champs.push({
      nom: "⚠️ Estimation",
      valeur:
        source +
        " n'a pas répondu (" +
        solde.estimation +
        ") : ces nombres sont une estimation comptée chez nous, qui peut SOUS-ESTIMER la dépense. " +
        "Le tableau de bord de " +
        source +
        " fait foi.",
    });
  }

  return {
    titre: "📦 Nouveau colis suivi — une prise en charge consommée",
    description:
      "Le colis `" +
      numero.slice(0, EMPREINTE) +
      "…` est désormais suivi automatiquement. Ce palier est **à vie** : les unités ne se rechargent pas.",
    couleur,
    champs,
    pied:
      solde.estimation === null
        ? "Solde lu chez " + source + ", qui fait foi"
        : "Estimation DropLink — à vérifier sur le tableau de bord " + source,
    horodatage: new Date(),
  };
}

/** Remet le témoin d'avertissement à zéro. Réservé aux tests. */
export function reinitialiserAnnonceBudget(): void {
  absenceDejaSignalee = false;
}

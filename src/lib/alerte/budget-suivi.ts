import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { expediteurDiscord } from "./discord";

/**
 * L'ANNONCE D'UNE UNITÉ DÉPENSÉE — décision de Wassim, 20/09/2026.
 *
 * « a chaque quota utilisé sur notre compte 17track jpense en vrai, et quand
 * y'aura énormément de gens sur le saas on réduira a 50 dans le quota restant »
 *
 * ── POURQUOI À CHAQUE UNITÉ, ET NON À UN SEUIL ─────────────────────────────
 *
 * Un seuil ne se déclenche qu'une fois, et il se déclenche TARD. À 191 unités
 * restantes sur 200 À VIE, chaque prise en charge est un événement rare : dix
 * comptes de vendeurs à quinze commandes suffisent à tout consommer. Tant que
 * le produit est en phase de validation, voir passer chaque unité vaut mieux
 * qu'une alerte unique — et c'est le choix de Wassim, qui a ajouté la suite :
 * quand le volume montera, on passera au seuil des 50 restantes.
 *
 * Le jour où cette bascule aura lieu, elle se fera ICI, sur `restantes`, et
 * nulle part ailleurs : la décision d'alerter vit dans un seul fichier.
 *
 * ── TROIS RÈGLES, ET ELLES SE TIENNENT ─────────────────────────────────────
 *
 * 1. CETTE FONCTION NE LÈVE JAMAIS. Elle est appelée juste après que le
 *    fournisseur a accepté un numéro — c'est-à-dire APRÈS la dépense. Faire
 *    échouer la prise en charge parce qu'une notification n'est pas partie
 *    reviendrait à payer une unité et à la perdre : le pire des deux mondes.
 *
 * 2. ELLE N'AFFIRME RIEN QU'ELLE N'AIT LU. Si la lecture du budget échoue, on
 *    ne poste pas un message avec des nombres inventés ou un « ? » : on NOMME
 *    l'échec dans le journal du serveur et on s'arrête. Une alerte qui annonce
 *    un solde faux est pire qu'une alerte absente, parce qu'on s'y fie.
 *
 * 3. `non_configure` SE DIT UNE FOIS, PAS À CHAQUE COLIS. Tant que l'URL du
 *    webhook n'est pas posée, chaque prise en charge écrirait la même ligne :
 *    un journal noyé se lit comme un journal vide.
 */

/** Le numéro n'est jamais écrit en entier : il identifie le colis d'un client. */
const EMPREINTE = 4;

let absenceDejaSignalee = false;

export async function annoncerBudgetDeSuivi(
  systeme: SupabaseClient<Database>,
  numero: string,
): Promise<void> {
  const { data, error } = await systeme.rpc("etat_budget_suivi");

  if (error !== null) {
    console.error("[budget] état du budget de suivi illisible : " + error.message);
    return;
  }

  const etat = Array.isArray(data) ? data[0] : null;
  if (etat === null || etat === undefined) {
    // Jamais de repli sur des nombres par défaut : voir la règle 2.
    console.error("[budget] état du budget de suivi vide — aucune alerte envoyée.");
    return;
  }

  const { utilisees, total, restantes } = etat;

  const issue = await expediteurDiscord().envoyer({
    sujet: "Suivi : une prise en charge vient d'être payée",
    texte:
      `Colis ${numero.slice(0, EMPREINTE)}… pris en charge.\n` +
      `**${restantes}** restantes sur ${total} (${utilisees} utilisées).\n` +
      "Ce palier est À VIE : ces unités ne se rechargent pas.",
  });

  if (issue.statut === "envoye") return;

  if (issue.statut === "non_configure") {
    if (absenceDejaSignalee) return;
    absenceDejaSignalee = true;
    console.warn(
      "[budget] " +
        issue.manquant.join(", ") +
        " n'est pas configuré : les alertes de budget de suivi sont PERDUES. " +
        "Il reste " +
        String(restantes) +
        " prises en charge à vie, et rien ne préviendra quand elles s'épuiseront.",
    );
    return;
  }

  // `refuse` : Discord a été joint et n'a pas voulu. On le nomme — une alerte
  // perdue en silence est exactement la défaillance que ce mécanisme existe
  // pour empêcher.
  console.error("[budget] alerte de budget non remise : " + issue.motif);
}

/** Remet le témoin d'avertissement à zéro. Réservé aux tests. */
export function reinitialiserAnnonceBudget(): void {
  absenceDejaSignalee = false;
}

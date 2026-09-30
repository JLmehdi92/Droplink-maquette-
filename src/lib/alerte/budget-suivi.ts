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

/**
 * ⚠️ UNE ABSENCE DE WEBHOOK SE RÉPÈTE, EN ERREUR, TOUTES LES HEURES (audit ECC du
 * 30/09/2026). Une seule ligne d'avertissement par processus se noyait dans les
 * journaux, et c'était le seul cas où RIEN ne préviendrait de l'épuisement du
 * stock. Une fois par heure : assez pour être vu, trop peu pour noyer.
 */
const RAPPEL_ABSENCE_MS = 60 * 60 * 1000;
let absenceSignaleeLe: number | null = null;

export async function annoncerBudgetDeSuivi(
  systeme: SupabaseClient<Database>,
  numero: string,
  fournisseur: Pick<FournisseurSuivi, "lireQuota" | "nom"> = dixSeptTrack,
): Promise<void> {
  // ⚠️ LA RÈGLE 1 TIENT PAR CONSTRUCTION, PAS PAR PRUDENCE (audit ECC du 30/09/2026).
  // Un reste au-delà du palier faisait lever la jauge (`"░".repeat(-5)`) APRÈS
  // l'unité payée : l'état du colis n'était jamais lu, et la boucle de la cadence
  // s'interrompait pour tous les colis suivants. Tout ce qui suit est donc gardé.
  try {
    await annoncer(systeme, numero, fournisseur);
  } catch (erreur) {
    console.error("[budget] annonce du budget de suivi interrompue :", erreur);
  }
}

async function annoncer(
  systeme: SupabaseClient<Database>,
  numero: string,
  fournisseur: Pick<FournisseurSuivi, "lireQuota" | "nom">,
): Promise<void> {
  // LE NOM VIENT DU PORT : ce fichier ne connaît pas le fournisseur (frontière
  // gardée par `suivi-frontiere`). Il ne sert qu'au salon de l'exploitant.
  const source = fournisseur.nom.toUpperCase();

  const solde = await lireSolde(systeme, fournisseur, source);
  if (solde === null) return;

  const issue = await publierCarteDiscord(carte(solde, numero, source));

  if (issue.statut === "envoye") return;

  if (issue.statut === "non_configure") {
    const maintenant = Date.now();
    if (absenceSignaleeLe !== null && maintenant - absenceSignaleeLe < RAPPEL_ABSENCE_MS) return;
    absenceSignaleeLe = maintenant;
    console.error(
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

/**
 * Trois nombres qui ne s'additionnent pas ne « font pas foi » : afficher
 * « Solde lu chez le fournisseur » au-dessus d'une contradiction serait le défaut
 * d'origine, habillé d'une certitude.
 */
function coherent(q: { total: number; utilisees: number; restantes: number }): boolean {
  return q.restantes <= q.total && q.utilisees + q.restantes === q.total;
}

/** Le fournisseur d'abord ; notre base seulement s'il ne répond pas. */
async function lireSolde(
  systeme: SupabaseClient<Database>,
  fournisseur: Pick<FournisseurSuivi, "lireQuota">,
  source: string,
): Promise<Solde | null> {
  // `try` ET NON `.catch()` : un double qui LÈVERAIT de façon synchrone passerait
  // avant le `.catch`, et la règle 1 — ne jamais lever — tomberait.
  let lu: QuotaPort;
  try {
    lu = await fournisseur.lireQuota();
  } catch (erreur) {
    // La cause est gardée : « exception » seul confondrait un défaut de notre
    // code avec une panne du fournisseur.
    console.error("[budget] la lecture du solde chez " + source + " a levé :", erreur);
    lu = { statut: "indisponible", motif: "exception" };
  }

  if (lu.statut === "ok" && !coherent(lu)) {
    lu = { statut: "indisponible", motif: "solde-incoherent" };
  }

  if (lu.statut === "ok") {
    return { total: lu.total, utilisees: lu.utilisees, restantes: lu.restantes, aujourdhui: lu.aujourdhui, estimation: null };
  }

  // LE REPLI SE DIT AUSSI DANS LE JOURNAL, pas seulement dans Discord : une clé
  // révoquée (`code-…`) serait sinon invisible côté serveur tant que le salon
  // reçoit les cartes.
  console.warn("[budget] solde illisible chez " + source + " (" + lu.motif + ") : repli sur l'estimation de la base.");

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
  // BORNÉE À [0, 1] : une jauge ne déborde pas, quoi qu'on lui donne.
  const part = solde.total > 0 ? Math.min(1, Math.max(0, solde.restantes / solde.total)) : 0;
  const estimee = solde.estimation !== null;
  // ⚠️ UNE ESTIMATION N'EST JAMAIS VERTE : notre base SOUS-ESTIME la dépense (197
  // affichés quand il en restait 190). Le vert rassurait exactement à tort.
  const couleur =
    part >= SEUILS.large && !estimee ? COULEURS.large : part >= SEUILS.moyen ? COULEURS.moyen : COULEURS.bas;
  const pleines = Math.round(part * CASES_JAUGE);
  const jauge = "█".repeat(pleines) + "░".repeat(CASES_JAUGE - pleines) + "  " + String(Math.round(part * 100)) + " % restant";
  const environ = estimee ? "~" : "";

  const champs: CarteDiscord["champs"][number][] = [
    { nom: "Restantes", valeur: "**" + environ + String(solde.restantes) + "**", enLigne: true },
    { nom: "Utilisées", valeur: environ + String(solde.utilisees), enLigne: true },
    { nom: "Palier", valeur: String(solde.total) + " à vie", enLigne: true },
  ];
  if (solde.aujourdhui !== null) {
    champs.push({ nom: "Aujourd'hui", valeur: String(solde.aujourdhui), enLigne: true });
  }
  // L'AVERTISSEMENT AVANT LA JAUGE : une carte trop longue perd ses DERNIERS champs
  // (`publierCarteDiscord`), et c'est la jauge qu'on peut perdre, pas lui.
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
  champs.push({ nom: "Jauge", valeur: "`" + jauge + "`" });

  return {
    titre: "📦 Nouveau colis suivi — une prise en charge consommée",
    description:
      "Le colis `" +
      // LETTRES ET CHIFFRES SEULEMENT : le numéro est un texte libre du vendeur, et
      // un accent grave ou une étoile casseraient la mise en forme de la carte.
      numero.replace(/[^A-Za-z0-9]/g, "").slice(0, EMPREINTE) +
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
  absenceSignaleeLe = null;
}

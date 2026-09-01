import "server-only";
import type { creerClientServeur } from "@/lib/supabase/server";
import { lireProfilAvec, onboardingAFaire } from "@/lib/comptes/profil";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { emettre } from "@/lib/instrumentation/emettre";

/**
 * CE QUI DOIT ARRIVER JUSTE APRÈS QU'UNE SESSION S'OUVRE — quel que soit le
 * chemin qui l'a ouverte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE : DEUX GARDES NE VIVAIENT QUE DANS UN SEUL CHEMIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 01/09/2026, il n'existait qu'une façon d'ouvrir une session : le
 * retour du lien magique. Tout ce qui devait se produire à ce moment-là a donc
 * été écrit DANS ce fichier de route, et rien ne le signalait — c'était vrai
 * tant que le chemin était unique.
 *
 * Le passage au mot de passe ajoute deux chemins. Recopier ces gardes dans
 * chacun aurait produit trois copies dont on n'aurait corrigé que celle qu'on
 * avait sous les yeux ; les laisser où elles étaient aurait produit ceci,
 * mesuré par recherche sur `src/` avant d'écrire une ligne :
 *
 *   - `lire_inscriptions_ouvertes` : UNE occurrence. L'interrupteur par lequel
 *     un administrateur ferme les inscriptions n'aurait plus rien fermé. Il
 *     l'aurait baissé, l'écran d'administration aurait dit « fermées », et les
 *     comptes auraient continué de naître. Une garde qui ment est pire qu'une
 *     garde absente : on cesse de la surveiller.
 *
 *   - `reclamer_evenement_inscription` : UNE occurrence. Plus AUCUNE
 *     inscription n'aurait été comptée. C'est le DÉNOMINATEUR du taux
 *     d'activation, donc la métrique de verdict de toute la phase de
 *     validation, et elle serait tombée à zéro sans que rien n'échoue.
 *
 * Les deux autres gardes du même fichier — profil introuvable, compte suspendu
 * — sont déjà doublées par le layout de l'espace vendeur. Elles sont reprises
 * ici quand même : ce module décrit ce qui suit une ouverture de session, et
 * une garde qu'on omet parce qu'« il y en a une plus loin » est une garde qui
 * disparaît le jour où le plus loin change.
 */

/** Où envoyer la personne, et pourquoi. */
export type Destination =
  | { readonly ok: true; readonly chemin: string }
  | { readonly ok: false; readonly motif: "profil" | "suspendu" | "fermees" };

/**
 * Décide de la suite, et émet ce qui doit l'être.
 *
 * ⚠️ LE CLIENT EST CELUI QUI VIENT D'OUVRIR LA SESSION, et il est passé
 * explicitement plutôt que reconstruit ici. Un client reconstruit relit les
 * cookies : dans la Server Action qui vient d'authentifier, ceux-ci sont écrits
 * à la même milliseconde, et l'on ferait dépendre l'ouverture d'un compte d'un
 * aller-retour interne au lieu de la réponse qu'on tient déjà. Voir
 * `lireProfilAvec`.
 *
 * ⚠️ NE JAMAIS APPELER AVANT QUE LA SESSION SOIT POSÉE : ce module ne vérifie
 * pas qu'elle existe, il en décrit la suite.
 */
export async function suivreApresSession(
  langue: "fr" | "en",
  supabase: Awaited<ReturnType<typeof creerClientServeur>>,
): Promise<Destination> {
  const profil = await lireProfilAvec(supabase);

  if (profil === null) {
    // La session existe mais le profil est introuvable : le déclencheur de
    // création n'a pas tourné, ou la ligne a été supprimée. On ne laisse pas
    // quelqu'un dans un espace authentifié sans profil, où chaque écran
    // échouerait séparément sans expliquer pourquoi.
    return { ok: false, motif: "profil" };
  }

  if (profil.statut === "suspended") {
    return { ok: false, motif: "suspendu" };
  }

  if (!onboardingAFaire(profil)) {
    // Quelqu'un qui se connecte veut ses commandes, pas la page de présentation
    // du produit qu'il emploie déjà.
    return { ok: true, chemin: `/${langue}/commandes` };
  }

  /*
   * L'INTERRUPTEUR D'INSCRIPTION SE LIT ICI, PAS AVANT.
   *
   * ⚠️ ET C'EST UNE FERMETURE APRÈS COUP, ASSUMÉE. Le compte est déjà créé à cet
   * instant — `signUp` comme le lien magique créent `auth.users`, `profiles` et
   * `shops` d'un bloc. Ce que l'interrupteur empêche n'est donc pas la
   * naissance de la ligne, c'est l'ENTRÉE dans le produit.
   *
   * Le fermer plus tôt, à la soumission du formulaire, coûterait exactement ce
   * que ce projet a déjà refusé une fois : un refus rendu AVANT l'appel à
   * Supabase se distingue par sa rapidité, et redonnerait à qui balaie des
   * adresses un oracle qu'on a payé cher pour fermer.
   *
   * LA LECTURE QUI ÉCHOUE LAISSE ENTRER. Le défaut de la fonction en base est
   * « ouvert » ; le répéter ici évite qu'une base momentanément illisible ferme
   * le produit sans que personne l'ait décidé.
   */
  const { data: ouvertes, error: erreurPorte } = await supabase.rpc("lire_inscriptions_ouvertes");
  if (erreurPorte !== null) {
    console.error("[auth] interrupteur d'inscription illisible — " + erreurPorte.message);
  } else if (ouvertes === false) {
    return { ok: false, motif: "fermees" };
  }

  /*
   * L'INSCRIPTION EST COMPTÉE ICI, UNE SEULE FOIS, ET LA MARQUE EST EN BASE.
   *
   * Le critère « onboarding à faire » ne suffit PAS à rendre l'émission unique :
   * il vaut `account_type is null`, donc il reste vrai tant que l'onboarding
   * n'est pas soumis. Quelqu'un qui se connecte trois jours de suite avant de le
   * remplir produirait TROIS inscriptions pour UN compte — sur un DÉNOMINATEUR,
   * cela fait BAISSER le taux d'activation, et le biais est corrélé au
   * comportement mesuré, donc il amplifie sa propre erreur.
   *
   * La marque est RENDUE si l'émission échoue : une marque à usage unique
   * consommée avant une opération qui peut échouer perd l'événement
   * définitivement, sans réémission possible.
   */
  const { data: reclamee } = await supabase.rpc("reclamer_evenement_inscription");

  if (reclamee === true) {
    const parti = await emettre(EVENEMENTS.INSCRIPTION, { sujet: profil.profilId }, { langue });
    if (!parti) {
      await supabase.rpc("liberer_evenement_inscription");
    }
  }

  return { ok: true, chemin: `/${langue}/bienvenue` };
}

/**
 * Le chemin de repli d'une destination refusée.
 *
 * UN SEUL ENDROIT construit ces URL. Les écrire à la main dans chaque appelant
 * a déjà coûté quatre motifs muets sur l'écran de connexion : la route de retour
 * redirigeait avec son motif, et rien ne l'affichait, parce que l'inventaire des
 * motifs affichables vivait ailleurs que leur émission.
 */
export function cheminDeRefus(langue: "fr" | "en", motif: "profil" | "suspendu" | "fermees"): string {
  return `/${langue}/connexion?erreur=${motif}`;
}

import "server-only";
import { redirect } from "next/navigation";
import type { creerClientServeur } from "@/lib/supabase/server";
import {
  lireProfilAvec,
  lireProfilVendeur,
  onboardingAFaire,
  SessionIndisponible,
  type ProfilVendeur,
} from "@/lib/comptes/profil";
/*
 * ⚠️ `Langue` PLUTÔT QUE `"fr" | "en"` ÉCRIT À LA MAIN. Ces trois signatures
 * portaient l'union en clair, et c'est ce qui a fait rougir le compilateur en
 * TREIZE endroits le jour où une troisième langue est entrée dans `LANGUES`.
 *
 * Ce rouge est le bon comportement : il a désigné exactement les appelants qui
 * dépendaient d'une hypothèse à deux langues, sans qu'aucune relecture n'ait à
 * les chercher. Le type dérivé de `LANGUES` est la seule forme qui se propage.
 */
import type { Langue } from "@/i18n/config";
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
 *     un administrateur ferme les inscriptions n'aurait plus rien fermé.
 *     ⚠️ ET IL NE FERMAIT DÉJÀ RIEN, ce que ce module n'a vu qu'au 02/09/2026 :
 *     posé ici, il s'exécutait APRÈS `signUp`, donc après la naissance du
 *     compte. Il vit désormais dans `sInscrire`, avant l'appel — voir le bloc
 *     qui remplace sa lecture plus bas. Ce paragraphe reste parce que sa
 *     conclusion tient : une garde qui ment est pire qu'une garde absente, on
 *     cesse de la surveiller. Elle mentait.
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
  /*
   * ⚠️ `fermees` N'EST PLUS UNE DESTINATION, et son absence ici est le contrôle.
   *
   * Ce module ne décide plus de la fermeture des inscriptions : elle est lue
   * dans `sInscrire`, AVANT `signUp`, seul endroit où l'intention est connue et
   * où fermer empêche réellement le compte de naître. Le motif reste connu de
   * `cheminDeRefus` — l'écran doit toujours savoir l'expliquer — mais aucun
   * chemin passant par ici ne peut plus le produire. Le remettre dans cette
   * union ferait de nouveau dépendre la CONNEXION d'un réglage d'INSCRIPTION.
   */
  | { readonly ok: false; readonly motif: "profil" | "suspendu" };

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
  langue: Langue,
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
   * ⚠️ L'INTERRUPTEUR D'INSCRIPTION NE SE LIT PLUS ICI — ET CE BLOC DISAIT LE
   * CONTRAIRE, AVEC UNE RAISON QUE LA MESURE A RÉFUTÉE.
   *
   * Il affirmait deux choses, mesurées le 02/09/2026 sur un serveur servi, en
   * rejouant le VRAI formulaire :
   *
   *   1. « Ce que l'interrupteur empêche n'est pas la naissance de la ligne,
   *      c'est l'ENTRÉE dans le produit. » Vrai, et c'est le défaut : avec les
   *      inscriptions FERMÉES, une soumission rend bien `?erreur=fermees` et
   *      crée quand même 1 `auth.users`, 1 `profiles` et 1 `shops`. Un
   *      interrupteur qu'on baisse pour arrêter un afflux ne l'arrête pas.
   *
   *   2. « Un refus rendu AVANT l'appel à Supabase se distingue par sa
   *      rapidité. » FAUX ici : le plancher d'authentification est
   *      INCONDITIONNEL sur les deux chemins. Mesuré, inscriptions ouvertes :
   *      adresse inconnue 1 249 ms, adresse connue 1 387 ms. Refuser plus tôt
   *      puis attendre le plancher ne se distingue donc de rien.
   *
   * ET IL VERROUILLAIT DEHORS DES COMPTES EXISTANTS. Lu après
   * `onboardingAFaire`, il ne frappait pas tout le monde — mesuré : onboarding
   * terminé, la connexion passe (`/commandes`) ; onboarding NON terminé, elle
   * rend `?erreur=fermees`. Le verrou visait donc exactement les inscrits les
   * plus récents, c'est-à-dire ceux qu'une fermeture ne cherche jamais à
   * exclure, et la seule population qui ne pouvait pas comprendre pourquoi.
   *
   * LA FERMETURE VIT DÉSORMAIS DANS `sInscrire`, AVANT `signUp` : c'est le seul
   * endroit où l'intention est connue avec certitude, et le seul où fermer
   * empêche réellement quelque chose.
   */

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
export function cheminDeRefus(
  langue: Langue,
  motif: "profil" | "suspendu" | "fermees" | "service",
): string {
  return `/${langue}/connexion?erreur=${motif}`;
}

/**
 * LA GARDE DE CHAQUE PAGE DE L'ESPACE VENDEUR.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ POURQUOI ELLE EXISTE : LE LAYOUT ARRIVE TROP TARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DÉFAUT RÉEL, MESURÉ LE 02/09/2026 EN ÉPROUVANT LA DÉCONNEXION. Le layout de
 * `(app)` redirige bien quand le profil est introuvable ou le compte suspendu.
 * Mais Next a DÉJÀ ENGAGÉ LA RÉPONSE quand cette redirection tombe : l'en-tête
 * `location:` part, **et la charge de la page part avec**.
 *
 * Un navigateur suit le 307 et jette le corps. `curl`, un script, un aspirateur,
 * non. Relevé avec un cookie RÉVOQUÉ, sentinelles à l'appui :
 *
 *     cookie révoqué   RSC /fr/commandes/[id] → 200, 19 344 o
 *                      "internal_notes":"SENTINELLE-NOTE-4471"
 *                      "tracking_number":"SENTINELLESUIVI7788"
 *     sans cookie      même route             → 200, 11 686 o, 0 occurrence
 *
 * Les trois pages qui fuyaient — la liste, l'éditeur, l'aperçu client — sont
 * exactement celles qui portent les **notes internes**, qui contiennent le prix
 * d'achat, et le **`public_token`**, qui ne transfère pas une donnée mais une
 * CAPACITÉ, définitivement, puisqu'il est immuable à vie. `envois`, `analyses`
 * et `marque` portaient déjà leur propre garde et ne fuyaient pas : c'est ce qui
 * a permis d'attribuer le défaut sans rien deviner.
 *
 * ⚠️ MÊME CAUSE POUR LA SUSPENSION : un compte suspendu gardait son tableau de
 * bord. La coupure tenait sur `/p/[token]` — qui rend bien 404 — et pas ici.
 * Elle fonde notre statut d'hébergeur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `lireProfilVendeur` est MÉMOÏSÉE pour la durée de la requête : appeler cette
 * garde dans chaque page ne coûte **aucun aller-retour de plus** que la lecture
 * que le layout fait déjà. La redondance est gratuite ; c'est son absence qui
 * coûtait.
 *
 * ⚠️ ET `tests/unit/pages-gardees.test.ts` INVENTORIE les pages de `(app)` pour
 * exiger cet appel — dans les deux sens. Une page ajoutée sans garde ne passe
 * pas, et une exception déclarée qui ne désigne plus rien non plus. C'est ce
 * qui empêche le défaut de revenir par la porte de la page suivante.
 */
export async function exigerVendeur(langue: Langue): Promise<ProfilVendeur> {
  let profil: ProfilVendeur | null;
  try {
    profil = await lireProfilVendeur();
  } catch (erreur) {
    /*
     * ⚠️ LE SERVEUR D'AUTHENTIFICATION N'A PAS RÉPONDU — CE N'EST PAS UNE
     * SESSION REFUSÉE, ET ON NE LE DIT PLUS COMME SI C'EN ÉTAIT UNE.
     *
     * Mesuré le 02/09/2026 : sur 200 requêtes authentifiées portant un cookie
     * valide, deux ont été éjectées, à 11,1 s et 11,4 s — soit juste au-delà du
     * délai de connexion de dix secondes — et l'écran affirmait « Votre session
     * a expiré ». C'est le principe XII à l'envers : l'interface affirme un état
     * que la base n'a jamais enregistré. Le même chemin servant la sauvegarde
     * automatique de l'éditeur, la phrase tombait pendant que le vendeur tape,
     * c'est-à-dire quand il a du texte non enregistré.
     *
     * L'ACCÈS RESTE REFUSÉ : on redirige, la garde ne s'ouvre pas. Seule la
     * PHRASE change, et elle devient vraie.
     */
    if (!(erreur instanceof SessionIndisponible)) throw erreur;
    console.error("[garde] " + erreur.message);
    redirect(cheminDeRefus(langue, "service"));
  }

  if (profil === null) {
    redirect(cheminDeRefus(langue, "profil"));
  }
  if (profil.statut === "suspended") {
    redirect(cheminDeRefus(langue, "suspendu"));
  }

  return profil;
}

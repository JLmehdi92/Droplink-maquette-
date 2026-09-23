"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { SchemaLangue } from "@/i18n/schema";
import { attendrePlancher } from "@/lib/auth/plancher";
import { MotDePasse, refusDuMotDePasse } from "@/lib/auth/mot-de-passe";
import { verifierFuite } from "@/lib/auth/fuites";
import { sessionParEmail } from "@/lib/auth/recuperation";
import { cheminDeRefus, suivreApresSession } from "@/lib/comptes/apres-session";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import { estLangueSupportee } from "@/i18n/config";

/**
 * CHOISIR UN NOUVEAU MOT DE PASSE.
 *
 * ⚠️ CE COMMENTAIRE DISAIT « ce qui sépare cet écran de n'importe qui est la
 * possession de la boîte mail ». C'ÉTAIT FAUX, et le défaut était exactement là :
 * c'était la possession de la SESSION, n'importe laquelle. Un cookie volé en est
 * une, et il changeait le mot de passe sans connaître l'ancien.
 *
 * La récupération authentifie par le lien, donc la session existe déjà quand
 * l'écran s'ouvre — c'est vrai. Mais l'action doit vérifier COMMENT elle a été
 * obtenue, pas seulement qu'elle existe : voir `sessionParEmail` plus bas.
 *
 * ⚠️ ET C'EST POURQUOI ELLE REVÉRIFIE L'IDENTITÉ ELLE-MÊME. Dans un module
 * `"use server"`, chaque export est un point d'entrée atteignable par une
 * requête forgée : le fait que la page ne s'affiche pas ne protège rien. Sans
 * cette garde, un appel direct changerait le mot de passe de quiconque a une
 * session ouverte — donc n'importe quel vendeur connecté, depuis un site tiers.
 *
 * ⚠️ LA GARDE EST `lireProfilVendeur`, LA MÊME QUE PARTOUT AILLEURS. Elle lit
 * `profiles` SOUS RLS, ce qui exige un jeton valide et non un cookie qu'on
 * croit sur parole — et elle rend EN PLUS l'adresse et le statut du compte.
 * L'adresse sert au seul contrôle de contenu qu'on applique, et elle vient donc
 * de la base, jamais du formulaire : la demander au client permettrait d'en
 * passer une autre et de contourner la règle.
 */

const Saisie = z.object({
  locale: SchemaLangue,
  motDePasse: MotDePasse,
});

export type ResultatChangement =
  | { statut: "inactif" }
  | {
      statut: "erreur";
      motif: "trop_court" | "trop_long" | "contient_email" | "fuite" | "session" | "indisponible";
    };

export async function changerMotDePasse(
  _precedent: ResultatChangement,
  donnees: unknown,
): Promise<ResultatChangement> {
  const debut = Date.now();

  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "indisponible" };

  const langueBrute = donnees.get("locale");
  // ⚠️ `=== "en" ? "en" : "fr"` jusqu'au 13/09/2026, antérieur au chinois : un
  // vendeur qui choisissait son mot de passe sur `/zh-CN` repartait en français.
  const langue = typeof langueBrute === "string" && estLangueSupportee(langueBrute) ? langueBrute : "fr";

  const profil = await lireProfilVendeur();

  // Un compte suspendu emprunte le MÊME chemin de sortie qu'une session absente.
  // Lui dire « vous êtes suspendu » ici ne lui apprendrait rien qu'il ne
  // découvrira à la connexion, et le distinguer donnerait à qui teste un lien
  // volé une information de plus que le refus lui-même.
  if (profil === null || profil.statut === "suspended") {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "session" };
  }

  const supabase = await creerClientServeur();

  /*
   * ⚠️ UNE SESSION NE SUFFIT PAS : IL EN FAUT UNE OBTENUE PAR EMAIL.
   *
   * DÉFAUT RÉEL, MESURÉ LE 02/09/2026. Cette action n'exigeait qu'une session
   * valide, donc n'importe laquelle — et un cookie volé en est une. Elle
   * changeait le mot de passe SANS l'ancien, puis le `signOut({scope:"others"})`
   * ci-dessous éjectait le vrai propriétaire. Un accès temporaire à un poste
   * déverrouillé devenait une prise de compte définitive.
   *
   * La raison complète, et ce que `amr` distingue exactement, sont dans
   * `lib/auth/recuperation`.
   */
  if (!(await sessionParEmail(supabase))) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "session" };
  }

  const brut = donnees.get("motDePasse");
  const analyse = Saisie.safeParse({ motDePasse: brut, locale: langue });

  if (!analyse.success) {
    if (typeof brut !== "string") return { statut: "erreur", motif: "trop_court" };
    const refus = refusDuMotDePasse(brut, profil.email);
    return {
      statut: "erreur",
      motif: refus.includes("trop_long") ? "trop_long" : "trop_court",
    };
  }

  // LE CONTRÔLE QUI A BESOIN DES DEUX VALEURS. L'adresse vient de la BASE, pas
  // du formulaire : la demander au client permettrait d'en passer une autre et
  // de contourner la règle.
  const refus = refusDuMotDePasse(analyse.data.motDePasse, profil.email);
  if (refus.includes("contient_email")) {
    return { statut: "erreur", motif: "contient_email" };
  }
  if ((await verifierFuite(analyse.data.motDePasse)) === "fuite") {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "fuite" };
  }

  const { error } = await supabase.auth.updateUser({ password: analyse.data.motDePasse });

  if (error !== null) {
    await attendrePlancher(debut);
    console.error("[auth] changement de mot de passe refusé — " + error.message);
    // Le message reste générique : les refus du serveur d'authentification à ce
    // stade portent sur la POLITIQUE du projet (longueur, mot de passe fuité),
    // et les énumérer ici les ferait diverger de ce que le projet applique
    // vraiment le jour où le réglage change.
    return { statut: "erreur", motif: "indisponible" };
  }

  /*
   * ON FERME LES AUTRES SESSIONS, ET LA PLANCHE L'ANNONCE.
   *
   * Changer son mot de passe est ce qu'on fait quand on soupçonne que
   * quelqu'un d'autre est entré. Laisser vivre les sessions déjà ouvertes
   * viderait le geste de son sens : l'intrus garderait l'accès jusqu'à
   * l'expiration du jeton de rafraîchissement, c'est-à-dire quatre cents jours.
   *
   * `others` et non `global` : `global` fermerait AUSSI celle-ci, et la
   * redirection qui suit renverrait la personne sur l'écran de connexion juste
   * après lui avoir fait choisir un mot de passe. On ferme les autres, on garde
   * la sienne.
   *
   * ⚠️ L'ÉCHEC N'EST PAS BLOQUANT, MAIS IL EST DIT. Le mot de passe est déjà
   * changé à cet instant : refuser maintenant laisserait quelqu'un croire que
   * rien n'a été fait alors que tout l'a été. Le journal porte la trace.
   */
  const { error: erreurAutres } = await supabase.auth.signOut({ scope: "others" });
  if (erreurAutres !== null) {
    console.error("[auth] autres sessions non fermées — " + erreurAutres.message);
  }

  const suite = await suivreApresSession(langue, supabase);
  await attendrePlancher(debut);

  redirect(suite.ok ? suite.chemin : cheminDeRefus(langue, suite.motif));
}

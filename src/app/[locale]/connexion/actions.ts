"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * Envoi du lien de connexion, CÔTÉ SERVEUR.
 *
 * Une première version faisait l'appel depuis le navigateur avec le SDK
 * Supabase. Elle fonctionnait, mais embarquait 69 ko de JavaScript dans une
 * page dont le seul rôle est de poster une adresse email — et cette page est la
 * porte d'entrée unique du fournisseur en Chine, souvent sur une connexion
 * lente. Une Server Action ramène la page à sa taille de socle.
 *
 * Le brief l'impose de toute façon : Server Actions pour les mutations, route
 * handlers réservés aux webhooks.
 */

const Saisie = z.object({
  // La langue voyage avec le formulaire : le lien recu par email doit ramener
  // l utilisateur dans la langue ou il etait, pas dans celle par defaut.
  locale: z.enum(["fr", "en"]),
  // Zod sur toute entrée externe, y compris ce qui « vient de notre
  // formulaire » : le formulaire n'est qu'une suggestion, la requête est ce qui
  // arrive vraiment.
  email: z.string().trim().min(3).max(254).email(),
});

export type ResultatConnexion =
  | { statut: "inactif" }
  | { statut: "envoye"; email: string }
  | { statut: "erreur"; motif: "email_invalide" | "trop_de_tentatives" | "envoi" };

export async function envoyerLienConnexion(
  _precedent: ResultatConnexion,
  donnees: FormData,
): Promise<ResultatConnexion> {
  const analyse = Saisie.safeParse({
    email: donnees.get("email"),
    locale: donnees.get("locale"),
  });
  if (!analyse.success) {
    return { statut: "erreur", motif: "email_invalide" };
  }

  const enTetes = await headers();
  const origine = enTetes.get("origin");
  if (origine === null) {
    // Sans origine on ne peut pas construire une URL de retour fiable, et
    // deviner produirait un lien qui mène ailleurs que là où l'utilisateur est.
    return { statut: "erreur", motif: "envoi" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.signInWithOtp({
    email: analyse.data.email,
    options: {
      emailRedirectTo: `${origine}/${analyse.data.locale}/auth/retour`,
      shouldCreateUser: true,
    },
  });

  if (error !== null) {
    // On distingue la limite de débit du reste : dire « réessayez » à quelqu'un
    // qui vient d'être limité le ferait réessayer aussitôt, donc échouer à
    // nouveau, et conclure que le produit est cassé.
    return {
      statut: "erreur",
      motif: error.status === 429 ? "trop_de_tentatives" : "envoi",
    };
  }

  // L'état « envoyé » n'est rendu qu'APRÈS une réponse sans erreur. L'annoncer
  // avant serait un pari sur le serveur, et un pari perdu laisserait
  // l'utilisateur attendre un email qui n'est jamais parti.
  return { statut: "envoye", email: analyse.data.email };
}

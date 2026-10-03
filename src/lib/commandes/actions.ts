"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { LANGUE_DEFAUT, estLangueSupportee } from "@/i18n/config";
import { SchemaLangue } from "@/i18n/schema";

/** La forme d'un identifiant de commande, pour relire son jeton avant une révocation. */
const Identifiant = z.string().uuid();
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types-base";
import { appliquerChamp, type ResultatEnregistrement } from "./ecriture";
import { invaliderCommandePublique } from "./cache";
import { cheminQuotaAtteint, quotaDepuisErreur } from "./quota-atteint";
import {
  dupliquerCommande,
  revoquerLien,
  type Duplication,
  type Revocation,
} from "./cycle";

export type { ResultatEnregistrement };

type InsertCommande = Database["public"]["Tables"]["orders"]["Insert"];

/**
 * Mutations de commande.
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE. Le layout de `(app)` redirige un visiteur
 * sans session, mais une Server Action ne passe PAS par le layout : c'est un
 * point d'entrée à part entière, atteignable par une requête forgée qui n'a
 * jamais affiché la page. Une garde posée seulement dans le layout serait une
 * garde absente.
 *
 * Toutes les écritures passent par le client AVEC SESSION, donc sous RLS. Aucune
 * ne filtre sur `shop_id` : c'est la base qui borne, pas la requête. Et aucune
 * ne touche `public_token` — un déclencheur `BEFORE UPDATE` le refuserait de
 * toute façon, ce qui est exactement le point : la règle ne peut pas être
 * oubliée dans un nouveau chemin de code.
 */

export async function creerBrouillon(donnees: FormData): Promise<void> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    redirect("/fr/connexion?erreur=session");
  }

  const langue = SchemaLangue.catch(LANGUE_DEFAUT).parse(donnees.get("langue"));

  const supabase = await creerClientServeur();

  /*
   * `public_token` et `unsubscribe_token` sont posés par un déclencheur
   * `BEFORE INSERT` (migration 009), et non par un défaut de colonne — un défaut
   * de colonne s'évalue avec les privilèges du rôle QUI INSÈRE, ce qui rendait
   * toute création impossible dès qu'on révoquait le droit d'exécution.
   *
   * L'introspection du schéma ne voit pas les déclencheurs : elle croit donc les
   * deux colonnes obligatoires. Le contournement est borné à cette insertion, et
   * il porte sur une propriété du schéma que le type ne sait pas exprimer — pas
   * sur une valeur qu'on préférerait ne pas fournir. Les tests d'immuabilité du
   * jeton établissent que les deux sont bel et bien posés.
   */
  const brouillon = { shop_id: profil.shopId } as unknown as InsertCommande;

  const { data, error } = await supabase.from("orders").insert(brouillon).select("id").single();

  /*
   * LE QUOTA ATTEINT N'EST PAS UNE PANNE (26/09/2026). Il levait l'erreur ci-dessous :
   * le vendeur gratuit à sa seizième commande recevait une page d'erreur, au lieu de
   * l'explication — et de l'offre qui la lève. Il revient à la liste, qui le dit.
   */
  const quota = quotaDepuisErreur(error);
  if (quota !== null) redirect(cheminQuotaAtteint(langue, quota));

  if (error !== null || data === null) {
    // Pas de `catch` muet : sans cette sortie, le vendeur serait renvoyé sur une
    // liste inchangée et conclurait que le bouton ne marche pas.
    throw new Error("création de commande impossible : " + (error?.message ?? "réponse vide"));
  }

  /*
   * PAS D'ÉMISSION ICI, et c'est la correction d'un DÉNOMINATEUR.
   *
   * Cette action redirige vers l'éditeur, qui émet `order_editor_opened` en
   * rendant. Émettre aussi depuis ici produisait DEUX événements pour une seule
   * ouverture — sur un événement déclaré dénominateur du taux d'activation.
   * Un dénominateur gonflé fait BAISSER le taux : le biais va cette fois du
   * côté pessimiste, ce qui le rend seulement moins dangereux, pas correct.
   *
   * La distinction que portait `origine: "creation"` n'est pas perdue : la page
   * la reconstruit depuis `first_content_at`, qui dit si la commande a déjà reçu
   * du contenu réel. Un fait, un point d'émission.
   */
  redirect("/" + langue + "/commandes/" + data.id);
}

/**
 * Enregistre UN champ.
 *
 * Un champ à la fois, et non le formulaire entier : la sauvegarde est
 * automatique, deux champs modifiés coup sur coup produiraient sinon deux
 * écritures dont la seconde écraserait la première avec une valeur périmée.
 *
 * L'INTERFACE N'AFFIRME JAMAIS CE QUE LA BASE N'A PAS ENREGISTRÉ. En cas
 * d'échec, cette action rend la valeur RÉELLEMENT en base, pour que l'écran y
 * revienne au lieu de laisser à l'affichage une saisie que personne n'a gardée.
 */
export async function enregistrerChamp(
  id: unknown,
  champ: unknown,
  valeur: unknown,
): Promise<ResultatEnregistrement> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session", champ: typeof champ === "string" ? champ : "" };
  }

  const supabase = await creerClientServeur();
  return appliquerChamp(supabase, profil.profilId, id, champ, valeur);
}

/**
 * Révoque le lien public et en régénère un.
 *
 * L'INVALIDATION PORTE SUR LES DEUX JETONS : l'ancien et le nouveau. Oublier
 * l'ancien laisserait le cache servir la page à qui détient le lien fuité — et
 * la révocation, qui existe précisément pour ça, n'aurait rien coupé.
 */
export async function revoquerLienPublic(
  orderId: unknown,
): Promise<Revocation | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  // L'ANCIEN JETON EST RELU EN BASE, sous RLS, juste avant la rotation — il venait du
  // navigateur (contre-audit du 03/10/2026) : deux onglets sur la même fiche, le second
  // révoquait avec un jeton déjà révoqué et invalidait le mauvais cache. Une course reste
  // possible entre cette lecture et la rotation ; elle ne vaut qu'entre deux révocations
  // simultanées de la MÊME commande par son propre vendeur.
  const id = Identifiant.safeParse(orderId);
  const lu = id.success
    ? await supabase.from("orders").select("public_token").eq("id", id.data).maybeSingle()
    : null;
  const resultat = await revoquerLien(supabase, profil.profilId, orderId);

  if (resultat.statut === "ok") {
    // Une lecture échouée ne fait pas lever la révocation APRÈS que la base a déjà tourné
    // le jeton : le vendeur croirait avoir échoué alors que son lien est bien coupé.
    const ancien = lu?.data?.public_token;
    if (typeof ancien === "string") invaliderCommandePublique(ancien);
    invaliderCommandePublique(resultat.nouveauJeton);
  }

  return resultat;
}

export async function dupliquer(
  orderId: unknown,
  langue: unknown,
): Promise<Duplication | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  const resultat = await dupliquerCommande(supabase, profil.profilId, profil.shopId, orderId);

  if (resultat.statut === "ok") {
    // Ensemble FERMÉ : une langue venue du navigateur ne peut porter aucun
    // chemin. ⚠️ Il s'écrivait `=== "en" ? "en" : "fr"`, antérieur au chinois :
    // dupliquer une commande depuis `/zh-CN` renvoyait l'éditeur en français.
    redirect("/" + (typeof langue === "string" && estLangueSupportee(langue) ? langue : LANGUE_DEFAUT) + "/commandes/" + resultat.nouvelleCommande);
  }

  return resultat;
}


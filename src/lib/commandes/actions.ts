"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { LANGUE_DEFAUT } from "@/i18n/config";
import { SchemaLangue } from "@/i18n/schema";

/**
 * LA FORME D UN JETON RENVOYÉ PAR LE NAVIGATEUR.
 *
 * Il ne sert JAMAIS à autoriser quoi que ce soit — l autorisation vient du
 * profil et de la RLS. Il ne sert qu à nommer l entrée de cache à invalider.
 * On borne donc sa forme, sans plus : une valeur non textuelle ferait lever
 * l invalidation après une mutation déjà écrite en base, et le vendeur
 * conclurait à un échec devant une opération réussie.
 */
const Jeton = z.string().max(200);
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types-base";
import { appliquerChamp, type ResultatEnregistrement } from "./ecriture";
import { invaliderCommandePublique } from "./cache";
import {
  archiverCommande,
  dupliquerCommande,
  revoquerLien,
  type Archivage,
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
  ancienJeton: unknown,
): Promise<Revocation | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  const resultat = await revoquerLien(supabase, profil.profilId, orderId);

  if (resultat.statut === "ok") {
    // L ANCIEN JETON VIENT DU NAVIGATEUR. Il ne sert qu à invalider une entrée
    // de cache : une valeur non textuelle ne doit pas faire lever la révocation
    // APRÈS que la base a déjà tourné le jeton — le vendeur croirait avoir
    // échoué alors que son lien est bel et bien coupé.
    const ancien = Jeton.safeParse(ancienJeton);
    if (ancien.success) invaliderCommandePublique(ancien.data);
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
    // Ensemble FERMÉ : tout ce qui n est pas exactement « en » vaut « fr ».
    // Une langue venue du navigateur ne peut donc porter aucun chemin.
    redirect("/" + (langue === "en" ? "en" : "fr") + "/commandes/" + resultat.nouvelleCommande);
  }

  return resultat;
}

export async function archiver(
  orderId: unknown,
  jeton: unknown,
  archiver: unknown,
): Promise<Archivage | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  const resultat = await archiverCommande(supabase, profil.profilId, orderId, archiver === true);

  // Archiver ne retire PAS la page, mais l'invalidation reste juste : la vue
  // publique lit d'autres colonnes de la même ligne, et un cache tenu pour une
  // mutation près finirait par l'être pour toutes.
  const cible = Jeton.safeParse(jeton);
  if (resultat.statut === "ok" && cible.success) {
    invaliderCommandePublique(cible.data);
  }

  return resultat;
}

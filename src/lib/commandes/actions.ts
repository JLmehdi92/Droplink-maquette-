"use server";

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types-base";
import { appliquerChamp, type ResultatEnregistrement } from "./ecriture";
import { etiquetteCommandePublique } from "./cache";
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

  const langue = z.enum(["fr", "en"]).catch("fr").parse(donnees.get("langue"));

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

  await emettre(EVENEMENTS.EDITEUR_OUVERT, { sujet: profil.profilId }, { origine: "creation" });

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
  id: string,
  champ: string,
  valeur: string,
): Promise<ResultatEnregistrement> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session", champ };
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
  orderId: string,
  ancienJeton: string,
): Promise<Revocation | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  const resultat = await revoquerLien(supabase, profil.profilId, orderId);

  if (resultat.statut === "ok") {
    revalidateTag(etiquetteCommandePublique(ancienJeton));
    revalidateTag(etiquetteCommandePublique(resultat.nouveauJeton));
  }

  return resultat;
}

export async function dupliquer(
  orderId: string,
  langue: string,
): Promise<Duplication | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  const resultat = await dupliquerCommande(supabase, profil.profilId, profil.shopId, orderId);

  if (resultat.statut === "ok") {
    redirect("/" + (langue === "en" ? "en" : "fr") + "/commandes/" + resultat.nouvelleCommande);
  }

  return resultat;
}

export async function archiver(
  orderId: string,
  jeton: string,
  archiver: boolean,
): Promise<Archivage | { statut: "echec"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "echec", motif: "session" };
  }

  const supabase = await creerClientServeur();
  const resultat = await archiverCommande(supabase, profil.profilId, orderId, archiver);

  // Archiver ne retire PAS la page, mais l'invalidation reste juste : la vue
  // publique lit d'autres colonnes de la même ligne, et un cache tenu pour une
  // mutation près finirait par l'être pour toutes.
  if (resultat.statut === "ok") revalidateTag(etiquetteCommandePublique(jeton));

  return resultat;
}

/**
 * LES ACTIONS DE LA LISTE — appelées par des FORMULAIRES, pas par du JavaScript.
 *
 * Elles existent en plus des trois ci-dessus, qui prennent leurs arguments un à
 * un depuis un îlot client. Ici l'écran est rendu entièrement côté serveur : une
 * action par formulaire ne coûte pas un octet de bundle, et archiver marche
 * même si le JavaScript n'a pas chargé — ce qui arrive plus souvent qu'on ne le
 * croit sur un téléphone d'entrée de gamme en 4G.
 *
 * ⚠️ CHAQUE EXPORT D'UN MODULE `"use server"` EST UN POINT D'ENTRÉE ATTEIGNABLE
 * DEPUIS LE NAVIGATEUR. Ces trois-là revérifient donc la session et valident
 * leur `FormData` avec Zod, sans supposer qu'un écran les a précédées : rien ne
 * garantit qu'un formulaire a jamais été affiché.
 */

const Retour = z.string().max(500).catch("");

/** Où revenir après l'action. Toujours une URL RELATIVE de ce site. */
function destination(donnees: FormData, defaut: string): string {
  const brut = Retour.parse(donnees.get("retour"));
  // Une redirection ouverte transformerait un bouton « archiver » en tremplin
  // vers un site tiers : il suffirait d'un lien préparé pour que le vendeur
  // atterrisse sur une fausse page de connexion, en venant de chez nous. Seul un
  // chemin commençant par UN SEUL `/` est accepté — `//exemple.test` est une URL
  // absolue déguisée, que le navigateur suit vers un autre domaine.
  if (brut.startsWith("/") && !brut.startsWith("//")) return brut;
  return defaut;
}

const Identifiant = z.string().uuid();

export async function archiverDepuisListe(donnees: FormData): Promise<void> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") redirect("/fr/connexion?erreur=session");

  const id = Identifiant.safeParse(donnees.get("id"));
  const jeton = z.string().max(64).safeParse(donnees.get("jeton"));
  const archiver = donnees.get("archiver") === "1";
  const retour = destination(donnees, "/fr/commandes");
  if (!id.success) redirect(retour);

  const supabase = await creerClientServeur();
  const resultat = await archiverCommande(supabase, profil.profilId, id.data, archiver);

  if (resultat.statut === "ok" && jeton.success && jeton.data !== "") {
    revalidateTag(etiquetteCommandePublique(jeton.data));
  }

  redirect(retour);
}

export async function dupliquerDepuisListe(donnees: FormData): Promise<void> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") redirect("/fr/connexion?erreur=session");

  const id = Identifiant.safeParse(donnees.get("id"));
  const langue = z.enum(["fr", "en"]).catch("fr").parse(donnees.get("langue"));
  const retour = destination(donnees, "/" + langue + "/commandes");
  if (!id.success) redirect(retour);

  const supabase = await creerClientServeur();
  const resultat = await dupliquerCommande(supabase, profil.profilId, profil.shopId, id.data);

  // La copie est un GABARIT vide : on ouvre son éditeur, parce que personne ne
  // duplique pour laisser la copie en l'état. Sur échec on revient à la liste
  // plutôt que d'inventer une destination.
  if (resultat.statut !== "ok") redirect(retour);
  redirect("/" + langue + "/commandes/" + resultat.nouvelleCommande);
}

export type ResultatLot =
  | { readonly statut: "ok"; readonly nombre: number }
  | { readonly statut: "echec"; readonly motif: "session" | "saisie" | "partiel" | "ecriture" };

/**
 * Archive ou désarchive une SÉLECTION, tout ou rien.
 *
 * L'atomicité est celle de la base : la fonction `archiver_lot` compare ce
 * qu'elle a modifié à ce qu'on lui a demandé et lève si les deux diffèrent, ce
 * qui annule la transaction entière. Une sélection à moitié archivée sans que le
 * vendeur sache LAQUELLE est pire que l'échec complet.
 */
export async function archiverLot(donnees: FormData): Promise<void> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") redirect("/fr/connexion?erreur=session");

  const ids = z
    .array(Identifiant)
    .max(200)
    .safeParse(donnees.getAll("selection").map(String));
  const archiver = donnees.get("archiver") === "1";
  const retour = destination(donnees, "/fr/commandes");

  if (!ids.success || ids.data.length === 0) redirect(retour + separateur(retour) + "lot=vide");

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc("archiver_lot", {
    p_ids: ids.data,
    p_archiver: archiver,
  });

  if (error !== null) {
    // L'ÉCHEC EST DIT, et distingué : « refusé » n'est pas « en panne ». Un lot
    // refusé se refait à l'identique, un lot en panne non.
    const motif = error.code === "DL038" ? "partiel" : "ecriture";
    redirect(retour + separateur(retour) + "lot=" + motif);
  }

  await emettre(
    EVENEMENTS.COMMANDE_ARCHIVEE,
    { sujet: profil.profilId },
    { lot: data ?? 0, archivee: archiver },
  );

  redirect(retour + separateur(retour) + "lot=ok&n=" + String(data ?? 0));
}

function separateur(url: string): string {
  return url.includes("?") ? "&" : "?";
}

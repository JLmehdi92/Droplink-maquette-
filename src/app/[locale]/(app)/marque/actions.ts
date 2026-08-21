"use server";

import { revalidatePath } from "next/cache";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { emettre } from "@/lib/instrumentation/emettre";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { appliquerReglagesMarque, ReglagesMarque } from "@/lib/boutique/reglages";
import {
  confirmerDepotDeLogo,
  preparerDepotDeLogo,
  retirerLogo,
  type PreparationLogo,
} from "@/lib/boutique/logo";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * RÉGLAGES DE MARQUE — les actions.
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE. Le layout de l'espace authentifié écarte
 * un visiteur sans session, mais une Server Action NE PASSE PAS par le layout :
 * c'est un point d'entrée à part entière, atteignable par une requête forgée qui
 * n'a jamais affiché l'écran. Une garde posée seulement dans le layout serait
 * une garde absente.
 *
 * DANS UN MODULE `"use server"`, CHAQUE EXPORT EST ATTEIGNABLE DEPUIS LE
 * NAVIGATEUR. Le travail réel vit dans `lib/boutique/*`, en `server-only`, et
 * c'est ce travail-là que les tests exercent.
 *
 * PAS DE SAUVEGARDE AUTOMATIQUE ICI, contrairement à l'éditeur de commande. Un
 * réglage de marque change TOUTES les pages publiques du vendeur d'un seul
 * geste : enregistrer à chaque frappe ferait défiler des états intermédiaires
 * chez ses clients pendant qu'il tape un code hexadécimal. L'éditeur touche une
 * commande que personne ne regarde à cet instant ; cet écran touche tout le
 * monde à la fois.
 */

export type ResultatMarque =
  | { statut: "inactif" }
  | { statut: "enregistre" }
  | { statut: "erreur"; motif: "saisie" | "session" | "ecriture"; champs?: readonly string[] };

export async function enregistrerMarque(
  _precedent: ResultatMarque,
  donnees: FormData,
): Promise<ResultatMarque> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "erreur", motif: "session" };
  }

  const analyse = ReglagesMarque.safeParse({
    nom: donnees.get("nom") ?? undefined,
    couleurAccent: donnees.get("couleurAccent"),
    languePublique: donnees.get("languePublique"),
    // Une case non cochée n'est PAS transmise par le navigateur : son absence
    // vaut « faux ». Lire `=== "on"` traiterait l'absence comme une erreur de
    // saisie et refuserait tout enregistrement qui désactive le filigrane.
    filigrane: donnees.get("filigrane") !== null,
  });

  if (!analyse.success) {
    // On NOMME les champs en échec. « Quelque chose ne va pas » oblige à deviner
    // lequel, et le témoin de l'éditeur a déjà tranché cette question.
    const champs = [...new Set(analyse.error.issues.map((i) => String(i.path[0] ?? "")))];
    return { statut: "erreur", motif: "saisie", champs };
  }

  const supabase = await creerClientServeur();
  const ecrit = await appliquerReglagesMarque(supabase, profil.shopId, analyse.data);
  if (!ecrit) return { statut: "erreur", motif: "ecriture" };

  await emettre(
    EVENEMENTS.MARQUE_ENREGISTREE,
    { sujet: profil.profilId },
    {
      // On mesure les DÉCISIONS, jamais leur contenu : le nom et la couleur
      // appartiennent au vendeur, le fait qu'il les configure appartient au
      // produit. C'est ce dernier qui dit si l'écran sert à quelque chose.
      boutique_nommee: analyse.data.nom !== undefined && analyse.data.nom !== "",
      logo_present: profil.logoUrl !== null,
      filigrane: analyse.data.filigrane,
      langue_publique: analyse.data.languePublique,
      // La couleur a-t-elle bougé depuis le défaut ? Sans cette distinction, on
      // ne saurait pas si les vendeurs personnalisent réellement leurs pages.
      couleur_personnalisee: analyse.data.couleurAccent.toLowerCase() !== "#0058be",
    },
  );

  // L'écran lui-même doit refléter ce qui vient d'être écrit. La page publique,
  // elle, n'a rien à invalider : elle est dynamique, et une mutation faite en
  // base y arrive en deux dixièmes de seconde — établi par la sonde de fumée,
  // pas supposé.
  revalidatePath(`/${profil.langue}/marque`);

  return { statut: "enregistre" };
}

export async function preparerLogo(
  typeMime: string,
  tailleOctets: number,
): Promise<PreparationLogo | { statut: "erreur"; motif: "session" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "erreur", motif: "session" };
  }
  return preparerDepotDeLogo(profil.shopId, typeMime, tailleOctets);
}

export async function confirmerLogo(cle: string): Promise<{ statut: "ok" | "erreur" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return { statut: "erreur" };

  const supabase = await creerClientServeur();
  const ok = await confirmerDepotDeLogo(supabase, profil.shopId, cle);
  if (!ok) return { statut: "erreur" };

  revalidatePath(`/${profil.langue}/marque`);
  return { statut: "ok" };
}

export async function supprimerLogo(): Promise<{ statut: "ok" | "erreur" }> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return { statut: "erreur" };

  const supabase = await creerClientServeur();
  const ok = await retirerLogo(supabase, profil.shopId, profil.logoUrl);
  if (!ok) return { statut: "erreur" };

  revalidatePath(`/${profil.langue}/marque`);
  return { statut: "ok" };
}

"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { emettre } from "@/lib/instrumentation/emettre";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { cleLogo } from "@/lib/storage/cles";
import { limites } from "@/lib/storage/limites";
import { lireTaille, signerDepot, supprimer } from "@/lib/storage/r2";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * Onboarding — soixante secondes, quatre décisions.
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE. Le layout de l'espace authentifié
 * redirige un visiteur non connecté, mais une Server Action ne passe PAS par le
 * layout : c'est un point d'entrée à part entière, atteignable par une requête
 * forgée qui n'a jamais affiché la page. Une garde posée seulement dans le
 * layout serait une garde absente.
 *
 * L'écriture passe par le client AVEC SESSION, donc sous RLS. Le vendeur ne
 * peut écrire que ses propres lignes parce que la BASE le lui interdit, pas
 * parce que notre requête est bien écrite. La différence compte le jour où
 * quelqu'un ajoutera un filtre de travers.
 */

const TYPES_LOGO_ACCEPTES = ["image/png", "image/jpeg", "image/webp"] as const;

const Onboarding = z.object({
  // NULLABLE EN BASE, OBLIGATOIRE ICI. La colonne n'a pas de valeur par défaut
  // pour que le manque soit visible plutôt que silencieux : un défaut à
  // `reseller` aurait classé tous les fournisseurs comme revendeurs et faussé
  // irrémédiablement la segmentation d'usage, qui est le livrable réel de la
  // phase de validation.
  typeDeCompte: z.enum(["supplier", "reseller"]),
  // Le nom reste FACULTATIF, y compris ici. Un vendeur peut envoyer un lien sans
  // avoir jamais configuré sa boutique — la page publique omet alors l'en-tête,
  // et c'est le cas principal en début de vie d'un compte, pas un repli dégradé.
  nomBoutique: z.string().trim().max(60).optional(),
  couleurAccent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "couleur hexadécimale à six chiffres attendue"),
  locale: z.enum(["fr", "en"]),
});

export type ResultatOnboarding =
  | { statut: "inactif" }
  | { statut: "erreur"; motif: "saisie" | "session" | "ecriture"; champs?: readonly string[] };

export async function terminerOnboarding(
  _precedent: ResultatOnboarding,
  donnees: FormData,
): Promise<ResultatOnboarding> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "erreur", motif: "session" };
  }

  const analyse = Onboarding.safeParse({
    typeDeCompte: donnees.get("typeDeCompte"),
    nomBoutique: donnees.get("nomBoutique") ?? undefined,
    couleurAccent: donnees.get("couleurAccent"),
    locale: donnees.get("locale"),
  });
  if (!analyse.success) {
    // On NOMME les champs en échec plutôt que d'afficher un refus global :
    // « quelque chose ne va pas » oblige à deviner lequel des quatre.
    const champs = [...new Set(analyse.error.issues.map((i) => String(i.path[0] ?? "")))];
    return { statut: "erreur", motif: "saisie", champs };
  }

  const supabase = await creerClientServeur();

  const { error: erreurProfil } = await supabase
    .from("profiles")
    .update({ account_type: analyse.data.typeDeCompte, locale: analyse.data.locale })
    .eq("id", profil.profilId);

  if (erreurProfil !== null) {
    return { statut: "erreur", motif: "ecriture" };
  }

  const nom = analyse.data.nomBoutique;
  const { error: erreurShop } = await supabase
    .from("shops")
    .update({
      // Une chaîne vide est enregistrée comme ABSENCE, pas comme nom vide : la
      // page publique décide d'omettre l'en-tête sur `null`, et un nom vide
      // produirait une barre de titre vide au lieu de pas de barre du tout.
      name: nom === undefined || nom === "" ? null : nom,
      // La valeur choisie est stockée telle quelle et n'est JAMAIS réécrite. Le
      // contraste est obtenu au rendu, en dérivant des variantes lisibles — si
      // l'on corrigeait la couleur en base, le vendeur verrait autre chose que
      // ce qu'il a choisi sans qu'on le lui dise.
      accent_color: analyse.data.couleurAccent.toLowerCase(),
    })
    .eq("id", profil.shopId);

  if (erreurShop !== null) {
    return { statut: "erreur", motif: "ecriture" };
  }

  await emettre(
    EVENEMENTS.ONBOARDING_TERMINE,
    { sujet: profil.profilId },
    {
      type_de_compte: analyse.data.typeDeCompte,
      // On mesure si le nom a été renseigné, pas ce qu'il contient : le nom est
      // une donnée du vendeur, sa présence est une donnée de produit.
      boutique_nommee: nom !== undefined && nom !== "",
      logo_depose: profil.logoUrl !== null,
    },
  );

  redirect(`/${analyse.data.locale}/commandes`);
}

export type ResultatDepotLogo =
  | { statut: "pret"; url: string; cle: string; enTetes: Record<string, string> }
  | { statut: "erreur"; motif: "session" | "type" | "taille" };

/**
 * Prépare le dépôt du logo : rend une URL présignée.
 *
 * LE FICHIER NE TRANSITE PAS PAR CETTE ACTION. Les Server Actions ont une limite
 * de corps d'un mégaoctet, et un dépôt à travers elles échoue dès le premier
 * fichier un peu lourd — piège d'autant plus vicieux qu'il PASSE en
 * développement sur de petits fichiers de test. Le navigateur envoie donc
 * directement à R2, avec une URL que le serveur a signée.
 *
 * LA CLÉ EST GÉNÉRÉE ICI, JAMAIS FOURNIE PAR LE CLIENT : une clé choisie par le
 * client permettrait d'écraser le logo — ou le média — d'un autre vendeur.
 *
 * PAS DE SVG. Le format est accepté par le module de clés, mais refusé sur ce
 * chemin : un SVG est un document capable de porter du script, et l'assainir
 * exige de le relire côté serveur après dépôt. Tant que cet assainissement
 * n'existe pas, l'accepter reviendrait à héberger du script fourni par
 * l'utilisateur. Tout vendeur sait exporter un PNG.
 */
export async function preparerDepotLogo(
  typeMime: string,
  tailleOctets: number,
): Promise<ResultatDepotLogo> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "erreur", motif: "session" };
  }

  const normalise = typeMime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!(TYPES_LOGO_ACCEPTES as readonly string[]).includes(normalise)) {
    return { statut: "erreur", motif: "type" };
  }

  const plafond = limites().logoOctets;
  if (!Number.isInteger(tailleOctets) || tailleOctets <= 0 || tailleOctets > plafond) {
    return { statut: "erreur", motif: "taille" };
  }

  const cle = cleLogo({ shopId: profil.shopId, logoId: randomUUID(), typeMime: normalise });
  const { url, enTetesObligatoires } = await signerDepot({
    cle,
    typeMime: normalise,
    tailleOctets,
  });

  return { statut: "pret", url, cle, enTetes: enTetesObligatoires };
}

export type ResultatConfirmationLogo = { statut: "ok"; cle: string } | { statut: "erreur" };

/**
 * Confirme le dépôt : relit la taille RÉELLE côté serveur, puis enregistre.
 *
 * On ne croit jamais le client sur la taille d'un fichier — c'est la base du
 * modèle de coût. La signature borne déjà ce qui peut être envoyé, mais cette
 * relecture est ce qui rend la borne VÉRIFIÉE plutôt que supposée, et elle
 * attrape aussi le cas où rien n'est arrivé.
 */
export async function confirmerDepotLogo(cle: string): Promise<ResultatConfirmationLogo> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return { statut: "erreur" };

  // La clé doit appartenir à CE vendeur. Sans ce contrôle, quelqu'un pourrait
  // confirmer la clé d'un autre et s'attribuer son logo — une clé n'est pas un
  // secret, elle est simplement difficile à deviner.
  if (!cle.startsWith(`logos/${profil.shopId}/`)) return { statut: "erreur" };

  const taille = await lireTaille(cle);
  if (taille === null) return { statut: "erreur" };

  if (taille > limites().logoOctets) {
    // Refus APRÈS mesure réelle : on retire l'objet plutôt que de le laisser
    // occuper l'espace d'un fichier qu'on vient de déclarer inacceptable.
    await supprimer(cle);
    return { statut: "erreur" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.from("shops").update({ logo_url: cle }).eq("id", profil.shopId);
  if (error !== null) return { statut: "erreur" };

  return { statut: "ok", cle };
}

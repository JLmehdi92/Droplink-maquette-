"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import { appliquerReglagesMarque } from "@/lib/boutique/reglages";
import {
  CleDeposee,
  confirmerDepotDeLogo,
  preparerDepotDeLogo,
  TailleDemandee,
  TypeMimeDemande,
} from "@/lib/boutique/logo";

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

  /*
   * L'ONBOARDING NE SE REJOUE PAS.
   *
   * DÉFAUT TROUVÉ PAR AUDIT : cette action ne vérifiait pas qu'il restait à
   * faire. Un second appel — un POST forgé, qui ne passe ni par le layout ni
   * par la redirection de la page — RÉÉCRIVAIT quatre choses :
   *
   *   - `account_type`, donc un RECLASSEMENT RÉTROACTIF de tout l'historique
   *     d'usage du compte. La segmentation fournisseur / revendeur est le
   *     livrable réel de cette phase : la laisser réécrivable, c'est laisser
   *     réécrire la conclusion ;
   *   - la couleur d'accent et la langue publique, donc l'apparence de toutes
   *     les pages déjà envoyées aux clients ;
   *   - le FILIGRANE, remis à `false` — un réglage que le vendeur avait pu
   *     activer depuis, et qui disparaissait sans un mot ;
   *   - l'événement de fin d'onboarding, réémis, donc ce compteur gonflé.
   *
   * L'onboarding est un geste initial. Tout ce qu'il pose est modifiable
   * ensuite, mais par l'écran des réglages de marque — celui qui montre au
   * vendeur ce qu'il change.
   */
  if (!onboardingAFaire(profil)) {
    return { statut: "erreur", motif: "session" };
  }

  const analyse = Onboarding.safeParse({
    typeDeCompte: donnees.get("typeDeCompte"),
    // ⚠️ LA CLÉ EST « nom », comme dans le champ qui l'envoie et comme dans
    // l'action des réglages de marque. Elle a longtemps valu « nomBoutique »
    // ici, et nulle part ailleurs : le formulaire postait `nom`, cette ligne
    // lisait autre chose, et le nom de boutique saisi à l'inscription était
    // jeté pour tous les comptes. Rien ne pouvait le dire — le champ est
    // facultatif, l'absence est un état légitime, et la page publique omet son
    // en-tête sans nom, ce que le brief décrit comme le cas principal.
    // `tests/unit/formulaires-et-actions.test.ts` compare désormais les deux
    // bouts du contrat, dans les deux sens.
    nomBoutique: donnees.get("nom") ?? undefined,
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

  // LE CHOIX UNIQUE DE L'ONBOARDING INITIALISE LES DEUX LANGUES.
  //
  // `profiles.locale` habille l'interface du vendeur, `shops.default_language`
  // habille les pages que voient ses clients. Ce sont deux réglages distincts,
  // et les réglages de marque permettent de les dissocier — un fournisseur peut
  // travailler en anglais et livrer en France. Mais à l'inscription, personne
  // n'a encore de raison de les distinguer : offrir deux menus ici ferait payer
  // à tout le monde un cas qui concerne une minorité.
  //
  // Sans cette ligne, `default_language` restait à son défaut `fr` pour TOUS les
  // comptes, y compris ceux qui avaient tout choisi en anglais. Le défaut ne se
  // voyait pas côté vendeur : il ne se voyait que chez son client. Ce qui
  // l'empêche de revenir n'est pas cette relecture mais le TYPAGE — la langue
  // publique est obligatoire dans `ReglagesMarque`, donc l'omettre ne compile
  // pas.
  const ecrit = await appliquerReglagesMarque(supabase, profil.shopId, {
    ...(nom === undefined ? {} : { nom }),
    couleurAccent: analyse.data.couleurAccent,
    languePublique: analyse.data.locale,
    // Le filigrane est un réglage de marque, pas une décision d'inscription :
    // il se règle plus tard, avec un aperçu sous les yeux.
    filigrane: false,
  });

  if (!ecrit) {
    return { statut: "erreur", motif: "ecriture" };
  }

  emettreApres(
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
  entreeType: unknown,
  entreeTaille: unknown,
): Promise<ResultatDepotLogo> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") {
    return { statut: "erreur", motif: "session" };
  }

  // LES ARGUMENTS VIENNENT DU NAVIGATEUR, et TypeScript ne les garantit pas :
  // ses annotations sont effacées à l'exécution. Sans ces deux contrôles,
  // `typeMime.split(…)` levait sur une valeur non textuelle et l'action rendait
  // 500 au lieu du refus nommé qui existe déjà.
  const type = TypeMimeDemande.safeParse(entreeType);
  if (!type.success) return { statut: "erreur", motif: "type" };
  const taille = TailleDemandee.safeParse(entreeTaille);
  if (!taille.success) return { statut: "erreur", motif: "taille" };

  // Même geste que les réglages de marque, donc même code. La duplication qui
  // vivait ici est ce qui a permis à la traversée de chemin de survivre dans un
  // chemin pendant qu'on regardait l'autre.
  return preparerDepotDeLogo(profil.shopId, type.data, taille.data);
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
export async function confirmerDepotLogo(entree: unknown): Promise<ResultatConfirmationLogo> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return { statut: "erreur" };

  // Une clé non textuelle faisait lever `cleAppartientAuShop`, et une clé
  // textuelle mais NON CANONIQUE — `logos/{monShop}/x`, qui franchit pourtant
  // le contrôle de propriété — faisait lever `exigerCleCanonique` plus bas.
  // Dans les deux cas 500, alors que le refus existe et porte un nom.
  const saisie = CleDeposee.safeParse(entree);
  if (!saisie.success) return { statut: "erreur" };
  const cle = saisie.data;

  // ⚠️ DÉLÉGATION VOLONTAIRE, ET C'EST LA CORRECTION.
  //
  // Ce chemin recopiait la confirmation du module partagé : contrôle
  // d'appartenance, relecture de taille, écriture. Deux copies d'une garde,
  // c'est celle qu'on corrige et celle qu'on oublie — et c'est exactement ce
  // qui est arrivé : la traversée de chemin trouvée le 26/08/2026 vivait dans
  // les DEUX, avec des formulations différentes.
  const supabase = await creerClientServeur();
  const ok = await confirmerDepotDeLogo(supabase, profil.shopId, cle);
  return ok ? { statut: "ok", cle } : { statut: "erreur" };
}

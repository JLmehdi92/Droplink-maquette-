import "server-only";
import { cache } from "react";
import { z } from "zod";
import { creerClientAnonyme } from "@/lib/supabase/anon";
import { signerLecture } from "@/lib/storage/r2";

/**
 * LA LECTURE DE LA PAGE PUBLIQUE.
 *
 * SANS SESSION, toujours. `server.ts` lit les cookies : s'en servir ici ferait
 * dépendre le rendu de la présence d'un cookie, et un vendeur connecté verrait
 * sa propre page autrement que son client — sans que personne s'en aperçoive
 * avant que ça compte, c'est-à-dire une fois le lien envoyé.
 *
 * UN SEUL CHEMIN DE SORTIE. Jeton inconnu, jeton révoqué et compte suspendu
 * rendent tous les trois `null`, par la même instruction. Trois chemins
 * distincts finiraient par diverger — en contenu, en code de réponse ou en
 * délai — et chacun de ces écarts est un oracle.
 */

/**
 * Le jeton, tel qu'il arrive de l'URL.
 *
 * Il est validé AVANT d'atteindre la base : 21 caractères en base 62, et rien
 * d'autre. Ce n'est pas une protection contre l'injection — la requête est
 * paramétrée — c'est une protection contre le COÛT : sans elle, n'importe quelle
 * chaîne de l'URL déclenche un aller-retour vers la base, et une adresse
 * publique est exactement ce qu'on balaie en masse.
 */
export const JetonPublic = z.string().regex(/^[0-9A-Za-z]{16,64}$/);

export interface Boutique {
  readonly nom: string | null;
  readonly logo: string | null;
  readonly couleur: string;
  readonly langue: string;
  /**
   * Vrai quand le vendeur a demandé un filigrane ET qu'il y a un nom à écrire.
   * La condition est résolue EN BASE : un filigrane activé sans nom de boutique
   * n'a rien à superposer, et l'afficher quand même produirait une bande vide.
   */
  readonly filigrane: boolean;
  /**
   * Les réseaux du vendeur, chacun `null` quand il n'est pas configuré.
   *
   * TROIS CHAMPS ET PAS UN TABLEAU : le rendu n'est pas le même d'un réseau à
   * l'autre — logo, couleur, libellé — et un tableau obligerait la page à
   * traduire une chaîne en composant, donc à accepter une valeur inconnue. Ici,
   * ce qui n'est pas prévu ne peut pas arriver.
   */
  readonly instagram: string | null;
  readonly tiktok: string | null;
  readonly whatsapp: string | null;
}

export interface MediaPublic {
  readonly id: string;
  readonly type: "photo" | "video";
  readonly urlVignette: string | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
  readonly dureeSecondes: number | null;
}

export interface CommandePublique {
  readonly jeton: string;
  readonly client: string | null;
  readonly reference: string | null;
  readonly statut: "preparation" | "expedie" | "en_transit" | "livre";
  readonly qc: "en_attente" | "approuve" | "refuse";
  readonly numeroSuivi: string | null;
  readonly modifieeLe: string;
  readonly boutique: Boutique;
  readonly medias: readonly MediaPublic[];
  readonly couverture: string | null;
}

/**
 * Lit une commande par son jeton, ou rend `null`.
 *
 * LES URL DE MÉDIA NE SONT PAS SIGNÉES ICI. Seules les VIGNETTES le sont : ce
 * sont les seules images que le document porte. La photo pleine n'est demandée
 * qu'à l'ouverture du visionneur, et elle n'est PAS dans le document tant qu'il
 * est fermé — une balise `img` masquée serait tout de même téléchargée, c'est la
 * façon la plus courante de croire qu'on a différé un chargement sans l'avoir
 * fait.
 */
/**
 * MÉMOÏSATION PAR REQUÊTE, et rien de plus.
 *
 * `cache()` de React ne garde son résultat que le temps d'UN rendu : deux
 * requêtes HTTP distinctes repartent toujours de la base. Ce n'est donc pas un
 * cache de données — il n'y a rien à invalider, et la sonde de fumée continue de
 * constater qu'une mutation faite en base arrive en deux dixièmes de seconde.
 *
 * Ce qu'elle évite : la mise en page racine a besoin de la langue du vendeur
 * pour poser `lang` sur le document, et la page a besoin de toute la commande.
 * Sans mémoïsation, l'écran le plus contraint du produit paierait deux
 * allers-retours là où un seul suffit.
 */
export const lireCommandePublique = cache(lireCommandePubliqueSansMemo);

async function lireCommandePubliqueSansMemo(
  jetonBrut: string,
): Promise<CommandePublique | null> {
  const analyse = JetonPublic.safeParse(jetonBrut);
  if (!analyse.success) return null;

  const jeton = analyse.data;
  const supabase = creerClientAnonyme();

  const { data, error } = await supabase.rpc("lire_commande_publique", { p_jeton: jeton });

  if (error !== null || data === null || data.length === 0) return null;

  const ligne = data[0];
  if (ligne === undefined) return null;

  const { data: medias } = await supabase.rpc("lire_medias_publics", { p_jeton: jeton });

  const rendus: MediaPublic[] = await Promise.all(
    (medias ?? []).map(async (m) => ({
      id: m.id,
      type: m.type,
      urlVignette:
        m.cle_vignette === null ? null : await signerLecture(m.cle_vignette).catch(() => null),
      largeur: m.largeur,
      hauteur: m.hauteur,
      dureeSecondes: m.duree_s,
    })),
  );

  /*
   * LE LOGO EST UNE CLÉ D'OBJET, PAS UNE URL — il se signe comme le reste.
   *
   * DÉFAUT TROUVÉ PAR AUDIT. `shops.logo_url` porte la clé R2
   * `logos/{shopId}/{uuid}.{ext}` ; la surface vendeur la signait déjà, la page
   * publique la rendait BRUTE dans l'attribut `src`. Deux effets, et le second
   * était visible à l'œil sans que personne ne l'ait vu :
   *
   *   1. le `shop_id` sortait dans le HTML — la migration 017 l'énumère
   *      pourtant parmi ce qui n'est PAS rendu. La valeur voyageait sous le nom
   *      `boutique_logo`, ce qui est exactement ce qu'un contrôle par NOM ne
   *      peut pas voir : deux liens publics de deux commandes différentes
   *      devenaient corrélables au même vendeur par un identifiant interne
   *      stable ;
   *   2. l'URL étant relative, le navigateur la résolvait depuis `/p/{jeton}/`
   *      et obtenait un 404. Un vendeur ayant un logo mais pas encore de nom
   *      obtenait donc un en-tête ne contenant qu'une image cassée — une barre
   *      vide, précisément ce que la décision 24 interdit.
   *
   * L'échec de signature rend `null` plutôt que de lever : un logo illisible ne
   * doit pas emporter la page que le client vient consulter.
   */
  const logoSigne =
    ligne.boutique_logo === null ? null : await signerLecture(ligne.boutique_logo).catch(() => null);

  return {
    jeton: ligne.jeton,
    client: ligne.client,
    reference: ligne.reference,
    statut: ligne.statut,
    qc: ligne.statut_qc,
    numeroSuivi: ligne.numero_suivi,
    modifieeLe: ligne.modifiee_le,
    boutique: {
      nom: ligne.boutique_nom,
      logo: logoSigne,
      couleur: ligne.boutique_couleur,
      langue: ligne.boutique_langue,
      filigrane: ligne.boutique_filigrane,
      instagram: ligne.boutique_instagram,
      tiktok: ligne.boutique_tiktok,
      whatsapp: ligne.boutique_whatsapp,
    },
    medias: rendus,
    couverture: ligne.couverture,
  };
}

/**
 * Signe la lecture d'UN média plein, à l'ouverture du visionneur.
 *
 * Le jeton est REDEMANDÉ et revérifié : sans lui, cette fonction signerait
 * n'importe quel identifiant de média pour n'importe qui. Le média doit
 * appartenir à la commande que le jeton désigne — c'est la base qui le dit, pas
 * un filtre écrit ici.
 */
export async function signerMediaPlein(
  jetonBrut: string,
  mediaId: string,
): Promise<string | null> {
  const jeton = JetonPublic.safeParse(jetonBrut);
  const id = z.string().uuid().safeParse(mediaId);
  if (!jeton.success || !id.success) return null;

  const supabase = creerClientAnonyme();
  const { data, error } = await supabase.rpc("lire_medias_publics", { p_jeton: jeton.data });
  if (error !== null || data === null) return null;

  const media = data.find((m) => m.id === id.data);
  if (media === undefined) return null;

  return signerLecture(media.cle).catch(() => null);
}

/**
 * LE SUIVI DU COLIS, tel que la page publique l'affiche.
 *
 * SÉPARÉ DE LA COMMANDE, et lu par une seconde requête. Une commande sur deux
 * n'a pas encore de numéro : joindre le suivi à la lecture principale ferait
 * payer une jointure à tout le monde pour servir la moitié.
 *
 * AUCUN CHIFFRE DE COÛT N'EN SORT. Le nombre d'interrogations et de retours
 * vides sont NOS chiffres, pas des informations pour le client — et ce qui n'est
 * pas rendu ne peut pas fuiter.
 */
export interface Passage {
  readonly instant: string;
  readonly lieu: string | null;
  readonly description: string;
  readonly etape: string | null;
}

export interface SuiviPublic {
  readonly etape: "preparation" | "expedie" | "en_transit" | "livre";
  readonly numero: string;
  readonly premierMouvement: string | null;
  readonly dernierMouvement: string | null;
  readonly estimationDu: string | null;
  readonly estimationAu: string | null;
  readonly abandonne: boolean;
  readonly passages: readonly Passage[];
}

export async function lireSuiviPublic(jetonBrut: string): Promise<SuiviPublic | null> {
  const analyse = JetonPublic.safeParse(jetonBrut);
  if (!analyse.success) return null;

  const supabase = creerClientAnonyme();
  const jeton = analyse.data;

  // Les deux lectures partent ENSEMBLE : elles ne dépendent pas l'une de
  // l'autre, et les enchaîner doublerait la latence d'une page dont tout
  // l'intérêt est d'apparaître vite.
  const [suivi, passages] = await Promise.all([
    supabase.rpc("lire_suivi_public", { p_jeton: jeton }),
    supabase.rpc("lire_passages_publics", { p_jeton: jeton }),
  ]);

  if (suivi.error !== null || suivi.data === null || suivi.data.length === 0) return null;

  const ligne = suivi.data[0];
  if (ligne === undefined) return null;

  return {
    etape: ligne.etape,
    numero: ligne.numero,
    premierMouvement: ligne.premier_mouvement,
    dernierMouvement: ligne.dernier_mouvement,
    estimationDu: ligne.estimation_du,
    estimationAu: ligne.estimation_au,
    abandonne: ligne.abandonne,
    passages: (passages.data ?? []).map((p) => ({
      instant: p.occurred_at,
      lieu: p.location,
      description: p.description,
      etape: p.stage,
    })),
  };
}

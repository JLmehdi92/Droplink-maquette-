import "server-only";
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
export async function lireCommandePublique(jetonBrut: string): Promise<CommandePublique | null> {
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
      logo: ligne.boutique_logo,
      couleur: ligne.boutique_couleur,
      langue: ligne.boutique_langue,
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

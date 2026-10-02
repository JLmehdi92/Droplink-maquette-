import "server-only";

import { creerClientAnonyme } from "@/lib/supabase/anon";

/**
 * LES DEUX PLAFONDS, LUS SANS SESSION, POUR LES PAGES PUBLIQUES PRÉRENDUES.
 *
 * La landing affiche les quotas et le prix (décision n° 3 de Mehdi, 02/10/2026 :
 * « la maquette », donc des chiffres) — mais LUS EN BASE, jamais écrits dans la
 * page : `lire_plafond_gratuit_a_vie` et `lire_plafond_commandes` sont ouvertes à
 * `anon` depuis la migration 196 précisément pour ça. Le client sans session est
 * ce qui garde la landing prérendue : le client avec session lirait les cookies,
 * et basculerait chaque visite en rendu à la demande.
 *
 * ⚠️ UN PLAFOND ILLISIBLE REND `null`, JAMAIS UN NOMBRE DE SECOURS. Un « 15 »
 * affiché pendant que la base applique 5 serait une promesse fausse ; l'appelant
 * retire la ligne ou dit la chose sans nombre. L'échec est écrit au journal du
 * serveur, nommé.
 */
export interface PlafondsPublics {
  /** Commandes (et colis suivis) d'un compte gratuit, À VIE. */
  readonly gratuitAVie: number | null;
  /** Commandes (et colis suivis) d'un compte Pro, PAR MOIS. */
  readonly proParMois: number | null;
}

interface LecteurRpc {
  rpc(nom: "lire_plafond_gratuit_a_vie" | "lire_plafond_commandes"): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export async function lirePlafondsPublics(client?: LecteurRpc): Promise<PlafondsPublics> {
  const lire = async (nom: "lire_plafond_gratuit_a_vie" | "lire_plafond_commandes"): Promise<number | null> => {
    try {
      // Créé DANS le `try` : une variable d'environnement absente ferait lever le
      // client, et c'est la page entière qui tomberait au lieu d'une ligne.
      client ??= creerClientAnonyme();
      const { data, error } = await client.rpc(nom);
      if (error !== null) {
        console.error(`[plafonds publics] ${nom} illisible — ${error.message}`);
        return null;
      }
      return typeof data === "number" && Number.isInteger(data) && data >= 0 ? data : null;
    } catch (erreur) {
      console.error(
        `[plafonds publics] ${nom} illisible — ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
      return null;
    }
  };
  const [gratuitAVie, proParMois] = await Promise.all([
    lire("lire_plafond_gratuit_a_vie"),
    lire("lire_plafond_commandes"),
  ]);
  return { gratuitAVie, proParMois };
}

import "server-only";
import { notFound } from "next/navigation";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * LA GARDE ADMIN — la seule qui fasse autorité.
 *
 * LE MIDDLEWARE NE PROTÈGE AUCUNE DONNÉE À LUI SEUL. Il s'exécute avant la page,
 * mais PAS avant une Server Action : celles-ci sont des points d'entrée à part
 * entière, atteignables par une requête forgée qui n'a jamais affiché l'écran.
 * Le matcher exclut de plus `/api`, donc une route `/api/admin/...` ne serait
 * protégée par rien — et son préfixe donnerait l'impression contraire à qui la
 * relit.
 *
 * LE RÔLE EST LU EN BASE, À CHAQUE APPEL. Jamais un claim du jeton : un jeton
 * reste valide jusqu'à son expiration même après une rétrogradation ou une
 * suspension, et s'y fier laisserait un ancien administrateur travailler jusqu'à
 * une heure de plus. Jamais un `useEffect`, jamais une comparaison d'email en
 * dur.
 *
 * `notFound()` ET JAMAIS 403. Un 403 confirme que la surface existe ; un 404 ne
 * dit rien. La différence n'est pas cosmétique : c'est ce qui sépare « il y a un
 * back-office ici, cherchons une faille » de « il n'y a rien ».
 */

export interface Administrateur {
  readonly profilId: string;
  readonly email: string;
}

/**
 * Rend l'administrateur, ou rend un 404 sans jamais revenir.
 *
 * La vérification passe par la fonction `est_admin()` en base plutôt que par une
 * lecture de colonne côté application : c'est la MÊME autorité que celle
 * qu'appliquent les fonctions de lecture auditées. Deux définitions du rôle
 * finiraient par diverger, et c'est la plus permissive des deux qui gagnerait.
 */
export async function exigerAdmin(): Promise<Administrateur> {
  const profil = await lireProfilVendeur();
  if (profil === null) notFound();

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc("est_admin");

  // FAIL-CLOSED. Une erreur de lecture n'est pas une autorisation : si l'on ne
  // peut pas établir que l'appelant est administrateur, il ne l'est pas. Le
  // réflexe inverse — « en cas de doute, laisser passer pour ne pas casser » —
  // est exactement ce qui ouvre une surface le jour d'un incident de base.
  if (error !== null || data !== true) notFound();

  return { profilId: profil.profilId, email: profil.email };
}

/**
 * Vrai si l'appelant est administrateur, sans interrompre.
 *
 * Réservé aux endroits qui doivent DÉCIDER plutôt que refuser — afficher ou non
 * une entrée de navigation, par exemple. Ne jamais l'employer pour protéger une
 * lecture : `exigerAdmin()` est la garde, celle-ci n'est qu'un renseignement.
 */
export async function estAdmin(): Promise<boolean> {
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc("est_admin");
  return error === null && data === true;
}

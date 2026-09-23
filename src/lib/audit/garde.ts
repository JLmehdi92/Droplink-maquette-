import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import { verifierQuotaAdmin } from "@/lib/limitation/quota";

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
export const exigerAdmin = cache(exigerAdminSansMemo);

/**
 * MÉMOÏSÉE PAR REQUÊTE, et rien de plus.
 *
 * `cache()` de React ne garde son résultat que le temps d'UN rendu : deux
 * requêtes HTTP distinctes revérifient toujours le rôle en base. Ce n'est donc
 * pas un cache d'autorisation — il n'y a rien à invalider, et une rétrogradation
 * prend effet à la requête suivante.
 *
 * Ce qu'elle permet : appeler cette garde AUSSI DANS `generateMetadata` sans
 * payer un second aller-retour. C'est nécessaire, et le défaut qui l'a montré
 * était réel — Next évalue les métadonnées en parallèle du rendu, donc le
 * `<title>` d'un écran d'administration se retrouvait dans le corps du 404 servi
 * à un visiteur sans droits. Le code de réponse ne disait rien ; le titre disait
 * tout.
 */
async function exigerAdminSansMemo(): Promise<Administrateur> {
  /*
   * LE PLAFOND VIENT EN PREMIER, AVANT MÊME DE SAVOIR QUI APPELLE.
   *
   * DÉFAUT TROUVÉ À L'AUDIT DU 26/08/2026 : la surface d'administration n'avait
   * AUCUN compteur de débit, alors que le brief en exige un, distinct de celui
   * de la page publique. Chaque requête anonyme vers `/fr/admin/...` coûtait
   * deux allers-retours en base — le profil, puis le rôle — avant de rendre son
   * 404. C'était le moyen le moins cher de nous faire travailler, et il était
   * gratuit pour l'attaquant.
   *
   * L'ORDRE COMPTE : si le plafond était vérifié APRÈS la lecture du profil, il
   * ne bornerait plus rien — le coût qu'il est censé éviter serait déjà payé.
   *
   * ET IL REFUSE EN CAS DE PANNE DU COMPTEUR. La page publique fait l'inverse,
   * délibérément : y refuser pénaliserait les clients d'un vendeur pour un
   * incident qui ne les concerne pas. Ici, un refus injustifié ne coûte qu'un
   * rechargement de page, à nous.
   *
   * `notFound()` COMME PARTOUT AILLEURS SUR CETTE SURFACE. Un 429 distinguerait
   * « trop de requêtes » de « rien ici », et cette distinction suffit à établir
   * que la surface existe. Le plafond ne doit pas devenir l'oracle que le 404
   * refuse d'être.
   */
  const quota = await verifierQuotaAdmin();
  if (!quota.autorise) notFound();

  const profil = await lireProfilVendeur();
  if (profil === null) notFound();

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc("est_admin");

  // FAIL-CLOSED. Une erreur de lecture n'est pas une autorisation : si l'on ne
  // peut pas établir que l'appelant est administrateur, il ne l'est pas. Le
  // réflexe inverse — « en cas de doute, laisser passer pour ne pas casser » —
  // est exactement ce qui ouvre une surface le jour d'un incident de base.
  if (error !== null || data !== true) {
    /*
     * UN ADMINISTRATEUR SANS DOUBLE AUTHENTIFICATION EST ENVOYÉ L'ACTIVER.
     *
     * Depuis la migration 186, la base refuse l'administration à une session à
     * un seul facteur. Lui rendre le même 404 qu'à un inconnu le laisserait
     * devant une page vide, sans savoir pourquoi son accès a disparu. La base ne
     * répond `true` ici QU'À un administrateur actif en session à un seul
     * facteur : un vendeur reçoit toujours le 404, et n'apprend rien.
     */
    const { data: sansFacteur } = await supabase.rpc("admin_sans_double_facteur");
    if (sansFacteur === true) redirect("/" + profil.langue + "/parametres");
    notFound();
  }

  return { profilId: profil.profilId, email: profil.email };
}


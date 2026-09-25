import { estLangueSupportee } from "@/i18n/config";
import { redirigerVers } from "@/lib/http/rediriger";

/**
 * L'ENTRÉE D'UN VENDEUR CONNECTÉ : DROPLINK.FR MÈNE À SON TABLEAU DE BORD.
 *
 * Wassim, 26/09/2026 : « quand je mets droplink.fr faut que ça me redirige sur
 * le tableau de bord ». Le middleware RÉÉCRIT l'accueil (`/fr`, `/en`,
 * `/zh-CN`) vers cette route quand un cookie de session est présent ; elle ne
 * fait que rediriger.
 *
 * ⚠️ SOUS `auth/`, PAS À `/…/entree` : chaque segment de premier niveau après
 * la langue doit être un nom de lien RÉSERVÉ (`tests/rls/lien-au-nom.test.ts`),
 * sinon un vendeur Pro pourrait appeler sa boutique « entree » et envoyer
 * `droplink.fr/entree/…`, qui se lit comme une page officielle. Le garde l'a
 * refusé ; `auth` est déjà réservé, ce qui évite une migration.
 *
 * ⚠️ POURQUOI UNE ROUTE ET PAS UNE REDIRECTION DANS LE MIDDLEWARE. Next 16
 * exige une `Location` ABSOLUE au bord, et la seule base qu'il y possède est
 * l'adresse du conteneur — `localhost:8080` chez Railway, le défaut du
 * 08/09/2026. Un route handler, lui, peut répondre une `Location` RELATIVE
 * (RFC 9110 §10.2.2), que le navigateur résout contre l'adresse qu'il a
 * demandée. Voir `redirigerVers`.
 *
 * ⚠️ ELLE NE VÉRIFIE PAS LA SESSION, ET N'A PAS À LE FAIRE : le tableau de bord
 * porte la vraie garde. Un cookie périmé ou révoqué y est renvoyé vers la
 * connexion par le layout de l'espace vendeur, comme partout ailleurs. Sans
 * cookie, le middleware ne réécrit rien : la landing reste statique, et un
 * moteur de recherche la voit comme avant.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  return redirigerVers(`/${langue}/tableau-de-bord`);
}

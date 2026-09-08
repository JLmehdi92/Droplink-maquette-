import { NextResponse } from "next/server";

/**
 * UNE REDIRECTION DE ROUTE HANDLER, RELATIVE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MESURÉ EN PRODUCTION LE 08/09/2026, SUR LA PREMIÈRE CONNEXION GOOGLE RÉELLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wassim s'est connecté avec Google et a atterri sur une page introuvable :
 * `localhost:8080/fr/commandes`, `ERR_CONNECTION_REFUSED`. Relevé aussitôt sur
 * le produit servi, sur les TROIS route handlers qui redirigent :
 *
 *   GET  /fr/auth/retour        → location: https://localhost:8080/fr/connexion?erreur=lien
 *   POST /fr/deconnexion        → location: https://localhost:8080/fr/connexion?info=deconnecte
 *   POST /fr/commandes/geste    → location: https://localhost:8080/fr/connexion?erreur=session
 *
 * LA CAUSE. `NextResponse.redirect()` exige une URL ABSOLUE, qu'on fabriquait
 * par `new URL(chemin, requete.url)`. Or `requete.url` est l'adresse par
 * laquelle le conteneur a été joint — chez Railway, `localhost:8080` — et non
 * celle que le navigateur a demandée. L'en-tête `Location` partait donc vers
 * une machine qui n'existe que dans le conteneur.
 *
 * ⚠️ ET C'ÉTAIT INVISIBLE DEPUIS UNE MACHINE DE DÉVELOPPEMENT, par
 * construction : en local, il n'y a pas de proxy, `requete.url` porte
 * `localhost:3000`, et c'est EXACTEMENT la bonne réponse. Toutes les sondes du
 * dépôt tournent en local ; aucune porte ne pouvait le voir. C'est le même
 * angle mort que la région Railway — un défaut que seule la production porte.
 *
 * ⚠️ CE N'ÉTAIT PAS QU'UN DÉFAUT DE CONFORT. La même route sert la
 * RÉINITIALISATION DE MOT DE PASSE, c'est-à-dire le seul recours d'un
 * utilisateur enfermé dehors depuis que le lien magique est supprimé. Elle
 * était donc cassée depuis le premier déploiement, sans qu'aucun signal ne
 * parte : la session s'ouvrait, l'écran suivant n'existait pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI RELATIF, ET NON `origineDuSite()`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `lib/site.ts` sait déjà rendre l'origine publique, et c'est ce qu'il faut
 * pour une URL qui part DANS UN EMAIL : là, aucune requête du destinataire
 * n'existe pour servir de base, et l'origine doit être configurée.
 *
 * Ici, c'est l'inverse : le navigateur vient de nous joindre, et la RFC 9110
 * §10.2.2 autorise `Location` à porter une référence relative — le client la
 * résout contre l'URL QU'IL A DEMANDÉE, donc contre `https://droplink.fr/…`.
 * Le proxy ne peut plus mentir, parce qu'on ne lui demande plus rien.
 *
 * C'est aussi une protection de moins à oublier : `origineDuSite()` peut rendre
 * `null` quand `NEXT_PUBLIC_SITE_URL` manque, et il aurait fallu décider quoi
 * faire de ce `null` sur sept redirections. Une correction qui tient à une
 * variable d'environnement présente n'est pas une correction (L-029) — celle-ci
 * ne dépend d'aucune configuration.
 *
 * @param chemin Chemin ABSOLU sur notre domaine, commençant par `/`. Jamais une
 *   URL complète : ce serait rouvrir la porte à une redirection ouverte.
 * @param statut 303 après un POST (le navigateur repasse en GET), 307 sinon.
 */
export function redirigerVers(chemin: string, statut: 303 | 307 = 307): NextResponse {
  /*
   * ⚠️ LE CHEMIN DOIT COMMENCER PAR UN SEUL `/`, ET C'EST UNE GARDE, PAS UNE
   * COQUETTERIE. `//exemple-mal.tld/x` est une URL relative au PROTOCOLE : un
   * navigateur la résout vers un AUTRE domaine. Le produit a déjà eu une
   * redirection ouverte le 01/09/2026 ; construire les redirections à la main
   * remet ce risque sur la table, donc on le referme ici, une fois.
   */
  const sur = chemin.startsWith("/") && !chemin.startsWith("//") ? chemin : "/";

  return new NextResponse(null, { status: statut, headers: { location: sur } });
}

import "server-only";
import type { NextRequest } from "next/server";

/**
 * LA GARDE CSRF DES POST NATIFS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE EXISTE, ET POURQUOI ELLE VIT DANS UN SEUL FICHIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une Server Action est protégée du CSRF par Next lui-même, qui compare
 * `Origin` à l'hôte. Dès qu'on QUITTE les Server Actions — parce qu'il faut une
 * vraie redirection HTTP que le navigateur suit — ON PERD CETTE PROTECTION, et
 * un formulaire posté depuis un site tiers agirait au nom d'un vendeur connecté
 * sans qu'il clique sur quoi que ce soit.
 *
 * Deux routes en ont besoin : les gestes de la liste des commandes, et la
 * déconnexion. Elle était écrite dans la première ; la recopier dans la seconde
 * aurait produit deux versions dont on n'aurait durci qu'une — et l'historique
 * ci-dessous montre qu'il a fallu DEUX corrections pour arriver à celle-ci.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE NE LIT PLUS, ET POURQUOI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ `x-forwarded-host` N'EST PLUS LU DU TOUT.
 *
 * Il passait avant `host`, inconditionnellement, avec pour raison « derrière un
 * proxy, `host` porte le nom interne ». Mais rien ne distingue un
 * `x-forwarded-host` posé par notre bord d'un `x-forwarded-host` posé par
 * l'appelant : envoyer cet en-tête ET un `Origin` assorti faisait comparer la
 * garde à elle-même, et elle passait.
 *
 * ⚠️ LA PREMIÈRE CORRECTION NE SUFFISAIT PAS, et c'est la sonde qui l'a dit :
 * elle ne lisait `x-forwarded-host` qu'en mode `BORD_DE_CONFIANCE=xff` — or ce
 * réglage existe pour `x-forwarded-for`, un AUTRE en-tête, et `xff` est
 * justement le mode des sondes locales. Faire dépendre une garde CSRF d'un
 * réglage qui parle d'adresses IP, c'était relier deux choses qui n'ont en
 * commun que le préfixe de leur nom.
 *
 * Cloudflare — notre cible — préserve `Host` et ne pose pas cet en-tête. Le jour
 * où un bord réécrirait `Host`, ce serait à lui de se déclarer, ici,
 * explicitement.
 */
export function memeOrigine(requete: NextRequest): boolean {
  const origine = requete.headers.get("origin");
  /*
   * ⚠️ ELLE ÉCHOUE FERMÉE : une requête SANS `Origin` est REFUSÉE.
   *
   * Tout navigateur envoie cet en-tête sur un POST. Ne pas l'exiger reviendrait
   * à laisser une porte ouverte à qui sait simplement l'omettre — et « ce serait
   * ouvert si quelqu'un omettait X » n'est pas une protection, c'est un sursis.
   */
  if (origine === null) return false;

  const hote = requete.headers.get("host");
  if (hote === null || hote === "") return false;

  try {
    return new URL(origine).host === hote;
  } catch {
    // `Origin` illisible : on refuse. Un en-tête malformé n'est pas une origine
    // valide, et le laisser passer reviendrait à ne pas vérifier du tout.
    return false;
  }
}

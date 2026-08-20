import "server-only";
import type { JWK } from "@supabase/supabase-js";
import { urlSupabase } from "@/lib/supabase/config";

/**
 * Cache des clés publiques de signature des jetons.
 *
 * POURQUOI CE MODULE EXISTE — un piège de montée en charge, lu dans le code du
 * SDK installé et non déduit de sa documentation.
 *
 * `getClaims()` vérifie le jeton LOCALEMENT quand la clé de signature est
 * asymétrique — c'est le cas de ce projet, dont la clé en service est en ES256.
 * C'est la propriété qui compte : pas d'appel réseau pour authentifier une
 * requête, donc un coût qui ne croît pas avec le nombre d'utilisateurs.
 *
 * Sauf que le SDK met le trousseau en cache SUR L'INSTANCE DU CLIENT. Or on
 * construit un client neuf à chaque requête — c'est la règle avec les cookies.
 * Le cache repart donc vide à chaque fois, et le trousseau est retéléchargé À
 * CHAQUE REQUÊTE. La vérification reste locale, mais on a rajouté un aller-retour
 * HTTPS par page vue, pour tout le monde, en croyant l'avoir supprimé.
 *
 * Le cache vit donc ICI, au niveau du module, où il survit d'une requête à
 * l'autre tant que l'instance d'exécution est chaude. On passe ensuite le
 * trousseau explicitement à `getClaims()`, qui s'en sert sans rien télécharger.
 *
 * Une clé absente du trousseau (rotation) force un rechargement immédiat : sans
 * cela, une rotation déconnecterait tout le monde jusqu'à expiration du cache.
 */

/**
 * Le type vient du SDK et n'est pas redéclaré ici.
 *
 * Une définition locale plus permissive obligerait à un `as` au point de
 * passage — et un `as` est une affirmation que le compilateur cesse de
 * vérifier, exactement à la frontière où l'on manipule des clés de signature.
 */
export type Jwk = JWK;

/** Le trousseau est rechargé au plus toutes les dix minutes. */
const DUREE_CACHE_MS = 10 * 60 * 1000;

let trousseau: Jwk[] = [];
let chargeA = 0;
/** Empêche N requêtes simultanées de déclencher N téléchargements. */
let enCours: Promise<Jwk[]> | null = null;

async function telecharger(): Promise<Jwk[]> {
  const reponse = await fetch(`${urlSupabase()}/auth/v1/.well-known/jwks.json`, {
    // Le cache HTTP de Next ne doit pas s'en mêler : la fraîcheur est gérée
    // ici, avec une invalidation sur clé inconnue que `revalidate` ne saurait
    // pas déclencher.
    cache: "no-store",
  });
  if (!reponse.ok) {
    throw new Error(
      `Trousseau de signature indisponible (HTTP ${reponse.status}). ` +
        "Sans lui, aucun jeton ne peut être vérifié localement.",
    );
  }
  const corps: unknown = await reponse.json();
  if (typeof corps !== "object" || corps === null || !Array.isArray((corps as { keys?: unknown }).keys)) {
    throw new Error(
      "Trousseau de signature illisible : réponse sans tableau `keys`. " +
        "Une réponse inattendue ne doit pas se dégrader en trousseau vide, " +
        "qui ferait échouer toutes les vérifications sans dire pourquoi.",
    );
  }
  return (corps as { keys: JWK[] }).keys;
}

/**
 * Rend le trousseau, en le rechargeant si nécessaire.
 *
 * `kidAttendu` permet de forcer un rechargement quand le jeton présenté cite une
 * clé qu'on ne connaît pas encore — le cas d'une rotation.
 */
export async function trousseauDeSignature(kidAttendu?: string): Promise<Jwk[]> {
  const maintenant = Date.now();
  const frais = maintenant - chargeA < DUREE_CACHE_MS;
  const connait = kidAttendu === undefined || trousseau.some((k) => k.kid === kidAttendu);

  if (trousseau.length > 0 && frais && connait) return trousseau;

  // Sans ce partage, dix requêtes arrivant ensemble sur une instance froide
  // lanceraient dix téléchargements du même trousseau — exactement au moment
  // où l'instance est la plus chargée.
  enCours ??= telecharger()
    .then((cles) => {
      trousseau = cles;
      chargeA = Date.now();
      return cles;
    })
    .finally(() => {
      enCours = null;
    });

  try {
    return await enCours;
  } catch {
    // Un trousseau périmé vaut mieux que pas de trousseau : les clés changent
    // rarement, et refuser toutes les sessions parce qu'un téléchargement a
    // échoué transformerait un incident réseau en déconnexion générale.
    if (trousseau.length > 0) return trousseau;
    throw new Error("Trousseau de signature indisponible et aucun cache utilisable.");
  }
}

/** Uniquement pour les tests : vide le cache. */
export function oublierTrousseau(): void {
  trousseau = [];
  chargeA = 0;
  enCours = null;
}

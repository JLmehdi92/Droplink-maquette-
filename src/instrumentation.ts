import * as Sentry from "@sentry/nextjs";
import { optionsSentry } from "@/lib/observabilite/sentry";

/**
 * LE RAPPORTEUR D'ERREURS, CÔTÉ SERVEUR UNIQUEMENT.
 *
 * Sans lui, une erreur en production ne partait NULLE PART : elle s'écrivait
 * dans la sortie du processus, que personne ne regarde à trois heures du matin,
 * et le vendeur voyait une page cassée que nous n'apprenions jamais.
 *
 * ⚠️ AUCUN OCTET N'ATTEINT LE NAVIGATEUR. Il n'existe pas
 * d'`instrumentation-client.ts` et `next.config.ts` n'est pas enveloppé : le
 * raisonnement complet, avec ce que cette déviation coûte, est dans
 * `lib/observabilite/sentry.ts`.
 *
 * ⚠️ ET AUCUN JETON NE SORT D'ICI. Une URL `/p/<jeton>` transfère une capacité à
 * vie ; l'expédier chez un tiers serait la fuite la plus grave que ce produit
 * puisse produire. Le masquage vit dans le même module, il s'applique PAR
 * VALEUR sur l'événement entier, et `tests/unit/sentry-ne-fuite-pas.test.ts`
 * l'éprouve avec des sentinelles.
 */
export async function register(): Promise<void> {
  const options = optionsSentry(process.env["SENTRY_DSN"]);

  // PAS DE DSN, PAS DE SDK. `enabled: false` laisserait le SDK poser ses
  // accroches sur `http`, `fetch` et les promesses pour ne rien envoyer :
  // la documentation de Sentry le dit, et un produit sans DSN ne doit rien
  // payer du tout. C'est aussi ce qui rend un déploiement sans la variable
  // silencieux et correct plutôt que bruyant et cassé.
  if (options === null) return;

  // Les deux exécutions ont des SDK distincts, et le bord n'a ni `http` ni les
  // API de Node : initialiser celui du serveur dans le bord échouerait au
  // chargement du middleware, c'est-à-dire sur CHAQUE requête.
  const execution = process.env["NEXT_RUNTIME"];
  if (execution === "nodejs" || execution === "edge") {
    Sentry.init(options);
  }
}

/**
 * LES ERREURS DES COMPOSANTS SERVEUR, DU MIDDLEWARE ET DES ROUTES.
 *
 * Next 15 appelle cette exportation pour toute erreur qu'il rend lui-même. Sans
 * elle, le rapporteur ne verrait que ce qui remonte jusqu'au processus, donc
 * précisément pas les 500 d'un écran — qui sont le cas qu'on cherche.
 */
export const onRequestError = Sentry.captureRequestError;

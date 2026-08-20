import "server-only";

import { PostHog } from "posthog-node";
import type { NomEvenement } from "./evenements";

/**
 * Point d'émission UNIQUE des événements d'usage. Côté serveur.
 *
 * Côté serveur et non côté navigateur : un beacon client ne prouve rien si la
 * requête n'arrive pas. Bloqueur, réseau coupé, onglet fermé — aucune trace, et
 * la perte n'est ni bornée ni mesurable. Un événement serveur borne la perte :
 * rendus ≥ vues réelles ≥ vues enregistrées.
 *
 * Trois règles d'usage, non négociables :
 *
 * 1. ÉMETTRE APRÈS l'opération, jamais avant. Un compteur incrémenté avant une
 *    opération qui peut échouer perd son événement définitivement, sans
 *    réémission possible.
 * 2. TOUJOURS `await`. `emettre()` rend une promesse, et
 *    `no-floating-promises` est une erreur bloquante : `foo()` et `await foo()`
 *    se ressemblent trop pour qu'une relecture les distingue, c'est au TYPAGE
 *    de l'exiger.
 * 3. `emettre()` NE LÈVE JAMAIS. Une panne d'analytics ne doit pas annuler la
 *    mutation d'un vendeur. Mais elle ne disparaît pas non plus en silence :
 *    tout échec est compté et consultable.
 */

export type ProprietesEvenement = Record<string, string | number | boolean | null>;

/** Ce que l'appelant doit fournir pour qu'un événement soit attribuable. */
export interface ContexteEmission {
  /** Identifiant du profil, ou un identifiant anonyme stable pour la page publique. */
  readonly sujet: string;
}

interface Compteurs {
  emis: number;
  echecs: number;
  nonConfigures: number;
  dernierEchec: string | null;
}

const compteurs: Compteurs = { emis: 0, echecs: 0, nonConfigures: 0, dernierEchec: null };

let clientMemoise: PostHog | null = null;
let avertissementDejaEmis = false;

function clientPostHog(): PostHog | null {
  if (clientMemoise !== null) return clientMemoise;

  const cle = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
  const hote = process.env["NEXT_PUBLIC_POSTHOG_HOST"];
  if (cle === undefined || cle.trim() === "" || hote === undefined || hote.trim() === "") {
    return null;
  }

  clientMemoise = new PostHog(cle, {
    host: hote,
    // Envoi immédiat : le processus d'une fonction serveur peut être gelé dès
    // la réponse rendue. Un lot en attente serait perdu sans trace.
    flushAt: 1,
    flushInterval: 0,
  });
  return clientMemoise;
}

/**
 * Émet un événement. Ne lève jamais.
 *
 * @returns `true` si l'événement est parti, `false` s'il a été perdu — et dans
 * ce cas la raison est comptée. Le retour est volontairement exploitable :
 * un appelant qui tient à savoir peut le vérifier.
 */
export async function emettre(
  nom: NomEvenement,
  contexte: ContexteEmission,
  proprietes: ProprietesEvenement = {},
): Promise<boolean> {
  const client = clientPostHog();

  if (client === null) {
    compteurs.nonConfigures += 1;
    if (!avertissementDejaEmis) {
      avertissementDejaEmis = true;
      // Un seul avertissement, pas un par événement : un journal noyé se lit
      // comme un journal vide. Mais PAS de silence : une instrumentation
      // débranchée qui ne dit rien se découvre au moment de décider, c'est-à-dire
      // trop tard.
      console.warn(
        "[instrumentation] PostHog n'est pas configuré : les événements d'usage " +
          "sont PERDUS. Le livrable de la phase de validation est cette donnée. " +
          "Renseigner NEXT_PUBLIC_POSTHOG_KEY.",
      );
    }
    return false;
  }

  try {
    client.capture({
      distinctId: contexte.sujet,
      event: nom,
      properties: proprietes,
    });
    await client.flush();
    compteurs.emis += 1;
    return true;
  } catch (erreur) {
    // Jamais de `catch` vide : on ne relance pas, parce qu'une panne
    // d'analytics ne doit pas annuler la mutation d'un vendeur — mais l'échec
    // est compté et nommé.
    compteurs.echecs += 1;
    compteurs.dernierEchec = erreur instanceof Error ? erreur.message : String(erreur);
    console.error("[instrumentation] événement perdu :", nom, compteurs.dernierEchec);
    return false;
  }
}

/** État des compteurs d'émission. Lecture seule, pour diagnostic et tests. */
export function compteursEmission(): Readonly<Compteurs> {
  return { ...compteurs };
}

/** Remet les compteurs et le client à zéro. Réservé aux tests. */
export function reinitialiserInstrumentation(): void {
  compteurs.emis = 0;
  compteurs.echecs = 0;
  compteurs.nonConfigures = 0;
  compteurs.dernierEchec = null;
  clientMemoise = null;
  avertissementDejaEmis = false;
}

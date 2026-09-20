import "server-only";

import { after } from "next/server";
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

/**
 * LE TEMPS MAXIMAL QU'UNE ÉMISSION PEUT COÛTER À QUELQU'UN QUI ATTEND.
 *
 * 1,5 s, et la valeur est un ARBITRAGE, pas une constante technique. Elle tient
 * entre deux bornes mesurées : un aller-retour normal vers l'UE coûte de 80 à
 * 400 ms — la borne ne doit donc jamais couper une émission saine — et le
 * délai anti-rebond de l'éditeur est de 800 ms, si bien qu'une borne plus
 * large laisserait les sauvegardes s'empiler dans la file d'attente que Next
 * impose aux Server Actions.
 *
 * Elle est EXPORTÉE parce qu'un contrôle la vérifie : une valeur d'arbitrage
 * qui ne vit que dans la mémoire de celui qui l'a posée finit par grandir.
 */
export const BORNE_EMISSION_MS = 1_500;

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

    /*
     * ⚠️ L'ENVOI EST BORNÉ, ET CE N'EST PAS UNE PRÉCAUTION THÉORIQUE.
     *
     * MESURÉ AU NAVIGATEUR LE 20/09/2026, sur l'éditeur de commande piloté au
     * vrai clavier : la réponse de `enregistrerChamp` a mis 32,4 s au premier
     * enregistrement d'une commande et 15,5 s aux suivants, pendant qu'une
     * LECTURE de la même page répondait en 952 ms.
     *
     * L'APPELANT COUPABLE EST `marquerPremierContenu`, qui attend CETTE
     * fonction EN LIGNE pour savoir s'il doit rendre sa marque à usage unique.
     * Et comme il la REND quand l'envoi échoue, la sauvegarde suivante la
     * re-réclame et re-paie l'appel : chaque champ, à chaque fois.
     *
     * ET NEXT SÉRIALISE LES SERVER ACTIONS : tant que la première n'a pas
     * répondu, les suivantes ne partent pas. Mesuré : UN SEUL POST pour six
     * champs saisis — cinq modifications perdues, sans une erreur à l'écran.
     * Le chemin le plus utilisé du produit dépendait donc du temps de réponse
     * d'un tiers d'analytique, sans borne et sans signal.
     *
     * On ne peut pas empêcher Next d'attendre `after()`. On peut empêcher cette
     * attente d'être INFINIE : au-delà de la borne, l'événement est abandonné et
     * COMPTÉ COMME PERDU — ce qu'il est. Le rendre `true` ferait monter la
     * métrique de verdict du côté rassurant, ce que le brief nomme.
     *
     * La promesse abandonnée reçoit son propre `catch` : sans lui, un rejet
     * arrivant après la borne deviendrait un rejet non traité, c'est-à-dire un
     * incident de processus pour une panne d'analytique.
     */
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const envoi = client.flush().then(() => "parti" as const);
    const issue = await Promise.race([
      envoi,
      new Promise<"borne">((resoudre) => {
        minuterie = setTimeout(() => resoudre("borne"), BORNE_EMISSION_MS);
      }),
    ]);
    clearTimeout(minuterie);

    if (issue === "borne") {
      // Le POST continue sa vie sans personne pour l'attendre : on neutralise
      // son rejet éventuel, jamais son effet — s'il finit par aboutir, tant
      // mieux, l'événement sera simplement compté ici comme perdu.
      void envoi.catch(() => undefined);
      compteurs.echecs += 1;
      compteurs.dernierEchec = `envoi abandonné après ${BORNE_EMISSION_MS} ms`;
      console.error("[instrumentation] événement perdu :", nom, compteurs.dernierEchec);
      return false;
    }

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

/**
 * Émet APRÈS que la réponse est partie. À employer partout où l'appelant n'a
 * pas besoin de savoir si l'événement est parti.
 *
 * ⚠️ DÉFAUT DE PERFORMANCE RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026.
 *
 * Le client est configuré en `flushAt: 1, flushInterval: 0` — un POST HTTP par
 * événement, et `emettre()` l'attend. Vingt-cinq appels vivaient sur le chemin
 * de la requête, dont neuf sur des gestes que le vendeur ou son client
 * DÉCLENCHENT : créer une commande, ouvrir l'éditeur, sauvegarder un champ,
 * déposer un média, rendre la page publique.
 *
 * Tant que PostHog n'est pas configuré, `emettre()` sort immédiatement et cela
 * ne coûte rien — c'est pourquoi le défaut ne se voyait pas. Le jour où la clé
 * est renseignée, chaque clic paie un aller-retour vers l'UE : de l'ordre de
 * 80 à 400 ms, ajoutés en série AVANT la réponse. Sur `/p/[token]`, cela vient
 * directement sur un budget de LCP inférieur à deux secondes en 4G.
 *
 * `after()` exécute le travail UNE FOIS LA RÉPONSE ENVOYÉE, dans le même
 * contexte de requête. La plateforme garde le processus vivant jusqu'à sa fin :
 * l'événement part réellement, il ne part simplement plus AVANT la réponse. Le
 * dépôt employait déjà ce motif pour l'appel au fournisseur de suivi ;
 * l'instrumentation ne l'avait pas reçu.
 *
 * ⚠️ CE PARAGRAPHE DIT VRAI, ET IL A ÉTÉ MIS EN DOUTE À TORT LE 20/09/2026.
 *
 * Ce jour-là, six champs saisis dans l'éditeur n'en ont enregistré qu'un, et
 * j'ai d'abord accusé ce report : « `after()` ne différerait rien dans une
 * Server Action ». **Faux, mesuré ensuite** — une sauvegarde de numéro de suivi,
 * dont l'attache pose un `after()` qui DORT 31 secondes, répond en **1,72 s**,
 * colis bien attaché. Le report fait ce qu'il promet.
 *
 * LE VRAI COUPABLE ÉTAIT L'APPEL EN LIGNE : `marquerPremierContenu` attend
 * `emettre()` pour savoir s'il doit rendre sa marque, et il la rend quand
 * l'envoi échoue — si bien que la sauvegarde suivante la re-réclame et re-paie.
 * 15,5 s par champ, tant que le tiers ne répondait pas, pendant qu'un GET de la
 * même page répondait en 952 ms. Next sérialisant les Server Actions, **un seul
 * POST est parti pour six champs** — cinq modifications perdues en silence.
 *
 * Ce qui borne désormais le dégât est `BORNE_EMISSION_MS`, et il borne l'appel
 * EN LIGNE comme celui qui passe par ici.
 *
 * ⚠️ CE N'EST PAS UN « TIRE ET OUBLIE ». La promesse est confiée à `after`, qui
 * l'attend : `no-floating-promises` reste satisfait, et une promesse non
 * attendue perdrait les événements en silence — le piège nommé au brief.
 *
 * QUAND NE PAS L'EMPLOYER : quand le RETOUR compte. Deux appelants réclament
 * une marque en base et la RENDENT si l'événement n'est pas parti, pour qu'une
 * réémission reste possible. Ceux-là doivent attendre, et c'est leur raison
 * d'être — le brief le dit : un compteur perdu qui sert de dénominateur fait
 * monter le taux du côté rassurant.
 */
export function emettreApres(
  nom: NomEvenement,
  contexte: ContexteEmission,
  proprietes: ProprietesEvenement = {},
): void {
  try {
    after(async () => {
      await emettre(nom, contexte, proprietes);
    });
  } catch {
    /*
     * HORS CONTEXTE DE REQUÊTE, ON ÉMET TOUT DE SUITE.
     *
     * `after()` LÈVE quand il n'y a pas de requête en cours — suites de tests,
     * scripts, tâches appelées directement. Laisser cette exception remonter
     * ferait échouer la MUTATION qu'on instrumente, ce qui est exactement
     * l'inverse de la règle « une panne d'analytics ne doit pas annuler la
     * mutation d'un vendeur ».
     *
     * Et il n'y a rien à différer : hors requête, il n'existe aucune réponse à
     * rendre en premier. Le report n'a de sens que pour ne pas faire attendre
     * quelqu'un.
     *
     * `void` et non `await` : cette fonction est synchrone par contrat, ses
     * appelants ne l'attendent pas. `emettre()` ne lève jamais, donc la
     * promesse ne peut pas se terminer par un rejet non traité.
     */
    void emettre(nom, contexte, proprietes);
  }
}

import type { NodeOptions } from "@sentry/nextjs";

/**
 * CE QUI PART CHEZ SENTRY, ET SURTOUT CE QUI N'EN PART JAMAIS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE POINT QUI DÉCIDE DE TOUT : UNE URL DE CE PRODUIT PORTE UNE CAPACITÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `/p/<jeton>` n'est pas une adresse, c'est un DROIT D'ACCÈS. Le brief le dit
 * dans ces termes : *les autres valeurs exposent une donnée, celle-là TRANSFÈRE
 * UNE CAPACITÉ, définitivement*, puisque le jeton est immuable à vie. Une trace
 * d'erreur envoyée à un tiers emporte l'URL de la requête, son `Referer`, ses
 * fils d'Ariane et souvent le message de l'exception : brancher un rapporteur
 * d'erreurs sans y penser reviendrait à publier chez un tiers les liens privés
 * des clients de nos vendeurs, sans qu'aucun test ne rougisse.
 *
 * Même chose, pour une durée plus courte mais un pouvoir plus grand, pour le
 * `token_hash` d'une réinitialisation de mot de passe et pour un en-tête
 * `Authorization`.
 *
 * ⚠️ LE MASQUAGE SE FAIT PAR VALEUR, PAS PAR NOM DE CHAMP. C'est la règle de
 * sécurité du projet, et elle vaut ici plus qu'ailleurs : la forme d'un
 * événement Sentry n'est pas un contrat, elle change avec le SDK. Un masquage
 * qui viserait `event.request.url` laisserait passer le même jeton republié
 * sous `breadcrumbs[].data.to`, `contexts.trace.data`, ou n'importe quel champ
 * qu'une version future ajoutera. On PARCOURT donc l'événement entier et on
 * masque partout où la FORME apparaît.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVEUR SEULEMENT — AUCUN OCTET SUR LA PAGE CLIENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il n'existe volontairement pas d'`instrumentation-client.ts`, et
 * `next.config.ts` n'est PAS enveloppé dans `withSentryConfig` : le budget de
 * `/p/[token]` est de 300 Ko dont 102 de socle incompressible, et le SDK
 * navigateur en coûterait 30 à 40 à lui seul — sur la page vue une fois, en 4G,
 * depuis un DM. `withSentryConfig` n'apporte par ailleurs que deux choses dont
 * nous n'avons pas l'usage : le dépôt des cartes de source, qui exige un jeton
 * que nous n'avons pas, et le tunnel anti-bloqueur, qui est une affaire de
 * navigateur.
 *
 * CE QUE CETTE DÉVIATION COÛTE, et il faut le dire plutôt que le découvrir : les
 * piles d'appel serveur pointeront vers le code compilé, pas vers les sources.
 * C'est le prix accepté ; il se paiera le jour où une trace sera illisible, et
 * il se lèvera en ajoutant `withSentryConfig` avec un `SENTRY_AUTH_TOKEN` —
 * jamais en expédiant le SDK navigateur.
 */

/**
 * Le masque, et la raison de chaque motif.
 *
 * Volontairement COURTE : masquer large rendrait les traces inutilisables, ce
 * qui reviendrait à ne pas avoir de rapporteur d'erreurs du tout. Chaque entrée
 * vise une valeur qui donne un POUVOIR, jamais une donnée simplement privée —
 * celles-là sont couvertes par `sendDefaultPii: false`.
 */
const MASQUES: readonly { readonly motif: RegExp; readonly par: string }[] = [
  // Le lien public d'une commande. `[^/?#\s"'\\]+` s'arrête au premier
  // séparateur : sans cette borne, le masque avalerait la fin d'un message.
  { motif: /\/p\/[^/?#\s"'\\]+/g, par: "/p/[jeton]" },
  // Le jeton de désabonnement, qui vit sur une autre route et un autre pouvoir.
  { motif: /\/desabonnement\/[^/?#\s"'\\]+/g, par: "/desabonnement/[jeton]" },
  // Le jeton d'un email d'authentification : réinitialisation et confirmation.
  { motif: /token_hash=[^&\s"'\\]+/gi, par: "token_hash=[masque]" },
  // Un porteur, quelle que soit sa casse — `CRON_SECRET` y voyage aussi.
  { motif: /Bearer\s+[\w.\-+/=]+/gi, par: "Bearer [masque]" },
  // Le cookie de session Supabase, qui rouvre le compte d'un vendeur.
  { motif: /sb-[\w-]+-auth-token(?:\.\d+)?=[^;\s"'\\]+/g, par: "sb-auth-token=[masque]" },
];

/** Masque, dans une chaîne, toute valeur qui donne un pouvoir. */
export function masquerLesJetons(valeur: string): string {
  let sortie = valeur;
  for (const { motif, par } of MASQUES) sortie = sortie.replace(motif, par);
  return sortie;
}

/**
 * Parcourt une structure et masque TOUTES ses chaînes.
 *
 * ⚠️ BORNÉE EN PROFONDEUR, et ce n'est pas de la prudence décorative : un
 * événement Sentry porte des objets venus de l'application, donc possiblement
 * cycliques. Une descente non bornée sur un cycle bloquerait le processus au
 * moment précis où il essaie de rapporter une panne. Au-delà de la borne on
 * REND LA VALEUR TELLE QUELLE plutôt que de la jeter : perdre une trace serait
 * pire que la garder profonde, et la borne est haute devant les événements
 * réels.
 */
function masquerEnProfondeur<T>(valeur: T, profondeur = 0, vus = new WeakSet<object>()): T {
  if (profondeur > 12) return valeur;
  if (typeof valeur === "string") return masquerLesJetons(valeur) as unknown as T;
  if (valeur === null || typeof valeur !== "object") return valeur;

  const objet = valeur as unknown as object;
  if (vus.has(objet)) return valeur;
  vus.add(objet);

  if (Array.isArray(valeur)) {
    for (let i = 0; i < valeur.length; i += 1) {
      valeur[i] = masquerEnProfondeur(valeur[i], profondeur + 1, vus);
    }
    return valeur;
  }

  const enregistrement = valeur as unknown as Record<string, unknown>;
  for (const cle of Object.keys(enregistrement)) {
    enregistrement[cle] = masquerEnProfondeur(enregistrement[cle], profondeur + 1, vus);
  }
  return valeur;
}

/**
 * Les options d'initialisation, ou `null` quand aucun DSN n'est configuré.
 *
 * ⚠️ `null` FAIT SAUTER L'APPEL À `Sentry.init` ENTIER, et ce n'est pas la même
 * chose que `enabled: false`. La documentation de Sentry est explicite :
 * *setting this to false does not eliminate all instrumentation overhead* — le
 * SDK pose quand même ses accroches sur `http`, `fetch` et les promesses. Un
 * produit qui n'a pas de DSN ne doit rien payer du tout.
 *
 * C'est aussi ce qui rend le déploiement sans DSN silencieux et correct : tant
 * que la variable est vide, le rapporteur n'existe simplement pas.
 */
export function optionsSentry(dsn: string | undefined): NodeOptions | null {
  const propre = (dsn ?? "").trim();
  if (propre === "") return null;

  return {
    dsn: propre,
    environment: process.env["NODE_ENV"] ?? "development",

    /*
     * ⚠️ JAMAIS DE DONNÉES PERSONNELLES PAR DÉFAUT. Ce produit hache les
     * adresses IP avec un sel — sans lui, *une IPv4 se retrouve en quelques
     * secondes* — et `link_views` ne conserve que des empreintes. Laisser le
     * rapporteur d'erreurs expédier l'IP brute et les en-têtes défairait ce
     * travail par une porte que personne ne regarde.
     */
    sendDefaultPii: false,

    /*
     * ⚠️ LES VARIABLES LOCALES NE PARTENT PAS, ET C'EST ÉCRIT PLUTÔT QUE SUPPOSÉ.
     *
     * La documentation de Sentry dit les DEUX choses : « the SDK does not send
     * local variables […] but it is enabled by default for Node.js runtimes »
     * sur une page, « to activate this feature, set `includeLocalVariables` to
     * true » sur l'autre. Mesuré le 04/09/2026 contre une ingestion locale, en
     * lisant les octets reçus : aucune clé `vars` dans l'enveloppe — donc c'est
     * bien inactif. Mais *une protection qui tient à une ABSENCE n'est pas une
     * protection* : la phrase juste serait « ce serait ouvert si une version
     * changeait ce défaut ».
     *
     * Ce que ça protège : le masquage vise les FORMES qui portent un pouvoir —
     * une URL `/p/<jeton>`, un `token_hash`, un porteur. Un jeton NU posé dans
     * une variable locale n'a aucune de ces formes, et masquer toute chaîne de
     * vingt caractères rendrait les traces illisibles. La borne est donc ici.
     */
    includeLocalVariables: false,

    /*
     * ON NE MESURE PAS LES PERFORMANCES ICI. Le protocole de mesure du projet
     * est le PLAN d'exécution, pas un échantillon de chronomètres, et chaque
     * transaction envoyée est une requête réseau de plus sur un chemin dont
     * l'échec est invisible. Les erreurs, elles, valent le voyage.
     */
    tracesSampleRate: 0,

    /*
     * LE DERNIER FILTRE AVANT LE DÉPART. Il s'exécute sur l'événement COMPLET,
     * après que le SDK l'a assemblé — c'est le seul endroit où l'on voit ce qui
     * part vraiment, plutôt que ce qu'on croit y avoir mis.
     */
    beforeSend(evenement) {
      return masquerEnProfondeur(evenement);
    },
    beforeBreadcrumb(fil) {
      return masquerEnProfondeur(fil);
    },
  };
}

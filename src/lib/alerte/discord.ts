import "server-only";
import type { Expediteur, Message, ResultatEnvoi } from "@/lib/email/port";

/**
 * L'UNIQUE FICHIER QUI CONNAÎT DISCORD.
 *
 * Même port que l'expéditeur d'email (`lib/email/port.ts`), et pour la même
 * raison : la DÉCISION d'alerter et ce qu'on fait de l'échec restent éprouvables
 * sans réseau. Le port porte trois issues, et les trois comptent ici —
 * `non_configure` dit « personne ne sera joint tant qu'une variable n'est pas
 * corrigée », là où `refuse` dit « réessaie ».
 *
 * ── POURQUOI DISCORD À CÔTÉ DE L'EMAIL, ET NON À SA PLACE ──────────────────
 *
 * Décision de Wassim, 20/09/2026. L'email d'alerte part déjà vers l'exploitant,
 * et il reste : c'est la voie qui survit à une panne de Discord. Discord s'y
 * ajoute parce qu'une notification de salon est LUE, quand un email d'alerte
 * est lu le lendemain. Le signal qu'elle porte est celui qui ne se rattrape
 * pas : **200 prises en charge de colis À VIE**, dont il reste 191, pour tout
 * le produit. Une fois dépensées, le suivi automatique — l'une des trois
 * features qui font la différence — s'arrête sans que rien ne le dise.
 *
 * ── TROIS PROTECTIONS, ET AUCUNE N'EST DÉCORATIVE ──────────────────────────
 *
 * 1. L'URL EST VALIDÉE POUR SA SUBSTANCE, pas pour sa présence (L-026). Une
 *    URL de webhook est une CAPACITÉ : qui la détient publie dans le salon. Une
 *    valeur mal substituée, un hôte qui imite `discord.com`, ou du `http://`
 *    qui promène le jeton en clair, sont refusés SANS rien envoyer — et refusés
 *    en `non_configure`, parce qu'aucune reprise ne les corrigera.
 *
 * 2. LE JETON N'APPARAÎT DANS AUCUN MOTIF. L'URL porte le secret ; la recopier
 *    dans un message d'erreur la publie dans les journaux, lus par plus de
 *    monde que le salon. Le corps de la réponse est repris — il diagnostique —
 *    mais borné, et jamais l'URL.
 *
 * 3. L'ENVOI EST BORNÉ. Mesuré le 20/09/2026 : un appel sortant non borné sur
 *    le chemin d'une mutation a coûté cinq modifications sur six. Ici l'appelant
 *    est une tâche de fond, mais la règle ne change pas — un tiers ne fige
 *    jamais le travail qui l'a demandé.
 *
 * ⚠️ `?wait=true` N'EST PAS UN CONFORT. Sans lui Discord rend `204 No Content` :
 * un adaptateur qui lirait le statut déclarerait « envoyé » pour un salon
 * supprimé. Avec lui, Discord rend le message créé et son identifiant, et
 * l'absence d'identifiant devient un refus visible. C'est L-024 — « il répond »
 * est la propriété que tous les résidus possèdent.
 */

/** Un envoi qui dure plus longtemps n'aide plus personne. */
const DELAI_MS = 10_000;

/** Le corps d'erreur est repris pour diagnostiquer, jamais en entier. */
const MOTIF_MAX = 300;

/** Discord refuse tout message au-delà de cette longueur. */
const CONTENU_MAX = 2_000;

/**
 * Les seuls hôtes qui reçoivent nos alertes.
 *
 * Une comparaison d'ÉGALITÉ sur le nom d'hôte, jamais un `includes` : le
 * deuxième accepterait `discord.com.pirate.net`, qui contient bien la chaîne
 * attendue et n'appartient pas à Discord.
 */
const HOTES = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);

/** Marqueurs qu'un gabarit non substitué laisse derrière lui (L-026). */
const GABARITS = ["votre", "your", "exemple", "example", "todo", "xxx", "changeme", "placeholder"];

const NOM_VARIABLE = "DISCORD_WEBHOOK_URL";

/**
 * Rend l'URL du webhook, ou la liste de ce qui manque.
 *
 * Exportée pour être éprouvable seule : la validation d'une capacité ne doit
 * pas n'être atteignable qu'à travers un envoi réseau.
 */
export function lireWebhookDiscord(): { url: URL } | { manquant: readonly string[] } {
  const brut = (process.env[NOM_VARIABLE] ?? "").trim();
  if (brut === "") return { manquant: [NOM_VARIABLE] };

  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return { manquant: [NOM_VARIABLE] };
  }

  // `https` seulement : le jeton du webhook voyage dans le CHEMIN de l'URL, donc
  // en clair sur toute la route si le transport ne l'est pas.
  if (url.protocol !== "https:") return { manquant: [NOM_VARIABLE] };
  if (!HOTES.has(url.hostname)) return { manquant: [NOM_VARIABLE] };
  if (!url.pathname.startsWith("/api/webhooks/")) return { manquant: [NOM_VARIABLE] };

  const minuscules = brut.toLowerCase();
  if (GABARITS.some((g) => minuscules.includes(g))) return { manquant: [NOM_VARIABLE] };

  return { url };
}

/**
 * ⚠️ AUCUNE MENTION NE SONNE. Un texte venu d'un tiers — le nom d'un client chez
 * le fournisseur de paiement, un numéro de colis — ne doit jamais pouvoir écrire
 * `@everyone` et faire sonner tout le salon. Discord le garantit si on le lui dit.
 */
const SANS_MENTION = { parse: [] as string[] };

/**
 * L'UNIQUE ENVOI. Le message texte et la carte passent par lui : les gardes —
 * URL validée, `?wait=true`, identifiant exigé, délai borné, jeton jamais recopié
 * — ne peuvent donc pas exister sur l'un et manquer à l'autre.
 */
async function poster(corps: Record<string, unknown>): Promise<ResultatEnvoi> {
  const config = lireWebhookDiscord();
  if ("manquant" in config) {
    // ON NE TENTE PAS « POUR VOIR ». Envoyer vers une URL douteuse, c'est
    // livrer nos alertes d'exploitation à qui la détient.
    return { statut: "non_configure", manquant: config.manquant };
  }

  const destination = new URL(config.url);
  destination.searchParams.set("wait", "true");

  let reponse: Response;
  try {
    reponse = await fetch(destination.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...corps, allowed_mentions: SANS_MENTION }),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (erreur) {
    // Réseau, DNS, délai dépassé : Discord n'a pas été joint. Réessayable.
    return {
      statut: "refuse",
      motif: "injoignable : " + (erreur instanceof Error ? erreur.message : String(erreur)),
    };
  }

  if (!reponse.ok) {
    const texte = await reponse.text().catch(() => "");
    return {
      statut: "refuse",
      motif: `HTTP ${reponse.status} ${texte.slice(0, MOTIF_MAX)}`.trim(),
    };
  }

  const donnees: unknown = await reponse.json().catch(() => null);
  const id =
    typeof donnees === "object" && donnees !== null && "id" in donnees
      ? (donnees as { id: unknown }).id
      : null;
  if (typeof id !== "string" || id === "") {
    // 204, corps vide, ou réponse inattendue : on préfère un refus visible
    // à un succès qu'on ne peut retrouver dans aucun salon.
    return { statut: "refuse", motif: "réponse acceptée mais sans identifiant de message" };
  }

  return { statut: "envoye", id };
}

export function expediteurDiscord(): Expediteur {
  return {
    async envoyer(message: Message): Promise<ResultatEnvoi> {
      // Le sujet en gras, le corps dessous : un salon se lit en diagonale, et
      // c'est la première ligne qui décide si on ouvre.
      return poster({ content: ("**" + message.sujet + "**\n" + message.texte).slice(0, CONTENU_MAX) });
    },
  };
}

/**
 * UNE CARTE — l'« embed » de Discord (30/09/2026, Mehdi : « un message simple
 * comme ça jtrouve ça moche »). Un titre, une couleur, des champs en colonnes,
 * un pied et une heure : le solde se lit d'un coup d'œil au lieu d'une phrase.
 */
export interface CarteDiscord {
  readonly titre: string;
  readonly description: string;
  /** 0xRRGGBB — la barre de couleur à gauche de la carte. */
  readonly couleur: number;
  readonly champs: readonly { readonly nom: string; readonly valeur: string; readonly enLigne?: boolean }[];
  readonly pied: string;
  readonly horodatage: Date;
}

/**
 * Les limites de Discord. Au-delà, il refuse la carte ENTIÈRE : on tronque, sans
 * quoi l'alerte la plus longue — donc souvent la plus grave — serait la seule perdue.
 */
const LIMITES = {
  titre: 256,
  description: 4_096,
  champs: 25,
  nom: 256,
  valeur: 1_024,
  pied: 2_048,
  /** La somme de tous les textes de la carte. */
  total: 6_000,
};

export function publierCarteDiscord(carte: CarteDiscord): Promise<ResultatEnvoi> {
  const titre = carte.titre.slice(0, LIMITES.titre);
  const pied = carte.pied.slice(0, LIMITES.pied);
  const champs = carte.champs.slice(0, LIMITES.champs).map((c) => ({
    name: c.nom.slice(0, LIMITES.nom),
    value: c.valeur.slice(0, LIMITES.valeur),
    inline: c.enLigne ?? false,
  }));

  // LE TOTAL AUSSI EST BORNÉ : les derniers champs tombent d'abord — le titre
  // et les premiers nombres sont ce qu'on lit —, puis la description se raccourcit.
  const taille = (): number =>
    titre.length + pied.length + champs.reduce((n, c) => n + c.name.length + c.value.length, 0);
  while (champs.length > 0 && taille() > LIMITES.total) champs.pop();
  const description = carte.description.slice(0, Math.max(0, Math.min(LIMITES.description, LIMITES.total - taille())));

  return poster({
    embeds: [
      {
        title: titre,
        description,
        color: carte.couleur,
        fields: champs,
        footer: { text: pied },
        timestamp: carte.horodatage.toISOString(),
      },
    ],
  });
}

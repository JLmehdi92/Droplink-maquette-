import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { EtatColisPort, FournisseurSuivi, ReponsePort } from "./port";

/**
 * L'ADAPTATEUR 17TRACK — LE SEUL FICHIER DE L'APPLICATION QUI CONNAÎT UN
 * FOURNISSEUR DE SUIVI.
 *
 * Tout ce qui est propre à eux vit ici et nulle part ailleurs : l'adresse, le
 * nom de l'en-tête d'authentification, la forme de leur réponse, leurs codes
 * d'erreur, leur schéma de signature. Rien de tout cela ne doit apparaître dans
 * un autre fichier — un test le vérifie, parce qu'une frontière qui tient à la
 * discipline ne tient pas.
 *
 * LA CLÉ NE QUITTE JAMAIS LE SERVEUR. `server-only`, et la variable n'est PAS
 * préfixée `NEXT_PUBLIC_` : une seule fuite donnerait à qui la trouve le droit
 * de prendre en charge des numéros à nos frais, et de signer de fausses
 * notifications — c'est-à-dire d'écrire dans les commandes de n'importe quel
 * vendeur.
 */

const BASE = "https://api.17track.net/track/v2.4";
const EN_TETE_CLE = "17token";
const EN_TETE_SIGNATURE = "sign";

/** Au-delà, on considère le fournisseur indisponible plutôt que d'attendre. */
const DELAI_MS = 12_000;

function cle(): string {
  const valeur = process.env["TRACKING_API_KEY"] ?? "";
  if (valeur.trim() === "") {
    throw new Error(
      "TRACKING_API_KEY absente. Le suivi ne peut ni prendre en charge un " +
        "numéro ni vérifier une notification : sans clé, la vérification de " +
        "signature accepterait ou refuserait tout, et les deux sont pires que " +
        "l'arrêt.",
    );
  }
  return valeur.trim();
}

/*
 * LA FORME DE LEUR RÉPONSE, décrite par Zod.
 *
 * `passthrough` et des champs très permissifs, délibérément : ce schéma n'est
 * pas là pour valider leur API — nous ne la contrôlons pas — mais pour EXTRAIRE
 * ce dont nous avons besoin sans lever quand ils ajoutent un champ. Un schéma
 * strict ferait échouer tout le suivi le jour où ils enrichissent leur réponse,
 * ce qui arrive sans prévenir.
 */
const Jalon = z
  .object({ key_stage: z.string().nullish(), time_utc: z.string().nullish() })
  .passthrough();

const Evenement = z
  .object({
    time_utc: z.string().nullish(),
    time_iso: z.string().nullish(),
    description: z.string().nullish(),
    location: z.string().nullish(),
    stage: z.string().nullish(),
  })
  .passthrough();

const InfoSuivi = z
  .object({
    latest_status: z.object({ status: z.string().nullish() }).passthrough().nullish(),
    latest_event: Evenement.nullish(),
    tracking: z
      .object({ providers: z.array(z.object({ events: z.array(Evenement).nullish() }).passthrough()).nullish() })
      .passthrough()
      .nullish(),
    milestone: z.array(Jalon).nullish(),
    time_metrics: z
      .object({
        estimated_delivery_date: z
          .object({ from: z.string().nullish(), to: z.string().nullish() })
          .passthrough()
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const Colis = z
  .object({
    number: z.string().nullish(),
    carrier: z.number().nullish(),
    track_info: InfoSuivi.nullish(),
  })
  .passthrough();

const Notification = z
  .object({ event: z.string().nullish(), data: Colis })
  .passthrough();

const Enregistrement = z
  .object({
    code: z.number().nullish(),
    data: z
      .object({
        accepted: z.array(z.object({ number: z.string().nullish(), carrier: z.number().nullish() }).passthrough()).nullish(),
        rejected: z
          .array(
            z
              .object({
                number: z.string().nullish(),
                error: z.object({ code: z.number().nullish(), message: z.string().nullish() }).passthrough().nullish(),
              })
              .passthrough(),
          )
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/** Traduit leur `track_info` dans le vocabulaire du produit. */
function versPort(colis: z.infer<typeof Colis>): EtatColisPort {
  const info = colis.track_info ?? null;

  const evenements = [
    ...(info?.tracking?.providers ?? []).flatMap((p) => p.events ?? []),
    // L'événement le plus récent est parfois rendu SEUL, hors de la liste des
    // fournisseurs. L'ajouter ne crée pas de doublon : la déduplication porte
    // sur (instant, description), et c'est exactement le même point.
    ...(info?.latest_event ? [info.latest_event] : []),
  ];

  return {
    statutBrut: info?.latest_status?.status ?? null,
    jalons: (info?.milestone ?? []).map((j) => ({
      etape: j.key_stage ?? "",
      date: j.time_utc ?? null,
    })),
    points: evenements.map((e) => ({
      // `time_utc` d'abord : `time_iso` porte le fuseau du transporteur, et
      // deux points datés dans deux fuseaux différents ne se comparent pas.
      instant: e.time_utc ?? e.time_iso ?? null,
      description: e.description ?? null,
      lieu: e.location ?? null,
      etape: e.stage ?? null,
    })),
    transporteur: colis.carrier ?? null,
    estimationDu: info?.time_metrics?.estimated_delivery_date?.from ?? null,
    estimationAu: info?.time_metrics?.estimated_delivery_date?.to ?? null,
  };
}

/**
 * Un état sans aucun point ni statut est un retour VIDE, pas une erreur.
 *
 * C'est la distinction qui décide de l'abandon d'un suivi : la confondre avec
 * « introuvable » ferait abandonner des colis parfaitement normaux la veille du
 * jour où ils commencent à bouger.
 */
function estVide(etat: EtatColisPort): boolean {
  const sansStatut = etat.statutBrut === null || etat.statutBrut.trim() === "";
  const sansPoint = etat.points.length === 0;
  const sansJalonDate = etat.jalons.every((j) => j.date === null || j.date.trim() === "");
  return sansStatut && sansPoint && sansJalonDate;
}

async function appeler(chemin: string, corps: unknown): Promise<ReponsePort> {
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);

  try {
    const reponse = await fetch(BASE + chemin, {
      method: "POST",
      headers: { "content-type": "application/json", [EN_TETE_CLE]: cle() },
      body: JSON.stringify(corps),
      signal: controleur.signal,
      cache: "no-store",
    });

    if (!reponse.ok) {
      // Le corps de leur réponse n'est PAS remonté tel quel : il peut contenir
      // notre propre requête en écho, donc le numéro de suivi d'un vendeur, et
      // ce motif finira dans un journal.
      return { statut: "indisponible", motif: "http-" + String(reponse.status) };
    }

    const brut: unknown = await reponse.json();
    const analyse = Enregistrement.safeParse(brut);
    if (!analyse.success) return { statut: "indisponible", motif: "reponse-illisible" };

    const rejete = analyse.data.data?.rejected?.[0];
    if (rejete !== undefined) {
      return { statut: "refuse", motif: "code-" + String(rejete.error?.code ?? "inconnu") };
    }

    // La prise en charge ne rend PAS l'état du colis : elle l'enregistre. L'état
    // arrive ensuite, par notification ou par interrogation.
    return { statut: "vide", brut };
  } catch (erreur) {
    const motif = erreur instanceof Error && erreur.name === "AbortError" ? "delai" : "reseau";
    return { statut: "indisponible", motif };
  } finally {
    clearTimeout(minuterie);
  }
}

export const dixSeptTrack: FournisseurSuivi = {
  nom: "17track",
  enTeteSignature: EN_TETE_SIGNATURE,

  async prendreEnCharge(numero, transporteur) {
    const entree: Record<string, unknown> = { number: numero };
    if (transporteur !== null) entree["carrier"] = transporteur;
    return appeler("/register", [entree]);
  },

  async interroger(numero, transporteur) {
    const entree: Record<string, unknown> = { number: numero };
    if (transporteur !== null) entree["carrier"] = transporteur;

    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);
    try {
      const reponse = await fetch(BASE + "/gettrackinfo", {
        method: "POST",
        headers: { "content-type": "application/json", [EN_TETE_CLE]: cle() },
        body: JSON.stringify([entree]),
        signal: controleur.signal,
        cache: "no-store",
      });
      if (!reponse.ok) return { statut: "indisponible", motif: "http-" + String(reponse.status) };

      const brut: unknown = await reponse.json();
      const accepte = z
        .object({ data: z.object({ accepted: z.array(Colis).nullish() }).passthrough().nullish() })
        .passthrough()
        .safeParse(brut);

      if (!accepte.success) return { statut: "indisponible", motif: "reponse-illisible" };

      const colis = accepte.data.data?.accepted?.[0];
      if (colis === undefined) return { statut: "vide", brut };

      const etat = versPort(colis);
      return estVide(etat) ? { statut: "vide", brut } : { statut: "ok", etat, brut };
    } catch (erreur) {
      const motif = erreur instanceof Error && erreur.name === "AbortError" ? "delai" : "reseau";
      return { statut: "indisponible", motif };
    } finally {
      clearTimeout(minuterie);
    }
  },

  /**
   * VÉRIFICATION DE SIGNATURE — la garde du point de réception.
   *
   * Le schéma est le leur : `sha256(corps_brut + "/" + clé)`, en hexadécimal,
   * comparé à l'en-tête `sign`. Trois points qui ne se négocient pas :
   *
   *  1. LE CORPS BRUT, jamais un objet réanalysé. Un aller-retour par
   *     `JSON.parse` puis `JSON.stringify` réordonne les clefs et change les
   *     espaces : la signature ne correspondrait plus — ou, pire, correspondrait
   *     à un contenu qui n'est plus celui reçu.
   *  2. COMPARAISON À TEMPS CONSTANT. Une comparaison de chaînes s'arrête au
   *     premier octet différent, et cet écart de temps se mesure : il permet de
   *     reconstruire la signature attendue octet par octet.
   *  3. AUCUNE SIGNATURE = REFUS. Un point de réception qui accepte une
   *     notification non signée laisse n'importe qui écrire dans les commandes
   *     de n'importe quel vendeur — le suivi devient un canal d'écriture ouvert.
   */
  verifierNotification(corpsBrut, signature) {
    if (signature === null) return false;
    const propre = signature.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(propre)) return false;

    const attendue = createHash("sha256")
      .update(corpsBrut + "/" + cle(), "utf8")
      .digest("hex");

    // Les deux tampons ont la même longueur par construction (64 hexadécimaux
    // vérifiés ci-dessus), condition qu'exige `timingSafeEqual` — appelée avec
    // des longueurs différentes, elle LÈVE, et l'exception révélerait par son
    // existence même que la longueur ne correspondait pas.
    return timingSafeEqual(Buffer.from(attendue, "hex"), Buffer.from(propre, "hex"));
  },

  lireNotification(corpsBrut) {
    let brut: unknown;
    try {
      brut = JSON.parse(corpsBrut);
    } catch {
      return { statut: "refuse", motif: "json-illisible" };
    }

    const analyse = Notification.safeParse(brut);
    if (!analyse.success) return { statut: "refuse", motif: "forme-inattendue" };

    const colis = analyse.data.data;
    const numero = colis.number ?? undefined;
    const etat = versPort(colis);

    // Une notification d'ARRÊT de suivi n'apporte aucun état : le fournisseur
    // cesse simplement de regarder. La traiter comme un état vide serait juste ;
    // la traiter comme une erreur ferait chercher une panne inexistante.
    if (estVide(etat)) {
      return numero === undefined ? { statut: "vide", brut } : { statut: "vide", brut, numero };
    }
    return numero === undefined
      ? { statut: "ok", etat, brut }
      : { statut: "ok", etat, brut, numero };
  },
};

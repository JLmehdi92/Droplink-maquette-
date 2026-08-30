import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MOTIF_CLE_ABSENTE } from "./port";
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI EST ÉTABLI SUR CE FOURNISSEUR — RELEVÉ LE 27/08/2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FACTURATION À LA PRISE EN CHARGE, verbatim de leur documentation :
 * « Successfully registering 1 tracking number equals 1 quota. No quota will be
 * deducted for continuous tracking after successful registration; repeated API
 * calls or automatic tracking do not incur quota deduction. »
 *
 * C'est ce qui fonde deux décisions déjà prises, et qui les CONFIRME plutôt que
 * de les rouvrir : l'unicité `(shop_id, tracking_number)` en base, et le refus
 * d'un second fournisseur de secours — garder un secours doublerait le seul
 * coût variable du produit, puisqu'on paierait DEUX prises en charge par colis.
 *
 * Pas d'abonnement : des packs de quotas, valables douze mois, non
 * reconductibles automatiquement. Limite de débit 3 requêtes/seconde, 429 au-delà.
 *
 * ⚠️ LE PALIER GRATUIT A CHANGÉ, ET CE BLOC AFFIRMAIT L'ANCIEN — relevé le
 * 30/08/2026 dans leur documentation courante. Il disait « 100 quotas par mois,
 * remis à 100 le premier du mois ». C'était vrai au relevé du 27/08 ; ça ne l'est
 * plus :
 *
 *   « Effective January 7, 2026, at 00:00 UTC, the platform's free order number
 *     allocation policy will be adjusted as follows: The previous monthly
 *     automatic allocation of 100 free order numbers will cease. New accounts
 *     registered after January 7, 2026, will receive a ONE-TIME allocation of
 *     200 free order numbers. »
 *
 * La différence n'est pas cosmétique : ce n'est plus une rente mensuelle, c'est
 * **200 prises en charge, une seule fois**. Le suivi cesse d'être gratuit dès
 * le 201ᵉ colis du compte, pas du mois. Toute estimation de coût qui repose sur
 * « 100 par mois » est fausse.
 *
 * ⚠️ LEURS PRIX NE SONT PAS PUBLIÉS. La page « Plan Details » renvoie à une
 * adresse commerciale, et la page tarifaire est une application JavaScript dont
 * le HTML servi ne contient aucun montant. Les chiffres qui circulent
 * (« 119 $ pour 5 000 ») viennent du blog d'un CONCURRENT. On ne les retient
 * pas : il faudra les demander. À titre de comparaison, le seul concurrent qui
 * publie ses prix en clair, TrackingMore, facture 74 $ pour 2 000 envois et
 * 0,04 $ par envoi supplémentaire — soit environ 32 $/mois pour un fournisseur
 * à 800 commandes mensuelles.
 *
 * ⚠️ DEUX CHIFFRES OFFICIELS SE CONTREDISENT sur la couverture : 2 100
 * transporteurs dans la documentation de l'API, « 3 500+ » sur la page
 * marketing. Aucun comparatif indépendant n'existe — toutes les pages qui
 * comparent ces fournisseurs sont écrites par l'un d'eux. C'est précisément
 * pourquoi le protocole des dix vrais numéros reste le seul juge.
 *
 * ⚠️ ILS ARRÊTENT DE SUIVRE APRÈS 30 JOURS SANS ÉVÉNEMENT, et 15 jours après
 * une livraison ; ils conservent les données 90 jours puis les suppriment. Notre
 * rétention en prévoit 90 après le DERNIER MOUVEMENT : un colis bloqué en douane
 * sort donc de leur radar avant du nôtre. C'est la réserve consignée au brief,
 * et elle est confirmée par leur documentation.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const BASE = "https://api.17track.net/track/v2.4";
const EN_TETE_CLE = "17token";
/**
 * LES DEUX NOMS D'EN-TÊTE DE SIGNATURE — ON ACCEPTE CELUI QUI ARRIVE.
 *
 * Leur documentation v1 nomme cet en-tête `sign`. Une lecture de la v2.2 — la
 * version dont vient l'adresse ci-dessus — a fait remonter
 * `x-17track-signature`. Les deux sont des sources officielles, et elles ne
 * disent pas la même chose.
 *
 * ON NE PARIE PAS SUR UN NOM. Si le nom retenu est le mauvais, aucune
 * notification n'est jamais authentifiée : TOUTES sont refusées en 401, le suivi
 * cesse de se mettre à jour EN SILENCE, et rien dans les journaux ne dirait que
 * la cause est un nom d'en-tête. C'est le pire mode de défaillance possible pour
 * cette route — celui qu'on ne cherche pas parce que tout paraît fonctionner.
 *
 * ⚠️ CE N'EST PAS UN AFFAIBLISSEMENT DE LA GARDE, et il faut savoir dire
 * pourquoi : accepter deux noms ne change RIEN à ce qui est vérifié. La
 * signature est calculée et comparée à l'identique ; une requête non signée ne
 * porte AUCUN des deux, donc elle reste refusée. On lève un pari, on n'ouvre
 * pas une porte.
 *
 * Le premier PRÉSENT fait foi, et la route journalise lequel est arrivé : c'est
 * ce journal qui tranchera définitivement à la première vraie notification.
 */
const EN_TETES_SIGNATURE = ["sign", "x-17track-signature"] as const;

/** Au-delà, on considère le fournisseur indisponible plutôt que d'attendre. */
const DELAI_MS = 12_000;

/**
 * Le nom porté par l'erreur de configuration, pour qu'elle reste RECONNAISSABLE
 * après avoir traversé un `catch`.
 *
 * ⚠️ SANS LUI, UNE CLÉ ABSENTE SE FAISAIT PASSER POUR UNE PANNE RÉSEAU. Les deux
 * `catch` de ce fichier rendaient `motif: "reseau"` pour toute erreur qui n'est
 * pas une expiration de délai — et `cle()` lève AVANT le `fetch`, puisqu'elle est
 * évaluée en construisant les en-têtes. Le message le plus utile du fichier
 * était donc jeté et remplacé par un diagnostic faux.
 *
 * La différence n'est pas cosmétique : une panne réseau est TRANSITOIRE et la
 * tâche de fond la rattrape, alors qu'une clé absente échouera à l'identique
 * pour toujours. Les taire toutes les deux revient à taire la seconde.
 */
const ERREUR_CONFIGURATION = "ConfigurationDeSuiviAbsente";

function cle(): string {
  const valeur = process.env["TRACKING_API_KEY"] ?? "";
  if (valeur.trim() === "") {
    const erreur = new Error(
      "TRACKING_API_KEY absente. Le suivi ne peut ni prendre en charge un " +
        "numéro ni vérifier une notification : sans clé, la vérification de " +
        "signature accepterait ou refuserait tout, et les deux sont pires que " +
        "l'arrêt.",
    );
    erreur.name = ERREUR_CONFIGURATION;
    throw erreur;
  }
  return valeur.trim();
}

/**
 * Le motif d'un échec, sans jamais confondre configuration et réseau.
 *
 * On teste le NOM de l'erreur, comme le fait déjà l'expiration de délai avec
 * `AbortError` : c'est l'idiome du fichier, et il survit à une reformulation du
 * message.
 */
function motifDeLErreur(erreur: unknown): string {
  if (erreur instanceof Error && erreur.name === ERREUR_CONFIGURATION) return MOTIF_CLE_ABSENTE;
  if (erreur instanceof Error && erreur.name === "AbortError") return "delai";
  return "reseau";
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
    return { statut: "indisponible", motif: motifDeLErreur(erreur) };
  } finally {
    clearTimeout(minuterie);
  }
}

export const dixSeptTrack: FournisseurSuivi = {
  nom: "17track",
  enTetesSignature: EN_TETES_SIGNATURE,

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
      return { statut: "indisponible", motif: motifDeLErreur(erreur) };
    } finally {
      clearTimeout(minuterie);
    }
  },

  /**
   * VÉRIFICATION DE SIGNATURE — la garde du point de réception.
   *
   * Le schéma est le leur : `sha256(corps_brut + "/" + clé)`, en hexadécimal,
   * comparé à l'en-tête `sign`.
   *
   * ⚠️ CE N'EST PAS UN HMAC, ET IL FAUT LE DIRE. Relevé le 27/08/2026 : ils
   * concatènent simplement le secret au message avant de hacher. Un HMAC existe
   * précisément parce que cette construction est faible — elle expose en théorie
   * à l'extension de longueur, dont l'effet ici serait qu'un tiers ayant vu une
   * notification légitime puisse en signer une PLUS LONGUE sans connaître la
   * clé. Leur documentation v1 signe `event/data/clé` là où la v2.2 signe le
   * corps entier ; c'est la seconde qui est implémentée ici, cohérente avec
   * l'adresse d'API employée.
   *
   * Ce n'est PAS une raison de changer de fournisseur : celui qui documente le
   * schéma le plus faible des quatre examinés est TrackingMore — HMAC du seul
   * HORODATAGE, avec l'adresse email du compte pour secret, donc une signature
   * valide n'y prouve rien du CONTENU. AfterShip et ParcelsApp signent bien le
   * corps brut, mais leur API n'est accessible qu'à partir de paliers payants
   * dont les prix ne sont, eux non plus, pas publiés en clair.
   *
   * C'est en revanche une raison de ne jamais faire reposer une écriture
   * IRRÉVERSIBLE sur cette seule garde. Elle ne l'est pas : le statut ne recule
   * jamais, l'unicité borne le coût, et la déduplication des notifications
   * empêche un rejeu de compter deux fois.
   *
   * Trois points qui ne se négocient pas :
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

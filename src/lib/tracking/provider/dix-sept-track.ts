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
 * reconductibles automatiquement.
 *
 * ⚠️ LIMITE DE DÉBIT : 3 REQUÊTES/SECONDE, 429 AU-DELÀ — ET NOUS NE LA LIMITONS
 * PAS. Écart connu, assumé, et nommé ici plutôt que colmaté :
 *
 *   - le seul appelant qui puisse faire une rafale est la CADENCE, et elle
 *     boucle en série, un `await` par colis ;
 *   - un 429 est déjà traité comme `indisponible` (motif `http-429`), donc le
 *     colis est REPRIS au passage suivant : la rafale dégrade, elle ne perd
 *     rien ;
 *   - une limitation EN MÉMOIRE ne tiendrait pas : le projet s'interdit
 *     explicitement ce mécanisme, parce que les instances se multiplient
 *     précisément sous la charge à limiter. La faire en base coûterait un
 *     aller-retour par appel de suivi ;
 *   - et surtout, RIEN N'EST OBSERVABLE tant que la clé est absente : on n'a
 *     jamais vu un seul 429. Poser une temporisation qu'on ne peut pas éprouver,
 *     c'est se donner l'impression d'avoir traité le sujet.
 *
 * → À reprendre avec de vrais 429 sous les yeux, et en base si le volume le
 * justifie. Le déclencheur se mesure : `usage_counters.tracking_api_calls`.
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

/**
 * LEUR ENVELOPPE, LA MÊME POUR `/register` ET POUR `/gettrackinfo`.
 *
 * ⚠️ ELLE ÉTAIT DÉDOUBLÉE, ET C'EST CE DÉDOUBLEMENT QUI A PRODUIT LE DÉFAUT.
 * `appeler` analysait `code` + `accepted` + `rejected` ; `interroger` avait son
 * propre schéma en ligne, qui ne regardait que `data.accepted`. Les deux points
 * d'appel du même fournisseur lisaient donc deux formes différentes d'une seule
 * réponse, et la moitié des champs n'était consultée que d'un côté.
 *
 * `accepted` porte `Colis` et non un couple `{number, carrier}` : `Colis` est
 * en `passthrough` et tous ses champs sont facultatifs, donc il analyse aussi
 * bien l'accusé maigre de `/register` que l'état complet de `/gettrackinfo`.
 */
const Enveloppe = z
  .object({
    code: z.number().nullish(),
    data: z
      .object({
        accepted: z.array(Colis).nullish(),
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

/**
 * LES CHAMPS DE LEUR RÉPONSE QUI DÉCRIVENT UNE PERSONNE, ET QU'ON NE STOCKE PAS.
 *
 * ⚠️ RELEVÉ LE 30/08/2026 DANS LEUR DOCUMENTATION, ET C'EST UNE SURPRISE. La
 * charge utile d'une notification `TRACKING_UPDATED` contient
 * `track_info.shipping_info.recipient_address` — pays, région, ville, RUE, code
 * postal et coordonnées du DESTINATAIRE — ainsi que `consignee`, `phone_number`,
 * `phone_number_last_4` et `cpf_or_cnpj`. Nous ne les demandons jamais : notre
 * `/register` n'envoie que le numéro et, parfois, le transporteur. Le
 * transporteur, lui, les publie.
 *
 * On les recevait donc, et on les ÉCRIVAIT dans `tracking_snapshots.raw_payload`
 * — pendant quatre-vingt-dix jours après le dernier mouvement.
 *
 * Ce n'était pas une fuite : cette table porte la RLS sans aucune policy, donc
 * elle n'est atteignable qu'en service-role, et rien de tout cela n'atteint
 * jamais un écran. Mais c'est une collecte : des données personnelles sur le
 * CLIENT D'UN VENDEUR, que le produit s'interdit par principe — le destinataire
 * n'a pas de compte, et son nom même n'est qu'un pseudo en texte libre.
 *
 * La réponse brute existe pour DIAGNOSTIQUER. L'adresse d'un tiers n'a aucune
 * valeur de diagnostic. On la retire avant d'écrire.
 *
 * ⚠️ CETTE LISTE EST UN CONTRÔLE PAR NOM, avec la faiblesse que ça implique :
 * elle vaut pour le schéma qu'ils documentent AUJOURD'HUI. Un champ personnel
 * ajouté demain sous un autre nom passerait. C'est assumé — l'inverse, une liste
 * blanche, jetterait précisément les champs inconnus pour lesquels on garde la
 * réponse brute. À revoir quand leur schéma change.
 */
const CHAMPS_PERSONNELS = new Set([
  "shipping_info",
  "shipper",
  "consignee",
  "phone_number",
  "phone_number_last_4",
  "cpf_or_cnpj",
  /*
   * ⚠️ AJOUTÉS LE 01/09/2026 — LA LISTE PASSAIT À CÔTÉ D'UN CHEMIN ENTIER.
   *
   * Elle ne couvrait que `shipping_info`. Or leur documentation place un objet
   * `address` IDENTIQUE sur `latest_event` ET sur CHAQUE entrée de
   * `tracking.providers[].events[]` :
   *
   *   "address": { "country":"US","state":"NJ","city":"MARLTON",
   *                "street":null,"postal_code":"08053",
   *                "coordinates":{"longitude":null,"latitude":null} }
   *
   * Sur la plupart des événements c'est un CENTRE DE TRI, sans valeur
   * personnelle. Mais sur l'événement de LIVRAISON, `street` et `coordinates`
   * portent l'adresse du CLIENT D'UN VENDEUR — la donnée que le produit
   * s'interdit de collecter, écrite quatre-vingt-dix jours dans
   * `tracking_snapshots.raw_payload`.
   *
   * ⚠️ ON NE RETIRE PAS `address` EN ENTIER, ET C'EST UN ARBITRAGE ASSUMÉ. La
   * réponse brute existe pour DIAGNOSTIQUER, et savoir dans quelle VILLE un
   * colis a été scanné en a la valeur — c'est même ce qui permet de comprendre
   * un blocage en douane. Ce qui désigne une PERSONNE, c'est la rue et les
   * coordonnées ; le pays, la région et la ville désignent un lieu de passage.
   * On retire donc les deux clefs, à toute profondeur, et on garde le reste.
   *
   * Le produit, lui, n'a jamais lu que `location` — une chaîne grossière. Rien
   * de ce qui est retiré ici n'atteignait un écran.
   */
  "street",
  "coordinates",
]);

/**
 * Rend une copie de leur réponse SANS les champs qui décrivent une personne.
 *
 * Le parcours est récursif et porte sur le NOM de la clef, à n'importe quelle
 * profondeur : leur schéma place `shipping_info` sous `track_info`, mais rien ne
 * garantit qu'il n'apparaisse pas ailleurs, et un contrôle qui ne regarde qu'un
 * chemin précis regarde là où le défaut n'est peut-être plus.
 */
export function sansDonneesPersonnelles(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(sansDonneesPersonnelles);
  if (valeur === null || typeof valeur !== "object") return valeur;

  const propre: Record<string, unknown> = {};
  for (const [clef, contenu] of Object.entries(valeur as Record<string, unknown>)) {
    if (CHAMPS_PERSONNELS.has(clef)) continue;
    propre[clef] = sansDonneesPersonnelles(contenu);
  }
  return propre;
}

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

/**
 * ⚠️ « DÉJÀ ENREGISTRÉ » N'EST PAS UN REFUS — C'EST UN SUCCÈS.
 *
 * DÉFAUT RÉEL, TROUVÉ LE 01/09/2026 EN LISANT LEUR TABLE DE CODES. Tout rejet
 * était traduit en `refuse`, et `refuse` déclenche `marquer_prise_en_charge`
 * avec `p_abandonne = true` : le colis est abandonné DÉFINITIVEMENT.
 *
 * Or `-18019901` signifie « Tracking number {0} is already registered ». Le
 * colis EST suivi chez eux, et le quota EST déjà payé. Le cas n'a rien
 * d'exotique : il survient dès qu'une prise en charge aboutit chez eux mais
 * que notre écriture échoue ensuite, ou qu'un même numéro revient par un autre
 * chemin. On abandonnait donc un suivi qui fonctionnait, après l'avoir payé, et
 * le vendeur ne voyait qu'une page qui ne bouge plus.
 */
const CODE_DEJA_ENREGISTRE = -18019901;

/**
 * Les seuls rejets DÉFINITIFS — ceux qu'insister ne réparera jamais.
 *
 * ⚠️ LA LISTE EST COURTE, ET L'ASYMÉTRIE EST VOULUE. Les deux erreurs possibles
 * n'ont pas le même prix :
 *   - classer à tort en `refuse` abandonne un colis POUR TOUJOURS, et le client
 *     d'un vendeur reste devant une page morte ;
 *   - classer à tort en `indisponible` fait reprendre le colis, et la fenêtre
 *     existante — 7 jours, 16 interrogations — l'abandonne de toute façon.
 * Le premier est irréversible, le second est borné. **Tout code INCONNU part
 * donc en `indisponible`.**
 *
 * ⚠️ ET LA RAISON QUI JUSTIFIAIT L'INVERSE ÉTAIT FAUSSE. Le commentaire de
 * `prise-en-charge.ts` abandonnait tout de suite « plutôt que de le réessayer
 * seize fois, [car] chaque tentative se paie ». Leur documentation dit le
 * contraire, verbatim : « **Successfully** registering 1 tracking number equals
 * 1 quota ». Un enregistrement REJETÉ ne consomme rien. Réessayer est gratuit.
 *
 * ⚠️ `-18019903` Y EST RESTÉ, APRÈS M'ÊTRE TROMPÉ DESSUS. Je l'en avais retiré
 * en raisonnant que la détection « réussirait plus tard, une fois le numéro
 * scanné ». C'est faux : leur détection lit le FORMAT du numéro, pas son
 * historique de scans. Un format qu'ils ne reconnaissent pas aujourd'hui ne
 * sera pas reconnu dans sept jours.
 *
 * Et la conséquence produit tranche dans le même sens : en refus, le vendeur
 * apprend TOUT DE SUITE qu'il doit préciser le transporteur ; en
 * indisponibilité, il attend une semaine de silence pour le même verdict. Le
 * refus n'est pas la punition, c'est le retour d'information.
 */
const CODES_DEFINITIFS: ReadonlySet<number> = new Set([
  -18010013, // « Submitted data is invalid » — le numéro est malformé.
  -18019903, // Transporteur indétectable : c'est le FORMAT, il ne changera pas.
  -18019910, // Code transporteur incorrect : le même envoi échouera toujours.
]);

/**
 * `-18019909` — « aucune information disponible pour l'instant ».
 *
 * C'EST LE VIDE LÉGITIME, celui que le brief décrit mot pour mot : « un numéro
 * fraîchement collé n'est souvent pas encore scanné ». Il est rendu par
 * l'interrogation, jamais par la prise en charge, et il doit rester `vide` —
 * donc compter dans le coût sans être une erreur.
 *
 * Le classer `indisponible` avec les pannes de compte serait le défaut
 * SYMÉTRIQUE de celui que ce fichier vient de fermer : `empty_count`
 * n'avancerait plus, la fenêtre d'abandon ne se refermerait jamais, et un
 * numéro erroné serait interrogé indéfiniment, à nos frais.
 */
const CODE_SANS_INFO_POUR_L_INSTANT = -18019909;

/** Les deux codes qui disent « rien de neuf », et non « quelque chose ne va pas ». */
const CODES_SANS_ETAT: ReadonlySet<number> = new Set([
  CODE_DEJA_ENREGISTRE,
  CODE_SANS_INFO_POUR_L_INSTANT,
]);

function classerRejet(code: number | null | undefined, brut: unknown): ReponsePort {
  if (code !== null && code !== undefined && CODES_SANS_ETAT.has(code)) {
    // Succès sans état : ni la prise en charge ni une interrogation trop
    // précoce ne rendent l'état du colis. Il arrive ensuite, par notification
    // ou au passage suivant de la cadence.
    return { statut: "vide", brut };
  }
  if (code !== null && code !== undefined && CODES_DEFINITIFS.has(code)) {
    return { statut: "refuse", motif: "code-" + String(code) };
  }
  return { statut: "indisponible", motif: "code-" + String(code ?? "inconnu") };
}

/**
 * LE CODE DE NIVEAU COMPTE — quota épuisé, clé révoquée, IP hors liste blanche,
 * compte désactivé. Il vaut pour LES DEUX points d'appel.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ LE 01/09/2026. Cette règle n'existait qu'en un seul
 * endroit — dans `appeler`, qui ne sert que `/register` — parce que la garde de
 * L-024 avait été écrite depuis le champ de vision de sa CORRECTION.
 * `interroger` fait son propre appel et ne lisait pas `code` : leur réponse
 * d'erreur de compte étant un HTTP **200** portant `data: null`, `accepted`
 * valait `undefined` et l'interrogation rendait « vide ».
 *
 * Ce que « vide » déclenche : `compter_interrogation_vide`, donc `empty_count`
 * incrémenté ET un appel imputé au vendeur ; et `schedule.ts` abandonne à SEIZE
 * vides, c'est-à-dire en deux jours à trois heures d'intervalle. Une liste
 * blanche d'IP oubliée dans leur console — le piège numéro un du déploiement
 * sur des adresses de sortie dynamiques — abandonnait donc DÉFINITIVEMENT le
 * suivi de tous les colis de tous les vendeurs en quarante-huit heures, en
 * gonflant le seul compteur de coût du produit, sans que rien ne nomme la
 * cause : « vide » est une réponse parfaitement normale.
 *
 * Elle vit maintenant dans UNE fonction, appelée par les deux chemins. Une
 * règle écrite à deux endroits est une règle qu'un seul des deux appliquera.
 */
function refusDeCompte(code: number | null | undefined): ReponsePort | null {
  // 0 dans leur doc v2.4, 200 dans une autre page officielle : les deux
  // conventions circulent, on ne parie sur aucune et on ne refuse que ce qui
  // n'est visiblement ni l'une ni l'autre.
  if (code === null || code === undefined || code === 0 || code === 200) return null;
  return { statut: "indisponible", motif: "code-" + String(code) };
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

    const brut: unknown = sansDonneesPersonnelles(await reponse.json());
    const analyse = Enveloppe.safeParse(brut);
    if (!analyse.success) return { statut: "indisponible", motif: "reponse-illisible" };

    /*
     * ⚠️ UN 200 NE PROUVE PAS QU'ILS ONT ACCEPTÉ — ET ON LE PRÉSUMAIT.
     *
     * Cette fonction rendait « vide », c'est-à-dire SUCCÈS, dès qu'aucun numéro
     * n'était explicitement rejeté. Or leur réponse porte un `code` de niveau
     * COMPTE : quota épuisé, clé révoquée, compte suspendu. Dans ces cas il n'y a
     * ni `accepted` ni `rejected` — juste un code non nul et deux tableaux vides.
     *
     * L'appelant marquait alors `registered_at`, donc « ce colis est pris en
     * charge ». La tâche de fond ne le reprenait plus JAMAIS, puisque c'est
     * précisément `registered_at` restée nulle qui la déclenche. Un quota épuisé
     * aurait donc éteint le suivi de tous les colis suivants, définitivement et
     * sans un mot — le vendeur voyant seulement des pages qui ne bougent pas.
     *
     * → ON EXIGE UN ACCUSÉ POSITIF. C'est la leçon L-024 : trouver l'appel qui
     * REFUSE quand la configuration est fausse, et l'avoir vu refuser.
     *
     * `indisponible` et non `refuse` : rien n'est marqué, `registered_at` reste
     * nulle, et le colis est repris tel quel quand le quota est rechargé. Un
     * refus l'aurait abandonné pour de bon.
     */
    const panne = refusDeCompte(analyse.data.code);
    if (panne !== null) return panne;

    const rejete = analyse.data.data?.rejected?.[0];
    if (rejete !== undefined) {
      return classerRejet(rejete.error?.code ?? null, brut);
    }

    if ((analyse.data.data?.accepted ?? []).length === 0) {
      return { statut: "indisponible", motif: "sans-accuse" };
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

      const brut: unknown = sansDonneesPersonnelles(await reponse.json());
      const analyse = Enveloppe.safeParse(brut);
      if (!analyse.success) return { statut: "indisponible", motif: "reponse-illisible" };

      /*
       * ⚠️ L'INTERROGATION AUSSI EXIGE UN ACCUSÉ, ET C'EST NEUF.
       *
       * Ces deux contrôles n'existaient que sur la prise en charge. Sans eux,
       * une panne de COMPTE — quota, clé, IP hors liste blanche — se présentait
       * ici comme un colis « pas encore scanné », et la cadence l'abandonnait
       * définitivement en deux jours. Voir `refusDeCompte`.
       *
       * L'ordre est celui de la prise en charge : le compte d'abord, parce
       * qu'une panne de compte ne dit rien du colis, puis le rejet du numéro.
       */
      const panne = refusDeCompte(analyse.data.code);
      if (panne !== null) return panne;

      const rejete = analyse.data.data?.rejected?.[0];
      if (rejete !== undefined) return classerRejet(rejete.error?.code ?? null, brut);

      const colis = analyse.data.data?.accepted?.[0];
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
      // ⚠️ ON ANALYSE LE CORPS BRUT, PUIS ON RETIRE LES CHAMPS PERSONNELS. La
      // SIGNATURE, elle, a déjà été vérifiée sur le corps BRUT tel quel, avant
      // cet appel : la nettoyer ici ne peut donc pas casser la vérification.
      brut = sansDonneesPersonnelles(JSON.parse(corpsBrut));
    } catch {
      return { statut: "refuse", motif: "json-illisible" };
    }

    const analyse = Notification.safeParse(brut);
    if (!analyse.success) return { statut: "refuse", motif: "forme-inattendue" };

    const colis = analyse.data.data;
    const numero = colis.number ?? undefined;
    const etat = versPort(colis);

    /*
     * ⚠️ ON LIT ENFIN L'ÉVÉNEMENT, ET PAS SEULEMENT SA CHARGE UTILE.
     *
     * DÉFAUT RÉEL, RELEVÉ LE 01/09/2026. Ils poussent DEUX événements —
     * `TRACKING_UPDATED` et `TRACKING_STOPPED` — et le champ `event` était lu
     * par le schéma sans que personne ne branche dessus.
     *
     * L'arrêt n'était donc détecté qu'indirectement, par l'absence d'état (le
     * `estVide` ci-dessous). Rien n'oblige un `TRACKING_STOPPED` à venir vide :
     * accompagné du dernier état connu, il passait pour une mise à jour
     * ordinaire. On continuait alors d'interroger un numéro que plus personne
     * ne suit, et le silence affiché au client était imputé au TRANSPORTEUR
     * alors que c'est la SOURCE qui s'était tue.
     *
     * La comparaison est insensible à la casse et aux séparateurs, comme
     * partout ailleurs ici : parier sur `TRACKING_STOPPED` exactement, c'est
     * accepter que le suivi s'éteigne en silence le jour où ils écrivent
     * `Tracking_Stopped`.
     */
    const arrete =
      (analyse.data.event ?? "").trim().toLowerCase().replace(/[\s_-]/g, "") === "trackingstopped";

    const suffixe = {
      ...(numero === undefined ? {} : { numero }),
      // Le champ n'est POSÉ que lorsqu'il est vrai : `exactOptionalPropertyTypes`
      // distingue « absent » de « vaut false », et l'appelant ne doit pas avoir
      // à traiter un troisième cas qui ne veut rien dire.
      ...(arrete ? { arrete: true as const } : {}),
    };

    // Un arrêt SANS état n'est pas une erreur : le fournisseur cesse simplement
    // de regarder. Le traiter comme une panne ferait chercher ce qui n'existe pas.
    if (estVide(etat)) return { statut: "vide", brut, ...suffixe };
    return { statut: "ok", etat, brut, ...suffixe };
  },
};

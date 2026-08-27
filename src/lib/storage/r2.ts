import "server-only";
import { AwsClient, AwsV4Signer } from "aws4fetch";
import { configR2 } from "./config";
import { exigerCleCanonique } from "./cles";

/**
 * Accès au stockage R2. MODULE UNIQUE — jamais d'appels dispersés ailleurs.
 *
 * Le bucket est PRIVÉ sans exception : aucun domaine public, aucun `r2.dev`.
 * Tout accès passe par une URL signée à expiration.
 *
 * Deux propriétés font que ce module tient quand le nombre de vendeurs croît :
 *
 *   - **Signer ne coûte aucun aller-retour réseau.** La signature SigV4 est un
 *     calcul HMAC local. Une page publique à 20 médias produit 20 URLs sans
 *     toucher R2 une seule fois. C'est ce qui rend le coût indépendant du
 *     nombre de consultations.
 *   - **On n'énumère jamais le bucket.** Les clés vivent en base, donc aucune
 *     opération ne parcourt un préfixe dont la taille croît avec le succès.
 *
 * Les seuls appels réseau sont ceux qui écrivent ou qui MESURENT : relire la
 * taille après un dépôt, et supprimer.
 */

/**
 * Durée de validité d'une URL de DÉPÔT.
 *
 * Assez longue pour qu'une vidéo de 20 Mo parte depuis une connexion lente
 * (20 Mo à 500 kbit/s ≈ 5 min 20), assez courte pour qu'une URL interceptée ne
 * serve pas longtemps. Chaque fichier reçoit la sienne.
 */
export const DUREE_DEPOT_S = 900;

/**
 * Bornes de validité d'une URL de LECTURE.
 *
 * ATTENTION — aws4fetch fixe `X-Amz-Expires` à 86 400 s (24 h) quand on ne le
 * précise pas. Ce module le passe TOUJOURS explicitement : un défaut silencieux
 * de 24 h sur un média privé ne se verrait dans aucune relecture de code, et
 * une URL de 24 h qui circule dans une conversation reste valable bien après
 * que la page a cessé d'être servie.
 */
export const LECTURE_MIN_S = 60;
export const LECTURE_MAX_S = 7 * 24 * 3600;

/**
 * QUINZE MINUTES, ET C'EST UN ARBITRAGE DE WASSIM, PAS UNE VALEUR TECHNIQUE.
 *
 * ⚠️ CE NOMBRE EST LE DERNIER RÉSIDU DE LA COUPURE DE SUSPENSION, et c'est la
 * coupure qui fonde notre statut d'hébergeur. La chaîne
 * `suspension → la vue filtre → la page cesse de répondre` est INSTANTANÉE : le
 * lien public renvoie 404 dès la seconde suivante. Mais R2 ne révoque pas une
 * URL déjà signée — elle vit sa vie jusqu'à son expiration, hors de notre
 * portée. Ce nombre EST donc la durée pendant laquelle les médias d'un compte
 * suspendu restent atteignables par qui avait déjà la page ouverte.
 *
 * Elle valait 3 600 s. Passée à 900 s : la fenêtre est divisée par quatre.
 *
 * CE QUE ÇA NE CASSE PAS, et c'est ce qui rend l'arbitrage gratuit. Le lien que
 * le client reçoit — `/p/[token]` — ne périme JAMAIS et n'est jamais régénéré.
 * La page est rendue à la demande (établi au build : `ƒ /p/[token]`), donc
 * chaque visite refabrique des URL neuves ; un client qui revient cinq heures
 * plus tard voit tout. Et les photos en plein écran sont signées AU CLIC, pas
 * au chargement — elles ne peuvent pas expirer avant d'être vues.
 *
 * Le seul cas dégradé est un onglet laissé ouvert au-delà du délai dont le
 * navigateur redemande une vignette : un rafraîchissement répare.
 *
 * LA COUPURE VRAIMENT INSTANTANÉE demanderait de faire transiter chaque média
 * par notre serveur, donc de renoncer à l'accès direct au stockage — sur le
 * seul poste de coût du produit qui puisse déraper, la vidéo. Ce n'est PAS
 * mesuré, et ce n'est pas tranché : c'est un sujet du premier déploiement,
 * là où l'on prouvera de toute façon que la coupure coupe.
 */
export const DUREE_LECTURE_DEFAUT_S = 900;

export class DureeHorsBornes extends Error {
  constructor(demandee: number) {
    super(
      `Durée de signature de ${demandee} s hors bornes ` +
        `[${LECTURE_MIN_S}, ${LECTURE_MAX_S}]. Une URL de lecture trop longue ` +
        "survit à la page qui l'a produite ; trop courte, elle expire pendant " +
        "que le client fait défiler sa galerie.",
    );
    this.name = "DureeHorsBornes";
  }
}

export class EchecStockage extends Error {
  constructor(
    operation: string,
    public readonly statut: number,
    detail: string,
  ) {
    super(`Stockage R2 : ${operation} a échoué (HTTP ${statut}). ${detail}`);
    this.name = "EchecStockage";
  }
}

/**
 * L'adresse d'un objet — SEUL point où une clé devient une URL.
 *
 * ⚠️ CE POINT DE PASSAGE EST LA GARDE, et il l'est parce qu'il est UNIQUE.
 *
 * Le contrôle vivait auparavant chez l'appelant, dupliqué en deux endroits
 * (`lib/boutique/logo.ts` et `bienvenue/actions.ts`), sous la forme d'un
 * préfixe. Une garde dupliquée est une garde qu'on corrige à un endroit et
 * qu'on oublie à l'autre ; et un contrôle de préfixe ne dit rien de ce qui
 * suit. La clé du logo revient du client : `logos/{monShop}/../../medias/...`
 * passait le préfixe, et `new URL()` normalisait les `..` juste ici.
 *
 * Deux barrières, et la seconde interroge l'EFFET plutôt que la forme :
 *   1. la clé doit avoir une des formes que `cles.ts` produit ;
 *   2. le chemin RÉELLEMENT construit doit encore contenir cette clé, à la
 *      lettre. Si une normalisation future — de `URL`, du runtime, d'un
 *      encodage — déplaçait l'objet, la première barrière ne le verrait pas.
 *      Celle-ci le voit, quelle qu'en soit la cause.
 */
export function adresseObjet(endpoint: string, bucket: string, cle: string): URL {
  exigerCleCanonique(cle);

  const url = new URL(`${endpoint}/${bucket}/${cle}`);
  const attendu = `/${bucket}/${cle}`;
  if (url.pathname !== attendu) {
    throw new EchecStockage(
      "construction de l'adresse",
      0,
      `Le chemin construit (${url.pathname}) ne correspond pas à la clé demandée ` +
        `(${attendu}) : l'objet visé n'est pas celui qui a été autorisé.`,
    );
  }
  return url;
}

function urlObjet(cle: string): URL {
  const { endpoint, bucket } = configR2();
  return adresseObjet(endpoint, bucket, cle);
}

function client(): AwsClient {
  const { accessKeyId, secretAccessKey } = configR2();
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    // R2 n'a qu'une région logique. Elle doit tout de même figurer dans la
    // signature, sans quoi la chaîne canonique ne correspond pas.
    region: "auto",
  });
}

/**
 * URL de dépôt présignée.
 *
 * `content-length` ET `content-type` sont INCLUS DANS LA SIGNATURE via
 * `allHeaders`. C'est le point qui compte : aws4fetch les classe par défaut
 * parmi les en-têtes non signables, si bien qu'une URL de dépôt naïve laisse le
 * client envoyer n'importe quelle taille et n'importe quel format. Quelqu'un
 * disposant d'une URL prévue pour une photo pourrait y pousser plusieurs
 * gigaoctets — et le stockage est le seul poste de coût du produit qui peut
 * réellement déraper.
 *
 * La taille annoncée par le client n'est pas CRUE, elle est LIÉE : plafonnée
 * par l'appelant côté serveur, puis scellée dans la signature, puis relue par
 * `lireTaille()` après le dépôt. Trois barrières dont aucune ne repose sur la
 * bonne foi du navigateur.
 */
export async function signerDepot(params: {
  cle: string;
  typeMime: string;
  tailleOctets: number;
  dureeSecondes?: number;
}): Promise<{ url: string; enTetesObligatoires: Record<string, string>; expireDans: number }> {
  const duree = params.dureeSecondes ?? DUREE_DEPOT_S;
  if (!Number.isInteger(params.tailleOctets) || params.tailleOctets <= 0) {
    throw new EchecStockage(
      "signature de dépôt",
      0,
      `Taille annoncée invalide (${params.tailleOctets}).`,
    );
  }

  const { accessKeyId, secretAccessKey } = configR2();
  const url = urlObjet(params.cle);
  url.searchParams.set("X-Amz-Expires", String(duree));

  const enTetes: Record<string, string> = {
    "content-type": params.typeMime,
    "content-length": String(params.tailleOctets),
  };

  const signer = new AwsV4Signer({
    url: url.toString(),
    method: "PUT",
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    // Sans ceci, `content-type` et `content-length` sortent de la signature et
    // la borne de taille devient décorative.
    allHeaders: true,
    headers: enTetes,
  });

  const { url: signee } = await signer.sign();
  return {
    url: signee.toString(),
    // Le navigateur DOIT renvoyer exactement ces en-têtes : ils font partie de
    // la signature. Les rendre explicites évite qu'un appelant les devine.
    enTetesObligatoires: enTetes,
    expireDans: duree,
  };
}

/** URL de lecture présignée. */
export async function signerLecture(
  cle: string,
  dureeSecondes: number = DUREE_LECTURE_DEFAUT_S,
): Promise<string> {
  if (
    !Number.isInteger(dureeSecondes) ||
    dureeSecondes < LECTURE_MIN_S ||
    dureeSecondes > LECTURE_MAX_S
  ) {
    throw new DureeHorsBornes(dureeSecondes);
  }

  const { accessKeyId, secretAccessKey } = configR2();
  const url = urlObjet(cle);
  url.searchParams.set("X-Amz-Expires", String(dureeSecondes));

  const signer = new AwsV4Signer({
    url: url.toString(),
    method: "GET",
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
  });

  const { url: signee } = await signer.sign();
  return signee.toString();
}

/**
 * Relit la taille RÉELLE d'un objet déposé.
 *
 * On ne croit jamais le client sur la taille d'un fichier : c'est la base du
 * modèle de coût, et une valeur qui fonde un coût se mesure côté serveur. Rend
 * `null` si l'objet n'existe pas — un dépôt annoncé mais jamais arrivé est un
 * cas normal, pas une erreur.
 */
export async function lireTaille(cle: string): Promise<number | null> {
  const reponse = await client().fetch(urlObjet(cle).toString(), { method: "HEAD" });
  if (reponse.status === 404) return null;
  if (!reponse.ok) {
    throw new EchecStockage("lecture de taille", reponse.status, await texteCourt(reponse));
  }
  const brut = reponse.headers.get("content-length");
  if (brut === null) {
    throw new EchecStockage(
      "lecture de taille",
      reponse.status,
      "Réponse sans en-tête content-length : la taille est indéterminable.",
    );
  }
  const taille = Number.parseInt(brut, 10);
  if (!Number.isFinite(taille)) {
    throw new EchecStockage("lecture de taille", reponse.status, `content-length illisible.`);
  }
  return taille;
}

/** Supprime un objet. Idempotent : supprimer ce qui n'existe pas réussit. */
export async function supprimer(cle: string): Promise<void> {
  const reponse = await client().fetch(urlObjet(cle).toString(), { method: "DELETE" });
  if (!reponse.ok && reponse.status !== 404) {
    throw new EchecStockage("suppression", reponse.status, await texteCourt(reponse));
  }
}

/** Dépose un objet depuis le serveur. Réservé aux vignettes et aux tests. */
export async function deposerDepuisLeServeur(params: {
  cle: string;
  corps: ArrayBuffer | Uint8Array;
  typeMime: string;
}): Promise<void> {
  const reponse = await client().fetch(urlObjet(params.cle).toString(), {
    method: "PUT",
    body: params.corps as BodyInit,
    headers: { "content-type": params.typeMime },
  });
  if (!reponse.ok) {
    throw new EchecStockage("dépôt serveur", reponse.status, await texteCourt(reponse));
  }
}

async function texteCourt(reponse: Response): Promise<string> {
  try {
    const texte = await reponse.text();
    return texte.slice(0, 300);
  } catch {
    // Un corps illisible ne doit pas masquer le statut, qui porte déjà
    // l'essentiel du diagnostic.
    return "(corps de réponse illisible)";
  }
}

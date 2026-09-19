/**
 * Clés d'objet du stockage.
 *
 * LA CLÉ EST TOUJOURS GÉNÉRÉE PAR LE SERVEUR. Une clé fournie par le client
 * permettrait d'écraser le média d'un autre vendeur : il suffirait de deviner
 * ou d'observer une clé voisine. C'est la raison pour laquelle ce module
 * n'accepte aucune chaîne libre — pas même un nom de fichier.
 *
 * L'EXTENSION EST DÉRIVÉE DU TYPE MIME VALIDÉ, jamais du nom du fichier déposé.
 * Un nom de fichier est intégralement contrôlé par le client : il peut contenir
 * `../`, une double extension, un octet nul, ou 4 000 caractères. En ne le
 * lisant jamais, on n'a pas à s'en défendre.
 *
 * DISPOSITION DES CLÉS ET MONTÉE EN CHARGE : `medias/{shop}/{commande}/{média}`.
 * Le compartiment du vendeur vient en premier, ce qui donne deux propriétés qui
 * comptent quand le nombre de VENDEURS croît, et pas seulement le nombre de
 * commandes de l'un d'eux :
 *   - les identifiants sont des UUID, donc les clés se répartissent d'elles-mêmes
 *     au lieu de s'entasser derrière un préfixe commun ;
 *   - tout ce qui appartient à un vendeur partage un préfixe, ce qui rend une
 *     purge de compte possible sans parcourir le bucket entier.
 * On n'énumère JAMAIS le bucket : les clés vivent en base. Une conception qui
 * doit lister pour retrouver ses objets ralentit à mesure qu'elle réussit.
 */

/** Ce à quoi sert un objet. Détermine les types acceptés. */
export type UsageObjet = "media" | "logo" | "contestation";

/**
 * Types acceptés, et l'extension que le SERVEUR leur attribue.
 *
 * La table est exhaustive et fermée : un type absent est refusé. C'est
 * volontairement plus strict que ce que les navigateurs savent produire — un
 * format qu'on n'a pas décidé d'accepter est un format qu'on ne sait pas
 * afficher, ni assainir, ni mesurer.
 */
const EXTENSIONS: Readonly<Record<UsageObjet, Readonly<Record<string, string>>>> = {
  media: {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  },
  /*
   * L'IMAGE D'UNE CONTESTATION (168) : une capture, une facture, une photo — ce que le
   * vendeur joint pour dire pourquoi son lien ne devait pas être bloqué. Trois formats
   * d'image que tout navigateur produit, sans SVG pour la même raison que le logo.
   */
  contestation: {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  },
  logo: {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    // ⚠️ PAS DE SVG, ET LE COMMENTAIRE QUI DISAIT LE CONTRAIRE ÉTAIT FAUX.
    //
    // Cette table portait `"image/svg+xml": "svg"` avec la mention « il est
    // ASSAINI AVANT STOCKAGE ». Cet assainissement N'EXISTE PAS — aucun module
    // du dépôt ne le fait. Ce qui refusait réellement le SVG, c'étaient les
    // deux listes blanches des appelants ; la règle du brief était donc tenue
    // par l'ABSENCE d'un troisième appelant, pas par un assainissement (L-029).
    //
    // `extensionPour` est une fonction GÉNÉRIQUE : c'est sa vocation d'être
    // appelée d'ailleurs. Le jour où elle l'aurait été, le produit aurait
    // hébergé un document capable d'exécuter du script, servi depuis une URL
    // signée, dans l'en-tête de la page publique d'un vendeur — et le
    // commentaire aurait affirmé que c'était sûr.
    //
    // Le format revient le jour où l'assainisseur existe, pas avant. Tout
    // vendeur sait exporter un PNG.
  },
};

export class TypeNonAccepte extends Error {
  constructor(usage: UsageObjet, typeMime: string) {
    super(
      `Type « ${typeMime} » non accepté pour un objet de type « ${usage} ». ` +
        `Acceptés : ${Object.keys(EXTENSIONS[usage]).join(", ")}.`,
    );
    this.name = "TypeNonAccepte";
  }
}

export class IdentifiantInvalide extends Error {
  constructor(nom: string) {
    super(
      `L'identifiant « ${nom} » n'est pas un UUID. Une clé d'objet ne se ` +
        "construit qu'à partir d'identifiants générés par la base.",
    );
    this.name = "IdentifiantInvalide";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigerUuid(valeur: string, nom: string): string {
  if (!UUID.test(valeur)) throw new IdentifiantInvalide(nom);
  return valeur.toLowerCase();
}

export function extensionPour(usage: UsageObjet, typeMime: string): string {
  // Un en-tête `Content-Type` peut porter des paramètres (« image/jpeg;
  // charset=... ») et une casse arbitraire. On normalise avant de comparer,
  // sinon un type parfaitement valide serait refusé pour une virgule.
  const normalise = typeMime.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = EXTENSIONS[usage][normalise];
  if (extension === undefined) throw new TypeNonAccepte(usage, typeMime);
  return extension;
}

export function typesAcceptes(usage: UsageObjet): readonly string[] {
  return Object.keys(EXTENSIONS[usage]);
}

/** Clé d'un média de commande. */
export function cleMedia(params: {
  shopId: string;
  orderId: string;
  mediaId: string;
  typeMime: string;
}): string {
  const shop = exigerUuid(params.shopId, "shopId");
  const commande = exigerUuid(params.orderId, "orderId");
  const media = exigerUuid(params.mediaId, "mediaId");
  const extension = extensionPour("media", params.typeMime);
  return `medias/${shop}/${commande}/${media}.${extension}`;
}

/**
 * Clé de la vignette d'un média, DÉRIVÉE de celle du média.
 *
 * Dérivée et non indépendante : une vignette orpheline ne se retrouverait
 * jamais, et une vignette dont la clé se calcule ne demande aucune colonne
 * supplémentaire pour être localisée. Toujours en WebP, quel que soit le format
 * d'origine — la vignette est produite par nous, son format est donc notre
 * décision et non celle du fichier déposé.
 */
export function cleVignette(cleDuMedia: string): string {
  const sansExtension = cleDuMedia.replace(/\.[^./]+$/, "");
  return `${sansExtension}.vignette.webp`;
}

/**
 * Clé de la COUVERTURE d'un média, dérivée elle aussi.
 *
 * Distincte de la vignette parce qu'elles ne servent pas le même écran : la
 * vignette fait 200 px dans une grille, la couverture fait 900 px et occupe la
 * plus grande surface de la page publique. Les confondre, c'est ce que le
 * produit faisait — et la couverture était alors une vignette étirée 4,49 fois.
 *
 * Dérivée et non indépendante, pour la même raison que la vignette : une clé
 * dont le client choisirait l'emplacement pourrait écraser le média d'un autre
 * vendeur. La base le vérifie AUSSI, par déclencheur — une règle applicative
 * peut être oubliée dans un nouveau chemin de code, une règle en base non.
 */
export function cleCouverture(cleDuMedia: string): string {
  // ⚠️ LE POINT EST ÉCHAPPÉ, et il ne l'était pas. `/.[^./]+$/` employait « . »
  // au sens de « n'importe quel caractère » : sur les clés d'aujourd'hui —
  // `medias/{uuid}/{uuid}/{uuid}.ext`, un seul point — le résultat était le
  // même, par COÏNCIDENCE, puisque le caractère à cette position se trouve
  // justement être un point. `cleVignette`, juste au-dessus, l'échappait déjà.
  // Deux fonctions dérivées de la même clé auraient divergé au premier format
  // à double extension, sans qu'aucun test en place ne puisse le voir.
  const sansExtension = cleDuMedia.replace(/\.[^./]+$/, "");
  return `${sansExtension}.couverture.webp`;
}

/** Clé du logo d'une boutique. */
export function cleLogo(params: { shopId: string; logoId: string; typeMime: string }): string {
  const shop = exigerUuid(params.shopId, "shopId");
  const logo = exigerUuid(params.logoId, "logoId");
  const extension = extensionPour("logo", params.typeMime);
  return `logos/${shop}/${logo}.${extension}`;
}

/**
 * Clé de l'image d'une contestation : `contestations/{shop}/{commande}/{image}.{ext}`.
 * La boutique et la commande en tête, comme les médias : la purge d'un compte la trouve sous
 * son préfixe, et la base refuse une contestation dont l'image vit sous une autre commande.
 */
export function cleContestation(params: {
  shopId: string;
  orderId: string;
  imageId: string;
  typeMime: string;
}): string {
  const shop = exigerUuid(params.shopId, "shopId");
  const commande = exigerUuid(params.orderId, "orderId");
  const image = exigerUuid(params.imageId, "imageId");
  const extension = extensionPour("contestation", params.typeMime);
  return `contestations/${shop}/${commande}/${image}.${extension}`;
}

/** Préfixe couvrant TOUT ce qui appartient à une boutique. */
export function prefixesBoutique(shopId: string): readonly string[] {
  const shop = exigerUuid(shopId, "shopId");
  return [`medias/${shop}/`, `logos/${shop}/`, `contestations/${shop}/`];
}

export class CleNonCanonique extends Error {
  constructor(cle: string) {
    super(
      `La clé « ${cle} » ne correspond à aucune forme produite par ce module. ` +
        "Seules les formes `medias/{uuid}/{uuid}/{uuid}.{ext}`, " +
        "`medias/{uuid}/{uuid}/{uuid}.vignette.webp`, `logos/{uuid}/{uuid}.{ext}` et " +
        "`contestations/{uuid}/{uuid}/{uuid}.{ext}` " +
        "sont admises.",
    );
    this.name = "CleNonCanonique";
  }
}

/**
 * Les formes de clés que ce module produit, et AUCUNE autre.
 *
 * DÉRIVÉES DES TABLES CI-DESSUS plutôt qu'écrites à la main : un format ajouté
 * à `EXTENSIONS` entre ici tout seul. Une seconde liste recopiée aurait divergé
 * à la première extension ajoutée, et personne ne l'aurait vu — le dépôt aurait
 * simplement cessé de fonctionner pour ce format, ou pire, la validation
 * l'aurait accepté sans que la table le connaisse.
 */
const UUID_NU = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function extensionsPossibles(): string {
  const toutes = new Set<string>();
  for (const usage of Object.keys(EXTENSIONS) as UsageObjet[]) {
    for (const ext of Object.values(EXTENSIONS[usage])) toutes.add(ext);
  }
  // `vignette.webp` est un suffixe composé, produit par `cleVignette`.
  return [...toutes].sort().join("|");
}

const FORMES_ADMISES = new RegExp(
  "^(?:" +
    `medias/${UUID_NU}/${UUID_NU}/${UUID_NU}\\.(?:couverture\\.webp|vignette\\.webp|${extensionsPossibles()})` +
    "|" +
    `logos/${UUID_NU}/${UUID_NU}\\.(?:${extensionsPossibles()})` +
    "|" +
    // Les SEULES extensions de sa propre table : une contestation ne porte jamais de vidéo.
    `contestations/${UUID_NU}/${UUID_NU}/${UUID_NU}\\.(?:${Object.values(EXTENSIONS.contestation).join("|")})` +
    ")$",
  // PAS DE DRAPEAU INSENSIBLE À LA CASSE. Une clé R2 est sensible à la casse :
  // `LOGOS/x` et `logos/x` sont DEUX objets. Les tolérer confondrait un espace
  // de noms que le produit ne crée jamais avec celui qu'il gère, et le contrôle
  // de propriété — qui compare des segments littéraux — ne les verrait pas.
  // `exigerUuid` met déjà les identifiants en minuscules à la fabrication.
);

/**
 * Exige qu'une clé ait EXACTEMENT une des formes que ce module produit.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026.
 *
 * Le logo est le SEUL objet dont la clé revient du CLIENT : le navigateur
 * dépose sur une URL présignée, puis confirme la clé. Le contrôle qui gardait
 * ce chemin était `cle.startsWith("logos/" + shopId + "/")`. Il est vrai — au
 * caractère 1 — pour :
 *
 *     logos/{monShop}/../../medias/{victime}/{commande}/{media}.jpg
 *
 * et `new URL()` NORMALISE les `..` en construisant l'adresse. La clé signée
 * pointait donc hors du compartiment du vendeur : lecture, et suppression, du
 * média de quelqu'un d'autre.
 *
 * ON VALIDE DONC PAR FORME, PAS PAR PRÉFIXE. Une liste fermée de formes ne
 * laisse rien passer qu'on n'ait pas décidé d'accepter, alors qu'un contrôle de
 * préfixe doit prévoir tout ce qui peut suivre — et `..` n'était que la
 * première idée. Chercher `..` aurait été un contrôle par MOTIF (L-020) ; on
 * interroge la forme complète, et `urlObjet()` vérifie l'EFFET.
 */
export function exigerCleCanonique(cle: string): string {
  if (!FORMES_ADMISES.test(cle)) throw new CleNonCanonique(cle);
  return cle;
}

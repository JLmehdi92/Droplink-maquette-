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
export type UsageObjet = "media" | "logo";

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
  logo: {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    // Le SVG est accepté pour un logo parce que c'est le format dans lequel un
    // vendeur possède le sien. Il est ASSAINI AVANT STOCKAGE, jamais après :
    // un SVG non assaini est un document capable d'exécuter du script.
    "image/svg+xml": "svg",
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

/** Clé du logo d'une boutique. */
export function cleLogo(params: { shopId: string; logoId: string; typeMime: string }): string {
  const shop = exigerUuid(params.shopId, "shopId");
  const logo = exigerUuid(params.logoId, "logoId");
  const extension = extensionPour("logo", params.typeMime);
  return `logos/${shop}/${logo}.${extension}`;
}

/** Préfixe couvrant TOUT ce qui appartient à une boutique. */
export function prefixesBoutique(shopId: string): readonly string[] {
  const shop = exigerUuid(shopId, "shopId");
  return [`medias/${shop}/`, `logos/${shop}/`];
}

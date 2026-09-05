/**
 * Production de vignettes 200 × 200, dans le navigateur.
 *
 * POURQUOI PAS `browser-image-compression`, que le brief cite. Cette librairie
 * exécute son travail dans un web worker qu'elle charge à l'exécution. Une
 * librairie qui va chercher son worker ailleurs échoue EN SILENCE derrière un
 * pare-feu d'entreprise ou un réseau chinois filtrant — et le repli, s'il
 * existe, envoie les photos brutes. Le fournisseur qu'on vise est précisément
 * derrière ce genre de réseau.
 *
 * Ce qui suit tient en une quarantaine de lignes, n'a aucune dépendance, et ne
 * fait aucune requête. `createImageBitmap` et `canvas.toBlob` sont dans tous les
 * navigateurs visés.
 *
 * AU DÉPÔT, ET PAS À LA LECTURE. C'est le seul instant où le fichier est déjà
 * décodé en mémoire. Transformer à l'affichage ferait payer ce coût à CHAQUE
 * consultation, pour toujours — et la page publique est vue en 4G sur un
 * téléphone d'entrée de gamme.
 */

export const COTE_VIGNETTE = 200;

/**
 * LE PLUS GRAND CÔTÉ D'UN LOGO RÉDUIT.
 *
 * ⚠️ DÉFAUT MESURÉ LE 27/08/2026, sur le vrai logo d'un vrai compte. Le logo
 * n'était réduit NULLE PART — ni au navigateur, ni au serveur — contrairement
 * aux photos, qui reçoivent une vignette. Il partait donc tel quel :
 *
 *     déposé  1254 × 1254, PNG, 1 682,9 Ko
 *     affiché    40 ×   40  (34 sur la page publique, 40 dans les réglages)
 *
 * Soit 5,6 fois le budget de la page publique ENTIÈRE — 300 Ko hors médias —
 * pour une image de la taille d'un ongle, rechargée par chaque client de chaque
 * commande.
 *
 * 256 EST DÉDUIT DE L'AFFICHAGE, PAS CHOISI À VUE : le plus grand emploi est
 * 40 px, soit 120 px sur un écran à 3×. 256 laisse donc un facteur 2 de marge
 * pour un usage plus grand à venir, sans payer une image que personne ne
 * regarde de près.
 *
 * MESURES SUR CE MÊME FICHIER, dans le navigateur, WebP :
 *
 *     128 px  q0,90 →  1,9 Ko        256 px  q0,90 →  4,3 Ko
 *     192 px  q0,90 →  3,0 Ko        384 px  q0,90 →  7,2 Ko
 *
 * soit un facteur 391 à 256 px. Le PNG au même côté pèse 84,6 Ko : le format de
 * sortie est NOTRE décision, pas celle du fichier déposé — comme pour la
 * vignette.
 */
export const COTE_LOGO = 256;

/**
 * Dimensions bornées par le plus grand côté, RATIO CONSERVÉ.
 *
 * SÉPARÉE ET PURE, parce que c'est la seule partie décidable hors navigateur —
 * donc la seule qu'un test puisse éprouver. Le reste tient au canevas, qui
 * n'existe pas dans un environnement Node.
 *
 * PAS DE RECADRAGE CARRÉ, contrairement à la vignette. Une vignette carrée
 * découpe une photo au centre, ce qui reste lisible ; un logo est très souvent
 * un mot, et le recadrer au centre en couperait les deux extrémités. Un logo
 * amputé sur la page d'un client est pire qu'un logo un peu lourd.
 *
 * JAMAIS D'AGRANDISSEMENT : une image déjà plus petite que la borne est rendue
 * telle quelle. L'étirer ajouterait des octets sans ajouter un seul détail.
 */
export function dimensionsBornees(
  largeur: number,
  hauteur: number,
  cote: number,
): Dimensions {
  const plusGrand = Math.max(largeur, hauteur);
  if (plusGrand <= 0) return { largeur: 1, hauteur: 1 };

  const echelle = Math.min(1, cote / plusGrand);
  return {
    largeur: Math.max(1, Math.round(largeur * echelle)),
    hauteur: Math.max(1, Math.round(hauteur * echelle)),
  };
}

/**
 * L'ÉCHELLE DE QUALITÉ, essayée dans l'ordre.
 *
 * On s'arrête à la PREMIÈRE qui tient sous le plafond : descendre plus bas
 * n'achèterait rien qu'on ait demandé. Mesuré, un logo photographique tient à
 * 0,90 dès 256 px ; les paliers suivants n'existent que pour le cas
 * pathologique — un logo bruité ou en dégradé fin — et valent mieux qu'un refus,
 * qui laisserait le vendeur sans logo du tout.
 */
const QUALITES_LOGO = [0.9, 0.8, 0.7, 0.6] as const;

/**
 * ENCODE LA TOILE, ET VÉRIFIE CE QU'ON A OBTENU.
 *
 * ⚠️ CE CONTRÔLE MANQUAIT, ET C'EST CE QUI A VIDÉ LA PAGE D'UN VRAI CLIENT LE
 * 05/09/2026. Les quatre encodages du module demandaient `image/webp` et
 * gardaient le résultat SANS REGARDER CE QU'IL ÉTAIT.
 *
 * Or `toBlob` ne rend pas `null` quand un format n'est pas encodable : la
 * spécification HTML impose à l'agent de se rabattre sur `image/png`. Le blob
 * arrive donc bien, la fonction le rend, tout paraît normal — et une vignette
 * PNG de 200 × 200 pèse 60 à 110 Ko contre un plafond DUR de 20 Ko, une
 * couverture PNG de 900 px pèse près d'un mégaoctet contre 90 Ko. Les deux
 * dérivées sont refusées par le serveur, et le refus n'est écrit nulle part.
 *
 * Pire pour la couverture : sa boucle baisse la qualité palier par palier pour
 * tenir sous le plafond. Le PNG étant SANS PERTE, le paramètre de qualité y est
 * ignoré — les quatre paliers rendent le même poids, et la boucle qui existe
 * pour rattraper l'excès ne peut structurellement pas le rattraper.
 *
 * ⚠️ LE REPLI DIFFÈRE SELON CE QU'ON ENCODE, et ce n'est pas un détail : JPEG
 * n'a pas de couche alpha. Il convient à une photo, jamais à un logo — un logo
 * transparent réencodé en JPEG sort sur fond noir. Le logo se replie donc sur
 * PNG, plus lourd et fidèle ; c'est au serveur de refuser s'il dépasse.
 *
 * ⚠️ EXPORTÉE POUR ÊTRE ÉPROUVÉE, et c'est la seule raison. Tout le reste de ce
 * module tient au canevas, qui n'existe pas sous Node : c'est précisément
 * pourquoi le défaut a pu vivre ici sans qu'aucune suite ne le voie. Celle-ci
 * ne prend qu'une TOILE — n'importe quel objet qui sait `toBlob` — donc elle
 * s'éprouve avec un encodeur de substitution qui imite un navigateur sans WebP.
 */
export async function encoder(
  toile: Pick<HTMLCanvasElement, "toBlob">,
  qualite: number,
  repli: "image/jpeg" | "image/png",
): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((resoudre) => {
    toile.toBlob(resoudre, "image/webp", qualite);
  });
  if (webp !== null && webp.type === "image/webp") return webp;

  return await new Promise<Blob | null>((resoudre) => {
    toile.toBlob(resoudre, repli, qualite);
  });
}

/**
 * Réduit un logo dans le navigateur, avant l'envoi.
 *
 * Rend `null` si le navigateur ne sait pas décoder le fichier. L'APPELANT DÉCIDE
 * alors : ici, contrairement à la vignette, il n'existe pas d'original à servir
 * en repli — le fichier réduit EST le logo. Envoyer l'original ramènerait le
 * défaut, donc l'appelant refuse et le dit.
 *
 * `plafondOctets` est passé plutôt que lu : ce module ne connaît pas la
 * configuration, et la borne qui FAIT AUTORITÉ est celle du serveur, qui relit
 * la taille réelle après dépôt. Celle-ci n'est qu'un objectif de cadrage.
 */
export async function logoReduit(
  fichier: Blob,
  plafondOctets: number,
): Promise<Blob | null> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    return null;
  }

  try {
    const { largeur, hauteur } = dimensionsBornees(image.width, image.height, COTE_LOGO);

    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;

    const contexte = toile.getContext("2d");
    if (contexte === null) return null;

    contexte.imageSmoothingEnabled = true;
    contexte.imageSmoothingQuality = "high";
    contexte.drawImage(image, 0, 0, largeur, hauteur);

    let dernier: Blob | null = null;
    for (const qualite of QUALITES_LOGO) {
      const blob = await encoder(toile, qualite, "image/png");
      if (blob === null) break;
      dernier = blob;
      if (blob.size <= plafondOctets) return blob;
    }

    // Le plus petit obtenu, même hors plafond : c'est au SERVEUR de refuser,
    // avec la taille réelle relue. Décider ici sur une taille annoncée par le
    // client reproduirait l'erreur que tout le module de dépôt évite.
    return dernier;
  } finally {
    image.close();
  }
}

export interface Vignette {
  readonly blob: Blob;
  readonly largeur: number;
  readonly hauteur: number;
}

/** Dimensions de l'image d'origine, mesurées et non annoncées. */
export interface Dimensions {
  readonly largeur: number;
  readonly hauteur: number;
}

/**
 * Produit la vignette d'une image.
 *
 * Rend `null` si le navigateur ne sait pas décoder le fichier. L'ÉCHEC N'EST PAS
 * BLOQUANT : refuser une photo parce qu'on n'a pas su en faire une vignette
 * ferait payer au vendeur une limite qui est la nôtre. `cle_vignette` est
 * nullable en base exactement pour cette raison.
 */
export async function vignetteDepuisImage(
  fichier: Blob,
): Promise<{ vignette: Vignette; dimensions: Dimensions } | null> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    return null;
  }

  try {
    const dimensions = { largeur: image.width, hauteur: image.height };

    // RECADRAGE CENTRÉ, et non déformation. Une vignette carrée obtenue en
    // écrasant une photo verticale rend le vêtement méconnaissable — or c'est
    // exactement ce que le client vient vérifier.
    const cote = Math.min(image.width, image.height);
    const x = (image.width - cote) / 2;
    const y = (image.height - cote) / 2;

    const toile = document.createElement("canvas");
    toile.width = COTE_VIGNETTE;
    toile.height = COTE_VIGNETTE;

    const contexte = toile.getContext("2d");
    if (contexte === null) return null;

    // Le rééchantillonnage de qualité coûte quelques millisecondes et évite le
    // crénelage sur les motifs fins — le pire cas de nos photos.
    contexte.imageSmoothingEnabled = true;
    contexte.imageSmoothingQuality = "high";
    contexte.drawImage(image, x, y, cote, cote, 0, 0, COTE_VIGNETTE, COTE_VIGNETTE);

    // WebP quand le navigateur sait l'encoder, JPEG sinon : la vignette est
    // produite par nous, son format est donc notre décision — mais elle se
    // CONSTATE, elle ne se suppose pas. Voir `encoder`.
    const blob = await encoder(toile, 0.82, "image/jpeg");

    if (blob === null) return null;

    return {
      vignette: { blob, largeur: COTE_VIGNETTE, hauteur: COTE_VIGNETTE },
      dimensions,
    };
  } finally {
    // Sans cette libération, déposer vingt photos garde vingt images décodées en
    // mémoire — sur un téléphone d'entrée de gamme, l'onglet est tué avant la
    // fin du dépôt.
    image.close();
  }
}

/**
 * LE PLUS GRAND CÔTÉ D'UNE COUVERTURE.
 *
 * ⚠️ MESURÉ LE 27/08/2026 : la couverture de `/p/[token]` était servie par la
 * VIGNETTE, 200 × 200, rendue en 899 × 562 — agrandissement 4,49× au bureau,
 * 5,85× sur un téléphone en DPR 3. C'est le plus gros élément de la page, celui
 * que le client vient voir, et il était flou à l'endroit exact où le produit
 * prétend montrer un contrôle qualité.
 *
 * 900 EST DÉDUIT DU RENDU, pas choisi : la couverture fait 899 px au bureau. À
 * 900 px il n'y a donc AUCUN agrandissement, et 1,3× seulement en DPR 3.
 */
export const COTE_COUVERTURE = 900;

/**
 * Dimensions dont la LARGEUR est bornée, ratio conservé.
 *
 * ⚠️ DISTINCTE DE `dimensionsBornees`, ET LA DISTINCTION EST TOUT LE SUJET.
 * Le logo est borné par son PLUS GRAND CÔTÉ : il s'affiche dans un carré, donc
 * c'est le grand côté qui sature. La couverture, elle, est rendue dans un cadre
 * en 16/10 rempli par `object-cover` : c'est la LARGEUR qui commande, et la
 * hauteur excédentaire est rognée à l'affichage.
 *
 * Borner le plus grand côté aurait donné, sur une photo QC typique en 3:4 —
 * 2160 × 2880 — une image de 675 px de large pour un rendu à 899. Soit un
 * agrandissement de 1,33× au bureau et 1,73× sur un téléphone en DPR 3 : bien
 * mieux que les 4,49× d'avant, mais toujours du flou, et du flou qu'on aurait
 * cru corrigé.
 *
 * C'est aussi ce que MESURENT les chiffres qui ont fixé le plafond de 90 Ko :
 * ils ont été relevés à largeur bornée. Une implémentation qui borne autre chose
 * que ce qu'on a mesuré rend la mesure sans objet.
 *
 * JAMAIS D'AGRANDISSEMENT ici non plus : une photo déjà moins large que la
 * borne est rendue telle quelle.
 */
export function dimensionsLargeurBornee(
  largeur: number,
  hauteur: number,
  cote: number,
): Dimensions {
  if (largeur <= 0 || hauteur <= 0) return { largeur: 1, hauteur: 1 };
  const l = Math.min(largeur, cote);
  return { largeur: l, hauteur: Math.max(1, Math.round((hauteur * l) / largeur)) };
}

/**
 * L'échelle de qualité de la couverture, essayée dans l'ordre.
 *
 * Mesuré sur cinq vraies photos QC, en WebP à 900 px : 78 à 122 Ko à q0,82 ;
 * 56 à 89 Ko à q0,75. On s'arrête à la PREMIÈRE qui tient sous le plafond, donc
 * la plupart des photos gardent 0,82 et seules les plus détaillées descendent.
 * Fixer une qualité unique aurait payé le pire cas sur toutes les photos.
 *
 * ⚠️ CES QUATRE PALIERS ONT ÉTÉ MESURÉS EN WEBP, ET L'ÉCHELLE S'ARRÊTAIT LÀ.
 * Sur un navigateur sans encodeur WebP, la dérivée sort en JPEG — nettement
 * moins efficace à qualité égale — et les quatre paliers restaient TOUS
 * au-dessus du plafond de 90 Ko. Constaté au navigateur le 05/09/2026, encodeur
 * WebP neutralisé, sur une photo réelle de 2,2 Mo : le `PUT` de la couverture
 * n'était même pas tenté, la signature ayant été refusée pour dépassement — et
 * ce refus n'était écrit nulle part.
 *
 * Les trois paliers ajoutés ne coûtent RIEN au cas normal : en WebP la boucle
 * rend dès le premier palier qui tient, donc elle ne les atteint jamais. Ils
 * n'existent que pour le repli, où une couverture un peu plus compressée vaut
 * infiniment mieux qu'une couverture absente — l'absence faisant retomber la
 * page du client sur l'image PLEINE, soit deux mégaoctets sur le plus gros
 * élément de la page.
 */
const QUALITES_COUVERTURE = [0.82, 0.75, 0.7, 0.62, 0.52, 0.42, 0.32] as const;

/**
 * Produit la couverture d'une image — la version 900 px servie sur la page
 * publique.
 *
 * PAS DE RECADRAGE, contrairement à la vignette. Le cadre de la page est en
 * 16/10 et l'image le remplit par `object-cover` : recadrer ici en plus
 * couperait deux fois. Les proportions d'origine sont conservées et le cadrage
 * reste une décision de mise en page, faite au rendu.
 *
 * ÉCHEC NON BLOQUANT, comme la vignette : la page publique retombe sur la
 * vignette quand la couverture manque. C'est ce qui rend cette dérivée posable
 * sans rien casser de l'existant — aucune commande déjà déposée n'en a.
 */
export async function couvertureDepuisImage(
  fichier: Blob,
  plafondOctets: number,
): Promise<Vignette | null> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    return null;
  }

  try {
    const { largeur, hauteur } = dimensionsLargeurBornee(
      image.width,
      image.height,
      COTE_COUVERTURE,
    );

    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;

    const contexte = toile.getContext("2d");
    if (contexte === null) return null;

    contexte.imageSmoothingEnabled = true;
    contexte.imageSmoothingQuality = "high";
    contexte.drawImage(image, 0, 0, largeur, hauteur);

    let dernier: Blob | null = null;
    for (const qualite of QUALITES_COUVERTURE) {
      const blob = await encoder(toile, qualite, "image/jpeg");
      if (blob === null) break;
      dernier = blob;
      if (blob.size <= plafondOctets) return { blob, largeur, hauteur };
    }

    // Hors plafond même au palier le plus bas : on rend quand même, et c'est le
    // SERVEUR qui refuse, sur la taille relue. Décider ici sur une taille
    // annoncée par le client serait le seul endroit du dépôt où on le croirait.
    return dernier === null ? null : { blob: dernier, largeur, hauteur };
  } finally {
    image.close();
  }
}

/**
 * Mesure la durée et capture une image d'une vidéo.
 *
 * ÉCHEC NON BLOQUANT, ici aussi et pour la même raison. On ne transcode RIEN :
 * `ffmpeg.wasm` pèse une trentaine de mégaoctets et prend plusieurs minutes sur
 * un téléphone — un fournisseur à deux cents commandes par semaine y perdrait
 * plus de temps que le produit ne lui en fait gagner.
 */
export async function apercuDepuisVideo(
  fichier: Blob,
): Promise<{ vignette: Vignette | null; dureeSecondes: number | null }> {
  const url = URL.createObjectURL(fichier);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  // Sans ceci, iOS passe en plein écran à la lecture et refuse de peindre
  // l'image dans un canvas.
  video.playsInline = true;

  try {
    const pret = new Promise<boolean>((resoudre) => {
      video.onloadeddata = () => resoudre(true);
      video.onerror = () => resoudre(false);
      // Une vidéo dont les métadonnées n'arrivent jamais ne doit pas bloquer le
      // dépôt : on abandonne la vignette, pas le média.
      window.setTimeout(() => resoudre(false), 5000);
    });

    video.src = url;
    // On se place légèrement après le début : la toute première image est
    // souvent noire.
    video.currentTime = 0.1;

    if (!(await pret)) return { vignette: null, dureeSecondes: null };

    const duree = Number.isFinite(video.duration) ? Math.round(video.duration) : null;

    const cote = Math.min(video.videoWidth, video.videoHeight);
    if (cote === 0) return { vignette: null, dureeSecondes: duree };

    const toile = document.createElement("canvas");
    toile.width = COTE_VIGNETTE;
    toile.height = COTE_VIGNETTE;
    const contexte = toile.getContext("2d");
    if (contexte === null) return { vignette: null, dureeSecondes: duree };

    contexte.drawImage(
      video,
      (video.videoWidth - cote) / 2,
      (video.videoHeight - cote) / 2,
      cote,
      cote,
      0,
      0,
      COTE_VIGNETTE,
      COTE_VIGNETTE,
    );

    const blob = await encoder(toile, 0.82, "image/jpeg");

    return {
      vignette:
        blob === null
          ? null
          : { blob, largeur: COTE_VIGNETTE, hauteur: COTE_VIGNETTE },
      dureeSecondes: duree,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

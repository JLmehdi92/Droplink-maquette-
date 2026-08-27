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
      const blob = await new Promise<Blob | null>((resoudre) => {
        toile.toBlob(resoudre, "image/webp", qualite);
      });
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

    const blob = await new Promise<Blob | null>((resoudre) => {
      // WebP quel que soit le format d'origine : la vignette est produite par
      // nous, son format est donc notre décision et non celle du fichier déposé.
      toile.toBlob(resoudre, "image/webp", 0.82);
    });

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

    const blob = await new Promise<Blob | null>((resoudre) => {
      toile.toBlob(resoudre, "image/webp", 0.82);
    });

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

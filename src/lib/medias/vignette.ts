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

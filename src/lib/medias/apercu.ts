/**
 * QUELLE CLÉ SERT D'APERÇU POUR UN MÉDIA — décision unique.
 *
 * ⚠️ CETTE RÈGLE ÉTAIT ÉCRITE QUATRE FOIS, ET DEUX D'ENTRE ELLES ÉTAIENT
 * FAUSSES. Constaté le 05/09/2026 sur la commande d'un vrai client : cinq
 * photos sans dérivée s'affichaient sur la page publique et dans l'éditeur —
 * corrigés le matin même — mais restaient des carrés gris dans la LISTE DES
 * COMMANDES et dans les ANALYSES, qui lisaient encore `cle_vignette` seule.
 *
 * C'est le même motif que `decrireSilence` le même jour : une règle qui vit
 * chez ses appelants n'est appliquée que par ceux qui y ont pensé. Elle vit
 * donc ici, et les quatre lecteurs l'appellent.
 *
 * ⚠️ `cle_vignette` EST NULLABLE PAR CONCEPTION — le modèle de données dit que
 * son absence est « un cas normal ». Un navigateur sans encodeur WebP, une
 * capture de vidéo qui échoue, un média déposé avant que la dérivée existe : le
 * cas n'a rien d'exceptionnel, et le rendu doit le traiter.
 *
 * ⚠️ LE REPLI NE VAUT QUE POUR LES PHOTOS. La clé d'une VIDÉO désigne le
 * fichier vidéo : la donner à une balise image rendrait une image cassée, donc
 * pire que la case vide qu'on répare. Une vidéo sans aperçu rend `null`, et
 * chaque écran sait déjà dessiner cette absence.
 *
 * LE COÛT EST ASSUMÉ ET BORNÉ. Servir l'image pleine dans une tuile, c'est des
 * centaines de kilo-octets au lieu d'une douzaine — précisément ce que le
 * correctif du 03/09 avait supprimé. Mais une photo lourde qui S'AFFICHE bat
 * une photo légère qui n'existe pas, et dès qu'une dérivée existe elle reprend
 * la main.
 */

/** Le minimum qu'un média doit porter pour qu'on sache quoi montrer de lui. */
export interface MediaApercu {
  readonly type: string;
  readonly cle: string;
  readonly cle_vignette: string | null;
}

/**
 * La clé à signer pour représenter ce média, ou `null` s'il n'y a rien à
 * montrer.
 */
export function cleDApercu(media: MediaApercu): string | null {
  if (media.cle_vignette !== null) return media.cle_vignette;
  return media.type === "photo" ? media.cle : null;
}

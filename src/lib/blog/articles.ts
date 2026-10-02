import type { Article } from "./types";
import { article as lienQuiExpire } from "@/contenu/blog/lien-qui-expire";
import { article as suivreUnColis } from "@/contenu/blog/suivre-un-colis-sans-boutique";
import { article as ouEstMonColis } from "@/contenu/blog/ou-est-mon-colis";
import { article as photosControle } from "@/contenu/blog/photos-controle-sans-dossier-partage";
import { article as vendreSansBoutique } from "@/contenu/blog/vendre-sans-boutique";
import { LANGUE_DEFAUT, type Langue } from "@/i18n/config";

/**
 * L'INVENTAIRE DES ARTICLES — déclaré, jamais découvert.
 *
 * ⚠️ LA LISTE EST ÉCRITE À LA MAIN, ET C'EST DÉLIBÉRÉ. Un balayage du dossier
 * publierait tout ce qui s'y trouve : un brouillon déposé pour le relire, un
 * fichier d'essai, une copie de travail. Sur un site dont chaque URL entre dans
 * le plan de site et part aux moteurs, « ce qui traîne dans le dossier » n'est
 * pas une bonne définition de « ce qui est publié ».
 *
 * Un article ajouté ici sans être importé ne compile pas ; un fichier ajouté au
 * dossier sans être inscrit ici n'est pas publié — et un test compare les deux
 * ensembles DANS LES DEUX SENS, pour que l'oubli se voie.
 */
// L'ORDRE EST CELUI DE LA MAQUETTE (`blog.html`) : à date égale, le tri est stable, et
// le premier de cette liste est l'article « à la une ».
const ARTICLES: readonly Article[] = [
  ouEstMonColis,
  lienQuiExpire,
  photosControle,
  suivreUnColis,
  vendreSansBoutique,
];

/**
 * ⚠️ LE BLOG N'EXISTE QU'EN FRANÇAIS, ET C'EST UNE DÉCISION, PAS UN RETARD.
 *
 * Décision de Wassim, 08/09/2026 : on écrit chaque article UNE fois, on regarde
 * en deux ou trois mois lesquels remontent réellement, et on traduit CEUX-LÀ.
 * Traduire avant de savoir, c'est payer trois fois pour un résultat inconnu.
 *
 * ⚠️ CE QUE ÇA IMPOSE, ET C'EST LE PIÈGE DE TOUTE LA FONCTIONNALITÉ : le reste
 * du site est trilingue et déclare ses trois traductions en hreflang. Le blog
 * ne DOIT PAS faire pareil. Un `hreflang="en"` qui pointe vers une page
 * inexistante ne dégrade pas un peu le signal — Google ignore le JEU ENTIER dès
 * qu'une URL du jeu ne répond pas. On perdrait le hreflang du blog **et** on
 * enverrait des visiteurs anglophones sur des 404.
 *
 * D'où `estLangueDuBlog()` : les autres langues rendent 404 sur ces routes, et
 * les métadonnées ne déclarent qu'une seule langue. Une garde l'éprouve.
 */
export const LANGUE_DU_BLOG: Langue = LANGUE_DEFAUT;

export function estLangueDuBlog(langue: Langue): boolean {
  return langue === LANGUE_DU_BLOG;
}

/** Les articles, du plus récent au plus ancien. */
export function tousLesArticles(): readonly Article[] {
  return [...ARTICLES].sort((a, b) => b.date.localeCompare(a.date));
}

/** Un article par son segment d'URL, ou `null` — jamais une exception. */
export function articleParSlug(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}

/** Les segments d'URL, pour le prérendu et pour le plan de site. */
export function slugs(): readonly string[] {
  return ARTICLES.map((a) => a.slug);
}

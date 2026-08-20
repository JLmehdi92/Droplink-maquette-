/**
 * Plafonds de dépôt.
 *
 * Ils sont EN CONFIGURATION et non en dur, parce qu'ils sont provisoires : une
 * vidéo de 60 s en 720p pèse couramment 15 à 30 Mo, et le seuil retenu ne sera
 * juste qu'après calibrage sur de vrais fichiers. Un seuil écrit en dur se
 * corrige par un déploiement ; un seuil en configuration se corrige le jour où
 * on découvre qu'il est faux.
 *
 * Toute décision de refus porte son MOTIF et la TAILLE RÉELLE. Sans la taille,
 * on saurait qu'on a refusé sans savoir de combien on s'est trompé — donc sans
 * pouvoir corriger le seuil autrement qu'au jugé.
 *
 * Ce module est pur : aucun accès réseau, aucun `server-only`. Il est lisible
 * depuis le navigateur pour refuser un fichier AVANT de l'envoyer, ce qui évite
 * de faire monter 30 Mo pour les rejeter à l'arrivée. Cette lecture côté client
 * est un CONFORT, jamais une garantie : la décision qui fait autorité est celle
 * du serveur, qui relit la taille après dépôt.
 */

const MO = 1024 * 1024;

function entierDepuisEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined) return defaut;
  const texte = brut.trim();

  // On exige la forme AVANT de convertir. `Number.parseInt` est trop
  // accommodant pour servir de validation : « 3.7 » lui donne 3, « 20abc » lui
  // donne 20. Les deux sont des entiers positifs, donc les deux franchiraient
  // un contrôle portant sur le RÉSULTAT — et le plafond vaudrait alors le
  // sixième de ce qui était écrit, sans que rien ne le signale.
  if (!/^\d+$/.test(texte)) return defaut;

  const valeur = Number.parseInt(texte, 10);
  // Une valeur illisible ne doit pas se dégrader en zéro : un plafond à zéro
  // refuserait tout, et l'on chercherait la panne du côté des fichiers.
  if (!Number.isInteger(valeur) || valeur <= 0) return defaut;
  return valeur;
}

export type Limites = {
  readonly photoOctets: number;
  readonly videoOctets: number;
  readonly logoOctets: number;
  readonly mediasParCommande: number;
  readonly videosParCommande: number;
  readonly dureeVideoMaxS: number;
  /** Plafond DUR de la vignette, déduit du budget de page. */
  readonly vignetteOctets: number;
};

export function limites(): Limites {
  return {
    photoOctets: entierDepuisEnv("DEPOT_PHOTO_MAX_MO", 10) * MO,
    // 20 Mo : provisoire, à recalibrer sur le lot de photos et vidéos réelles.
    videoOctets: entierDepuisEnv("DEPOT_VIDEO_MAX_MO", 20) * MO,
    logoOctets: entierDepuisEnv("DEPOT_LOGO_MAX_MO", 2) * MO,
    mediasParCommande: entierDepuisEnv("DEPOT_MEDIAS_PAR_COMMANDE", 20),
    videosParCommande: entierDepuisEnv("DEPOT_VIDEOS_PAR_COMMANDE", 3),
    dureeVideoMaxS: entierDepuisEnv("DEPOT_VIDEO_DUREE_MAX_S", 60),
    // 12 Ko visés, 20 Ko de plafond dur : 400 Ko de page + 600 Ko de vignettes
    // à 50 lignes, divisés par 50.
    vignetteOctets: entierDepuisEnv("VIGNETTE_MAX_KO", 20) * 1024,
  };
}

export type MotifRefus =
  | "type_non_accepte"
  | "trop_lourd"
  | "trop_de_medias"
  | "trop_de_videos"
  | "video_trop_longue";

export type Decision =
  | { accepte: true }
  | {
      accepte: false;
      motif: MotifRefus;
      /** Toujours renseignée : sans elle, un refus n'apprend rien. */
      tailleReelle: number;
      plafond: number;
    };

export function estVideo(typeMime: string): boolean {
  return typeMime.split(";")[0]?.trim().toLowerCase().startsWith("video/") ?? false;
}

/**
 * Décide si un dépôt est acceptable.
 *
 * `mediasExistants` et `videosExistantes` sont comptés PAR LE SERVEUR, jamais
 * transmis par le client : ce sont des plafonds, et un plafond qu'on demande à
 * l'intéressé de mesurer n'en est pas un.
 */
export function deciderDepot(params: {
  typeMime: string;
  tailleOctets: number;
  mediasExistants: number;
  videosExistantes: number;
  dureeSecondes?: number;
}): Decision {
  const l = limites();
  const video = estVideo(params.typeMime);

  if (params.mediasExistants >= l.mediasParCommande) {
    return {
      accepte: false,
      motif: "trop_de_medias",
      tailleReelle: params.tailleOctets,
      plafond: l.mediasParCommande,
    };
  }

  if (video && params.videosExistantes >= l.videosParCommande) {
    return {
      accepte: false,
      motif: "trop_de_videos",
      tailleReelle: params.tailleOctets,
      plafond: l.videosParCommande,
    };
  }

  if (
    video &&
    params.dureeSecondes !== undefined &&
    params.dureeSecondes > l.dureeVideoMaxS
  ) {
    return {
      accepte: false,
      motif: "video_trop_longue",
      tailleReelle: params.tailleOctets,
      plafond: l.dureeVideoMaxS,
    };
  }

  const plafondTaille = video ? l.videoOctets : l.photoOctets;
  if (params.tailleOctets > plafondTaille) {
    return {
      accepte: false,
      motif: "trop_lourd",
      tailleReelle: params.tailleOctets,
      plafond: plafondTaille,
    };
  }

  return { accepte: true };
}

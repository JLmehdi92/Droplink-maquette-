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
  /** Plafond DUR de la couverture 900 px, déduit de la mesure. */
  readonly couvertureOctets: number;
};

export function limites(): Limites {
  return {
    photoOctets: entierDepuisEnv("DEPOT_PHOTO_MAX_MO", 10) * MO,
    // 20 Mo : provisoire, à recalibrer sur le lot de photos et vidéos réelles.
    videoOctets: entierDepuisEnv("DEPOT_VIDEO_MAX_MO", 20) * MO,
    /*
     * ⚠️ CE PLAFOND ÉTAIT DE 2 Mo, ET IL ÉTAIT LE SEUL CONTRÔLE DU LOGO.
     *
     * Mesuré le 27/08/2026 sur un vrai compte : un logo de 1 682,9 Ko servi à
     * chaque client de chaque commande, pour un affichage de 40 px. Soit 5,6
     * fois le budget de la page publique entière (300 Ko hors médias) — le
     * plafond autorisait donc, à lui seul, de dépasser le budget de 6,7 fois.
     *
     * 20 Ko VIENT DE LA MESURE, pas d'un arrondi. Le même logo réduit à 256 px
     * en WebP pèse 4,3 Ko : le plafond laisse un facteur 4,6 pour absorber un
     * logo pathologique — bruit, dégradé fin — sans jamais approcher le budget.
     * C'est aussi le plafond dur de la vignette, et c'est cohérent : une
     * vignette et un logo sont deux images du même ordre de grandeur sur la
     * même page.
     *
     * LE NOM DE LA VARIABLE CHANGE AVEC L'UNITÉ. Garder `_MO` pour y lire des
     * kilo-octets aurait produit un plafond mille fois trop grand au premier
     * réglage, et rien ne l'aurait signalé — une valeur qui a la FORME d'une
     * configuration franchit toutes les validations de présence (L-026).
     */
    logoOctets: entierDepuisEnv("DEPOT_LOGO_MAX_KO", 20) * 1024,
    mediasParCommande: entierDepuisEnv("DEPOT_MEDIAS_PAR_COMMANDE", 20),
    videosParCommande: entierDepuisEnv("DEPOT_VIDEOS_PAR_COMMANDE", 3),
    dureeVideoMaxS: entierDepuisEnv("DEPOT_VIDEO_DUREE_MAX_S", 60),
    // 12 Ko visés, 20 Ko de plafond dur : 400 Ko de page + 600 Ko de vignettes
    // à 50 lignes, divisés par 50.
    vignetteOctets: entierDepuisEnv("VIGNETTE_MAX_KO", 20) * 1024,
    /*
     * LA COUVERTURE — 900 px, plafond 90 Ko.
     *
     * Le plafond vient de la MESURE, sur cinq vraies photos QC en WebP à
     * 900 px : 78 à 122 Ko à q0,82, et 56 à 89 Ko à q0,75. 90 Ko laisse donc
     * passer la plupart des photos à pleine qualité et force les plus détaillées
     * d'un palier — sans jamais dépasser ce que la page peut porter.
     *
     * CE QU'ELLE COÛTE À LA PAGE : une seule couverture par page, contre vingt
     * vignettes. À 20 médias, la page passe d'environ 272 à 340 Ko, très en
     * dessous du mégaoctet que le brief fixe comme plafond à cette volumétrie.
     * C'est aussi l'élément LCP : sur 4G bridée, 70 Ko coûtent environ 0,4 s,
     * pour un budget de 2 s.
     */
    couvertureOctets: entierDepuisEnv("COUVERTURE_MAX_KO", 90) * 1024,
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

  /*
   * ⚠️ CE PLAFOND EST DÉCLARATIF, ET IL FAUT LE DIRE PLUTÔT QUE LE MAQUILLER.
   *
   * `dureeSecondes` est OPTIONNEL et vient de `video.duration`, lu dans le
   * NAVIGATEUR. Trois façons de le franchir sans rien forger : omettre le
   * champ, envoyer un fichier que le navigateur ne sait pas décoder — auquel
   * cas la durée vaut `null` —, ou appeler la Server Action directement.
   *
   * ON NE PEUT PAS FAIRE MIEUX SANS CONTREDIRE UNE DÉCISION EXISTANTE. Le
   * rendre obligatoire refuserait une vidéo parce que le navigateur du vendeur
   * n'a pas su la décoder — exactement ce que le brief interdit à propos de la
   * vignette : « refuser une vidéo parce qu'on n'a pas su en extraire une image
   * ferait payer au vendeur une limite qui est la nôtre ». Et le mesurer côté
   * serveur demanderait le transcodeur que le brief refuse (30 Mo de WASM, des
   * minutes sur mobile).
   *
   * CE QUI BORNE RÉELLEMENT LE COÛT EST LA TAILLE, elle relue côté serveur
   * après dépôt. Une vidéo de dix minutes sous 20 Mo passe ; elle coûte le prix
   * de ses 20 Mo, pas celui de ses dix minutes.
   *
   * ALORS ON COMPTE. Une vidéo acceptée SANS durée déclarée est instrumentée :
   * si le cas est marginal, le plafond fait son travail ; s'il est courant, on
   * l'apprendra au lieu de le supposer. C'est la règle du brief sur les refus —
   * « sans la taille, je ne saurai pas de combien je me suis trompé » —
   * appliquée à ce qu'on ACCEPTE faute de pouvoir le mesurer.
   */
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

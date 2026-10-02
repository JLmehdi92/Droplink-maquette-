/**
 * NORMALISER CE QUE LE VENDEUR COLLE, AU LIEU DE LE REFUSER.
 *
 * DÉFAUT RÉEL, TROUVÉ PAR WASSIM LE 02/09/2026. Il a collé
 * `www.tiktok.com/@laplanque92` — l'adresse de son propre compte, recopiée
 * depuis sa barre d'adresse — et le champ a répondu « Veuillez saisir une
 * URL ». Le message d'aide, lui, disait « Collez l'adresse complète depuis
 * votre navigateur » : c'est exactement ce qu'il avait fait.
 *
 * LA CAUSE ÉTAIT DOUBLE, et corriger une seule couche n'aurait rien changé :
 * le `type="url"` du champ faisait refuser le NAVIGATEUR avant l'envoi, et le
 * motif serveur exigeait `https://` en tête. Deux exigences de machine posées à
 * quelqu'un qui recopie un lien.
 *
 * ⚠️ ET LA PLANCHE DISAIT DÉJÀ L'INVERSE. `Marque.dc.html` dessine
 * `<input type="text" value="@ateliernord">` et, pour WhatsApp, le
 * substitut « Numéro au format international ». Le canevas décrivait donc un
 * champ qui accepte un pseudo et un numéro ; le code avait implémenté un champ
 * qui exige une URL. La planche fait foi.
 *
 * ⚠️ CE MODULE NE REMPLACE PAS LE CONTRÔLE D'HÔTE, IL LE PRÉCÈDE. Le motif de
 * `reglages.ts` et la contrainte de la migration 085 restent seuls juges : ils
 * sont ancrés aux deux bouts, sans quoi
 * `https://instagram.com.attaquant.example/x` passerait. Ce module se contente
 * de mettre la saisie dans une forme que ce motif PEUT accepter — et quand il
 * ne sait pas quoi en faire, il rend la saisie telle quelle, pour que le refus
 * vienne du motif et non d'ici.
 *
 * PUR ET SANS DÉPENDANCE : il tourne à l'identique dans le navigateur (pour
 * montrer au vendeur ce qui sera enregistré) et sur le serveur (où se joue la
 * vraie garde).
 */

export type CleLien = "instagram" | "tiktok" | "whatsapp" | "site";

/** Ce qu'un navigateur mettrait devant une adresse tapée sans schéma. */
const SCHEMA = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Un pseudo tel qu'on le tape : lettres, chiffres, point, tiret bas, tiret,
 * précédé ou non d'une arobase. Volontairement plus strict que ce que les
 * réseaux acceptent — en cas de doute on ne fabrique rien, et le motif tranche.
 */
const PSEUDO = /^@?[A-Za-z0-9._-]{1,30}$/;

/** Un numéro tel qu'on le dicte : chiffres, espaces, points, tirets, parenthèses. */
const NUMERO = /^\+?[0-9 .() -]{6,25}$/;

const HOTES: Record<Exclude<CleLien, "site">, readonly string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  whatsapp: ["wa.me", "api.whatsapp.com"],
};

/**
 * `http://` DEVIENT `https://`, ET C'EST DÉLIBÉRÉ POUR LES RÉSEAUX. Les trois
 * imposent TLS depuis des années : un `http://instagram.com/x` collé sur une
 * page servie en TLS serait bloqué par le navigateur du client. Pour le site du
 * vendeur, en revanche, on ne réécrit rien — voir plus bas.
 */
function versHttps(saisie: string): string {
  if (/^http:\/\//i.test(saisie)) return "https://" + saisie.slice("http://".length);
  if (saisie.startsWith("//")) return "https:" + saisie;
  return saisie;
}

/**
 * LE SCHÉMA ET L'HÔTE PASSENT EN MINUSCULES, LE CHEMIN JAMAIS.
 *
 * `WWW.Laplanque.FR` est la même machine que `www.laplanque.fr` — le DNS ne
 * distingue pas la casse — et les motifs, eux, la distinguent : sans ce
 * passage, une adresse recopiée depuis un document mis en forme serait refusée
 * pour une raison invisible à l'œil. Le CHEMIN, lui, est sensible à la casse
 * sur la plupart des serveurs : `/Boutique` et `/boutique` sont deux pages, et
 * abaisser l'un donnerait un lien mort.
 */
function minusculerAutorite(url: string): string {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/?#]*)(.*)$/.exec(url);
  if (m === null) return url;
  return m[1]!.toLowerCase() + m[2]!.toLowerCase() + m[3]!;
}

function hoteConnu(saisie: string, hotes: readonly string[]): boolean {
  const sansSchema = saisie.replace(/^https?:\/\//i, "").toLowerCase();
  return hotes.some((h) => sansSchema === h || sansSchema.startsWith(h + "/"));
}

/**
 * Un numéro en chiffres seuls, sans indicatif de pays deviné.
 *
 * ⚠️ ON NE DEVINE JAMAIS L'INDICATIF. `06 12 34 56 78` est un numéro français
 * pour un Français et rien du tout pour Chen à Guangzhou ; y coller `33`
 * fabriquerait un lien vers le téléphone de quelqu'un d'autre. Un numéro qui
 * commence par `0` sans `00` est donc refusé — le substitut de la planche dit
 * « au format international », et c'est cette exigence-là qu'on garde.
 */
function numeroInternational(saisie: string): string | null {
  if (!NUMERO.test(saisie)) return null;
  let chiffres = saisie.replace(/[^0-9]/g, "");
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  else if (saisie.trim().startsWith("+")) {
    // déjà international, rien à retirer
  } else if (chiffres.startsWith("0")) return null;
  // E.164 : 15 chiffres au maximum, et un indicatif seul n'est pas un numéro.
  if (chiffres.length < 8 || chiffres.length > 15) return null;
  return chiffres;
}

/**
 * Met la saisie dans la forme canonique attendue, ou la rend inchangée quand on
 * ne sait pas quoi en faire — dans ce cas c'est le motif qui refusera, avec son
 * message.
 */
export function normaliserLien(clef: CleLien, saisie: string): string {
  const brut = saisie.trim().replace(/\s+$/, "");
  if (brut === "") return "";

  if (clef === "site") {
    /*
     * LE SITE DU VENDEUR N'A PAS D'HÔTE ATTENDU — c'est le sien. On préfixe
     * donc `https://` quand aucun schéma n'est écrit, et on ne réécrit RIEN
     * d'autre : convertir un `http://` explicite en `https://` fabriquerait un
     * lien qui peut ne pas répondre, et le vendeur ne saurait pas d'où vient la
     * page blanche. Le motif refuse `http://`, avec un message qui le dit.
     */
    return minusculerAutorite(SCHEMA.test(brut) ? brut : "https://" + brut);
  }

  const avecHttps = versHttps(brut);
  if (hoteConnu(avecHttps, HOTES[clef])) {
    return minusculerAutorite(SCHEMA.test(avecHttps) ? avecHttps : "https://" + avecHttps);
  }

  // Un schéma explicite vers autre chose que le réseau attendu n'est jamais
  // rattrapé : le motif doit le voir tel quel pour pouvoir le refuser.
  if (SCHEMA.test(avecHttps)) return avecHttps;

  if (clef === "whatsapp") {
    const numero = numeroInternational(brut);
    return numero === null ? brut : "https://wa.me/" + numero;
  }

  if (PSEUDO.test(brut)) {
    const pseudo = brut.startsWith("@") ? brut.slice(1) : brut;
    if (pseudo === "") return brut;
    // TikTok porte l'arobase DANS son chemin, Instagram non.
    return clef === "tiktok"
      ? "https://www.tiktok.com/@" + pseudo
      : "https://instagram.com/" + pseudo;
  }

  return brut;
}

/*
 * LES MOTIFS DES LIENS, ICI ET NON DANS `reglages.ts` (03/10/2026) : ce module-là est
 * réservé au serveur, et « Ma marque » valide désormais à la saisie (maquette,
 * `marque.js`) avec EXACTEMENT les mêmes motifs, après la même normalisation. Une
 * seule source : `reglages.ts` les réexporte. Leur commentaire d'origine y reste.
 */
export const MOTIFS_RESEAUX = {
  instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/?=&%-]{1,180}$/,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._/?=&%-]{1,180}$/,
  whatsapp: /^https:\/\/(wa\.me|api\.whatsapp\.com)\/[A-Za-z0-9._/?=&%+-]{1,180}$/,
} as const;

export const MOTIF_SITE =
  /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(\/[A-Za-z0-9._~:/?#=@!$&'()*+,;%-]{0,180})?$/;

/**
 * Le lien saisi, normalisé, est-il un lien que le serveur accepterait ? (vide = absence,
 * accepté). La même règle que `ReglagesMarque` : normalisation, 200 caractères, motif.
 */
export function lienAcceptable(clef: CleLien, saisie: string): boolean {
  const v = normaliserLien(clef, saisie.trim());
  if (v === "") return true;
  const motif = clef === "site" ? MOTIF_SITE : MOTIFS_RESEAUX[clef];
  return v.length <= 200 && motif.test(v);
}

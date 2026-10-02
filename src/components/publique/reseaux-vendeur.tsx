import { MOTIFS_RESEAUX, MOTIF_SITE } from "@/lib/boutique/reglages";
import type { Boutique } from "@/lib/page-publique/lecture";

/**
 * Les quatre motifs, en une seule table indexée par la même clef que la
 * boutique. Un lien dont la clef n'a pas de motif ne peut pas exister : c'est
 * le TYPE qui l'exige, pas une relecture.
 */
const MOTIFS = { ...MOTIFS_RESEAUX, site: MOTIF_SITE } as const;

/**
 * LES RÉSEAUX DU VENDEUR — dans l'en-tête de boutique et dans la carte
 * « Une question ? » de la page client.
 *
 * LE BLOC ENTIER EST OMIS quand aucun des trois n'est configuré. Pas de logos
 * grisés, pas de « ce vendeur n'a pas de réseaux », pas d'invitation à en
 * ajouter : le client n'a rien à faire de ce que son vendeur n'a pas rempli, et
 * un emplacement vide se lit comme un défaut d'affichage.
 *
 * TROIS RÉSEAUX, ET CES TROIS-LÀ SEULEMENT. Instagram, TikTok, WhatsApp —
 * Snapchat et Telegram sont écartés par décision produit. La liste est fermée
 * dans le TYPE, pas dans une donnée : un quatrième réseau ne peut pas arriver
 * ici par accident.
 *
 * `rel="noopener noreferrer"` ET `target="_blank"`. Sans `noopener`, la page
 * ouverte garde une référence sur celle-ci par `window.opener` et peut la
 * remplacer — sur une page qui porte le nom d'un vendeur, cela suffit à
 * envoyer son client sur une copie.
 *
 * ⚠️ LE DOMAINE EST REVÉRIFIÉ ICI, AU RENDU, alors qu'une contrainte de base et
 * un schéma Zod le vérifient déjà.
 *
 * CE N'EST PAS UNE REDITE : c'est le seul des trois contrôles qui protège la
 * page de CE QU'ELLE LIT. Les deux autres protègent l'ÉCRITURE. React n'assainit
 * pas un `href` — un `javascript:` stocké en base par n'importe quel chemin
 * futur (une migration corrective, un import, une console d'administration de
 * la base) arriverait ici et s'exécuterait chez le client d'un vendeur, sur une
 * page qu'il croit être la sienne.
 *
 * Trouvé à l'audit du 26/08/2026 : la protection tenait entièrement à l'ABSENCE
 * d'un second chemin d'écriture. La phrase juste était « ce serait ouvert si
 * quelqu'un écrivait en base autrement », donc c'était en sursis (L-029).
 *
 * UN LIEN QUI NE PASSE PAS EST OMIS, pas corrigé et pas signalé au client : il
 * n'y peut rien, et son vendeur ne lira jamais cette page.
 *
 * AUCUNE COULEUR D'ACCENT ICI, ET PLUS AUCUNE COULEUR DE MARQUE NON PLUS.
 * Les logos étaient peints aux couleurs d'Instagram, de TikTok et de WhatsApp ;
 * le kit `client_link` les rend tous À L'ENCRE, dans des puces neutres. La
 * reconnaissance tient à la silhouette, que les tracés officiels portent — et
 * un Instagram vert parce que la boutique est verte reste exclu : ce n'est pas
 * la couleur du vendeur qui dessine la marque d'un tiers.
 */

export const RESEAUX = [
  {
    clef: "instagram",
    libelle: "Instagram",
    trace:
      "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm6.9-11.2a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0z",
  },
  {
    clef: "tiktok",
    libelle: "TikTok",
    trace:
      "M14.7 3h2.5a5.3 5.3 0 0 0 4.3 4.3v2.5a7.7 7.7 0 0 1-4.3-1.4v5.9a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.6a3.3 3.3 0 1 0 2.5 3.2z",
  },
  {
    clef: "whatsapp",
    libelle: "WhatsApp",
    trace:
      "M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.3-1.1A8.4 8.4 0 1 0 12 3.5zm4.8 11.9c-.2.6-1.2 1.1-1.7 1.1-.4 0-1 .1-3-.8-2.5-1.1-4.1-3.7-4.2-3.9-.1-.2-1-1.3-1-2.5 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.7-.1 1.4z",
  },
  /*
   * LE SITE DU VENDEUR — quatrième et dernier. Son libellé, contrairement aux
   * trois noms propres au-dessus, est une chaîne TRADUITE : il arrive donc en
   * propriété. Le kit le dessine avec le logo d'un navigateur de marque ; le
   * produit garde un globe, qui ne prétend être le logo de personne.
   */
  {
    clef: "site",
    libelle: null,
    trace:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.9 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.3a17 17 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.6A15.6 15.6 0 0 0 8 8zM12 20c-.8-1.1-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.9-1.8 4zm2.2-6H9.8a15 15 0 0 1 0-4h4.4a15 15 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a17 17 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z",
  },
] as const;

/** Un lien du vendeur, validé et prêt à rendre. */
export interface LienVendeur {
  readonly clef: (typeof RESEAUX)[number]["clef"];
  readonly libelle: string;
  readonly href: string;
  readonly trace: string;
}

/**
 * Les liens configurés ET conformes, dans l'ordre du kit : Instagram, TikTok,
 * WhatsApp, puis le site.
 *
 * ⚠️ C'EST ICI, ET NULLE PART AILLEURS, QUE LE DOMAINE EST REVÉRIFIÉ. La page
 * client rend ces liens à DEUX endroits — l'en-tête de boutique et la carte
 * « Une question ? » — et deux validations finiraient par diverger : la seconde
 * copie est toujours celle qu'on oublie de corriger.
 */
export function liensDuVendeur(boutique: Boutique, libelleSite: string): readonly LienVendeur[] {
  const liens: LienVendeur[] = [];
  for (const reseau of RESEAUX) {
    const href = boutique[reseau.clef];
    if (href === null || !MOTIFS[reseau.clef].test(href)) continue;
    liens.push({ clef: reseau.clef, trace: reseau.trace, libelle: reseau.libelle ?? libelleSite, href });
  }
  return liens;
}

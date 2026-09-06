import "server-only";
import { getTranslations } from "next-intl/server";
import { LANGUES, type Langue } from "@/i18n/config";
import type { LibellesApercu } from "@/lib/boutique/phrases-apercu";

/**
 * LES PHRASES QUE MONTRE UN APERÇU « CE QUE VOIT LE CLIENT ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE MODULE FERME, RAPPORTÉ PAR WASSIM ET MESURÉ LE 06/09/2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * *« Quand je suis sur le SaaS anglais et que je clique sur la page client, ça
 * me redirige vers la page client en français. »*
 *
 * La page client, elle, est CORRECTE : elle vit hors du segment `[locale]` et
 * prend `shops.default_language` — décision verrouillée, et pour une bonne
 * raison, une URL localisée créerait deux adresses pour un jeton censé être
 * unique. Vérifié : aucun des quatre constructeurs de lien ne porte de locale,
 * et le saut `page-client/route` redirige en relatif.
 *
 * CE QUI EST FAUX, C'EST CE QUI PROMET DE LA MONTRER. Les deux aperçus —
 * celui de l'éditeur et celui de « Ma marque » — résolvaient leurs phrases avec
 * `useTranslations`, donc dans la langue de l'URL VENDEUR. Sur `/en/marque`, le
 * vendeur voyait un sélecteur intitulé « Customer page language » réglé sur
 * « French », et à vingt pixels un aperçu affichant « Your order ». L'écran se
 * contredisait lui-même, à l'endroit exact dont le rôle est de prévenir la
 * surprise.
 *
 * Trois surfaces disaient « anglais » — l'interface, l'aperçu de l'éditeur,
 * l'aperçu de la marque — et la quatrième, la seule qui compte, rendait
 * « français ». La conclusion « le clic m'a redirigé » était la seule possible.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI LES PHRASES SONT EMPRUNTÉES À `page-publique`, ET NON RECOPIÉES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elles l'étaient : `editeur.apercuVotreCommande`, `marque.apercuCommande` et
 * `page-publique.titre` portaient TROIS FOIS « Votre commande », dans trois
 * espaces de noms résolus par deux sources de langue différentes. Corriger la
 * langue sans supprimer la copie aurait laissé le vrai défaut en place : le
 * jour où la page client change une phrase, les aperçus continueraient
 * d'afficher l'ancienne, sans que rien n'échoue.
 *
 * C'est la leçon de `cleDApercu`, payée le 05/09 sur la commande d'un vrai
 * client : une règle écrite quatre fois est une règle dont on ne corrige que
 * les copies qu'on a sous les yeux.
 *
 * ⚠️ SEUL `pourGenerique` RESTE DANS `marque`, et c'est délibéré : l'écran de
 * marque n'a aucune commande réelle à montrer, donc aucun nom de client. La
 * page publique, elle, en a toujours un — elle n'a pas de phrase pour ce cas et
 * ne doit pas en acquérir une qui ne lui servirait jamais.
 *
 * ⚠️ LE TYPE ET LA SUBSTITUTION VIVENT DANS `phrases-apercu.ts`, PAS ICI, et
 * c'est le build qui l'a imposé : ce module porte `server-only` — il appelle
 * `next-intl/server` — tandis que les trois aperçus sont des Client
 * Components. La compilation a refusé, exactement comme elle doit le faire.
 */

/**
 * Les libellés d'aperçu dans UNE langue donnée.
 *
 * ⚠️ LA LANGUE EST UN ARGUMENT, ET C'EST TOUTE LA CORRECTION. `getTranslations`
 * sans `locale` prend celle de la requête — c'est-à-dire le segment `[locale]`
 * de l'URL vendeur, exactement la source qu'il ne faut pas ici.
 */
export async function libellesApercu(langue: Langue): Promise<LibellesApercu> {
  const client = await getTranslations({ locale: langue, namespace: "page-publique" });
  const marque = await getTranslations({ locale: langue, namespace: "marque" });

  return {
    commande: client("titre"),
    // `raw` rend le gabarit sans le résoudre : `client("pourClient")` exigerait
    // le nom, qu'on n'a pas encore.
    pourGabarit: client.raw("pourClient"),
    pourGenerique: marque("apercuPour"),
    approuver: client("qc.approuver"),
    statut: client("frise.en_transit"),
    reseauxGabarit: client.raw("reseaux.titre"),
  };
}

/**
 * Les libellés d'aperçu dans TOUTES les langues du produit.
 *
 * ⚠️ ENGENDRÉS PAR `LANGUES`, JAMAIS ÉNUMÉRÉS. L'écran de marque les recevait
 * sous la forme `{ fr: …, en: … }`, écrite à la main : ajouter une troisième
 * langue aurait laissé son aperçu vide, ou pire, l'aurait figé dans une langue
 * que le vendeur n'avait pas choisie. Le compilateur l'a attrapé cette fois —
 * `Record<Langue, …>` l'exige — mais seulement parce que le type est dérivé.
 *
 * Le coût est celui de N appels à `getTranslations`, sur un écran rendu une
 * fois par visite et déjà servi par le cache de traduction de next-intl.
 */
export async function tousLesLibellesApercu(): Promise<Record<Langue, LibellesApercu>> {
  const paires = await Promise.all(
    LANGUES.map(async (langue) => [langue, await libellesApercu(langue)] as const),
  );
  return Object.fromEntries(paires) as Record<Langue, LibellesApercu>;
}

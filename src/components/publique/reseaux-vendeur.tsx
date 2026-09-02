import { MOTIFS_RESEAUX, MOTIF_SITE } from "@/lib/boutique/reglages";
import type { Boutique } from "@/lib/page-publique/lecture";

/**
 * Les quatre motifs, en une seule table indexée par la même clef que la
 * boutique. Un lien dont la clef n'a pas de motif ne peut pas exister : c'est
 * le TYPE qui l'exige, pas une relecture.
 */
const MOTIFS = { ...MOTIFS_RESEAUX, site: MOTIF_SITE } as const;

/**
 * LES RÉSEAUX DU VENDEUR, en bas de la page client.
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
 * AUCUNE COULEUR D'ACCENT ICI. Les logos portent la couleur de LEUR marque,
 * pas celle du vendeur : un Instagram vert parce que la boutique est verte ne
 * se reconnaîtrait pas, et c'est la reconnaissance qui fait cliquer.
 */

const RESEAUX = [
  {
    clef: "instagram",
    libelle: "Instagram",
    couleur: "#c13584",
    trace:
      "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm6.9-11.2a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0z",
  },
  {
    clef: "tiktok",
    libelle: "TikTok",
    couleur: "#0e0e13",
    trace:
      "M14.7 3h2.5a5.3 5.3 0 0 0 4.3 4.3v2.5a7.7 7.7 0 0 1-4.3-1.4v5.9a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.6a3.3 3.3 0 1 0 2.5 3.2z",
  },
  {
    clef: "whatsapp",
    libelle: "WhatsApp",
    couleur: "#1da851",
    trace:
      "M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.3-1.1A8.4 8.4 0 1 0 12 3.5zm4.8 11.9c-.2.6-1.2 1.1-1.7 1.1-.4 0-1 .1-3-.8-2.5-1.1-4.1-3.7-4.2-3.9-.1-.2-1-1.3-1-2.5 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.7-.1 1.4z",
  },
  /*
   * LE SITE DU VENDEUR — quatrième et dernier. Il n'a pas de marque, donc pas
   * de couleur à lui : il porte le violet DropLink, la seule teinte du système
   * qui ne prétende être celle de personne d'autre. Et son libellé, contrairement
   * aux trois noms propres au-dessus, est une chaîne TRADUITE — il arrive donc
   * en propriété, comme le titre et la note.
   */
  {
    clef: "site",
    libelle: null,
    couleur: "#7c5cf5",
    trace:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.4 2.5 1.8 4h-3.6c.4-1.5 1-2.9 1.8-4zM4.3 14a8 8 0 0 1 0-4h3.3a17 17 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.6A15.6 15.6 0 0 0 8 8zM12 20c-.8-1.1-1.4-2.5-1.8-4h3.6c-.4 1.5-1 2.9-1.8 4zm2.2-6H9.8a15 15 0 0 1 0-4h4.4a15 15 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a17 17 0 0 0 0-4h3.3a8 8 0 0 1 0 4h-3.3z",
  },
] as const;

export function ReseauxVendeur({
  boutique,
  titre,
  note,
  libelleSite,
}: {
  readonly boutique: Boutique;
  /**
   * « Retrouvez {nom} », déjà substitué par l'appelant — ou `null` quand la
   * boutique n'a pas de nom.
   *
   * ⚠️ IL ÉTAIT OBLIGATOIRE, et l'appelant y passait « Retrouvez le vendeur ».
   * La planche `PageClientSansEntete` l'interdit NOMMÉMENT en commentaire :
   * « les icônes restent, le libellé "Retrouvez …" disparaît. Écrire "Retrouvez
   * le vendeur" serait un texte de remplacement, donc précisément ce que la
   * règle interdit. » C'est la décision 26 du brief — une information absente
   * est OMISE, jamais remplacée.
   *
   * Le type le dit désormais : `string | null`. Une propriété obligatoire
   * OBLIGE à inventer quelque chose le jour où l'on n'a rien.
   */
  readonly titre: string | null;
  /** « Les liens s'ouvrent dans un nouvel onglet. » — rendue sur grand écran seulement. */
  readonly note: string;
  /** « Site web » — le seul libellé traduisible des quatre. */
  readonly libelleSite: string;
}) {
  const liens = RESEAUX.map((reseau) => ({
    ...reseau,
    libelle: reseau.libelle ?? libelleSite,
    href: boutique[reseau.clef],
  })).filter(
    (r): r is (typeof RESEAUX)[number] & { libelle: string; href: string } =>
      r.href !== null && MOTIFS[r.clef].test(r.href),
  );

  if (liens.length === 0) return null;

  return (
    /*
      DEUX COMPOSITIONS, ET C'EST LE CANEVAS QUI LES SÉPARE.

      Au téléphone (`PageClient`) : une section pleine largeur, les trois liens
      côte à côte, chacun en colonne — icône au-dessus du nom — et tous de
      largeur égale. Sur grand écran (`PageClientDesktop`) : un pied de page,
      titre et note à gauche, les liens alignés à droite, en ligne.

      LA NOTE N'EXISTE QUE SUR GRAND ÉCRAN, comme sur la planche. Elle dit ce
      que le clic va faire ; sur 390 px elle prendrait une ligne entière pour
      une information qu'un pouce découvre en une seconde.
    */
    <section className="border-t border-filet-section px-[18px] py-[26px] lg:px-14 lg:pt-7 lg:pb-[34px]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-[30px]">
        {titre !== null ? (
          <div>
            <p className="font-body-sm text-[11px] leading-[15px] font-bold tracking-[0.09em] text-gris-entete uppercase">
              {titre}
            </p>
            <p className="mt-[5px] hidden font-body-md text-[14px] text-on-surface-variant lg:block">
              {note}
            </p>
          </div>
        ) : null}
        <ul className="flex gap-2.5">
          {liens.map((lien) => (
            <li key={lien.clef} className="flex-grow lg:flex-grow-0">
              <a
                href={lien.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] flex-col items-center justify-center gap-1.5 rounded-md border border-filet-controle font-label-md text-[12px] font-semibold text-ardoise-doux transition-colors hover:border-outline hover:bg-surface-container-low hover:text-on-surface lg:min-h-12 lg:flex-row lg:gap-2.5 lg:px-5 lg:text-[14px]"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={lien.couleur}
                  aria-hidden="true"
                >
                  <path d={lien.trace} />
                </svg>
                {lien.libelle}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

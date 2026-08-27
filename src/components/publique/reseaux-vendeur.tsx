import { MOTIFS_RESEAUX } from "@/lib/boutique/reglages";
import type { Boutique } from "@/lib/page-publique/lecture";

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
] as const;

export function ReseauxVendeur({
  boutique,
  titre,
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
}) {
  const liens = RESEAUX.map((reseau) => ({
    ...reseau,
    href: boutique[reseau.clef],
  })).filter(
    (r): r is (typeof RESEAUX)[number] & { href: string } =>
      r.href !== null && MOTIFS_RESEAUX[r.clef].test(r.href),
  );

  if (liens.length === 0) return null;

  return (
    <section className="border-t border-outline-variant px-margin-mobile py-6 md:px-margin-desktop">
      <div className="mx-auto max-w-container-max">
        {titre !== null ? (
          <p className="mb-3 font-body-sm text-[11px] leading-[15px] font-bold tracking-[0.09em] text-sourdine uppercase">
            {titre}
          </p>
        ) : null}
        <ul className="flex gap-2.5">
          {liens.map((lien) => (
            <li key={lien.clef} className="flex-grow">
              <a
                href={lien.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] flex-col items-center justify-center gap-1.5 rounded-md border border-outline font-label-md text-[12px] font-semibold text-on-surface-variant transition-colors hover:border-outline-variant hover:bg-surface-container hover:text-on-surface"
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

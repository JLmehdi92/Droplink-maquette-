import { CARTE } from "@/components/publique/carte-client";
import { ReseauxVendeur, liensDuVendeur } from "@/components/publique/reseaux-vendeur";
import type { Boutique } from "@/lib/page-publique/lecture";

/**
 * L'IDENTITÉ DE LA BOUTIQUE — la première carte du kit `client_link`.
 *
 * Elle remplace le BANDEAU à la couleur du vendeur que dessinait le canevas.
 * Le kit compose une page blanche, et la couleur du vendeur y vit dans ce qui
 * porte une information — la frise, le bandeau d'état, le bouton de contact —
 * plutôt que dans un aplat qui n'en porte aucune.
 *
 * ⚠️ OMISE EN ENTIER QUAND IL N'Y A NI NOM NI LOGO — décision 24. Pas de carte
 * vide, pas de « Une commande de » suivi de rien : un vendeur qui n'a rien
 * configuré obtient une page qui commence par sa commande, et c'est le cas le
 * plus fréquent en début de vie d'un compte. La décision est prise par
 * l'appelant, qui rend ou non ce composant.
 *
 * CE QUE LE KIT MONTRE ET QUI N'EST PAS PORTÉ :
 *  - sa colonne de trois gages — « Qualité 1:1 », « Suivi en temps réel »,
 *    « Service client réactif ». Le premier est interdit par le principe II,
 *    les deux autres sont des PROMESSES du vendeur que la base n'enregistre
 *    nulle part ;
 *  - le nom écrit dans un disque noir quand le logo manque. Le nom est déjà
 *    écrit en grand juste à côté : le répéter dans un faux logo serait un
 *    texte de remplacement, ce que la décision 26 refuse.
 */
export function EnTeteBoutique({
  boutique,
  commandeDe,
  libelleSite,
}: {
  readonly boutique: Boutique;
  /** « Une commande de » — posé seulement quand le nom existe. */
  readonly commandeDe: string;
  readonly libelleSite: string;
}) {
  const aDesLiens = liensDuVendeur(boutique, libelleSite).length > 0;

  return (
    <section className={CARTE + " lg:px-[26px] lg:py-[22px]"}>
      <div className="flex items-center gap-4 lg:gap-[22px]">
        {boutique.logo !== null ? (
          /* eslint-disable-next-line @next/next/no-img-element -- le logo est
             servi par une URL signée à expiration ; l'optimiseur la mettrait en
             cache au-delà de sa validité. */
          <img
            src={boutique.logo}
            alt=""
            width={96}
            height={96}
            className="h-16 w-16 shrink-0 rounded-full bg-ds-surface-inverse object-cover lg:h-24 lg:w-24"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-[5px]">
          {boutique.nom !== null ? (
            <>
              <span className="text-[13px] text-ds-texte-sourdine">{commandeDe}</span>
              <span className="text-[22px] leading-[1.15] font-extrabold tracking-[-0.04em] break-words text-ds-texte-fort lg:text-[26px]">
                {boutique.nom}
              </span>
            </>
          ) : null}
          {/* OMISE QUAND ELLE N'EST PAS CONFIGURÉE, jamais remplacée : c'est la
              base qui la retire quand le nom manque (migration 147). */}
          {boutique.description !== null ? (
            <span className="text-[13px] text-ds-texte-corps">{boutique.description}</span>
          ) : null}
          {aDesLiens ? (
            <div className="mt-1.5">
              <ReseauxVendeur boutique={boutique} libelleSite={libelleSite} variante="icone" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

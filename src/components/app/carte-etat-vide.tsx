import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * LA CARTE D'ÉTAT VIDE DE L'ESPACE VENDEUR — `EmptyView` du kit `seller_app`,
 * et la vue `#introuvable` écrite dans ce kit le 14/09/2026 pour une commande
 * qui n'existe plus.
 *
 * AUCUN CROCHET, AUCUNE TRADUCTION : elle sert à la fois `(app)/not-found`, un
 * composant serveur, et `(app)/error`, qui est une frontière d'erreur donc un
 * composant client. Les textes et l'action arrivent résolus.
 */
export function CarteEtatVide({
  icone: Icone,
  titre,
  texte,
  children,
}: {
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly texte: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-6 py-12 text-center shadow-ds-card md:p-[72px]">
      <span className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-ds-pill bg-ds-surface-teinte text-ds-accent">
        <Icone aria-hidden="true" size={26} strokeWidth={1.8} />
      </span>
      <h1 className="text-[22px] leading-[1.1] font-extrabold tracking-[-0.03em] text-ds-texte-fort">{titre}</h1>
      <p className="max-w-[420px] text-[15px] text-ds-texte-corps">{texte}</p>
      {children === undefined ? null : <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Le bouton secondaire du kit (`Button variant="secondary"`, taille md). */
export const CLASSE_BOUTON_SECONDAIRE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-fort shadow-ds-sm transition-shadow hover:shadow-ds-md";

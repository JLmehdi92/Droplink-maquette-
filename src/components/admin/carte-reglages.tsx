import type { ReactNode } from "react";

/**
 * UNE CARTE DE RÉGLAGES.
 *
 * Le sous-titre dit CE QUE LA CARTE GARANTIT, pas ce qu'elle contient :
 * « vérifiés en base, pas seulement dans l'interface » et « effet immédiat sur
 * toute la plateforme » sont les deux phrases qu'on veut avoir lues avant de
 * toucher à un chiffre. « Quatre réglages » ne se relit pas.
 */
export function CarteReglages({
  titre,
  sousTitre,
  children,
}: {
  readonly titre: string;
  readonly sousTitre: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-ds-card border border-ds-filet bg-ds-surface-carte p-4 md:rounded-ds-card-lg md:p-[22px]">
      <h2 className="text-[16px] leading-[21px] font-bold tracking-[-0.015em] text-ds-texte-fort">
        {titre}
      </h2>
      <p className="mt-1 mb-2 text-[13px] leading-4 text-ds-texte-sourdine">
        {sousTitre}
      </p>
      {children}
    </section>
  );
}

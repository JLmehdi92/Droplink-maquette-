import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * `SetCard` ET `ActionRow` DU KIT — les deux briques de l'écran « Paramètres ».
 *
 * ⚠️ PAS `Panneau`, ET LA MESURE L'A DIT. `Panneau` pose sa pastille au rayon
 * pilule et son action SOUS l'en-tête replié ; `SetCard` pose une tuile de 44 au
 * rayon `icon-tile` (12) et son action DANS l'en-tête, à droite du titre. La
 * première passe employait `Panneau` : les titres sortaient 114 px trop étroits
 * et le bouton « Enregistrer » tombait sous le formulaire.
 *
 * SANS DIRECTIVE ET SANS ÉTAT : ces briques se rendent aussi bien depuis la page
 * serveur que depuis les formulaires clients qui ouvrent un panneau sur place.
 */
export function CarteReglage({
  icone: Icone,
  titre,
  sousTitre,
  action,
  children,
}: {
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly sousTitre: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card sm:p-6">
      <header className="mb-5 flex flex-wrap items-start gap-3.5">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-icon-tile bg-ds-surface-teinte text-ds-accent">
          <Icone aria-hidden="true" size={20} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-[1_1_180px]">
          <h2 className="text-[17px] leading-[1.1] font-bold tracking-[-0.025em] text-ds-texte-titre">{titre}</h2>
          <p className="mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps">{sousTitre}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function LigneAction({
  icone: Icone,
  titre,
  sousTitre,
  premiere = false,
  danger = false,
  children,
}: {
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly sousTitre: string;
  readonly premiere?: boolean;
  /** `ActionRow danger` : tuile et titre à la couleur d'erreur — un geste irréversible. */
  readonly danger?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className={
        "flex flex-wrap items-center gap-3.5 py-3.5" + (premiere ? "" : " border-t border-ds-filet")
      }
    >
      <span
        className={
          "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-ds-icon-tile " +
          (danger ? "bg-ds-erreur-fond text-ds-erreur-encre" : "bg-ds-surface-teinte text-ds-accent")
        }
      >
        <Icone aria-hidden="true" size={17} strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
        <span
          className={"text-[14px] leading-[normal] font-semibold " + (danger ? "text-ds-erreur-encre" : "text-ds-texte-fort")}
        >
          {titre}
        </span>
        <span className="text-[12.5px] leading-[normal] text-ds-texte-sourdine">{sousTitre}</span>
      </span>
      <span className="flex items-center gap-3">{children}</span>
    </div>
  );
}

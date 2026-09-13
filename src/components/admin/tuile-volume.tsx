import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * UNE TUILE DE VOLUME DU PANNEAU — `AdminStat` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : carte au rayon `card-lg`, filet, ombre de
 * carte, remplissage 20/22 ; tuile d'icône de 52 au rayon `card` sur la teinte,
 * icône 23 au trait 1,9, écart 16 ; colonne à l'écart 5 — libellé 14/400 en
 * corps, valeur 28/800 à l'interlettrage -0,045em et l'interligne 1,1,
 * complément 12,5/400 en sourdine.
 *
 * ⚠️ LE KIT MET UN BADGE « +12 % / vs période précédente » SUR CHAQUE TUILE, ET
 * NOUS N'EN METTONS AUCUN. Aucun compteur du produit ne porte son historique :
 * `usage_counters` tient le mois COURANT, et la comparaison au mois précédent
 * exigerait de lire une période qu'aucune de nos fonctions ne rend. Un badge
 * calculé sur rien serait le pire des deux mondes — il a la forme d'une mesure.
 * L'emplacement sert donc à ce qui EST vrai : la mention « FACTURÉ » du seul
 * compteur qui corresponde à une facture.
 */
export function TuileVolume({
  icone: Icone,
  libelle,
  valeur,
  complement,
  badge,
  accent = false,
  valeurEnSourdine = false,
}: {
  readonly icone: LucideIcon;
  readonly libelle: string;
  readonly valeur: string;
  readonly complement: ReactNode;
  readonly badge?: ReactNode;
  /** La tuile facturée : teinte de fond et filet d'accent, comme le veut le brief. */
  readonly accent?: boolean;
  /** « Indisponible » n'est pas un chiffre : il ne prend ni la graisse ni l'encre. */
  readonly valeurEnSourdine?: boolean;
}) {
  return (
    <div
      className={
        "flex items-start gap-4 rounded-ds-card-lg border p-4 shadow-ds-card md:px-[22px] md:py-5 " +
        (accent
          ? "border-ds-accent-doux bg-ds-surface-teinte"
          : "border-ds-filet bg-ds-surface-carte")
      }
    >
      <span
        aria-hidden="true"
        className={
          "flex h-[52px] w-[52px] flex-none items-center justify-center rounded-ds-card text-ds-accent " +
          (accent ? "bg-ds-surface-carte" : "bg-ds-surface-teinte")
        }
      >
        <Icone size={23} strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span
          className={
            "text-[14px] leading-[normal] " +
            (accent ? "font-bold text-ds-accent-encre" : "text-ds-texte-corps")
          }
        >
          {libelle}
        </span>
        <span className="flex flex-wrap items-center gap-2.5">
          <span
            className={
              "text-[24px] leading-[1.1] font-extrabold tracking-[-0.045em] md:text-[28px] " +
              (valeurEnSourdine
                ? "text-ds-texte-sourdine"
                : accent
                  ? "text-ds-accent-encre"
                  : "text-ds-texte-fort")
            }
          >
            {valeur}
          </span>
          {badge}
        </span>
        <span
          className={
            "text-[12.5px] leading-[normal] " +
            (accent ? "text-ds-accent-encre" : "text-ds-texte-sourdine")
          }
        >
          {complement}
        </span>
      </span>
    </div>
  );
}

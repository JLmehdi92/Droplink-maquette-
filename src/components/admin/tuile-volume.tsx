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
 * ⚠️ DEUX GÉOMÉTRIES, ET C'EST LE KIT QUI EN A DEUX. `AdminStat` — la vue
 * d'ensemble, quatre tuiles larges : icône 52, écart 16, remplissage 20/22,
 * libellé 14, valeur 28. `OrderKpi` — les écrans de liste, six tuiles étroites :
 * icône 44, écart 14, remplissage 16/18, colonne à l'écart 4, libellé 13 en
 * interligne 1,35, valeur 23, complément 12. Les transposer l'une à l'autre
 * ferait un écran conforme à la mauvaise référence.
 *
 * ⚠️ LE KIT MET UN BADGE « +12 % / vs période précédente » SUR CHAQUE TUILE, ET
 * NOUS N'EN METTONS AUCUN. Aucun compteur du produit ne porte son historique :
 * `usage_counters` tient le mois COURANT, et la comparaison au mois précédent
 * exigerait de lire une période qu'aucune de nos fonctions ne rend. Un badge
 * calculé sur rien serait le pire des deux mondes — il a la forme d'une mesure.
 * L'emplacement sert donc à ce qui EST vrai : la mention « FACTURÉ » du seul
 * compteur qui corresponde à une facture.
 */
/** Les teintes d'icône du kit, par famille d'information. */
const TEINTES = {
  marque: "bg-ds-surface-teinte text-ds-accent",
  info: "bg-ds-info-fond text-ds-info",
  succes: "bg-ds-succes-fond text-ds-succes",
  alerte: "bg-ds-alerte-fond text-ds-alerte",
} as const;

export function TuileVolume({
  icone: Icone,
  libelle,
  valeur,
  complement,
  badge,
  accent = false,
  valeurEnSourdine = false,
  compacte = false,
  teinte = "marque",
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
  /** La géométrie `OrderKpi` des écrans de liste, au lieu de `AdminStat`. */
  readonly compacte?: boolean;
  readonly teinte?: keyof typeof TEINTES;
}) {
  return (
    <div
      className={
        "flex items-start rounded-ds-card-lg border shadow-ds-card " +
        (compacte ? "gap-3.5 p-4 md:px-[18px] " : "gap-4 p-4 md:px-[22px] md:py-5 ") +
        (accent
          ? "border-ds-accent-doux bg-ds-surface-teinte"
          : "border-ds-filet bg-ds-surface-carte")
      }
    >
      <span
        aria-hidden="true"
        className={
          "flex flex-none items-center justify-center rounded-ds-card " +
          (compacte ? "h-11 w-11 " : "h-[52px] w-[52px] ") +
          (accent ? "bg-ds-surface-carte text-ds-accent" : TEINTES[teinte])
        }
      >
        <Icone size={compacte ? 20 : 23} strokeWidth={1.9} />
      </span>
      <span className={"flex min-w-0 flex-col " + (compacte ? "gap-1" : "gap-[5px]")}>
        <span
          className={
            (compacte ? "text-[13px] leading-[1.35] " : "text-[14px] leading-[normal] ") +
            (accent ? "font-bold text-ds-accent-encre" : "text-ds-texte-corps")
          }
        >
          {libelle}
        </span>
        <span className={"flex flex-wrap items-center " + (compacte ? "gap-2" : "gap-2.5")}>
          <span
            className={
              "leading-[1.1] font-extrabold tracking-[-0.045em] " +
              (compacte ? "text-[21px] md:text-[23px] " : "text-[24px] md:text-[28px] ") +
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
            (compacte ? "text-[12px] leading-[1.35] " : "text-[12.5px] leading-[normal] ") +
            (accent ? "text-ds-accent-encre" : "text-ds-texte-sourdine")
          }
        >
          {complement}
        </span>
      </span>
    </div>
  );
}

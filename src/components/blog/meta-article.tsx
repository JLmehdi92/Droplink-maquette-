import { CalendarDays, Clock } from "lucide-react";

/**
 * LA LIGNE DE MÉTA D'UN ARTICLE — date et durée, icônes Lucide en 14, comme la
 * ligne d'en-tête des pages légales. Partagée par l'index et l'article, qui
 * recopiaient chacun leur propre table des mois.
 */
export function MetaArticle({ date, duree }: { readonly date: string; readonly duree: string }) {
  return (
    <span className="flex flex-wrap items-center gap-4 text-[12.5px] text-ds-texte-sourdine">
      <span className="flex items-center gap-[7px]">
        <CalendarDays aria-hidden="true" size={14} strokeWidth={1.9} />
        <time dateTime={date}>{dateLisible(date)}</time>
      </span>
      <span className="flex items-center gap-[7px]">
        <Clock aria-hidden="true" size={14} strokeWidth={1.9} />
        {duree}
      </span>
    </span>
  );
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

/**
 * La date en toutes lettres.
 *
 * ⚠️ EN DUR PLUTÔT QU'AVEC `Intl.DateTimeFormat`. Le blog n'existe que dans une
 * langue : passer par une API de localisation ferait dépendre l'affichage du
 * fuseau et de la locale du serveur, pour un résultat qui doit être français
 * quoi qu'il arrive. Et `new Date("2026-09-08")` est interprété en UTC, ce qui
 * décale la date d'un jour dans les fuseaux négatifs — un article publié le 8
 * s'afficherait « 7 septembre » pour une partie des lecteurs.
 */
function dateLisible(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  const nom = MOIS[Number(mois) - 1];
  if (annee === undefined || jour === undefined || nom === undefined) return iso;
  return `${Number(jour)} ${nom} ${annee}`;
}

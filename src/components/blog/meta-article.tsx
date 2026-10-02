import { CalendarDays, Clock } from "lucide-react";

/**
 * LA LIGNE DE MÉTA D'UN ARTICLE — date et durée, icônes Lucide en 14, comme la
 * ligne d'en-tête des pages légales. Partagée par l'index et l'article, qui
 * recopiaient chacun leur propre table des mois.
 */
export function MetaArticle({ date, duree }: { readonly date: string; readonly duree: string }) {
  // Le vocabulaire de la maquette (`.blog-meta`) : date, point médian, durée.
  return (
    <span className="blog-meta">
      <CalendarDays aria-hidden="true" className="ic" />
      <time dateTime={date}>{dateLisible(date)}</time>
      <span aria-hidden="true">·</span>
      <Clock aria-hidden="true" className="ic" />
      {duree}
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

import { Eye } from "lucide-react";

/**
 * L'ENCART QUI DIT CE QUE LA CONSULTATION ÉCRIT AU JOURNAL (maquette,
 * `.adm-encart`). Il est posé AVANT les données : celui qui regarde doit savoir
 * qu'il est tracé avant de regarder, pas le découvrir dans le journal.
 */
export function EncartTrace({ texte }: { readonly texte: string }) {
  return (
    <p className="adm-encart">
      <Eye aria-hidden="true" className="ic" />
      <span>{texte}</span>
    </p>
  );
}

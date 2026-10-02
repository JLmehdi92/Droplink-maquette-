import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * L'ÉCRAN D'ÉTAT DE L'ESPACE VENDEUR ET DE L'ADMINISTRATION — refonte du
 * 02/10/2026 (maquettes `erreur-espace.html`, `commande-introuvable.html`,
 * `admin-erreur.html`) : une icône dans une pastille, un titre, un texte, une
 * action. Elle se pose dans `main.tableau.etat-ecran`.
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
    <section className="etat" aria-labelledby="etat-titre">
      <span className="etat__icone" aria-hidden="true">
        <Icone className="ic" />
      </span>
      <h1 id="etat-titre">{titre}</h1>
      <p>{texte}</p>
      {children === undefined ? null : <div className="etat__actions">{children}</div>}
    </section>
  );
}

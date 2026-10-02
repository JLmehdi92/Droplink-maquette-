import type { ReactNode } from "react";
import { ValeurRoulee } from "@/components/app/couche-v4";

/**
 * LES TUILES CHIFFRÉES DE L'ADMINISTRATION — refonte du 02/10/2026 (maquette,
 * `.compteurs.adm-tuiles`) : une bande de compteurs séparés par des filets,
 * la grammaire des compteurs de l'espace vendeur.
 *
 * UN TIRET, JAMAIS UN ZÉRO : la valeur arrive déjà formatée par l'appelant,
 * qui écrit « — » quand la lecture n'a pas abouti. Et « Indisponible » se rend
 * en sourdine (`valeurEnSourdine`), pour ne pas se lire comme un chiffre.
 */
export function Tuiles({ etiquette, children, colonnes }: { readonly etiquette: string; readonly children: ReactNode; readonly colonnes: number }) {
  return (
    <section className={`compteurs compteurs--${colonnes} adm-tuiles`} aria-label={etiquette}>
      {children}
    </section>
  );
}

export function TuileVolume({
  libelle,
  valeur,
  complement,
  ton,
  valeurEnSourdine = false,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly complement?: ReactNode;
  /** `facture` : le seul compteur qui corresponde à une facture ; `erreur` : un seuil dépassé. */
  readonly ton?: "facture" | "erreur" | undefined;
  readonly valeurEnSourdine?: boolean;
}) {
  return (
    <div className="compteur-app" data-ton={ton}>
      <p className="compteur-app__titre">{libelle}</p>
      <p className={"compteur-app__valeur" + (valeurEnSourdine ? " adm-sourdine" : "")}>
        {/* Les chiffres roulent au premier chargement réel (maquette, `v4.js`). */}
        <ValeurRoulee texte={valeur} />
      </p>
      {complement === undefined ? null : <p className="compteur-app__dessous">{complement}</p>}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageAcces } from "@/components/acces/page-acces";

/**
 * LA COQUE DES PAGES DE COMPTE (refonte du 02/10/2026) : mot de passe oublié, nouveau mot
 * de passe, vérification en deux étapes. La même page d'accès que la connexion
 * (`PageAcces`, maquette `nouveau-mot-de-passe.html` / `verification.html`) : le formulaire
 * dans sa colonne, le film « absence » posé à côté au-dessus de 1 020 px.
 *
 * Aucune phrase de consentement : changer un mot de passe ou saisir un code n'accepte
 * rien de nouveau, comme se reconnecter.
 */
export async function CoqueAccesSimple({
  langue,
  icone: Icone,
  titre,
  sousTitre,
  children,
}: {
  readonly langue: string;
  /** La pastille au-dessus du titre (la vérification en porte une dans la maquette). */
  readonly icone?: LucideIcon;
  readonly titre: string;
  readonly sousTitre: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <PageAcces locale={langue} film="absence" legal={false}>
      <header className="acces__tete">
        {Icone === undefined ? null : (
          <span className="acces__pastille">
            <Icone aria-hidden="true" className="ic" />
          </span>
        )}
        <h1>{titre}</h1>
        <p>{sousTitre}</p>
      </header>
      {children}
    </PageAcces>
  );
}

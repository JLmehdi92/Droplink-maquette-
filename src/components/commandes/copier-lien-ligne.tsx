"use client";

import { annoncer } from "@/components/app/annonce";
import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

/**
 * COPIER LE LIEN D'UNE LIGNE (maquette, `.action-ligne[data-copier]`).
 *
 * L'ÉTAT « COPIÉ » N'EST AFFICHÉ QU'APRÈS SUCCÈS de l'écriture. Un retour
 * optimiste serait un pari sur le presse-papiers : refusé par le navigateur, le
 * vendeur collerait le contenu précédent dans sa conversation en croyant envoyer
 * le lien de son client. L'échec est donc DIT (icône d'alerte, et le libellé du
 * bouton le nomme).
 */
export function CopierLienLigne({
  lien,
  libelles,
}: {
  readonly lien: string;
  /** `copie` : « Lien de {client} copié », dit par la bulle (maquette `commandes.js`). */
  readonly libelles: { readonly copier: string; readonly echec: string; readonly copie?: string };
}) {
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");
  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lien);
      setEtat("copie");
      if (libelles.copie !== undefined) annoncer(libelles.copie);
      window.setTimeout(() => setEtat("repos"), 1600);
    } catch {
      setEtat("echec");
    }
  };
  const libelle = etat === "echec" ? libelles.echec : libelles.copier;
  return (
    <>
    <button
      type="button"
      className={"action-ligne" + (etat === "copie" ? " est-copie" : "") + (etat === "echec" ? " est-echec" : "")}
      aria-label={libelle}
      title={libelle}
      onClick={() => void copier()}
    >
      {etat === "copie" ? (
        <Check aria-hidden="true" className="ic" />
      ) : etat === "echec" ? (
        <TriangleAlert aria-hidden="true" className="ic" />
      ) : (
        <Copy aria-hidden="true" className="ic" />
      )}
    </button>
    {/* L'échec se LIT, pas seulement au survol : au doigt, un `title` est invisible. */}
    {etat === "echec" ? (
      <span className="action-ligne__echec" role="status">
        {libelles.echec}
      </span>
    ) : null}
    </>
  );
}

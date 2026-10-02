"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { annoncer } from "@/components/app/annonce";

/**
 * COPIER LE LIEN DE LA PAGE CLIENT, depuis la fiche — trois endroits de la maquette :
 * l'en-tête (« Copier le lien »), le champ du lien et la bande du téléphone (icône).
 *
 * L'ÉTAT « COPIÉ » N'EST AFFICHÉ QU'APRÈS SUCCÈS. Un retour optimiste serait un pari sur
 * le presse-papiers : refusé par le navigateur — hors contexte sécurisé, dans certaines
 * vues intégrées —, le vendeur collerait le contenu précédent en croyant envoyer le lien
 * de son client. L'échec se DIT, à l'écran et au lecteur d'écran.
 */
export function BoutonCopierFiche({
  lien,
  className,
  avecTexte = false,
}: {
  readonly lien: string;
  readonly className: string;
  readonly avecTexte?: boolean;
}) {
  const t = useTranslations("editeur");
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");

  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lien);
      setEtat("copie");
      annoncer(t("lienCopie"));
      window.setTimeout(() => setEtat("repos"), 2000);
    } catch {
      setEtat("echec");
      annoncer(t("copieEchouee"));
    }
  };

  const libelle = etat === "copie" ? t("lienCopie") : etat === "echec" ? t("copieEchouee") : t("copierLien");
  const Icone = etat === "copie" ? Check : etat === "echec" ? TriangleAlert : Copy;
  return (
    <>
      <button
        type="button"
        className={className + (etat === "copie" ? " est-copie" : "") + (etat === "echec" ? " est-echec" : "")}
        aria-label={avecTexte ? undefined : libelle}
        title={libelle}
        onClick={() => void copier()}
      >
        <Icone aria-hidden="true" className="ic" />
        {avecTexte ? <span>{libelle}</span> : null}
      </button>
      {/* L'ANNONCE est la bulle de la coque (maquette `commande.js` : « Lien copié »,
          « Copie refusée par le navigateur »), `role="status"` : vue ET lue. */}
    </>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { CarteEtatVide, CLASSE_BOUTON_SECONDAIRE } from "@/components/app/carte-etat-vide";

/**
 * LA FRONTIÈRE D'ERREUR DE L'ESPACE VENDEUR.
 *
 * Le produit n'en avait AUCUNE : une erreur de rendu tombait sur la page
 * générique de Next, en anglais, sans rien dire au vendeur de ce qu'il advient
 * de ses données — et c'est la seule question qu'il se pose à cet instant.
 *
 * ON DIT CE QUI EST VRAI ET RIEN D'AUTRE : le rendu a échoué, donc rien n'a été
 * écrit ni supprimé. Affirmer « réessayez plus tard » sans le savoir serait un
 * pari ; affirmer que les données sont intactes ne l'est pas, puisque cette
 * frontière n'attrape que des échecs de RENDU.
 *
 * `digest` est l'identifiant que Next attribue à l'erreur côté serveur. Il est
 * affiché parce que c'est la seule chose qui permet de relier ce que le vendeur
 * a vu à ce que le journal contient — le message réel, lui, n'est jamais
 * envoyé au navigateur en production, et c'est très bien ainsi.
 */
export default function Erreur({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations("erreurs");

  /* PORTÉE SUR LE DESIGN SYSTEM LE 14/09/2026 : la carte d'état vide du kit —
     celle de la commande introuvable —, et non plus un titre en Plus Jakarta
     Sans au-dessus d'un bouton noir. */
  return (
    <main id="contenu" className="px-margin-mobile pt-3.5 pb-5 md:px-8 md:pt-8 md:pb-[26px]">
      <CarteEtatVide icone={TriangleAlert} titre={t("titre")} texte={t("texte")}>
        <button type="button" onClick={reset} className={CLASSE_BOUTON_SECONDAIRE}>
          <RotateCcw aria-hidden="true" size={17} strokeWidth={1.9} />
          {t("reessayer")}
        </button>
        {error.digest !== undefined && (
          <p className="mt-5 text-[13px] text-ds-texte-sourdine">{t("reference", { ref: error.digest })}</p>
        )}
      </CarteEtatVide>
    </main>
  );
}

"use client";

import { useTranslations } from "next-intl";

/**
 * LA FRONTIÈRE D'ERREUR DE L'ESPACE D'ADMINISTRATION.
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

  return (
    <main
      id="contenu"
      className="flex flex-1 items-center justify-center px-margin-mobile py-10 md:px-8"
    >
      <div className="max-w-[520px] text-center">
        <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-ds-texte-fort">
          {t("titre")}
        </h1>
        <p className="mt-3 text-ds-texte-corps">{t("texte")}</p>

        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-[44px] rounded-ds-control bg-ds-surface-carte px-5 text-admin"
        >
          {t("reessayer")}
        </button>

        {error.digest !== undefined && (
          <p className="mt-6 text-ds-texte-sourdine">
            {t("reference", { ref: error.digest })}
          </p>
        )}
      </div>
    </main>
  );
}

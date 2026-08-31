"use client";

import { useTranslations } from "next-intl";

/**
 * LA FRONTIÈRE D'ERREUR DES SURFACES PUBLIQUES.
 *
 * ⚠️ IL N'Y EN AVAIT AUCUNE. `(app)` et `admin` en portaient une chacun ; la
 * landing, la connexion, l'inscription, l'onboarding, les conditions, la
 * confidentialité et le signalement n'en avaient pas. Une erreur de rendu y
 * servait la page générique de Next — anglais, Times New Roman, aucun rapport
 * avec le produit — sur les écrans par lesquels tout le monde entre.
 *
 * L'ASYMÉTRIE ÉTAIT UN OUBLI, PAS UNE DÉCISION : l'en-tête de
 * `(app)/error.tsx` argumente précisément pourquoi cette page générique est
 * inacceptable, et le raisonnement ne dépend en rien du fait qu'on soit
 * authentifié.
 *
 * ON DIT CE QUI EST VRAI ET RIEN D'AUTRE : cette frontière n'attrape que des
 * échecs de RENDU, donc rien n'a été écrit ni supprimé. Le `digest` est affiché
 * parce qu'il est la seule chose qui relie ce qu'on a vu à ce que le journal
 * contient — le message réel, lui, ne quitte jamais le serveur en production.
 */
export default function ErreurPublique({
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
      className="flex min-h-dvh items-center justify-center px-margin-mobile py-10 md:px-[30px]"
    >
      <div className="max-w-[520px] text-center">
        <h1 className="font-headline-xl text-[24px] font-extrabold tracking-[-0.03em] text-on-surface">
          {t("titre")}
        </h1>
        <p className="mt-3 font-body-md text-body-md text-on-surface-variant">{t("texte")}</p>

        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-[44px] rounded-md bg-primary px-5 font-label-md text-label-md text-surface-container-lowest"
        >
          {t("reessayer")}
        </button>

        {error.digest !== undefined && (
          <p className="mt-6 font-body-sm text-body-sm text-sourdine">
            {t("reference", { ref: error.digest })}
          </p>
        )}
      </div>
    </main>
  );
}

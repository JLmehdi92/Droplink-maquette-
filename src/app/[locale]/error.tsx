"use client";

import { useTranslations } from "next-intl";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { CLASSE_ACTION_ERREUR, EcranErreurPublic } from "@/components/ecran-erreur-public";

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

  /* PORTÉE SUR `ui_kits/erreurs/erreur.html` LE 14/09/2026 — elle rendait un
     titre en Plus Jakarta Sans au-dessus d'un bouton noir. */
  return (
    <EcranErreurPublic icone={TriangleAlert} titre={t("titre")} texte={t("texte")}>
      <button type="button" onClick={reset} className={CLASSE_ACTION_ERREUR}>
        <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        {t("reessayer")}
      </button>
      {error.digest !== undefined && (
        <p className="mt-6 text-[13px] text-ds-texte-sourdine">{t("reference", { ref: error.digest })}</p>
      )}
    </EcranErreurPublic>
  );
}

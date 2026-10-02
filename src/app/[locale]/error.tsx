"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
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
  const langue = useLocale();
  const [enCours, demarrer] = useTransition();

  /* Refonte du 02/10/2026 : maquette `erreur.html`. */
  return (
    <EcranErreurPublic
      icone={TriangleAlert}
      titre={t("titre")}
      texte={t("texte")}
      accueil={{ href: `/${langue}`, libelle: t("accueilLogo") }}
    >
      {/* L'attente est celle de la VRAIE relance (transition), jamais un délai fixe. */}
      <button type="button" onClick={() => demarrer(reset)} aria-busy={enCours} disabled={enCours} className={CLASSE_ACTION_ERREUR}>
        <RotateCcw aria-hidden="true" className="ic" />
        <span>{t("reessayer")}</span>
      </button>
      {error.digest === undefined ? null : <p className="err-ref">{t("reference", { ref: error.digest })}</p>}
    </EcranErreurPublic>
  );
}

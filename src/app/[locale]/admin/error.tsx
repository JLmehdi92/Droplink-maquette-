"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { CarteEtatVide } from "@/components/app/carte-etat-vide";
import { BoutonReessayer } from "@/components/app/bouton-reessayer";

/**
 * LA FRONTIÈRE D'ERREUR DE L'ADMINISTRATION (maquette `admin-erreur.html`). Seul le `digest` est
 * montré, jamais le message de l'erreur ; et le texte dit vrai : une erreur de
 * rendu n'a rien écrit ni supprimé.
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
    <main id="contenu" className="tableau etat-ecran">
      <CarteEtatVide icone={TriangleAlert} titre={t("titre")} texte={t("texte")}>
        <BoutonReessayer libelle={t("reessayer")} reset={reset} />
        {error.digest === undefined ? null : <p className="etat__ref">{t("reference", { ref: error.digest })}</p>}
      </CarteEtatVide>
    </main>
  );
}

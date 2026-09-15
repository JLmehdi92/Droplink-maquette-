"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink, TriangleAlert } from "lucide-react";

/**
 * Actions rapides d'une ligne : copier le lien public, l'ouvrir.
 *
 * SEUL ÎLOT CLIENT DE L'ÉCRAN. Tout le reste — filtres, tri, pagination — passe
 * par des liens et un formulaire `GET`, donc fonctionne sans JavaScript et ne
 * coûte rien au chargement. Copier dans le presse-papiers, lui, n'a pas
 * d'équivalent en HTML.
 *
 * L'ÉTAT « COPIÉ » N'EST AFFICHÉ QU'APRÈS SUCCÈS de l'écriture. Un retour
 * optimiste ici est un pari sur le presse-papiers : refusé par le navigateur —
 * ce qui arrive hors contexte sécurisé et dans certaines vues intégrées — le
 * vendeur collerait le contenu précédent dans sa conversation, en croyant
 * envoyer le lien de son client. L'échec est donc DIT, et le lien reste
 * sélectionnable à la main.
 */
export function ActionsLigne({
  lien,
  nomClient,
}: {
  readonly lien: string;
  readonly nomClient: string;
}) {
  const t = useTranslations("commandes");
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");

  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lien);
      setEtat("copie");
      window.setTimeout(() => setEtat("repos"), 2000);
    } catch {
      setEtat("echec");
    }
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => void copier()}
        /* 36 x 36, rayon `--radius-sm`, survol sur la teinte violette : le
           `IconButton` du design system. L'ancien carré de 32 venait du canevas
           condamné. */
        className="flex h-9 w-9 items-center justify-center rounded-ds-sm text-ds-texte-tenu transition-colors hover:bg-ds-surface-teinte hover:text-ds-texte-fort"
        title={t("copierLien", { client: nomClient })}
      >
        {etat === "copie" ? (
          <Check aria-hidden="true" size={16} strokeWidth={2.2} className="text-ds-succes-encre" />
        ) : etat === "echec" ? (
          <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} className="text-ds-erreur-encre" />
        ) : (
          <Copy aria-hidden="true" size={16} strokeWidth={1.8} />
        )}
        <span className="sr-only">{t("copierLien", { client: nomClient })}</span>
      </button>

      <a
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 w-9 items-center justify-center rounded-ds-sm text-ds-texte-tenu transition-colors hover:bg-ds-surface-teinte hover:text-ds-texte-fort"
        title={t("ouvrirPage", { client: nomClient })}
      >
        <ExternalLink aria-hidden="true" size={16} strokeWidth={1.8} />
        <span className="sr-only">{t("ouvrirPage", { client: nomClient })}</span>
      </a>

      {etat === "echec" ? (
        <span className="text-[12px] font-semibold text-ds-erreur-encre">{t("copieEchouee")}</span>
      ) : null}
    </div>
  );
}

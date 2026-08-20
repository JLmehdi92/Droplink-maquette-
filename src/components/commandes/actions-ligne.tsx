"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icone } from "@/components/icone";

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
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => void copier()}
        className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-[var(--accent-texte)]"
        title={t("copierLien", { client: nomClient })}
      >
        <Icone
          nom={etat === "copie" ? "done" : etat === "echec" ? "error" : "content_copy"}
          className="text-[18px]"
          titre={t("copierLien", { client: nomClient })}
        />
      </button>

      <a
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-[var(--accent-texte)]"
        title={t("ouvrirPage", { client: nomClient })}
      >
        <Icone
          nom="open_in_new"
          className="text-[18px]"
          titre={t("ouvrirPage", { client: nomClient })}
        />
      </a>

      {etat === "echec" ? (
        <span className="font-label-sm text-label-sm text-error">{t("copieEchouee")}</span>
      ) : null}
    </div>
  );
}

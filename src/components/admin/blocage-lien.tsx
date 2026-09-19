"use client";

import { useRef, useState } from "react";
import { Ban, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BoutonAction } from "@/components/bouton-action";
import { bloquerLien, debloquerLien, type EtatBlocage } from "@/app/[locale]/admin/commandes/actions";

/**
 * BLOQUER OU DÉBLOQUER LE LIEN D'UNE COMMANDE — décision de Wassim, 19/09/2026.
 * Planche `admin` du kit, `#commandes-blocage` (écrite le même jour).
 *
 * Le seul geste que l'administration a sur une commande qu'elle ne voit pas. Le
 * dialogue DIT ce que le client verra avant qu'on agisse, exige un motif, et ne
 * demande pas de recopie : le geste est réversible et ne coupe qu'une page — la gêne
 * se réserve à la suspension d'un compte.
 *
 * Même mécanique que `DialogueSuspension`, pour la même raison mesurée le 29/08 :
 * l'action est APPELÉE comme une fonction, et la page n'est rechargée qu'après que
 * la base a confirmé. Recharger sur un échec effacerait le message et la saisie.
 * Échap ferme — `<dialog>` le fait lui-même — et fermer ne bloque rien.
 */

const INITIAL: EtatBlocage = { statut: "inactif" };

export function BlocageLien({
  commandeId,
  reference,
  bloque,
  motifMin,
  carte = false,
}: {
  readonly commandeId: string;
  readonly reference: string;
  readonly bloque: boolean;
  /** Reçu en propriété : le module qui le définit est `server-only` (voir `DialogueSuspension`). */
  readonly motifMin: number;
  /** Sur la carte du téléphone, la cible fait 44 px ; dans le tableau, 34 comme « Voir ». */
  readonly carte?: boolean;
}) {
  const t = useTranslations("admin.blocage");
  const dialogue = useRef<HTMLDialogElement>(null);
  const [motif, setMotif] = useState("");
  const [etat, setEtat] = useState<EtatBlocage>(INITIAL);
  const [travaille, setTravaille] = useState(false);

  const pret = motif.trim().length >= motifMin;

  function reinitialiser(): void {
    setMotif("");
    setEtat(INITIAL);
  }

  /* L'ÉTAT SE REMET À ZÉRO À L'OUVERTURE AUSSI. Défaut relevé par la revue du
     19/09/2026 : remis à zéro à la fermeture seulement, le résultat d'une requête
     arrivée APRÈS fermeture réécrivait l'erreur, et la tentative suivante s'ouvrait
     sur le message d'une autre. */
  function ouvrir(): void {
    reinitialiser();
    dialogue.current?.showModal();
  }

  async function confirmer(): Promise<void> {
    setTravaille(true);
    const donnees = new FormData();
    donnees.set("commandeId", commandeId);
    donnees.set("motif", motif);
    const resultat = await (bloque ? debloquerLien : bloquerLien)(INITIAL, donnees);
    setEtat(resultat);
    setTravaille(false);
    if (resultat.statut === "ok") window.location.reload();
  }

  // `leading-[normal]` comme la planche (15 px) : hérité du `label`, l'interligne montait à
  // 18 px et décalait tout le dialogue de 3 px (mesuré le 19/09/2026).
  const libelle = "text-[12.5px] leading-[normal] font-semibold text-ds-texte-sourdine";
  const aide = "text-[12.5px] leading-[1.5] text-ds-texte-corps";

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        aria-label={t(bloque ? "debloquerLong" : "bloquerLong", { reference })}
        title={t(bloque ? "debloquer" : "bloquer")}
        className={
          "inline-flex flex-none items-center justify-center rounded-ds-sm border bg-ds-surface-carte align-middle transition-colors " +
          (carte ? "min-h-11 min-w-11 " : "h-[34px] w-[34px] ") +
          (bloque
            ? "border-ds-erreur text-ds-erreur-encre hover:bg-ds-erreur-fond"
            : "border-ds-filet text-ds-texte-sourdine hover:bg-ds-surface-creux hover:text-ds-texte-fort")
        }
      >
        {bloque ? (
          <Link2 aria-hidden="true" size={16} strokeWidth={1.9} />
        ) : (
          <Ban aria-hidden="true" size={16} strokeWidth={1.9} />
        )}
      </button>

      <dialog
        ref={dialogue}
        onClose={reinitialiser}
        /* ⚠️ PENDANT LA REQUÊTE, ÉCHAP NE FERME PAS. Une Server Action ne s'annule pas :
           fermer ferait croire à une annulation, puis la page se rechargerait sur un
           blocage bel et bien fait (revue du 19/09/2026, contrainte 8). */
        onCancel={(e) => {
          if (travaille) e.preventDefault();
        }}
        aria-labelledby={`blocage-${commandeId}`}
        className="m-auto w-[480px] max-w-[calc(100%-32px)] rounded-ds-card-lg bg-ds-surface-carte p-6 text-left shadow-ds-window backdrop:bg-[rgba(11,11,24,.34)]"
      >
        <div className="flex flex-col gap-4">
          <div>
            <h2
              id={`blocage-${commandeId}`}
              className="text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre"
            >
              {t(bloque ? "debloquerLong" : "bloquerLong", { reference })}
            </h2>
            <p className="mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps">
              {t(bloque ? "aideDeblocage" : "aideBlocage")}
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={libelle}>{t("motif")}</span>
            <textarea
              name="motif"
              rows={3}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="w-full resize-none rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[13px] py-[11px] text-[13.5px] leading-[1.55] text-ds-texte-fort outline-none focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]"
            />
            <span className={aide}>{t("motifAide", { n: motifMin })}</span>
          </label>

          {etat.statut === "erreur" ? (
            <p role="alert" className="text-[13px] text-ds-erreur-encre">
              {t(`erreur.${etat.motif}`)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Annuler ne dépend que d'une chose : qu'aucune requête ne soit partie. Tant
                qu'elle court, il n'annulerait rien — le proposer serait mentir. */}
            <button
              type="button"
              disabled={travaille}
              onClick={() => dialogue.current?.close()}
              className="h-11 px-4 text-[14px] font-semibold text-ds-texte-corps transition-colors hover:text-ds-texte-fort disabled:opacity-50"
            >
              {t("annuler")}
            </button>
            <BoutonAction
              type="button"
              enAttente={travaille}
              disabled={!pret}
              onClick={() => void confirmer()}
              libelles={{
                repos: t(bloque ? "debloquer" : "bloquer"),
                enCours: t("enCours"),
                reussi: t(bloque ? "debloquer" : "bloquer"),
                echoue: t(bloque ? "debloquer" : "bloquer"),
              }}
              className={
                "flex h-11 items-center justify-center rounded-ds-card border bg-ds-surface-carte px-5 text-[14px] font-bold transition-colors disabled:opacity-50 " +
                (bloque
                  ? "border-ds-filet-appuye text-ds-texte-fort hover:bg-ds-surface-creux"
                  : "border-ds-erreur text-ds-erreur-encre hover:bg-ds-erreur-fond")
              }
            />
          </div>
        </div>
      </dialog>
    </>
  );
}

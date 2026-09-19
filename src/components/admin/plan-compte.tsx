"use client";

import { useState } from "react";
import { BoutonAction } from "@/components/bouton-action";
import { useTranslations } from "next-intl";
import { definirPlan, type EtatPlan } from "@/app/[locale]/admin/comptes/[id]/actions";

/**
 * LE PLAN DU COMPTE, sur la fiche de l'administration — planche `#compte` et son état ouvert
 * `#compte-plan` du kit admin (19/09/2026).
 *
 * « Quand le client paye il est pro […] c'est à moi de mettre les gens pro » (Wassim, 19/09) :
 * aucun paiement ne passe par DropLink, ce panneau est le seul endroit où un plan change. Le
 * motif est exigé comme pour une suspension — c'est lui qu'on relira si un vendeur demande
 * pourquoi il est Pro, ou pourquoi il ne l'est plus.
 *
 * Même mécanique que `DialogueSuspension`, et pour les mêmes raisons mesurées : l'action est
 * appelée comme une fonction, la page n'est RECHARGÉE qu'après la confirmation de la base, et
 * ni Échap ni « Annuler » ne ferment pendant la requête (elle ne s'annule pas).
 *
 * ⚠️ LE PLAN ILLISIBLE N'EST NI « GRATUIT » NI « PRO ». Une lecture en échec ne propose aucun
 * geste : proposer « Passer en Pro » sur un compte déjà Pro recevrait « déjà dans ce plan », et
 * l'écran aurait affirmé un état que la base n'a pas (contrainte 8).
 */

const INITIAL: EtatPlan = { statut: "inactif" };

export function PlanCompte({
  profilId,
  plan,
  motifMin,
}: {
  readonly profilId: string;
  readonly plan: "gratuit" | "pro" | null;
  /** Reçu en propriété : le module qui le porte est `server-only`. */
  readonly motifMin: number;
}) {
  const t = useTranslations("admin.plan");
  const [etat, setEtat] = useState<EtatPlan>(INITIAL);
  const [travaille, setTravaille] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");

  const vise = plan === "pro" ? "gratuit" : "pro";
  const pret = motif.trim().length >= motifMin;
  const geste = vise === "pro" ? t("passerPro") : t("passerGratuit");

  async function confirmer(): Promise<void> {
    setTravaille(true);
    const donnees = new FormData();
    donnees.set("profilId", profilId);
    donnees.set("plan", vise);
    donnees.set("motif", motif);
    const resultat = await definirPlan(INITIAL, donnees);
    setEtat(resultat);
    setTravaille(false);
    if (resultat.statut === "ok") window.location.reload();
  }

  function fermer(): void {
    setOuvert(false);
    setMotif("");
  }

  /* Passer en Pro prend le contour de l'accent, comme la planche. Repasser en gratuit n'est pas
     un geste dangereux — il fait revenir la carte DropLink — : contour neutre. */
  const bouton =
    "flex h-11 items-center justify-center rounded-ds-card border bg-ds-surface-carte text-[14px] font-bold transition-colors disabled:opacity-50 " +
    (vise === "pro"
      ? "border-ds-accent text-ds-accent-encre hover:bg-ds-surface-teinte"
      : "border-ds-filet-appuye text-ds-texte-fort hover:bg-ds-surface-creux");

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && ouvert && !travaille) fermer();
      }}
    >
      <div className="mb-[18px]">
        <h2 className="text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre">
          {t("titre")}
        </h2>
        <p className="mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps">{t("aide")}</p>
      </div>

      {/* La rangée de la planche (`AccRow`, première du panneau) : sans filet ni retrait en
          haut, 11 px en bas — c'est eux qui posent le bouton 42 px sous le libellé. */}
      <div className="flex items-center gap-3.5 pb-[11px]">
        <span className="text-[13.5px] text-ds-texte-corps">{t("planActuel")}</span>
        <span className="flex-1" />
        <span className="text-right text-[14px] font-semibold text-ds-texte-fort">
          {plan === null ? t("illisible") : t(`plans.${plan}`)}
        </span>
      </div>

      {plan === null ? null : !ouvert ? (
        <>
          <button
            type="button"
            onClick={() => {
              setEtat(INITIAL);
              setOuvert(true);
            }}
            className={bouton + " mt-3.5 w-full px-1.5 py-px"}
          >
            {geste}
          </button>
          {etat.statut === "ok" ? (
            <p role="status" className="mt-2 text-[13px] text-ds-texte-corps">
              {t("fait")}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-3.5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-ds-texte-sourdine">{t("motif")}</span>
            <textarea
              name="motif"
              rows={3}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="w-full resize-none rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[13px] py-[11px] text-[13.5px] leading-[1.55] text-ds-texte-fort outline-none focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]"
            />
            <span className="text-[12.5px] leading-[1.5] text-ds-texte-corps">
              {t("motifAide", { n: motifMin })}
            </span>
          </label>

          {etat.statut === "erreur" ? (
            <p role="alert" className="text-[13px] text-ds-erreur-encre">
              {t(`erreur.${etat.motif}`)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={travaille}
              onClick={fermer}
              className="h-11 px-4 text-[14px] font-semibold text-ds-texte-corps transition-colors hover:text-ds-texte-fort disabled:opacity-50"
            >
              {t("annuler")}
            </button>
            <BoutonAction
              type="button"
              enAttente={travaille}
              disabled={!pret}
              onClick={() => void confirmer()}
              libelles={{ repos: geste, enCours: t("enCours"), reussi: geste, echoue: geste }}
              className={bouton + " px-5"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

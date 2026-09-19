"use client";

import { useRef, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { BoutonAction } from "@/components/bouton-action";
import {
  debloquerLien,
  lireContestation,
  refuserUneContestation,
  type EtatBlocage,
  type EtatRefus,
} from "@/app/[locale]/admin/commandes/actions";
import type { ContestationAdmin } from "@/lib/audit/contestation";

/**
 * LA CONTESTATION D'UN LIEN BLOQUÉ, CÔTÉ ADMINISTRATION — planche `#commandes-contestation`
 * (19/09/2026).
 *
 * Remplace le bouton de déblocage sur une ligne dont une contestation attend. L'administrateur
 * LIT ce que le vendeur lui envoie — la lecture part AU GESTE (l'ouverture du dialogue), jamais
 * au rendu de la liste : c'est elle qui écrit la consultation au journal. Puis il répond, en une
 * phrase que le vendeur lira : refuser (le lien reste coupé) ou débloquer (le même lien revient).
 *
 * Même mécanique que `BlocageLien` : `<dialog>` natif, Échap et « Annuler » sans effet pendant la
 * requête, état remis à zéro à chaque ouverture, rechargement après la seule confirmation.
 */

type Lecture =
  | { readonly etat: "attente" }
  | { readonly etat: "ok"; readonly contestation: ContestationAdmin }
  | { readonly etat: "erreur"; readonly motif: "introuvable" | "lecture" };

type Resultat = { statut: "inactif" } | EtatBlocage | EtatRefus;
const INITIAL: Resultat = { statut: "inactif" };

export function ContestationLien({
  commandeId,
  reference,
  motifMin,
  carte = false,
}: {
  readonly commandeId: string;
  readonly reference: string;
  readonly motifMin: number;
  readonly carte?: boolean;
}) {
  const t = useTranslations("admin.contestation");
  const format = useFormatter();
  const dialogue = useRef<HTMLDialogElement>(null);
  const [lecture, setLecture] = useState<Lecture>({ etat: "attente" });
  const [reponse, setReponse] = useState("");
  const [resultat, setResultat] = useState<Resultat>(INITIAL);
  const [travaille, setTravaille] = useState<"refuser" | "debloquer" | null>(null);

  const pret = reponse.trim().length >= motifMin && lecture.etat === "ok";

  async function ouvrir(): Promise<void> {
    setReponse("");
    setResultat(INITIAL);
    setLecture({ etat: "attente" });
    dialogue.current?.showModal();
    const r = await lireContestation(commandeId);
    setLecture(r.statut === "ok" ? { etat: "ok", contestation: r.contestation } : { etat: "erreur", motif: r.motif });
  }

  async function repondre(geste: "refuser" | "debloquer"): Promise<void> {
    if (lecture.etat !== "ok") return;
    setTravaille(geste);
    const donnees = new FormData();
    let r: Resultat;
    if (geste === "refuser") {
      donnees.set("contestationId", lecture.contestation.id);
      donnees.set("reponse", reponse);
      r = await refuserUneContestation({ statut: "inactif" }, donnees);
    } else {
      // Débloquer clôt la contestation en « acceptée » : le motif du déblocage est la réponse
      // que le vendeur lit (migration 168).
      donnees.set("commandeId", commandeId);
      donnees.set("motif", reponse);
      r = await debloquerLien({ statut: "inactif" }, donnees);
    }
    setResultat(r);
    setTravaille(null);
    if (r.statut === "ok") window.location.reload();
  }

  const choix =
    "inline-flex h-11 flex-[1_1_180px] items-center justify-center rounded-ds-card border bg-ds-surface-carte px-[18px] text-[14px] font-bold transition-colors disabled:opacity-50 ";

  return (
    <>
      <button
        type="button"
        onClick={() => void ouvrir()}
        aria-label={t("voir", { ref: reference })}
        title={t("voir", { ref: reference })}
        className={
          "inline-flex flex-none items-center justify-center rounded-ds-sm border border-ds-erreur bg-ds-surface-carte align-middle text-ds-erreur-encre transition-colors hover:bg-ds-erreur-fond " +
          (carte ? "min-h-11 min-w-11" : "h-[34px] w-[34px]")
        }
      >
        <MessageSquareWarning aria-hidden="true" size={16} strokeWidth={1.9} />
      </button>

      <dialog
        ref={dialogue}
        onClose={() => {
          setReponse("");
          setResultat(INITIAL);
        }}
        onCancel={(e) => {
          if (travaille !== null) e.preventDefault();
        }}
        aria-labelledby={`contestation-${commandeId}`}
        className="m-auto max-h-[calc(100%-32px)] w-[520px] max-w-[calc(100%-32px)] overflow-y-auto rounded-ds-card-lg bg-ds-surface-carte p-6 text-left shadow-ds-window backdrop:bg-[rgba(11,11,24,.34)]"
      >
        <div className="flex flex-col gap-4">
          <div>
            <h2
              id={`contestation-${commandeId}`}
              className="text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre"
            >
              {t("titre", { ref: reference })}
            </h2>
            {lecture.etat === "ok" ? (
              <p className="mt-[3px] text-[13px] leading-[1.55] text-ds-texte-corps">
                {t("aide", {
                  date: format.dateTime(new Date(lecture.contestation.creeeLe), { dateStyle: "long" }),
                  rang: lecture.contestation.rang,
                })}
              </p>
            ) : null}
          </div>

          {lecture.etat === "attente" ? (
            <p role="status" className="text-[13px] text-ds-texte-corps">
              {t("lecture")}
            </p>
          ) : lecture.etat === "erreur" ? (
            <p role="alert" className="text-[13px] text-ds-erreur-encre">
              {t(`erreur.${lecture.motif}`)}
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-3.5 rounded-ds-card border border-ds-filet bg-ds-surface-page p-3.5">
              <p className="min-w-0 flex-[1_1_220px] text-[13.5px] leading-[1.55] whitespace-pre-line text-ds-texte-fort">
                {lecture.contestation.message}
              </p>
              {lecture.contestation.imageUrl === null ? null : (
                <a
                  href={lecture.contestation.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("image")}
                  className="block h-24 w-24 flex-none overflow-hidden rounded-ds-md bg-ds-surface-creux"
                >
                  {/* URL R2 SIGNÉE, à expiration : `next/image` la remettrait en cache derrière sa
                      propre adresse, au-delà de la signature — même raison que les médias. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lecture.contestation.imageUrl} alt="" className="h-full w-full object-cover" />
                </a>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] leading-[normal] font-semibold text-ds-texte-sourdine">{t("reponse")}</span>
            <textarea
              name="reponse"
              rows={3}
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              className="w-full resize-none rounded-ds-sm border border-ds-filet bg-ds-surface-carte px-[13px] py-[11px] text-[13.5px] leading-[1.55] text-ds-texte-fort outline-none focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]"
            />
            <span className="text-[12.5px] leading-[1.5] text-ds-texte-corps">{t("reponseAide", { n: motifMin })}</span>
          </label>

          {resultat.statut === "erreur" ? (
            <p role="alert" className="text-[13px] text-ds-erreur-encre">
              {t(`erreur.${resultat.motif === "saisie" || resultat.motif === "deja" || resultat.motif === "introuvable" ? resultat.motif : "ecriture"}`)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <BoutonAction
              type="button"
              enAttente={travaille === "refuser"}
              disabled={!pret || travaille !== null}
              onClick={() => void repondre("refuser")}
              libelles={{ repos: t("refuser"), enCours: t("enCours"), reussi: t("refuser"), echoue: t("refuser") }}
              className={choix + "border-ds-filet-appuye text-ds-texte-fort hover:bg-ds-surface-creux"}
            />
            <BoutonAction
              type="button"
              enAttente={travaille === "debloquer"}
              disabled={!pret || travaille !== null}
              onClick={() => void repondre("debloquer")}
              libelles={{ repos: t("debloquer"), enCours: t("enCours"), reussi: t("debloquer"), echoue: t("debloquer") }}
              className={choix + "border-ds-accent text-ds-accent-encre hover:bg-ds-surface-teinte"}
            />
            <button
              type="button"
              disabled={travaille !== null}
              onClick={() => dialogue.current?.close()}
              className="h-11 flex-[1_1_100%] px-4 text-[14px] font-semibold text-ds-texte-corps transition-colors hover:text-ds-texte-fort disabled:opacity-50"
            >
              {t("annuler")}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

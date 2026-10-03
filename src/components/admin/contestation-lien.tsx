"use client";

import { useId, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { DialogueAdmin, confirmerEtRecharger, fermerDialogue, secouerDialogue } from "@/components/admin/dialogue-admin";
import { useTranslations } from "next-intl";
import { useFormateur } from "@/lib/format/formateur-client";
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
}: {
  readonly commandeId: string;
  readonly reference: string;
  readonly motifMin: number;
}) {
  const t = useTranslations("admin.contestation");
  const td = useTranslations("admin.dialogue");
  const idTitre = useId();
  const format = useFormateur();
  const dialogue = useRef<HTMLDialogElement>(null);
  const [lecture, setLecture] = useState<Lecture>({ etat: "attente" });
  const [reponse, setReponse] = useState("");
  const [resultat, setResultat] = useState<Resultat>(INITIAL);
  const [travaille, setTravaille] = useState<"refuser" | "debloquer" | null>(null);
  const [refus, setRefus] = useState<string | null>(null);


  async function ouvrir(): Promise<void> {
    setReponse("");
    setResultat(INITIAL);
    setRefus(null);
    setLecture({ etat: "attente" });
    dialogue.current?.showModal();
    const r = await lireContestation(commandeId);
    setLecture(r.statut === "ok" ? { etat: "ok", contestation: r.contestation } : { etat: "erreur", motif: r.motif });
  }

  async function repondre(geste: "refuser" | "debloquer"): Promise<void> {
    if (lecture.etat !== "ok") return;
    // Comme la maquette (`admin.js`) : « Refuser » dit « La réponse est trop courte. » sans
    // secousse ; « Débloquer » est un motif de déblocage — « Le motif est trop court. », secoué.
    if (reponse.trim().length < motifMin) {
      if (geste === "refuser") {
        setRefus(t("reponseCourte"));
      } else {
        setRefus(td("motifCourt"));
        secouerDialogue(dialogue.current);
      }
      return;
    }
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
    if (r.statut === "ok") confirmerEtRecharger(dialogue.current, t(geste === "refuser" ? "annonceRefusee" : "annonceAcceptee"));
  }

  return (
    <>
      {/* LA PASTILLE « CONTESTATION » DE LA MAQUETTE, cliquable : elle dit qu'une
          contestation attend ET ouvre sa lecture — tracée au geste, jamais au rendu. */}
      <button
        type="button"
        onClick={() => void ouvrir()}
        aria-label={t("voir", { ref: reference })}
        className="adm-pastille-contest"
      >
        <MessageCircle aria-hidden="true" className="ic" />
        {t("pastille")}
      </button>

      <DialogueAdmin
        refDialogue={dialogue}
        idTitre={idTitre}
        titre={t("titre", { ref: reference })}
        aide={
          lecture.etat === "ok"
            ? t("aide", {
                // « 30 sept. 2026 », comme la maquette et l'alerte du panneau.
                date: format.dateTime(new Date(lecture.contestation.creeeLe), { day: "numeric", month: "short", year: "numeric" }),
                rang: lecture.contestation.rang,
              })
            : undefined
        }
        travaille={travaille !== null}
        fermer={t("annuler")}
        onClose={() => {
          setReponse("");
          setResultat(INITIAL);
        }}
      >
        {lecture.etat === "attente" ? (
          <p role="status" className="adm-dialogue__aide">
            {t("lecture")}
          </p>
        ) : lecture.etat === "erreur" ? (
          <p role="alert" className="adm-dialogue__erreur">
            {t(`erreur.${lecture.motif}`)}
          </p>
        ) : (
          <div className="adm-contest">
            <p className="whitespace-pre-line">{lecture.contestation.message}</p>
            {lecture.contestation.imageUrl === null ? null : (
              <a
                href={lecture.contestation.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("image")}
                className="mt-2.5 block h-24 w-24 overflow-hidden rounded-[10px] bg-[var(--creux)]"
              >
                {/* URL R2 SIGNÉE, à expiration : `next/image` la remettrait en cache
                    derrière sa propre adresse, au-delà de la signature. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lecture.contestation.imageUrl} alt="" className="h-full w-full object-cover" />
              </a>
            )}
          </div>
        )}

        <label className="adm-champ">
          <span>{t("reponse")}</span>
          <textarea name="reponse" rows={3} autoFocus value={reponse} onChange={(e) => {
              setReponse(e.target.value);
              setRefus(null);
            }}
          />
          <small>{t("reponseAide", { n: motifMin })}</small>
        </label>
        {refus === null ? null : (
          <p role="alert" className="adm-dialogue__erreur">
            {refus}
          </p>
        )}

        {resultat.statut === "erreur" ? (
          <p role="alert" className="adm-dialogue__erreur">
            {t(`erreur.${resultat.motif === "saisie" || resultat.motif === "deja" || resultat.motif === "introuvable" ? resultat.motif : "ecriture"}`)}
          </p>
        ) : null}

        {/* DEUX ISSUES : refuser (le lien reste coupé, la réponse part au vendeur)
            ou débloquer (la réponse devient le motif du déblocage). */}
        <footer>
          <BoutonAction
            type="button"
            enAttente={travaille === "refuser"}
            disabled={lecture.etat !== "ok" || travaille !== null}
            onClick={() => void repondre("refuser")}
            libelles={{ repos: t("refuser"), enCours: t("enCours"), reussi: t("refuser"), echoue: t("refuser") }}
            className="bouton-outil adm-refuser disabled:opacity-50"
          />
          <button type="button" className="bouton-outil" disabled={travaille !== null} onClick={() => fermerDialogue(dialogue.current)}>
            {t("annuler")}
          </button>
          <BoutonAction
            type="button"
            enAttente={travaille === "debloquer"}
            disabled={lecture.etat !== "ok" || travaille !== null}
            onClick={() => void repondre("debloquer")}
            libelles={{ repos: t("debloquer"), enCours: t("enCours"), reussi: t("debloquer"), echoue: t("debloquer") }}
            className="adm-confirmer disabled:opacity-50"
          />
        </footer>
      </DialogueAdmin>
    </>
  );
}

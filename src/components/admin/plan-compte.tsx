"use client";

import { useId, useRef, useState } from "react";
import { DialogueAdmin, fermerDialogue, secouerDialogue } from "@/components/admin/dialogue-admin";
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
  readonly motifMin: number;
}) {
  const t = useTranslations("admin.plan");
  const idTitre = useId();
  const dialogue = useRef<HTMLDialogElement>(null);
  const [etat, setEtat] = useState<EtatPlan>(INITIAL);
  const [travaille, setTravaille] = useState(false);
  const [motif, setMotif] = useState("");
  const [refus, setRefus] = useState<string | null>(null);
  const td = useTranslations("admin.dialogue");

  // LE PLAN VISÉ VOYAGE, pas « l'inverse de l'actuel » : deux onglets ouverts ne
  // s'annulent pas, la base répond « déjà dans ce plan ».
  const vise = plan === "pro" ? "gratuit" : "pro";
  const pret = motif.trim().length >= motifMin;
  const geste = vise === "pro" ? t("passerPro") : t("passerGratuit");

  async function confirmer(): Promise<void> {
    if (!pret) {
      setRefus(td("motifCourt"));
      secouerDialogue(dialogue.current);
      return;
    }
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

  return (
    <section className="bloc adm-bloc" aria-labelledby={idTitre + "-bloc"}>
      <header className="bloc__tete">
        <div>
          <h2 id={idTitre + "-bloc"}>{t("titre")}</h2>
        </div>
      </header>
      <p className="adm-texte">{t("aide")}</p>
      <div className="adm-plan-ligne">
        <span>{t("planActuel")}</span>
        {/* ILLISIBLE, AUCUN GESTE : proposer de changer un plan qu'on n'a pas su
            lire reviendrait à agir à l'aveugle. */}
        <b>{plan === null ? t("illisible") : t(`plans.${plan}`)}</b>
        {plan === null ? null : (
          <button
            type="button"
            className="bouton-outil"
            onClick={() => {
              setEtat(INITIAL);
              setMotif("");
              setRefus(null);
              dialogue.current?.showModal();
            }}
          >
            {geste}
          </button>
        )}
      </div>
      {etat.statut === "ok" ? (
        <p role="status" className="adm-texte pb-4">
          {t("fait")}
        </p>
      ) : null}

      <DialogueAdmin
        refDialogue={dialogue}
        idTitre={idTitre}
        titre={geste}
        aide={t("aide")}
        travaille={travaille}
        fermer={t("annuler")}
        onClose={() => setMotif("")}
      >
        <label className="adm-champ">
          <span>{t("motif")}</span>
          <textarea name="motif" rows={3} autoFocus value={motif} onChange={(e) => {
              setMotif(e.target.value);
              setRefus(null);
            }}
          />
          <small>{t("motifAide", { n: motifMin })}</small>
        </label>
        {refus === null ? null : (
          <p role="alert" className="adm-dialogue__erreur">
            {refus}
          </p>
        )}
        {etat.statut === "erreur" ? (
          <p role="alert" className="adm-dialogue__erreur">
            {t(`erreur.${etat.motif}`)}
          </p>
        ) : null}
        <footer>
          <button type="button" className="bouton-outil" disabled={travaille} onClick={() => fermerDialogue(dialogue.current)}>
            {t("annuler")}
          </button>
          <BoutonAction
            type="button"
            enAttente={travaille}
            onClick={() => void confirmer()}
            libelles={{ repos: geste, enCours: t("enCours"), reussi: geste, echoue: geste }}
            className="adm-confirmer disabled:opacity-50"
          />
        </footer>
      </DialogueAdmin>
    </section>
  );
}

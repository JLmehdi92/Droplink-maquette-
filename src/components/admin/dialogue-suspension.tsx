"use client";

import { DialogueAdmin, confirmerEtRecharger, fermerDialogue, secouerDialogue } from "@/components/admin/dialogue-admin";
import { useId, useRef, useState } from "react";
import { BoutonAction } from "@/components/bouton-action";
import { useTranslations } from "next-intl";
import {
  reactiver,
  suspendre,
  type EtatSuspension,
} from "@/app/[locale]/admin/comptes/[id]/actions";

/**
 * LE DIALOGUE DE SUSPENSION.
 *
 * LA GÊNE EST LE MÉCANISME, PAS UN EFFET SECONDAIRE.
 *
 * Cette confirmation n'existe pas pour rattraper une faute de frappe : elle
 * existe pour FORCER À LIRE quel compte on suspend. Une case à cocher se coche
 * sans regarder — on l'a tous fait. Un email se recopie en le regardant, et
 * c'est tout ce qu'on demande.
 *
 * LE COLLAGE EST BLOQUÉ pour la même raison. Coller l'email, c'est reproduire
 * une chaîne sans la lire, donc contourner exactement ce que le geste cherche à
 * obtenir. Le blocage est ANNONCÉ à l'écran : un champ qui refuse le collage
 * sans explication passe pour un bogue, et l'on cherche alors comment le
 * contourner plutôt que pourquoi il est là.
 *
 * ⚠️ Il reste un chemin sans friction — un administrateur peut toujours appeler
 * la fonction en base directement. C'est assumé : cette confirmation protège
 * contre l'INATTENTION, jamais contre la détermination. Ce qui protège contre la
 * détermination, c'est le journal d'audit, qui consigne le geste avec son auteur
 * et son motif.
 *
 * ÉCHAP FERME, et la fermeture ne suspend rien : la sortie doit toujours être
 * plus facile que l'action.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ L'ACTION EST APPELÉE DIRECTEMENT, ET L'ÉCRAN SE RECHARGE ENSUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DÉFAUT MESURÉ LE 29/08/2026, en pilotant l'écran sur un vrai compte. Avec
 * `<form action={dispatch}>` de `useActionState` : le compte EST suspendu — la
 * colonne passe à `suspended`, l'audit est inscrit, la page est même re-rendue
 * côté serveur (une seconde trace `comptes.detail` suit immédiatement) — et
 * l'écran ne montre RIEN. Pas de message, pas de pilule « Suspendu », le
 * dialogue reste ouvert avec son bouton « Suspendre ». Observé sept secondes
 * durant.
 *
 * C'est le pire endroit du produit où ce défaut pouvait vivre : la coupure de
 * suspension est la capacité technique qui fonde notre statut d'hébergeur.
 * Un administrateur qui ne voit rien recommence — ou conclut que ça n'a pas
 * marché, alors que si.
 *
 * Le même défaut a été trouvé le même jour sur l'écran des paramètres, par la
 * même mesure : `useActionState` ne rend jamais son résultat au composant, et
 * `router.refresh()` ne redessine rien. On cesse donc de dépendre d'une
 * invalidation : l'action est appelée comme une fonction, et une fois qu'elle a
 * confirmé, la page est RECHARGÉE. Grossier, mais c'est le seul mécanisme dont
 * on ait établi qu'il montre l'état réel — et cette décision-là se prend une
 * fois par mois, pas dix fois par minute.
 */

const INITIAL: EtatSuspension = { statut: "inactif" };

/**
 * LE BOUTON DE CONFIRMATION DE LA MODALE.
 *
 * ⚠️ IL S'APPELAIT `BoutonAction`, ET C'ÉTAIT UN HOMONYME DU COMPOSANT PARTAGÉ.
 * Deux composants du même nom, l'un local et l'autre dans
 * `@/components/bouton-action`, avec des propriétés différentes : relever « qui
 * porte un état d'attente » par une recherche du nom donnait un faux positif
 * ici. Renommé, et son travail délégué au vrai.
 *
 * ⚠️ IL N'ANNONCE NI RÉUSSITE NI ÉCHEC, et ses deux libellés répètent celui du
 * repos. Une suspension réussie FERME la modale et redessine la fiche ; un échec
 * s'affiche dans le message de la modale, qui nomme le motif. Un « Échoué » sur
 * le bouton remplacerait un motif par un constat.
 */
function BoutonConfirmation({
  libelle,
  enCours,
  danger,
  desactive,
  travaille,
  onConfirmer,
}: {
  readonly libelle: string;
  readonly enCours: string;
  readonly danger: boolean;
  readonly desactive: boolean;
  readonly travaille: boolean;
  readonly onConfirmer: () => void;
}) {
  return (
    <BoutonAction
      type="button"
      enAttente={travaille}
      disabled={desactive}
      onClick={onConfirmer}
      libelles={{ repos: libelle, enCours, reussi: libelle, echoue: libelle }}
      /* ⚠️ `bg-error text-on-error` ET `bg-primary text-on-primary` ÉTAIENT DES
         JETONS DE L'ANCIEN CANEVAS — un bouton noir, ou rouge #ba1a1a, au milieu
         d'un écran du design system. Le geste dangereux prend le contour rouge
         du bouton qui l'ouvre : même couleur au départ et à l'arrivée. */
      className={(danger ? "adm-danger" : "adm-confirmer") + " disabled:opacity-50"}
    />
  );
}

export function DialogueSuspension({
  profilId,
  email,
  suspendu,
  motifMin,
}: {
  readonly profilId: string;
  readonly email: string;
  readonly suspendu: boolean;
  /**
   * REÇU EN PROPRIÉTÉ, jamais importé : le module qui porte cette constante est
   * `server-only`, et la barrière vaut mieux qu'une fuite silencieuse.
   */
  readonly motifMin: number;
}) {
  const t = useTranslations("admin.suspension");
  const idTitre = useId();
  const dialogue = useRef<HTMLDialogElement>(null);
  const [etat, setEtat] = useState<EtatSuspension>(INITIAL);
  const [travaille, setTravaille] = useState(false);
  const [motif, setMotif] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [colle, setColle] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const td = useTranslations("admin.dialogue");

  const motifSuffisant = motif.trim().length >= motifMin;
  // La comparaison ignore la casse et les espaces de bord : un email n'y est pas
  // sensible, et refuser « Alice@ » pour « alice@ » ferait douter de l'outil.
  const confirme = confirmation.trim().toLowerCase() === email.trim().toLowerCase();
  const pret = suspendu ? motifSuffisant : motifSuffisant && confirme;

  function reinitialiser(): void {
    setMotif("");
    setConfirmation("");
    setColle(false);
    setRefus(null);
  }

  async function confirmer(): Promise<void> {
    if (!pret) {
      setRefus(!motifSuffisant ? td("motifCourt") : td("recopieDifferente"));
      secouerDialogue(dialogue.current);
      return;
    }
    setTravaille(true);
    const donnees = new FormData();
    donnees.set("profilId", profilId);
    donnees.set("motif", motif);
    if (!suspendu) donnees.set("confirmation", confirmation);

    const resultat = await (suspendu ? reactiver : suspendre)(INITIAL, donnees);
    setEtat(resultat);
    setTravaille(false);
    // ON NE RECHARGE QU'APRÈS UNE CONFIRMATION DE LA BASE. Recharger sur un
    // échec effacerait le message d'erreur ET la saisie.
    if (resultat.statut === "ok") confirmerEtRecharger(dialogue.current, t(suspendu ? "annonceReactive" : "annonceSuspendu"));
  }

  const titre = suspendu ? t("titreReactivation") : t("titreSuspension");

  /* LE TITRE ET CE QUE LE GESTE FAIT SONT LISIBLES AVANT D'OUVRIR : les
     découvrir une fois le dialogue ouvert, ce serait demander de s'engager pour
     savoir à quoi. */
  return (
    <section className={"bloc adm-bloc" + (suspendu ? "" : " adm-bloc--danger")} aria-labelledby={idTitre + "-bloc"}>
      <header className="bloc__tete">
        <div>
          <h2 id={idTitre + "-bloc"}>{titre}</h2>
        </div>
      </header>
      <p className="adm-texte">{suspendu ? t("aideReactivation") : t("aideSuspension")}</p>
      <button
        type="button"
        className={suspendu ? "bouton-outil" : "adm-danger"}
        onClick={() => {
          // L'état repart de zéro à l'OUVERTURE : une erreur arrivée après une
          // fermeture ne doit pas accueillir la tentative suivante (revue du 19/09/2026).
          setEtat(INITIAL);
          reinitialiser();
          dialogue.current?.showModal();
        }}
      >
        {suspendu ? t("rouvrir") : t("ouvrir")}
      </button>
      {etat.statut === "ok" ? (
        <p role="status" className="adm-texte pb-4">
          {t("fait")}
        </p>
      ) : null}

      <DialogueAdmin
        refDialogue={dialogue}
        idTitre={idTitre}
        titre={titre}
        aide={suspendu ? t("aideReactivation") : t("aideSuspension")}
        travaille={travaille}
        fermer={t("annuler")}
        onClose={reinitialiser}
      >
        {/* LE MOTIF EST LA PIÈCE QU'ON DEMANDERAIT EN CAS DE LITIGE. Il s'affiche
            en clair sur la ligne du journal. */}
        <label className="adm-champ">
          <span>{t("motif")}</span>
          <textarea name="motif" rows={3} autoFocus value={motif}
            onChange={(e) => {
              setMotif(e.target.value);
              setRefus(null);
            }}
          />
          <small>{t("motifAide", { n: motifMin })}</small>
        </label>

        {!suspendu ? (
          <label className="adm-champ">
            <span>{t("recopier")}</span>
            <input
              name="confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={email}
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setRefus(null);
              }}
              onDrop={(e) => {
                // Déposer un texte glissé, c'est coller sans le dire.
                e.preventDefault();
                setColle(true);
              }}
              onPaste={(e) => {
                // COLLER, C'EST REPRODUIRE SANS LIRE — donc contourner exactement ce
                // que ce champ cherche à obtenir. Le refus est annoncé juste en
                // dessous : un champ qui refuse sans expliquer passe pour un bogue.
                e.preventDefault();
                setColle(true);
              }}
            />
            <small role={colle ? "alert" : undefined}>{colle ? t("collageRefuse") : t("collageAide")}</small>
          </label>
        ) : null}

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
          {/* ANNULER N'EST DÉSACTIVÉ QUE PENDANT LA REQUÊTE : il n'annulerait
              alors rien, et le proposer serait mentir. */}
          <button type="button" className="bouton-outil" disabled={travaille} onClick={() => fermerDialogue(dialogue.current)}>
            {t("annuler")}
          </button>
          <BoutonConfirmation
            libelle={suspendu ? t("confirmerReactivation") : t("confirmerSuspension")}
            enCours={t("enCours")}
            danger={!suspendu}
            desactive={false}
            travaille={travaille}
            onConfirmer={() => void confirmer()}
          />
        </footer>
      </DialogueAdmin>
    </section>
  );
}

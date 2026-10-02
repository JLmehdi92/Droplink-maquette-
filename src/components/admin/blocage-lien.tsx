"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BoutonAction } from "@/components/bouton-action";
import { DialogueAdmin, confirmerEtRecharger, fermerDialogue, secouerDialogue } from "@/components/admin/dialogue-admin";
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
  // UNIQUE PAR INSTANCE (26/09/2026) : la ligne est rendue deux fois — tableau du bureau et
  // carte du téléphone —, et `blocage-<commande>` donnait deux titres au même identifiant.
  const idTitre = useId();
  const t = useTranslations("admin.blocage");
  const dialogue = useRef<HTMLDialogElement>(null);
  const [motif, setMotif] = useState("");
  const [etat, setEtat] = useState<EtatBlocage>(INITIAL);
  const [travaille, setTravaille] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const td = useTranslations("admin.dialogue");

  const pret = motif.trim().length >= motifMin;

  function reinitialiser(): void {
    setMotif("");
    setEtat(INITIAL);
    setRefus(null);
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
    if (!pret) {
      setRefus(td("motifCourt"));
      secouerDialogue(dialogue.current);
      return;
    }
    setTravaille(true);
    const donnees = new FormData();
    donnees.set("commandeId", commandeId);
    donnees.set("motif", motif);
    const resultat = await (bloque ? debloquerLien : bloquerLien)(INITIAL, donnees);
    setEtat(resultat);
    setTravaille(false);
    if (resultat.statut === "ok") confirmerEtRecharger(dialogue.current, t(bloque ? "annonceDebloque" : "annonceBloque"));
  }

  // `leading-[normal]` comme la planche (15 px) : hérité du `label`, l'interligne montait à
  // 18 px et décalait tout le dialogue de 3 px (mesuré le 19/09/2026).
  return (
    <>
      {/* UN LIBELLÉ EN TOUTES LETTRES, comme la maquette : l'icône seule d'avant
          (« interdit ») demandait de survoler pour savoir ce qu'elle faisait. */}
      <button
        type="button"
        onClick={ouvrir}
        aria-label={t(bloque ? "debloquerLong" : "bloquerLong", { reference })}
        className={"bouton-outil" + (carte ? " w-full justify-center" : "")}
      >
        {t(bloque ? "debloquer" : "bloquer")}
      </button>

      <DialogueAdmin
        refDialogue={dialogue}
        idTitre={idTitre}
        titre={t(bloque ? "debloquerLong" : "bloquerLong", { reference })}
        aide={t(bloque ? "aideDeblocage" : "aideBlocage")}
        travaille={travaille}
        fermer={t("annuler")}
        onClose={reinitialiser}
      >
        <label className="adm-champ">
          <span>{t("motif")}</span>
          <textarea name="motif" rows={3} autoFocus value={motif} onChange={(e) => {
              setMotif(e.target.value);
              setRefus(null);
            }}
          />
          <small>{t(bloque ? "motifAide" : "motifAideBlocage", { n: motifMin })}</small>
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
          {/* Annuler ne dépend que d'une chose : qu'aucune requête ne soit partie. */}
          <button type="button" className="bouton-outil" disabled={travaille} onClick={() => fermerDialogue(dialogue.current)}>
            {t("annuler")}
          </button>
          <BoutonAction
            type="button"
            enAttente={travaille}
            onClick={() => void confirmer()}
            libelles={{
              repos: t(bloque ? "debloquer" : "bloquer"),
              enCours: t("enCours"),
              reussi: t(bloque ? "debloquer" : "bloquer"),
              echoue: t(bloque ? "debloquer" : "bloquer"),
            }}
            className={(bloque ? "adm-confirmer" : "adm-danger") + " disabled:opacity-50"}
          />
        </footer>
      </DialogueAdmin>
    </>
  );
}

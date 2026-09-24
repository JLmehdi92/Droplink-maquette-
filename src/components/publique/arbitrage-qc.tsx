"use client";

import { useState } from "react";

/**
 * L'ARBITRAGE QC, vu par celui qui consulte le lien.
 *
 * L'INTERFACE N'AFFIRME JAMAIS CE QUE LA BASE N'A PAS ENREGISTRÉ. Il n'y a donc
 * aucun retour optimiste ici : l'état affiché ne change qu'après confirmation du
 * serveur, et un échec revient à l'état confirmé EN LE DISANT. Un pari sur le
 * serveur, perdu, se manifeste chez le destinataire des semaines plus tard, sans
 * casser aucun test et sans apparaître dans aucun journal.
 *
 * LA DÉCISION RESTE MODIFIABLE. Un client qui regarde mieux ses photos et change
 * d'avis est un cas normal ; c'est l'HISTORIQUE de ses décisions qui ne doit pas
 * se perdre, et il est écrit en base, pas ici.
 *
 * Les libellés arrivent en PROPRIÉTÉS : aucun catalogue de traduction n'est
 * expédié au navigateur pour cette page.
 */

export type EtatQc = "en_attente" | "approuve" | "refuse";

export function ArbitrageQc({
  jeton,
  etatInitial,
  remplissage,
  surRemplissage,
  libelles,
}: {
  readonly jeton: string;
  readonly etatInitial: EtatQc;
  /**
   * Le fond du bouton et l'écriture qui va dessus, RÉSOLUS EN AMONT.
   *
   * Deux propriétés et non une : c'est un bouton plein, donc l'accent y fait le
   * FOND, et un blanc posé d'office sur un jaune vif se lit à 1,5:1. La
   * conformité doit être obtenue automatiquement — le vendeur n'a pas à chercher
   * « une couleur qui marche », et personne ne verra jamais la page qu'il aura
   * rendue illisible sans le savoir.
   */
  readonly remplissage: string;
  readonly surRemplissage: string;
  readonly libelles: {
    readonly texte: string;
    readonly approuver: string;
    readonly refuser: string;
    readonly commentaire: string;
    readonly envoi: string;
    readonly approuve: string;
    readonly refuse: string;
    readonly annuler: string;
    readonly modifier: string;
    readonly echec: string;
  };
}) {
  const [etat, setEtat] = useState<EtatQc>(etatInitial);
  const [commentaire, setCommentaire] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);
  // Rouvrir le choix après une décision : le formulaire n'est pas affiché en
  // permanence, sinon l'écran demanderait sans cesse de trancher une question
  // déjà tranchée.
  const [rouvert, setRouvert] = useState(false);
  // Le refus est en deux temps : la planche ne montre au repos que les deux
  // boutons, et le motif s'ouvre après le second.
  const [motif, setMotif] = useState(false);

  const decider = async (decision: "approuve" | "refuse"): Promise<void> => {
    setEnvoi(true);
    setEchec(false);
    try {
      const reponse = await fetch("/p/" + encodeURIComponent(jeton) + "/qc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, commentaire: commentaire.trim() || undefined }),
      });
      if (!reponse.ok) {
        setEchec(true);
        return;
      }
      const corps: unknown = await reponse.json();
      const confirme =
        typeof corps === "object" && corps !== null && "qc" in corps
          ? (corps as { qc: unknown }).qc
          : null;

      // On n'affiche QUE ce que le serveur a renvoyé. Reprendre `decision` ici
      // reviendrait à afficher ce qu'on a demandé plutôt que ce qui a été
      // enregistré — la différence est invisible tant qu'elle n'existe pas.
      if (confirme !== "approuve" && confirme !== "refuse") {
        setEchec(true);
        return;
      }
      setEtat(confirme);
      setCommentaire("");
      setRouvert(false);
      setMotif(false);
    } catch {
      setEchec(true);
    } finally {
      setEnvoi(false);
    }
  };

  const decide = etat !== "en_attente" && !rouvert;

  const boutonPlein =
    "min-h-[50px] rounded-ds-control px-6 text-[15px] font-bold disabled:opacity-50";
  const boutonBorde =
    "min-h-[50px] rounded-ds-control border border-ds-filet-appuye px-[22px] text-[15px] " +
    "font-bold text-ds-texte-corps disabled:opacity-50 lg:px-[26px]";

  if (decide) {
    return (
      <div className="flex flex-col gap-3">
        {/* `role="status"` : l'échec s'annonçait, la réussite non — un client qui
            n'y voit pas n'avait aucune confirmation que sa décision était
            enregistrée (WCAG 4.1.3, audit du 24/09/2026). */}
        <p role="status" className="text-[15px] leading-[23px] text-ds-texte-fort lg:text-[16px] lg:leading-6">
          {etat === "approuve" ? libelles.approuve : libelles.refuse}
        </p>
        <button
          type="button"
          onClick={() => setRouvert(true)}
          className="min-h-11 self-start text-ds-texte-corps underline"
        >
          {libelles.modifier}
        </button>
      </div>
    );
  }

  /*
   * LE COMMENTAIRE N'APPARAÎT QU'APRÈS « REFUSER », et c'est la planche qui le
   * décide : `PageClient` et `PageClientDesktop` ne montrent, au repos, QUE la
   * question et les deux boutons.
   *
   * Ce n'est pas une amputation du champ. Personne n'écrit un commentaire avant
   * d'avoir tranché, et un champ posé au-dessus des boutons demande d'abord de
   * rédiger pour ensuite décider — l'ordre inverse de celui dans lequel on
   * pense. C'est aussi le refus, pas l'accord, qui a besoin d'être expliqué :
   * « c'est bon » se suffit, « il y a un problème » ne dit rien au vendeur.
   */
  if (motif) {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-ds-texte-fort">
            {libelles.commentaire}
          </span>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            autoFocus
            // Le même plafond qu'en base : refuser à la saisie explique,
            // tronquer en base protège. Les deux ne remplacent pas le même
            // défaut.
            maxLength={1000}
            rows={3}
            className="w-full rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte p-3 text-[14px] text-ds-texte-fort transition-shadow outline-none placeholder:text-ds-texte-corps focus:border-ds-filet-focus focus:shadow-[var(--anneau-ds-focus)]"
          />
        </label>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={envoi}
            onClick={() => void decider("refuse")}
            style={{ backgroundColor: remplissage, color: surRemplissage }}
            className={boutonPlein + " flex-grow lg:flex-grow-0 lg:px-[34px]"}
          >
            {envoi ? libelles.envoi : libelles.refuser}
          </button>
          <button
            type="button"
            disabled={envoi}
            onClick={() => {
              setMotif(false);
              setCommentaire("");
              setEchec(false);
            }}
            className={boutonBorde}
          >
            {libelles.annuler}
          </button>
        </div>

        {echec ? (
          <p role="alert" className="text-[14px] text-ds-erreur-encre">
            {libelles.echec}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-[23px] text-ds-texte-fort lg:text-[16px] lg:leading-6">
        {libelles.texte}
      </p>

      {/* Cibles de 50 points au doigt : cette page est ouverte au téléphone. */}
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={envoi}
          onClick={() => void decider("approuve")}
          style={{ backgroundColor: remplissage, color: surRemplissage }}
          className={boutonPlein + " flex-grow lg:flex-grow-0 lg:px-[34px]"}
        >
          {envoi ? libelles.envoi : libelles.approuver}
        </button>
        <button
          type="button"
          disabled={envoi}
          onClick={() => {
            setEchec(false);
            setMotif(true);
          }}
          className={boutonBorde}
        >
          {libelles.refuser}
        </button>
      </div>

      {/* L'échec est DIT. Un pari perdu qui ne se dit pas laisse le visiteur
          croire que sa décision est enregistrée. */}
      {echec ? (
        <p role="alert" className="text-[14px] text-ds-erreur-encre">
          {libelles.echec}
        </p>
      ) : null}
    </div>
  );
}

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
    readonly titre: string;
    readonly texte: string;
    readonly approuver: string;
    readonly refuser: string;
    readonly commentaire: string;
    readonly envoi: string;
    readonly approuve: string;
    readonly refuse: string;
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
    } catch {
      setEchec(true);
    } finally {
      setEnvoi(false);
    }
  };

  const decide = etat !== "en_attente" && !rouvert;

  if (decide) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-body-md text-body-md text-on-surface">
          {etat === "approuve" ? libelles.approuve : libelles.refuse}
        </p>
        <button
          type="button"
          onClick={() => setRouvert(true)}
          className="self-start rounded-lg px-3 py-2 font-label-md text-label-md underline"
        >
          {libelles.modifier}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-body-md text-body-md text-on-surface-variant">{libelles.texte}</p>

      <label className="flex flex-col gap-2">
        <span className="font-label-md text-label-md text-on-surface">{libelles.commentaire}</span>
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          // Le même plafond qu'en base : refuser à la saisie explique, tronquer
          // en base protège. Les deux ne remplacent pas le même défaut.
          maxLength={1000}
          rows={3}
          className="champ-app w-full rounded-md p-3 font-body-md text-body-md text-on-surface"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        {/* Cibles de 44 points au doigt : cette page est ouverte au téléphone. */}
        <button
          type="button"
          disabled={envoi}
          onClick={() => void decider("approuve")}
          style={{ backgroundColor: remplissage, color: surRemplissage }}
          className="min-h-[50px] flex-grow rounded-md px-6 font-label-md text-[15px] font-bold disabled:opacity-50"
        >
          {envoi ? libelles.envoi : libelles.approuver}
        </button>
        <button
          type="button"
          disabled={envoi}
          onClick={() => void decider("refuse")}
          className="min-h-[50px] rounded-md border border-outline px-6 font-label-md text-[15px] font-bold text-on-surface-variant disabled:opacity-50"
        >
          {envoi ? libelles.envoi : libelles.refuser}
        </button>
      </div>

      {/* L'échec est DIT. Un pari perdu qui ne se dit pas laisse le visiteur
          croire que sa décision est enregistrée. */}
      {echec ? (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {libelles.echec}
        </p>
      ) : null}
    </div>
  );
}

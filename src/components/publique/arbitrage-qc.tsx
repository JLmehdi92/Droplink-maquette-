"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

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
  libelles,
}: {
  readonly jeton: string;
  readonly etatInitial: EtatQc;
  /*
   * LES COULEURS NE PASSENT PLUS EN PROPRIÉTÉS (refonte du 02/10/2026) : le bouton plein
   * lit `--cl-remplissage` et `--cl-sur-remplissage`, posées sur la page par
   * `resoudreAccent()`. Le contraste reste obtenu automatiquement — un blanc d'office
   * sur un jaune vif se lirait à 1,5:1.
   */
  readonly libelles: {
    readonly titre: string;
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

  /* LE FOCUS SUIT LA BASCULE : le bouton qui avait le focus disparaît à chaque étape, et
     sans ce renvoi le clavier repartirait du haut de la page. Pas au premier rendu : on
     ne vole pas le focus à qui ouvre la page. */
  const statut = useRef<HTMLParagraphElement>(null);
  const question = useRef<HTMLHeadingElement>(null);
  const interagi = useRef(false);
  const zone = useRef<HTMLElement>(null);
  const champMotif = useRef<HTMLTextAreaElement>(null);
  // `useLayoutEffect` : l'étape arrive souvent après un `await` ; elle entre avant d'être peinte.
  useLayoutEffect(() => {
    if (!interagi.current) {
      interagi.current = true;
      return;
    }
    // L'étape qui arrive entre (maquette, `client.js` : `apparaitre`, 200 ms, 4 px).
    const etape = zone.current?.firstElementChild;
    if (etape instanceof HTMLElement && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      etape.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 200, easing: "cubic-bezier(.23,1,.32,1)" },
      );
    }
    if (decide) statut.current?.focus();
    // Le motif prend le focus SANS faire défiler (maquette : `preventScroll`) — `autoFocus`
    // ramenait la page sur le champ.
    else if (motif) champMotif.current?.focus({ preventScroll: true });
    else question.current?.focus();
  }, [decide, motif]);

  /* L'échec est DIT. Un pari perdu qui ne se dit pas laisse le visiteur croire que sa
     décision est enregistrée. */
  const messageEchec = echec ? (
    <p role="alert" className="cv-erreur">
      {libelles.echec}
    </p>
  ) : null;

  return (
    <section ref={zone} className="cv-qc cv-entree" aria-labelledby="cv-qc-titre" data-etat={decide ? etat : undefined}>
      {decide ? (
        <div className="cv-qc__decide">
          <span className="cv-qc__marque" aria-hidden="true">
            <Check className="ic" />
          </span>
          {/* `role="status"` : un client qui n'y voit pas doit savoir que sa décision est
              enregistrée (WCAG 4.1.3, audit du 24/09/2026). */}
          {/* Le titre reste pour la section (son nom), hors de la vue : la marque dit l'état. */}
          <h2 id="cv-qc-titre" className="sr-only">
            {libelles.titre}
          </h2>
          <p role="status" ref={statut} tabIndex={-1}>
            {etat === "approuve" ? libelles.approuve : libelles.refuse}
          </p>
          <button type="button" onClick={() => setRouvert(true)} className="cv-lien">
            {libelles.modifier}
          </button>
        </div>
      ) : motif ? (
        /*
         * LE COMMENTAIRE N'APPARAÎT QU'APRÈS « REFUSER » : personne n'écrit avant d'avoir
         * tranché, et c'est le refus, pas l'accord, qui a besoin d'être expliqué.
         */
        <div className="cv-qc__motif">
          <h2 id="cv-qc-titre">{libelles.titre}</h2>
          <label htmlFor="cv-motif">{libelles.commentaire}</label>
          <textarea
            id="cv-motif"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            ref={champMotif}
            // Le même plafond qu'en base : refuser à la saisie explique, tronquer en
            // base protège.
            maxLength={1000}
            rows={3}
          />
          <div className="cv-qc__actions">
            <button
              type="button"
              disabled={envoi}
              onClick={() => {
                setMotif(false);
                setCommentaire("");
                setEchec(false);
              }}
              className="cv-bouton cv-bouton--clair"
            >
              {libelles.annuler}
            </button>
            <button type="button" disabled={envoi} onClick={() => void decider("refuse")} className="cv-bouton cv-bouton--plein">
              {envoi ? libelles.envoi : libelles.refuser}
            </button>
          </div>
          {messageEchec}
        </div>
      ) : (
        <div>
          <h2 id="cv-qc-titre" ref={question} tabIndex={-1}>
            {libelles.titre}
          </h2>
          <p className="cv-qc__question">{libelles.texte}</p>
          <div className="cv-qc__actions">
            <button
              type="button"
              disabled={envoi}
              onClick={() => {
                setEchec(false);
                setMotif(true);
              }}
              className="cv-bouton cv-bouton--clair"
            >
              <X aria-hidden="true" className="ic" />
              {libelles.refuser}
            </button>
            <button type="button" disabled={envoi} onClick={() => void decider("approuve")} className="cv-bouton cv-bouton--plein">
              <Check aria-hidden="true" className="ic" />
              {envoi ? libelles.envoi : libelles.approuver}
            </button>
          </div>
          {messageEchec}
        </div>
      )}
    </section>
  );
}

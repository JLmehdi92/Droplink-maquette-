"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * LE BOUTON D'ACTION, ET CE QU'IL DIT PENDANT QU'IL TRAVAILLE.
 *
 * ⚠️ MESURE DU 09/09/2026 : 43 boutons sur 47 de l'espace authentifié ne
 * donnaient AUCUN retour au clic, et le produit ne contenait aucun indicateur
 * d'attente — le seul retour existant était une opacité à 60 %. C'est ce que
 * Wassim a décrit par « c'est sec ». La planche `BoutonEtats` du canevas dessine
 * les quatre états ; ce composant les rend.
 *
 * ⚠️ « RÉUSSI » N'APPARAÎT QU'APRÈS CONFIRMATION DU SERVEUR, JAMAIS AU CLIC.
 * C'est le principe XII du brief : l'interface n'affirme jamais ce que la base
 * n'a pas enregistré. Un bouton qui se déclare réussi à l'envoi est un pari sur
 * le serveur, et le pari perdu se voit chez le client du vendeur, des semaines
 * plus tard. L'état de réussite est donc PASSÉ EN PROPRIÉTÉ par l'appelant, qui
 * seul connaît la réponse — ce composant ne le devine jamais.
 */

/** Ce que le bouton montre. `repos` est le seul état qu'il choisit seul. */
type Etat = "repos" | "enCours" | "reussi" | "echoue";

/**
 * ⚠️ AUCUN INDICATEUR SOUS 150 ms, ET C'EST UNE DÉCISION, PAS UN RÉGLAGE.
 * Une action qui répond en 40 ms ferait apparaître puis disparaître l'anneau en
 * moins de trois images : l'œil ne lit pas un état, il voit un sursaut. Un
 * bouton immobile est plus calme qu'un bouton qui clignote. Le seuil ne retarde
 * rien — l'action part au clic ; il ne retarde que l'AFFICHAGE de l'attente.
 */
const SEUIL_AVANT_INDICATEUR_MS = 150;

/**
 * Combien de temps « Enregistré » reste à l'écran avant de rendre la main.
 * Assez pour être lu, assez court pour ne pas laisser croire que le bouton est
 * désactivé.
 */
const DUREE_CONFIRMATION_MS = 1800;

export interface LibellesBoutonAction {
  /** Au repos. C'est aussi lui qui fixe la largeur. */
  readonly repos: string;
  readonly enCours: string;
  readonly reussi: string;
  readonly echoue: string;
}

export function BoutonAction({
  libelles,
  resultat,
  className,
  type = "submit",
  onClick,
  disabled,
}: {
  readonly libelles: LibellesBoutonAction;
  /**
   * La réponse du serveur, ou `null` tant qu'il n'a rien dit. L'appelant la
   * remet à `null` quand il repart d'un état neuf.
   */
  readonly resultat?: "reussi" | "echoue" | null;
  readonly className?: string;
  readonly type?: "submit" | "button";
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const mouvementReduit = useReducedMotion();
  const [attenteVisible, setAttenteVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  /*
   * L'attente ne devient visible qu'au-delà du seuil. Le minuteur est annulé si
   * la réponse arrive avant — c'est ce qui empêche le clignotement.
   */
  useEffect(() => {
    if (!pending) {
      setAttenteVisible(false);
      return;
    }
    const minuteur = setTimeout(() => setAttenteVisible(true), SEUIL_AVANT_INDICATEUR_MS);
    return () => clearTimeout(minuteur);
  }, [pending]);

  /*
   * ⚠️ SEULE LA RÉUSSITE S'EFFACE TOUTE SEULE. Un échec qui disparaîtrait au
   * bout de deux secondes laisserait le vendeur devant un bouton au repos,
   * persuadé que son enregistrement est passé. L'échec reste jusqu'à la
   * prochaine tentative.
   */
  useEffect(() => {
    if (resultat !== "reussi") {
      setConfirmationVisible(false);
      return;
    }
    setConfirmationVisible(true);
    const minuteur = setTimeout(() => setConfirmationVisible(false), DUREE_CONFIRMATION_MS);
    return () => clearTimeout(minuteur);
  }, [resultat]);

  const etat: Etat = attenteVisible
    ? "enCours"
    : confirmationVisible
      ? "reussi"
      : resultat === "echoue"
        ? "echoue"
        : "repos";

  const libelle = libelles[etat];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled === true || pending}
      /*
       * `aria-busy` et `aria-live` portent l'information à qui n'a pas d'yeux
       * pour l'animation. Le libellé change vraiment dans le DOM : ce n'est pas
       * l'animation qui informe, elle ne fait qu'accompagner.
       */
      aria-busy={pending}
      aria-live="polite"
      className={className}
    >
      {/*
        ⚠️ LA LARGEUR NE SAUTE PAS. Les quatre libellés n'ont pas la même
        longueur ; sans cette grille superposée, le bouton se redimensionnerait
        à chaque état et déplacerait ce qui l'entoure au moment précis où l'on
        vient de cliquer. Les quatre libellés sont donc empilés dans la MÊME
        cellule de grille : les trois invisibles réservent la place, seul le
        courant est peint. `aria-hidden` les retire de la lecture d'écran.
      */}
      <span className="grid grid-cols-1 grid-rows-1 place-items-center">
        {(Object.keys(libelles) as Array<keyof LibellesBoutonAction>).map((clef) => (
          <span
            key={clef}
            aria-hidden={clef !== etat}
            className="invisible col-start-1 row-start-1 inline-flex items-center gap-[9px] whitespace-nowrap"
          >
            {clef === "enCours" ? <Anneau immobile={mouvementReduit === true} /> : null}
            {libelles[clef]}
          </span>
        ))}

        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={etat}
            /*
             * ⚠️ SOUS `prefers-reduced-motion`, LE MOUVEMENT S'ARRÊTE MAIS RIEN
             * NE DISPARAÎT : le libellé change, la couleur change, l'état reste
             * écrit en toutes lettres. L'animation n'a jamais porté
             * l'information — c'est la règle 4 du design system.
             */
            initial={mouvementReduit === true ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={mouvementReduit === true ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: mouvementReduit === true ? 0 : 0.16, ease: "easeOut" }}
            className="col-start-1 row-start-1 inline-flex items-center gap-[9px] whitespace-nowrap"
          >
            {etat === "enCours" ? <Anneau immobile={mouvementReduit === true} /> : null}
            {libelle}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

/**
 * L'anneau d'attente.
 *
 * ⚠️ IL NE PORTE AUCUNE INFORMATION QUE LE TEXTE NE PORTE PAS. Le libellé dit
 * déjà « Enregistrement… » ; l'anneau ne fait que rendre l'attente perceptible
 * plus vite que la lecture. D'où `aria-hidden` : le répéter à un lecteur
 * d'écran serait du bruit.
 */
function Anneau({ immobile }: { readonly immobile: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={immobile ? undefined : "animate-spin"}
    >
      <circle cx="12" cy="12" r="9" opacity="0.3" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

/**
 * Le minuteur de réinitialisation d'un résultat, pour les appelants qui gardent
 * la réponse du serveur dans un état local.
 *
 * Extrait ici plutôt que recopié : trois écrans en avaient besoin, et trois
 * copies d'un même minuteur divergent toujours par celle qu'on oublie de
 * corriger.
 */
export function useOubliDuResultat(
  resultat: "reussi" | "echoue" | null,
  oublier: () => void,
  delaiMs = DUREE_CONFIRMATION_MS,
): void {
  const oublierRef = useRef(oublier);
  oublierRef.current = oublier;

  useEffect(() => {
    if (resultat !== "reussi") return;
    const minuteur = setTimeout(() => oublierRef.current(), delaiMs);
    return () => clearTimeout(minuteur);
  }, [resultat, delaiMs]);
}

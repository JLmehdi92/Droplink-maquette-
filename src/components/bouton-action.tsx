"use client";

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
 * ⚠️ IL N'Y A NI MOTION NI ANIMATION DE POSITION ICI, ET C'EST UNE CORRECTION.
 * La première version faisait glisser le libellé de six pixels à chaque
 * changement d'état, via `AnimatePresence`. Verdict de Wassim après l'avoir vu
 * tourner : « j'ai pas trop capté, fallait juste un bouton qui loading en
 * gardant la même couleur que le bouton original ». Il avait raison — un
 * libellé qui bouge attire l'œil sur le mouvement plutôt que sur le mot, et
 * pour un enregistrement, le mot suffit. Ne reste que l'anneau qui tourne, en
 * `animate-spin`, donc en CSS pur : Motion n'est plus nécessaire ici, et son
 * retrait rend à la route `marque` les 42 Ko qu'il lui coûtait.
 *
 * ⚠️ LA COULEUR NE CHANGE JAMAIS NON PLUS. Le `className` vient de l'appelant et
 * est appliqué tel quel dans les quatre états : le dégradé de marque reste. Un
 * bouton qui vire au vert puis au rouge cesse d'être le bouton qu'on vient de
 * cliquer, et le vert dirait « c'est fini » avec la force d'une alerte, pour la
 * chose la plus banale de l'écran.
 *
 * ⚠️ « ENREGISTRÉ » N'APPARAÎT QU'APRÈS CONFIRMATION DU SERVEUR, JAMAIS AU CLIC.
 * C'est le principe XII du brief : l'interface n'affirme jamais ce que la base
 * n'a pas enregistré. L'état de réussite est donc PASSÉ EN PROPRIÉTÉ par
 * l'appelant, qui seul connaît la réponse — ce composant ne le devine jamais.
 */

/** Ce que le bouton montre. `repos` est le seul état qu'il choisit seul. */
type Etat = "repos" | "enCours" | "reussi" | "echoue";

/**
 * ⚠️ L'ANNEAU PART AU CLIC, ET RESTE AU MOINS CE TEMPS-LÀ.
 *
 * LA PREMIÈRE VERSION FAISAIT L'INVERSE, ET C'ÉTAIT UNE FAUTE MESURABLE : elle
 * attendait 150 ms avant d'afficher quoi que ce soit, pour qu'une action rapide
 * ne fasse pas clignoter l'anneau. Le raisonnement se tenait ; le chiffre était
 * posé au jugé. Mesuré le 09/09/2026 depuis la machine de Wassim, cinq lectures
 * après rodage : un aller-retour vers la base prend 26, 32, 32, 37 et 59 ms —
 * MÉDIANE 32 ms. L'enregistrement se terminait donc toujours avant le seuil, et
 * l'anneau n'apparaissait JAMAIS. Verdict de Wassim après essai : « rien a
 * changé sur le bouton ».
 *
 * Le seuil protégeait du clignotement au prix de l'existence de l'indicateur.
 * Une durée MINIMALE d'affichage protège des deux : l'anneau se voit toujours,
 * et il ne clignote jamais. C'est L-014 dans sa forme la plus bête — un chiffre
 * que personne n'avait confronté à la latence réelle.
 */
export const DUREE_MINIMALE_ANNEAU_MS = 450;

/**
 * Combien de temps l'anneau doit ENCORE rester, une fois le serveur revenu.
 *
 * ⚠️ EXTRAITE DU COMPOSANT POUR ÊTRE ÉPROUVÉE. C'est exactement ce calcul qui
 * était faux dans la première version — un seuil AVANT affichage au lieu d'une
 * durée APRÈS — et rien ne pouvait le dire : la faute ne se voyait qu'à
 * l'écran, sur une action assez rapide pour passer sous le seuil. Une fonction
 * pure, elle, se falsifie en une ligne.
 *
 * `depart` à `null` signifie qu'aucune attente n'était en cours : il n'y a rien
 * à prolonger, et le zéro rendu ici éteint l'anneau immédiatement.
 */
export function resteAvantExtinction(
  depart: number | null,
  maintenant: number,
  dureeMinimale: number = DUREE_MINIMALE_ANNEAU_MS,
): number {
  if (depart === null) return 0;
  return Math.max(0, dureeMinimale - (maintenant - depart));
}

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
  const [attenteVisible, setAttenteVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  /*
   * L'anneau s'allume dès que l'action part, et ne s'éteint qu'une fois la
   * durée minimale écoulée. Quand le serveur répond en 32 ms — le cas normal —
   * l'anneau reste donc visible 450 ms au lieu de n'être jamais peint.
   *
   * ⚠️ CELA NE RETARDE RIEN DE RÉEL. Le formulaire est parti au clic, la base a
   * déjà écrit ; seul l'affichage du bouton s'attarde. Ce qui suit — le passage
   * à « Enregistré » — est piloté par la réponse du serveur, pas par ce
   * minuteur.
   */
  const departAttente = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      departAttente.current = Date.now();
      setAttenteVisible(true);
      return;
    }
    const reste = resteAvantExtinction(departAttente.current, Date.now());
    if (departAttente.current === null) return;
    departAttente.current = null;
    if (reste === 0) {
      setAttenteVisible(false);
      return;
    }
    const minuteur = setTimeout(() => setAttenteVisible(false), reste);
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

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled === true || pending}
      /*
       * `aria-busy` et `aria-live` portent l'information à qui n'a pas d'yeux
       * pour l'anneau. Le libellé change vraiment dans le DOM : ce n'est pas
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
        cellule de grille : les trois inutilisés réservent la place sans être
        peints ni lus, seul le courant est visible.
      */}
      <span className="grid grid-cols-1 grid-rows-1 place-items-center">
        {(Object.keys(libelles) as Array<keyof LibellesBoutonAction>).map((clef) => {
          const courant = clef === etat;
          return (
            <span
              key={clef}
              aria-hidden={!courant}
              className={
                "col-start-1 row-start-1 inline-flex items-center gap-[9px] whitespace-nowrap " +
                (courant ? "" : "invisible")
              }
            >
              {clef === "enCours" ? <Anneau /> : null}
              {libelles[clef]}
            </span>
          );
        })}
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
 *
 * ⚠️ `animate-spin` DE TAILWIND RESPECTE DÉJÀ `prefers-reduced-motion` : le
 * projet coupe les animations dans `globals.css` pour qui le demande. Rien à
 * rajouter ici — et rien ne disparaît quand le mouvement s'arrête, puisque le
 * libellé dit déjà l'état en toutes lettres.
 */
function Anneau() {
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
      className="animate-spin"
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
 * Extrait ici plutôt que recopié : trois écrans en auront besoin, et trois
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

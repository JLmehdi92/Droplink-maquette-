"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

/**
 * LE DIALOGUE MODAL DE L'ADMINISTRATION — refonte du 02/10/2026 (maquette,
 * `.adm-dialogue`) : un seul gabarit pour la suspension, le plan, le blocage et
 * la contestation.
 *
 * UN `<dialog>` NATIF, OUVERT PAR `showModal()` : le navigateur pose le piège de
 * focus, rend le reste de la page inerte et rend le focus au bouton qui l'a
 * ouvert. C'est ce qui manquait aux panneaux « en ligne » d'avant pour devenir
 * une modale — aucun piège écrit à la main.
 *
 * ⚠️ PENDANT LA REQUÊTE, RIEN NE FERME : ni Échap, ni la croix, ni un clic sur le
 * voile. Une Server Action ne s'annule pas ; fermer ferait croire à une
 * annulation, puis la page se rechargerait sur un geste bel et bien fait
 * (revue du 19/09/2026, contrainte 8).
 */
/**
 * FERMER EN SORTANT (maquette, `admin.js` : `fermer`) : la boîte descend et s'efface
 * en 160 ms (`.sort`), PUIS le dialogue se ferme — `close()` seul la ferait
 * disparaître d'un coup. Sous mouvement réduit, elle se ferme tout de suite. Un
 * dialogue déjà en train de sortir n'est pas refermé deux fois.
 */
export function fermerDialogue(d: HTMLDialogElement | null | undefined): void {
  if (!d || !d.open || d.classList.contains("sort")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    d.close();
    return;
  }
  d.classList.add("sort");
  window.setTimeout(() => {
    d.classList.remove("sort");
    d.close();
  }, 160);
}

/**
 * LE REFUS D'UNE SAISIE DIT ET SECOUÉ (maquette, `admin.js` : le motif trop court
 * affiche « Le motif est trop court. » et la boîte tremble 280 ms) plutôt qu'un bouton
 * désactivé qui ne dit pas pourquoi. Le serveur garde le même plancher.
 */
export function secouerDialogue(d: HTMLDialogElement | null | undefined): void {
  const corps = d?.querySelector<HTMLElement>(".adm-dialogue__corps");
  if (!corps || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  corps.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
    { duration: 280 },
  );
}

export function DialogueAdmin({
  refDialogue,
  idTitre,
  titre,
  aide,
  travaille,
  fermer,
  onClose,
  children,
}: {
  readonly refDialogue: RefObject<HTMLDialogElement | null>;
  readonly idTitre: string;
  readonly titre: string;
  readonly aide?: ReactNode;
  readonly travaille: boolean;
  /** Le libellé de la croix (« Annuler »). */
  readonly fermer: string;
  readonly onClose?: () => void;
  readonly children: ReactNode;
}) {
  // UN CLIC SUR LE VOILE, ET SEULEMENT LUI : le geste doit COMMENCER hors de la
  // boîte. Une sélection commencée dans le motif et relâchée au-dehors, ou un clic
  // sur la barre de défilement, ne ferme pas (ils effaceraient la saisie).
  const departDehors = useRef(false);
  const dehors = (e: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  return (
    <dialog
      ref={refDialogue}
      className="adm-dialogue"
      aria-labelledby={idTitre}
      aria-describedby={aide === undefined ? undefined : `${idTitre}-aide`}
      onClose={onClose}
      onCancel={(e) => {
        // Échap : la sortie animée plutôt que la fermeture sèche du navigateur.
        e.preventDefault();
        if (!travaille) fermerDialogue(e.currentTarget);
      }}
      onPointerDown={(e) => {
        departDehors.current = e.target === e.currentTarget && dehors(e);
      }}
      onClick={(e) => {
        if (departDehors.current && e.target === e.currentTarget && dehors(e) && !travaille) fermerDialogue(e.currentTarget);
        departDehors.current = false;
      }}
    >
      <div className="adm-dialogue__corps">
        <header>
          <h2 id={idTitre}>{titre}</h2>
          <button
            type="button"
            className="adm-dialogue__x"
            aria-label={fermer}
            disabled={travaille}
            onClick={() => fermerDialogue(refDialogue.current)}
          >
            <X aria-hidden="true" className="ic" />
          </button>
        </header>
        {aide === undefined ? null : (
          <p id={`${idTitre}-aide`} className="adm-dialogue__aide">
            {aide}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}

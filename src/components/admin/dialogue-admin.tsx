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
        if (travaille) e.preventDefault();
      }}
      onPointerDown={(e) => {
        departDehors.current = e.target === e.currentTarget && dehors(e);
      }}
      onClick={(e) => {
        if (departDehors.current && e.target === e.currentTarget && dehors(e) && !travaille) e.currentTarget.close();
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
            onClick={() => refDialogue.current?.close()}
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

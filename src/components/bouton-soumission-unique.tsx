"use client";

import { useRef, type ReactNode } from "react";

/**
 * UN BOUTON DE FORMULAIRE NATIF QUI NE SOUMET QU'UNE FOIS.
 *
 * ⚠️ TROUVÉ PAR LA REVUE REACT ECC DU 24/09/2026 : « Dupliquer » est un POST
 * natif vers la route des gestes de liste, sans Server Action, donc sans
 * `useFormStatus` ni état d'attente. Sur une 4G lente, un double-clic partait
 * deux fois — DEUX copies de la commande, chacune décomptée du quota du compte
 * (à vie en gratuit).
 *
 * Le premier clic part tel quel : sans JavaScript, le bouton reste un bouton de
 * formulaire ordinaire. Les clics suivants sont ignorés pendant quelques
 * secondes — le temps que la redirection arrive. Si elle n'arrive pas (réseau
 * coupé), le bouton se réarme seul : un geste qui a échoué doit pouvoir se
 * refaire.
 */
const FENETRE_MS = 5_000;

export function BoutonSoumissionUnique({
  className,
  form,
  children,
}: {
  readonly className?: string;
  /** Identifiant du formulaire quand le bouton vit hors de lui (`form=`). */
  readonly form?: string;
  readonly children: ReactNode;
}) {
  const dernier = useRef(0);
  return (
    <button
      type="submit"
      form={form}
      className={className}
      onClick={(e) => {
        const maintenant = Date.now();
        if (maintenant - dernier.current < FENETRE_MS) {
          e.preventDefault();
          return;
        }
        dernier.current = maintenant;
      }}
    >
      {children}
    </button>
  );
}

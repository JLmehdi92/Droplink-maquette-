"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, Plus } from "lucide-react";

/**
 * LE BOUTON « Créer une commande » DE LA BARRE DU HAUT (décision n° 5 de Mehdi,
 * 02/10/2026 : il est sur chaque écran de l'espace vendeur, comme dans la
 * maquette). Il porte le SEUL dégradé de l'écran : les autres « Créer une
 * commande » des écrans passent en bouton plein.
 *
 * Il soumet le formulaire de `creerBrouillon` posé par la barre du haut. Sous
 * 760 px il ne garde que son icône : son nom accessible reste le libellé, posé en
 * `aria-label` parce que le texte visible est alors masqué.
 */
export function BoutonCreerCommande({
  libelle,
  libelleEnCours,
}: {
  readonly libelle: string;
  readonly libelleEnCours: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="bouton-app bouton-app--marque"
      aria-label={pending ? libelleEnCours : libelle}
      aria-busy={pending}
      disabled={pending}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="ic tourne" />
      ) : (
        <Plus aria-hidden="true" className="ic" />
      )}
      <span className="bouton-app__libelle">{pending ? libelleEnCours : libelle}</span>
    </button>
  );
}

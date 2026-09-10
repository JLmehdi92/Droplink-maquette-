"use client";

import { useFormStatus } from "react-dom";
import { Anneau } from "@/components/bouton-action";
import { Icone } from "@/components/icone";

/**
 * LES BRIQUES COMMUNES AUX QUATRE ÉCRANS D'ACCÈS.
 *
 * Connexion, inscription, mot de passe oublié, nouveau mot de passe. Ils
 * partagent une carte-page, un champ à 52 px de haut et un bouton au dégradé de
 * marque, parce que les quatre planches les dessinent identiques.
 *
 * ⚠️ CE N'EST PAS UNE FACTORISATION DE CONFORT. Le formulaire de connexion et
 * celui d'inscription ÉTAIENT le même composant, distingués par une propriété
 * `intention` qui ne changeait que le libellé du bouton — parce qu'avec un lien
 * magique le serveur faisait strictement la même chose des deux côtés. Ce n'est
 * plus vrai : l'un vérifie, l'autre crée. Les deux formulaires sont donc
 * séparés, et ce qui reste commun est ici, à l'endroit où le partager ne peut
 * plus faire diverger un comportement.
 */

/** Le champ de saisie des planches : 52 px, rayon 13, filet de contrôle. */
export const CLASSE_CHAMP =
  "h-13 w-full rounded-[13px] border border-filet-controle bg-surface-container-low px-4 " +
  "font-body-md text-[15px] text-on-surface transition-colors focus:border-violet " +
  "focus:outline-none focus:ring-2 focus:ring-violet/30";

/** Le libellé au-dessus d'un champ. */
export const CLASSE_LIBELLE =
  "block font-headline-md text-[13px] leading-4 font-semibold text-on-surface";

/**
 * L'action principale de l'écran, au dégradé de marque.
 *
 * Le dégradé est réservé à UNE action principale par écran, et uniquement sur
 * les surfaces DropLink — ce qui est le cas des quatre écrans d'accès.
 *
 * `useFormStatus` doit être lu depuis un composant ENFANT du formulaire : lu
 * dans le formulaire lui-même, il rendrait toujours `false`.
 *
 * ⚠️ IL CHANGEAIT DÉJÀ DE LIBELLÉ, ET CE N'ÉTAIT PAS SUFFISANT. Sur les quatre
 * écrans d'accès, l'attente ne se lisait qu'en relisant le mot — or on ne relit
 * pas un bouton qu'on vient de cliquer, on le REGARDE. L'anneau est le même que
 * celui de `BoutonAction`, validé par Wassim le 09/09 : `animate-spin` en CSS
 * pur, aucune couleur qui change, et il ne porte aucune information que le
 * libellé ne porte pas — d'où son `aria-hidden`.
 *
 * ⚠️ LA FLÈCHE CÈDE SA PLACE À L'ANNEAU, elle ne s'y ajoute pas : les deux
 * ensemble élargiraient le bouton au moment précis du clic.
 */
export function BoutonPrincipal({
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
      disabled={pending}
      className="degrade-marque flex h-13 w-full items-center justify-center gap-[9px] rounded-[13px] font-headline-md text-[15px] leading-5 font-bold shadow-[0_10px_24px_-10px_rgba(124,92,245,0.6)] transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? <Anneau /> : null}
      <span>{pending ? libelleEnCours : libelle}</span>
      {pending ? null : <Icone nom="arrow_forward" className="text-[15px]" />}
    </button>
  );
}

/**
 * Le message d'échec, sous les champs et avant le bouton.
 *
 * `role="alert"` : il apparaît après une soumission, donc hors du champ de
 * quelqu'un qui emploie un lecteur d'écran.
 */
export function MessageErreur({ id, texte }: { readonly id: string; readonly texte: string }) {
  return (
    <p id={id} role="alert" className="font-body-sm text-body-sm text-error">
      {texte}
    </p>
  );
}

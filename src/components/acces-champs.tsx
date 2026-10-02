"use client";

import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState } from "react";

/**
 * LES CHAMPS DES PAGES D'ACCÈS ET DE COMPTE — au dessin de la refonte (maquette,
 * `construire.mjs` : `champ-acces`, `bouton-envoi`).
 *
 * Ce qui ne change PAS avec le dessin, et ne doit jamais changer : le NOM des
 * champs (`name`), lu par les Server Actions (`tests/unit/formulaires-et-actions`),
 * et le serveur comme seule autorité. Ce qui est vérifié ici est un confort ;
 * aucune vérification d'ici ne dit quoi que ce soit sur l'existence d'un compte.
 */

/** Le libellé d'un champ hors de `ChampAcces` (sélecteur, zone de texte). */
export const CLASSE_LIBELLE_DS = "text-[13.5px] leading-[normal] font-semibold text-ds-texte-fort";

export function ChampAcces({
  id,
  nom,
  type = "text",
  libelle,
  placeholder,
  autoComplete,
  requis = true,
  action,
  decritPar,
  valeur,
  surChangement,
  modeSaisie,
  invalide = false,
  libellesOeil,
  children,
}: {
  readonly id: string;
  readonly nom: string;
  readonly type?: "text" | "email" | "password" | "url";
  readonly libelle: string;
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly requis?: boolean;
  /** Un lien sur la ligne du libellé (« Mot de passe oublié ? »). */
  readonly action?: React.ReactNode;
  readonly decritPar?: string;
  readonly valeur?: string;
  readonly surChangement?: (valeur: string) => void;
  readonly modeSaisie?: "email" | "text" | "numeric";
  readonly invalide?: boolean;
  /**
   * Les libellés du bouton qui montre le mot de passe, traduits par l'appelant
   * (ce composant ne tire aucun catalogue). Sans eux, pas de bouton : un bouton
   * sans nom n'est pas un bouton.
   */
  readonly libellesOeil?: { readonly afficher: string; readonly masquer: string };
  /** Ce qui vit sous la boîte : jauge, aide, suggestion. */
  readonly children?: React.ReactNode;
}) {
  const [devoile, setDevoile] = useState(false);
  const estMotDePasse = type === "password";

  return (
    <div className={"champ-acces" + (invalide ? " est-invalide" : "")}>
      <div className="champ-acces__ligne">
        <label htmlFor={id}>{libelle}</label>
        {action}
      </div>
      <div className="champ-acces__boite">
        <input
          id={id}
          name={nom}
          type={estMotDePasse && devoile ? "text" : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize={type === "email" ? "off" : undefined}
          spellCheck={type === "email" || estMotDePasse ? false : undefined}
          required={requis}
          aria-describedby={decritPar}
          aria-invalid={invalide || undefined}
          inputMode={modeSaisie}
          {...(valeur === undefined
            ? {}
            : { value: valeur, onChange: (e: React.ChangeEvent<HTMLInputElement>) => surChangement?.(e.target.value) })}
        />
        {estMotDePasse && libellesOeil !== undefined ? (
          <button
            type="button"
            className="champ-acces__oeil"
            onClick={() => setDevoile((d) => !d)}
            aria-label={devoile ? libellesOeil.masquer : libellesOeil.afficher}
          >
            {devoile ? <EyeOff aria-hidden="true" className="ic" /> : <Eye aria-hidden="true" className="ic" />}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * LE BOUTON D'ENVOI : le libellé sort par le haut, « Connexion… » entre par le
 * bas, à largeur constante (les deux sont empilés dans la même cellule). Il porte
 * le seul dégradé de l'écran.
 */
export function BoutonPrincipalDs({
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
      aria-busy={pending}
      className={"bouton bouton--marque bouton--large bouton-envoi" + (pending ? " est-en-cours" : "")}
    >
      <span className="bouton-envoi__libelle" aria-hidden={pending}>
        {libelle}
      </span>
      <span className="bouton-envoi__cours" aria-hidden={!pending}>
        <LoaderCircle aria-hidden="true" className="ic tourne" />
        {libelleEnCours}
      </span>
    </button>
  );
}

/** Ce que le serveur a refusé, dit en clair ; `role="alert"` : il apparaît après l'envoi. */
export function MessageErreurDs({ id, texte }: { readonly id: string; readonly texte: string }) {
  return (
    <p id={id} role="alert" className="formulaire__statut formulaire__statut--erreur">
      {texte}
    </p>
  );
}

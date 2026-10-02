"use client";

import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ecouterAppuisEnvoi, sortieVersEnvoi } from "@/components/acces/validation-locale";

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
  erreurLocale,
  surSortie,
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
  /**
   * Le refus de la validation À LA SAISIE (maquette, `acces.js` : `[data-erreur]`),
   * dit sous la boîte. Un confort : le serveur reste l'autorité, et son refus
   * s'affiche à part (`MessageErreurDs`).
   */
  readonly erreurLocale?: string;
  readonly surSortie?: () => void;
  /** Ce qui vit sous la boîte : jauge, aide, suggestion. */
  readonly children?: React.ReactNode;
}) {
  const [devoile, setDevoile] = useState(false);
  const ecouteSortie = surSortie !== undefined;
  useEffect(() => {
    if (ecouteSortie) ecouterAppuisEnvoi();
  }, [ecouteSortie]);
  const estMotDePasse = type === "password";
  const aErreurLocale = erreurLocale !== undefined && erreurLocale !== "";
  const idErreur = `${id}-erreur`;
  const decrit = [aErreurLocale ? idErreur : null, decritPar ?? null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={"champ-acces" + (invalide || aErreurLocale ? " est-invalide" : "")}>
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
          aria-describedby={decrit}
          aria-invalid={invalide || aErreurLocale || undefined}
          onBlur={(e) => {
            if (!sortieVersEnvoi(e.relatedTarget)) surSortie?.();
          }}
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
      {/* Il naît avec son texte, en `role="alert"` : une région `aria-live` masquée
          (`display: none` hors refus) n'est pas dans l'arbre d'accessibilité au moment
          où le texte arrive, et souvent pas annoncée. */}
      {aErreurLocale ? (
        <p className="champ-acces__erreur" id={idErreur} role="alert">
          {erreurLocale}
        </p>
      ) : null}
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
  occupe = false,
}: {
  readonly libelle: string;
  readonly libelleEnCours: string;
  /** Reste « en cours » après la réponse, le temps que la page suivante arrive. */
  readonly occupe?: boolean;
}) {
  const { pending: envoi } = useFormStatus();
  const pending = envoi || occupe;
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

"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * LA RECHERCHE DE LA BARRE DU HAUT : un formulaire GET vers `/commandes?q=`.
 *
 * Elle ne filtre rien elle-même : c'est l'écran des commandes, côté serveur, qui
 * cherche (index insensible aux accents, pagination par curseur). Ctrl/⌘ K lui
 * donne le focus, comme dans la maquette (`coque.js`).
 *
 * Le champ n'est prérempli que SUR l'écran des commandes : ailleurs, « q » ne
 * désigne pas une recherche de commande.
 */
export function RechercheGlobale({
  action,
  placeholder,
  placeholderCourt,
  etiquette,
}: {
  readonly action: string;
  readonly placeholder: string;
  /** Sous 640 px le champ fait 180 px : le texte complet y était coupé en plein mot. */
  readonly placeholderCourt: string;
  readonly etiquette: string;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const chemin = usePathname();
  const parametres = useSearchParams();
  const etroit = useSyncExternalStore(abonnerEtroit, lireEtroit, () => false);
  // « Ctrl K » au rendu serveur ; « ⌘K » une fois le navigateur connu (Mac, iPhone, iPad).
  const touche = useSyncExternalStore(
    sansAbonnement,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );

  const valeurInitiale = chemin === action ? (parametres.get("q") ?? "") : "";
  // Sur la liste elle-même, une recherche GARDE les critères en cours (archives,
  // période, statut, tri) : sinon chercher un nom dans les archives ramènerait
  // aux commandes actives, et le vendeur conclurait que la commande n'existe pas.
  const gardes =
    chemin === action
      ? (["statut", "qc", "tri", "du", "au", "archivees"] as const).flatMap((cle) => {
          const v = parametres.get(cle);
          return v === null || v === "" ? [] : [[cle, v] as const];
        })
      : [];

  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== "k" || (!e.ctrlKey && !e.metaKey)) return;
      e.preventDefault();
      champ.current?.focus();
      champ.current?.select();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  return (
    <form className="recherche" role="search" method="get" action={action}>
      {gardes.map(([cle, v]) => (
        <input key={cle} type="hidden" name={cle} value={v} />
      ))}
      <Search aria-hidden="true" className="ic" />
      <input
        ref={champ}
        type="search"
        name="q"
        key={valeurInitiale}
        defaultValue={valeurInitiale}
        placeholder={etroit ? placeholderCourt : placeholder}
        aria-label={etiquette}
        aria-keyshortcuts="Control+K Meta+K"
        autoComplete="off"
        spellCheck={false}
      />
      {/* Elle décrit un geste, pas un contenu : un lecteur d'écran l'annoncerait
          au milieu d'un champ de saisie. */}
      <kbd aria-hidden="true">{touche}</kbd>
    </form>
  );
}

const ETROIT = "(max-width: 640px)";
function abonnerEtroit(rappel: () => void): () => void {
  const media = window.matchMedia(ETROIT);
  media.addEventListener("change", rappel);
  return () => media.removeEventListener("change", rappel);
}
function lireEtroit(): boolean {
  return window.matchMedia(ETROIT).matches;
}
function sansAbonnement(): () => void {
  return () => {};
}

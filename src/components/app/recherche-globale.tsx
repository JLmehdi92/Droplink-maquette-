"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * LA RECHERCHE DE LA BARRE SUPÉRIEURE — `dl-topsearch` du kit.
 *
 * ⚠️ ELLE REMPLACE CELLE DE L'EN-TÊTE DE « COMMANDES », elle ne s'y ajoute pas.
 * Le kit ne dessine qu'un seul champ de recherche par écran, et il est en haut :
 * deux champs qui cherchent la même chose à 200 px l'un de l'autre, c'est un
 * champ de trop et une question — « lequel cherche quoi ? » — à chaque écran.
 * L'en-tête de `Commandes` récupère la place pour le sélecteur de période, qui
 * est ce que le kit y met.
 *
 * ELLE CHERCHE DANS LES COMMANDES, depuis n'importe quel écran. C'est le seul
 * ensemble du produit qui se cherche — les envois se filtrent, les analyses se
 * lisent — et c'est aussi ce que le kit annonce dans son propre texte de
 * remplacement : « une commande, un produit, un client ou un numéro de suivi ».
 *
 * ⚠️ UN FORMULAIRE `GET`, PAS UN ÉTAT CLIENT. L'URL décrit ce qui est affiché :
 * elle se met en favori, se recopie, revient par l'historique. Le seul morceau
 * de JavaScript ici est le raccourci clavier — et s'il ne charge pas, le champ
 * reste un champ.
 */
export function RechercheGlobale({
  action,
  placeholder,
  etiquette,
}: {
  readonly action: string;
  readonly placeholder: string;
  readonly etiquette: string;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const chemin = usePathname();
  const parametres = useSearchParams();

  /*
   * ⚠️ LA RECHERCHE EN COURS EST RELUE DEPUIS L URL, ET SEULEMENT SUR LA LISTE
   * QU ELLE FILTRE. La coque est un composant SERVEUR : Next ne lui passe pas
   * les paramètres de requête, donc la valeur ne peut pas descendre en
   * propriété. Sans cette relecture, un vendeur qui a cherché « crème » voit un
   * champ VIDE au-dessus d une liste filtrée — et conclut que sa recherche n a
   * pas été prise.
   *
   * La borne au chemin compte : ailleurs, `?q=` ne veut rien dire, et préremplir
   * le champ avec le paramètre d un autre écran afficherait une recherche qui
   * n est pas celle qu on regarde.
   */
  const valeurInitiale = chemin === action ? (parametres.get("q") ?? "") : "";

  /*
   * ⚠️ LE RACCOURCI EST ANNONCÉ À L'ÉCRAN, DONC IL DOIT EXISTER. Le kit dessine
   * les deux touches `Ctrl` et `K` dans le champ ; les dessiner sans les câbler
   * serait une affirmation fausse posée sur l'interface — exactement ce que le
   * principe XII interdit, appliqué à une promesse de clavier plutôt qu'à une
   * donnée.
   *
   * `metaKey` autant que `ctrlKey` : sur un Mac le geste est `⌘ K`, et le
   * fournisseur comme le revendeur peuvent être sur l'un ou l'autre.
   */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key !== "k" && e.key !== "K") return;
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      champ.current?.focus();
      champ.current?.select();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  return (
    <form
      method="get"
      action={action}
      /* 551 × 46, rayon de carte, filet, fond carte, ombre xs — mesuré sur la
         référence servie à 1690 px. Le champ ne s'étale pas : au-delà, la ligne
         de texte devient plus longue que ce qu'on y tape. */
      className="hidden h-[46px] w-full max-w-[551px] items-center gap-3 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] shadow-ds-xs transition-shadow focus-within:border-ds-filet-focus focus-within:shadow-[var(--anneau-ds-focus)] md:flex"
    >
      <Search
        aria-hidden="true"
        size={18}
        strokeWidth={1.8}
        className="shrink-0 text-ds-texte-sourdine"
      />
      <input
        ref={champ}
        type="search"
        name="q"
        key={valeurInitiale}
        defaultValue={valeurInitiale}
        placeholder={placeholder}
        aria-label={etiquette}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ds-texte-fort placeholder:text-ds-texte-sourdine focus-visible:outline-none"
      />
      {/* Les deux touches du kit : 11 px en 600, creux, rayon 6, filet.
          `aria-hidden` parce qu'elles décrivent un geste, pas un contenu — un
          lecteur d'écran annoncerait « Ctrl K » au milieu d'un champ de saisie. */}
      <span aria-hidden="true" className="hidden shrink-0 items-center gap-1 lg:flex">
        <kbd className="rounded-ds-xs border border-ds-filet bg-ds-surface-creux px-[7px] py-[3px] font-sans text-[11px] font-semibold text-ds-texte-sourdine">
          Ctrl
        </kbd>
        <kbd className="rounded-ds-xs border border-ds-filet bg-ds-surface-creux px-[7px] py-[3px] font-sans text-[11px] font-semibold text-ds-texte-sourdine">
          K
        </kbd>
      </span>
    </form>
  );
}

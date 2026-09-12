"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { LienEcran } from "@/components/lien-ecran";
import { BarChart3, Briefcase, Shield, Truck, type LucideIcon } from "lucide-react";

/**
 * LA NAVIGATION DE L'ESPACE VENDEUR — colonne sur grand écran, onglets en bas
 * au téléphone.
 *
 * ELLE EST CLIENTE, ET C'EST UN ARBITRAGE ASSUMÉ. Le layout serveur ne connaît
 * pas le chemin courant : Next ne le lui passe pas. Sans lui, il n'y a pas
 * d'entrée active — or la pastille d'accent qui dit « vous êtes ici » est la
 * seule chose qui distingue cette barre d'une liste de liens. Le coût est
 * d'environ un kilo-octet, et il ne touche QUE l'espace authentifié : la page
 * publique, elle, n'embarque toujours aucun catalogue ni aucune navigation.
 *
 * `aria-current="page"` est posé sur l'entrée active. Ce n'est pas décoratif :
 * sans lui, un lecteur d'écran entend quatre liens identiques et rien ne dit
 * lequel est la page ouverte.
 *
 * LES LIBELLÉS ARRIVENT EN PROPRIÉTÉS, résolus côté serveur : ce composant ne
 * doit pas tirer un catalogue de traduction dans le navigateur.
 */

/**
 * ⚠️ L ICÔNE VOYAGE EN CLÉ, PAS EN COMPOSANT. Ce fichier est un îlot client et
 * la coque qui le rend est un composant serveur : une référence de fonction ne
 * traverse pas cette frontière. La clé se résout ici, dans le navigateur.
 *
 * LES QUATRE ICÔNES SONT CELLES DU KIT, relevées dans son `NAV` :
 * `briefcase`, `truck`, `bar-chart-3`, `shield`. L ancienne correspondance
 * écrite dans `CLAUDE.md` — `inventory_2 → package`, `palette → palette` —
 * datait du canevas condamné : le kit ne dessine ni paquet ni palette.
 */
export type CleIcone = "commandes" | "envois" | "analyses" | "marque";

const ICONES: Record<CleIcone, LucideIcon> = {
  commandes: Briefcase,
  envois: Truck,
  analyses: BarChart3,
  marque: Shield,
};

export interface EntreeNavigation {
  readonly href: string;
  readonly libelle: string;
  readonly icone: CleIcone;
  /**
   * Le compte affiché en pastille à droite de l entrée.
   *
   * ⚠️ FACULTATIF, ET IL DOIT LE RESTER. Le kit n en pose qu UNE, sur
   * « Commandes ». Une pastille sur chaque entrée ferait quatre nombres à
   * lire là où le dessin en met un seul, et le seul qui compte est le volume
   * de l écran qu on ouvre vingt fois par jour.
   */
  readonly compte?: number;
}

/**
 * L'entrée active est celle dont le chemin est un PRÉFIXE du chemin courant.
 *
 * L'égalité stricte ne suffit pas : `/fr/commandes/xxxx` est l'éditeur d'une
 * commande, et laisser la barre sans entrée active à cet endroit ferait croire
 * qu'on a quitté la section. Le préfixe est borné par un `/` pour que
 * `/fr/commandes-archivees` ne s'allume pas sur `/fr/commandes`.
 */
/**
 * ⚠️ L'ENTRÉE COURANTE EST UN LIEN À RECHARGEMENT, LES AUTRES NON.
 *
 * Cliquer « Commandes » alors qu'on est sur `/fr/commandes?statut=expedie`
 * est une navigation vers le MÊME chemin — celle que le routeur de Next
 * abandonne en silence (mesuré le 29/08/2026, voir `LienEcran`). Les autres
 * entrées mènent à un autre chemin, où la navigation cliente marche : les
 * rendre natives coûterait un document complet sans rien réparer.
 */
function estActive(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(href + "/");
}

/**
 * Sommes-nous dans l'éditeur d'UNE commande ?
 *
 * `/fr/commandes` est la liste — les onglets y ont toute leur place.
 * `/fr/commandes/<id>` est l'éditeur, `/fr/commandes/<id>/page-client` son
 * aperçu. On exige donc un segment APRÈS `commandes`, et pas seulement un
 * préfixe : sans cela la liste elle-même perdrait sa navigation.
 */
function estEditionDeCommande(chemin: string): boolean {
  return /^\/[a-z]{2}\/commandes\/[^/]+/.test(chemin);
}

export function NavigationVendeur({
  entrees,
  variante,
  etiquette,
}: {
  readonly entrees: readonly EntreeNavigation[];
  readonly variante: "cote" | "bas";
  readonly etiquette: string;
}) {
  const chemin = usePathname();
  const mouvementReduit = useReducedMotion();

  if (variante === "bas") {
    /*
     * ⚠️ LA BARRE D'ONGLETS DISPARAÎT SUR L'ÉDITEUR D'UNE COMMANDE, et c'est la
     * planche `EditeurMobile` qui le dit : elle n'en dessine aucune. Elle pose à
     * la place une bande d'action collée en bas — « copier le lien » et « voir
     * la page publique ».
     *
     * Ce n'est pas un choix esthétique : les deux barres se superposaient. La
     * bande d'action de l'éditeur passait DERRIÈRE les onglets, donc les deux
     * gestes qui terminent le travail étaient inatteignables au téléphone.
     *
     * Éditer une commande est un contexte PLEIN ÉCRAN — on y entre par une
     * ligne de liste, on en sort par la flèche de retour, qui est en haut à
     * gauche et ne bouge pas. Il n'y a donc aucun cul-de-sac.
     */
    if (estEditionDeCommande(chemin)) return null;

    return (
      <nav
        aria-label={etiquette}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ds-filet bg-ds-surface-carte px-5 pt-2 pb-[18px] md:hidden"
      >
        <ul className="flex justify-between">
          {entrees.map((entree) => {
            const active = estActive(chemin, entree.href);
            const Composant = active ? LienEcran : Link;
            return (
              <li key={entree.href}>
                <Composant
                  href={entree.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 " +
                    (active ? "text-ds-accent-encre" : "text-ds-texte-corps")
                  }
                >
                  <IconeDe cle={entree.icone} actif={active} taille={21} />
                  {/*
                    ⚠️ 11,5 px ET NON 10, ET C EST LA MESURE QUI L A DIT. La
                    règle 5 du design system pose 11,5 px comme plancher sur
                    téléphone, et ces quatre libellés — les seules destinations
                    du produit au doigt — étaient à 10. Aucune garde ne pouvait
                    le voir : la sonde qui balaie les polices comptait aussi les
                    éléments MASQUÉS, donc elle signalait ces quatre libellés à
                    1440 px où ils ne sont pas rendus, et ses cinq faux positifs
                    couvraient le vrai.
                  */}
                  <span className="text-[11.5px] font-bold">{entree.libelle}</span>
                </Composant>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={etiquette}>
      {/* Écart de 6 px entre les entrées — `gap: 6` sur l `aside` du kit. */}
      <ul className="flex flex-col gap-1.5">
        {entrees.map((entree) => {
          const active = estActive(chemin, entree.href);
          const Composant = active ? LienEcran : Link;
          return (
            <li key={entree.href} className="relative">
              {/*
                LA PASTILLE ACTIVE GLISSE D'UNE RUBRIQUE À L'AUTRE.

                ⚠️ ELLE EST UN ÉLÉMENT À PART, PAS UN FOND SUR LE LIEN, et c'est
                toute l'astuce. Un `bg-violet-fond` posé sur l'entrée active
                disparaît d'un endroit et réapparaît à un autre : il n'y a rien
                à animer entre les deux, puisque ce sont deux boîtes
                différentes. Extrait en un seul élément porteur d'un `layoutId`,
                il devient LE MÊME élément d'un rendu au suivant — Motion mesure
                alors les deux positions et anime la trajectoire.

                ⚠️ CELA NE MARCHE QUE PARCE QUE LE DOCUMENT SURVIT AU CLIC.
                Mesuré le 09/09/2026 : passer d'une rubrique à une autre est une
                navigation CLIENTE, l'arbre React est conservé. Cliquer la
                rubrique où l'on est déjà, en revanche, détruit le document
                (voir `LienEcran`) — aucune animation ne traverse ça, et il n'y
                en a d'ailleurs rien à animer puisque la pastille ne bouge pas.

                ⚠️ ET ELLE NE PORTE AUCUNE INFORMATION : `aria-current` reste sur
                le lien, la couleur du texte change aussi. Un vendeur qui a coupé
                les animations voit la pastille se poser sans glisser, et sait
                exactement où il est.
              */}
              {active ? (
                <motion.span
                  layoutId="pastille-navigation-vendeur"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-ds-card bg-ds-surface-teinte"
                  transition={
                    mouvementReduit === true
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              ) : null}
              <Composant
                href={entree.href}
                aria-current={active ? "page" : undefined}
                className={
                  // ⚠️ 48 ET NON 42, GAP 14 ET NON 11, RAYON 16 ET NON 11 —
                  // mesuré sur la référence servie. Et la graisse CHANGE avec
                  // l'état : 700 quand l'entrée est active, 500 sinon. Le
                  // produit posait `font-semibold` des deux côtés, donc l'entrée
                  // courante ne se distinguait que par sa couleur.
                  // `SidebarItem` du kit : 48 de haut, `padding: 0 14px`, écart 14,
                  // rayon de carte, 15 px, graisse 700 quand l entrée est active
                  // et 500 sinon, survol sur `--ink-50`.
                  "relative flex h-12 items-center gap-[14px] rounded-ds-card px-[14px] text-[15px] transition-colors " +
                  (active
                    ? "font-bold text-ds-accent-encre"
                    : "font-medium text-ds-texte-corps hover:bg-ds-ink-50")
                }
              >
                {/* 20 px, trait 2,1 quand l entrée est active et 1,8 sinon —
                    c est le kit qui épaissit le trait avec la graisse. */}
                <IconeDe cle={entree.icone} actif={active} taille={20} />
                <span className="min-w-0 flex-1 truncate">{entree.libelle}</span>
                {entree.compte === undefined ? null : (
                  /* Pastille du kit : `padding: 2px 9px`, rayon pilule, 11/700.
                     Sur l entrée active elle prend l accent plein ; ailleurs, le
                     creux et la couleur sourdine. */
                  <span
                    className={
                      "shrink-0 rounded-ds-pill px-[9px] py-0.5 text-[11px] font-bold " +
                      (active
                        ? "bg-ds-accent text-ds-texte-sur-marque"
                        : "bg-ds-surface-creux text-ds-texte-sourdine")
                    }
                  >
                    {entree.compte}
                  </span>
                )}
              </Composant>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Résout la clé d icône et épaissit son trait quand l entrée est celle qu on
 *  regarde — 2,1 contre 1,8, comme `SidebarItem`. */
function IconeDe({
  cle,
  actif,
  taille,
}: {
  readonly cle: CleIcone;
  readonly actif: boolean;
  readonly taille: number;
}) {
  const Dessin = ICONES[cle];
  return <Dessin aria-hidden="true" size={taille} strokeWidth={actif ? 2.1 : 1.8} />;
}

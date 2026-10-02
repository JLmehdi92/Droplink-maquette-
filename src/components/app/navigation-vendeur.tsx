"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { LienEcran } from "@/components/lien-ecran";
import {
  Activity,
  ChartColumn,
  FileText,
  LayoutDashboard,
  Package,
  Palette,
  ScrollText,
  Settings,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * LA NAVIGATION DE L'ESPACE VENDEUR — la colonne de la coque, qui devient le
 * tiroir sous 1 020 px (`CoqueTiroir`). Il n'y a plus de barre d'onglets en bas :
 * la refonte la remplace par le tiroir (décision n° 1 de Mehdi, 02/10/2026).
 *
 * ELLE EST CLIENTE, ET C'EST UN ARBITRAGE ASSUMÉ. Le layout serveur ne connaît
 * pas le chemin courant : Next ne le lui passe pas. Sans lui, il n'y a pas
 * d'entrée active — or la pastille qui dit « vous êtes ici » est la seule chose
 * qui distingue cette barre d'une liste de liens.
 *
 * `aria-current="page"` est posé sur l'entrée active : sans lui, un lecteur
 * d'écran entend six liens identiques et rien ne dit lequel est la page ouverte.
 *
 * LES LIBELLÉS ARRIVENT EN PROPRIÉTÉS, résolus côté serveur : ce composant ne
 * doit pas tirer un catalogue de traduction dans le navigateur.
 */

/**
 * ⚠️ L'ICÔNE VOYAGE EN CLÉ, PAS EN COMPOSANT : une référence de fonction ne
 * traverse pas la frontière serveur → client. Les six icônes sont celles de la
 * maquette (`coque.html`).
 */
export type CleIcone =
  | "tableau"
  | "commandes"
  | "envois"
  | "analyses"
  | "marque"
  | "parametres"
  // Les huit de l'administration (maquette, `outils/admin.mjs`), qui partage cette colonne.
  | "adm-commandes"
  | "adm-comptes"
  | "adm-boutiques"
  | "adm-journal"
  | "adm-surveillance";

const ICONES: Record<CleIcone, LucideIcon> = {
  tableau: LayoutDashboard,
  commandes: Package,
  envois: Truck,
  analyses: ChartColumn,
  marque: Palette,
  parametres: Settings,
  "adm-commandes": FileText,
  "adm-comptes": Users,
  "adm-boutiques": Store,
  "adm-journal": ScrollText,
  "adm-surveillance": Activity,
};

export interface EntreeNavigation {
  readonly href: string;
  readonly libelle: string;
  readonly icone: CleIcone;
  /**
   * Le compte affiché à droite de l'entrée. FACULTATIF, et il doit le rester :
   * la maquette n'en pose qu'un, sur « Commandes ». Une lecture échouée n'en pose
   * aucun (jamais « 0 », qui affirmerait qu'on a compté).
   */
  readonly compte?: number;
  /**
   * Active sur son seul chemin, jamais sur ses sous-chemins : la racine de
   * l'administration (`/fr/admin`) préfixe tous les autres écrans.
   */
  readonly exacte?: boolean;
}

/**
 * L'entrée active est celle dont le chemin est un PRÉFIXE du chemin courant :
 * `/fr/commandes/xxxx` est l'éditeur d'une commande, et il vit sous
 * « Commandes ». Le préfixe est borné par un `/` pour que
 * `/fr/commandes-archivees` ne s'allume pas sur `/fr/commandes`.
 */
function estActive(chemin: string, href: string): boolean {
  if (chemin === href || chemin.startsWith(href + "/")) return true;
  // « Passer au Pro » s'ouvre depuis l'onglet Abonnement des Paramètres, et son
  // fil d'Ariane le dit : la maquette y allume « Paramètres ».
  return href.endsWith("/parametres") && chemin === href.slice(0, -"/parametres".length) + "/passer-pro";
}

export function NavigationVendeur({
  entrees,
  etiquette,
  idPastille = "pastille-navigation-vendeur",
  prefetch,
}: {
  readonly entrees: readonly EntreeNavigation[];
  readonly etiquette: string;
  /** Une par coque : l'administration a la sienne. */
  readonly idPastille?: string;
  /** `false` dans l'administration : son plafond de requêtes compte les préchargements. */
  readonly prefetch?: boolean;
}) {
  const chemin = usePathname();
  const mouvementReduit = useReducedMotion();
  const rangActif = entrees.findIndex((e) => (e.exacte === true ? chemin === e.href : estActive(chemin, e.href)));

  return (
    <nav className="app__nav" aria-label={etiquette}>
      {entrees.map((entree, rang) => {
        const active = rang === rangActif;
        /*
         * ⚠️ L'ENTRÉE COURANTE EST UN LIEN À RECHARGEMENT, LES AUTRES NON.
         * Cliquer « Commandes » depuis `/fr/commandes?statut=expedie` est une
         * navigation vers le MÊME chemin, que le routeur de Next abandonne en
         * silence (voir `LienEcran`).
         */
        const Composant = active ? LienEcran : Link;
        const Icone = ICONES[entree.icone];
        return (
          <Composant
            key={entree.href}
            href={entree.href}
            aria-current={active ? "page" : undefined}
            {...(prefetch === false ? { prefetch: false } : {})}
            style={{ "--rang": String(rang) } as React.CSSProperties}
            onClick={() => {
              // Le contenu suivant entre dans le sens du menu : on descend, il monte.
              if (rangActif >= 0 && rang !== rangActif) {
                document.documentElement.dataset.sens = rang < rangActif ? "haut" : "bas";
              }
            }}
          >
            {/*
              LA PASTILLE GLISSE D'UNE RUBRIQUE À L'AUTRE. Elle est un élément à
              part, porteur d'un `layoutId` : Motion mesure ses deux positions et
              anime la trajectoire. Elle ne porte aucune information
              (`aria-current` reste sur le lien) : sous mouvement réduit, elle se
              pose sans glisser.
            */}
            {active ? (
              <motion.i
                layoutId={idPastille}
                aria-hidden="true"
                className="app__nav-pastille"
                transition={
                  mouvementReduit === true
                    ? { duration: 0 }
                    : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }
                }
              />
            ) : null}
            <span className="app__nav-libelle">
              <Icone aria-hidden="true" className="ic" />
              {entree.libelle}
              {entree.compte === undefined ? null : (
                <span className="app__compte">{entree.compte}</span>
              )}
            </span>
          </Composant>
        );
      })}
    </nav>
  );
}

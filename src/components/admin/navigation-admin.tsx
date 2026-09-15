"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  BookMarked,
  ClipboardList,
  Ellipsis,
  LayoutDashboard,
  Settings,
  Store,
  Activity,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";

/**
 * LA NAVIGATION D'ADMINISTRATION, dans ses deux formes.
 *
 * POURQUOI ELLE EST CLIENTE alors que tout le reste de la surface est rendu au
 * serveur : le kit marque l'entrée COURANTE, et un layout ne connaît pas l'URL
 * de la page qu'il enveloppe. Sans cette marque, six entrées identiques ne
 * disent jamais où l'on est — sur une surface où l'on agit sur les données d'un
 * tiers, savoir sur quel écran on se trouve n'est pas du confort.
 *
 * Le coût est nul ici : l'administration n'a pas le budget de page de
 * `/p/[token]`, elle est vue par nous seuls, jamais depuis un DM en 4G.
 *
 * ⚠️ ELLE NE PROTÈGE RIEN. Masquer un lien ne ferme pas une route : chaque page
 * et chaque Server Action porte sa propre garde. Cette liste n'est qu'un moyen
 * de circuler.
 *
 * ⚠️ LES ICÔNES SONT DES CLÉS, PAS DES RÉFÉRENCES DE FONCTION, et c'est la même
 * contrainte que sur la coque vendeur : une fonction ne traverse pas la
 * frontière serveur → client. Le layout nomme, l'îlot résout.
 */

export type CleIconeAdmin =
  | "panneau"
  | "commandes"
  | "comptes"
  | "boutiques"
  | "statistiques"
  | "journal"
  | "veille"
  | "reglages";

/**
 * LES SIX ICÔNES, EN LUCIDE. L'ancien code employait les noms
 * `material-symbols` (`dashboard`, `person`, `storefront`, `bookmark`,
 * `monitoring`, `settings`) ; le design system est en Lucide, et la
 * correspondance se fait à la migration de l'écran, pas en bloc.
 */
const ICONES: Record<CleIconeAdmin, LucideIcon> = {
  panneau: LayoutDashboard,
  commandes: ClipboardList,
  comptes: Users,
  boutiques: Store,
  statistiques: BarChart3,
  journal: BookMarked,
  veille: Activity,
  reglages: Settings,
};

export interface EntreeAdmin {
  readonly href: string;
  /** Libellé complet, employé dans la colonne du bureau. */
  readonly libelle: string;
  /** Libellé court de la barre d'onglets — six colonnes de 60 px. */
  readonly court: string;
  readonly icone: CleIconeAdmin;
}

/**
 * Une entrée est courante si l'URL EST la sienne, ou commence par elle suivie
 * d'une barre — SAUF la racine, qui n'est courante que sur elle-même.
 *
 * ⚠️ DÉFAUT MESURÉ LE 12/09/2026, ET IL AVAIT SON PROPRE COMMENTAIRE QUI SE
 * TROMPAIT. Celui-ci disait : « le test naïf `pathname.startsWith(href)`
 * allumerait la racine `/fr/admin` sur TOUS les écrans », et prétendait le
 * corriger en ajoutant une barre. Mais `/fr/admin` + `/` est encore le préfixe
 * de `/fr/admin/surveillance` : la racine restait allumée PARTOUT, en même
 * temps que l'écran réel. DEUX entrées courantes, et un `aria-current="page"`
 * en double.
 *
 * Il est resté invisible tant que le chrome était sombre — les deux états ne
 * différaient que par un `bg-white/10`. Le design system peint l'entrée
 * courante du DÉGRADÉ DE MARQUE, et deux dégradés côte à côte se voient à
 * l'autre bout de la pièce. *Une correction qui décrit son intention plutôt
 * que son effet est un mensonge en attente.*
 *
 * La racine est reconnue par le fait qu'AUCUNE autre entrée ne la contient :
 * on ne la nomme pas, on la déduit de la liste. Nommer `/fr/admin` ici
 * casserait le jour où le préfixe de langue change.
 */
function estCourante(chemin: string, href: string, racine: boolean): boolean {
  if (racine) return chemin === href;
  return chemin === href || chemin.startsWith(href + "/");
}

/**
 * La RACINE d'une liste d'entrées : celle dont le chemin est préfixe de toutes
 * les autres. Sur la navigation d'administration c'est `/<langue>/admin`.
 */
function hrefRacine(entrees: readonly EntreeAdmin[]): string | null {
  for (const e of entrees) {
    if (entrees.every((a) => a === e || a.href.startsWith(e.href + "/"))) return e.href;
  }
  return null;
}

export function NavigationAdmin({
  entrees,
  etiquette,
  variante,
  plus = "",
}: {
  readonly entrees: readonly EntreeAdmin[];
  readonly etiquette: string;
  readonly variante: "colonne" | "onglets";
  /** Libellé de l'onglet qui déplie les destinations au-delà de la quatrième. */
  readonly plus?: string;
}) {
  const chemin = usePathname();
  const racine = hrefRacine(entrees);
  const plusRef = useRef<HTMLDetailsElement>(null);

  /* La feuille « Plus » se referme quand on change d'écran : un `<details>` resté
     ouvert recouvrirait l'écran qu'on vient d'ouvrir. */
  useEffect(() => {
    if (plusRef.current !== null) plusRef.current.open = false;
  }, [chemin]);

  if (variante === "onglets") {
    /*
     * ⚠️ QUATRE ONGLETS ET « PLUS », DEPUIS LE 15/09/2026 — ET LA BARRE DÉFILAIT.
     * Huit destinations ne tiennent pas dans 390 px : la barre glissait sous le
     * pouce, et mesurée à 390 elle rendait « Panneau » et « Journal » coupés aux
     * bords. Une destination cachée derrière un défilement horizontal ne se
     * trouve pas. (Avant elle, sept onglets de 60 px avaient fait se CHEVAUCHER
     * les libellés — « PanneauCommandesComptesBoutiques » — sans que rien ne
     * déborde du document.) Planche `AdminShell`, `AdminTabBar`.
     */
    const principales = entrees.slice(0, 4);
    const autres = entrees.slice(4);
    const autreCourante = autres.some((e) => estCourante(chemin, e.href, e.href === racine));
    return (
      <nav
        aria-label={etiquette}
        className="sticky bottom-0 z-20 flex border-t border-ds-filet bg-ds-surface-carte px-2 pt-2 pb-[18px] md:hidden"
      >
        {principales.map((entree) => {
          const courante = estCourante(chemin, entree.href, entree.href === racine);
          const Icone = ICONES[entree.icone];
          // Voir `LienEcran` : l'entrée courante vise le chemin déjà occupé.
          const Composant = courante ? LienEcran : Link;
          return (
            <Composant
              key={entree.href}
              href={entree.href}
              aria-current={courante ? "page" : undefined}
              className={
                "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-ds-sm " +
                (courante ? "text-ds-accent" : "text-ds-texte-sourdine")
              }
            >
              <Icone aria-hidden="true" size={20} strokeWidth={courante ? 2.1 : 1.8} />
              {/*
                ⚠️ 11,5 px ET NON 10. Le plancher de la règle 5 est 11,5 au
                téléphone, et cette barre y vit exclusivement : elle rendait ses
                six libellés à 10 px depuis toujours, sur la seule surface que
                la sonde ne pouvait pas mesurer — le plafond de débit de
                l'administration lui servait des 404.
              */}
              <span className={"text-[11.5px] leading-[normal] whitespace-nowrap " + (courante ? "font-bold" : "font-semibold")}>
                {entree.court}
              </span>
            </Composant>
          );
        })}
        <details ref={plusRef} className="group relative flex min-w-0 flex-1">
          <summary
            aria-current={autreCourante ? "page" : undefined}
            className={
              "flex min-h-11 w-full cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-ds-sm " +
              (autreCourante ? "text-ds-accent" : "text-ds-texte-sourdine")
            }
          >
            <Ellipsis aria-hidden="true" size={20} strokeWidth={autreCourante ? 2.1 : 1.8} />
            <span className={"text-[11.5px] leading-[normal] whitespace-nowrap " + (autreCourante ? "font-bold" : "font-semibold")}>
              {plus}
            </span>
          </summary>
          {/* Une feuille posée au-dessus de la barre, pleine largeur moins 8 px. */}
          <div className="fixed inset-x-2 bottom-[86px] z-30 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-1.5 shadow-ds-lg">
            {autres.map((entree) => {
              const courante = estCourante(chemin, entree.href, entree.href === racine);
              const Icone = ICONES[entree.icone];
              const Composant = courante ? LienEcran : Link;
              return (
                <Composant
                  key={entree.href}
                  href={entree.href}
                  aria-current={courante ? "page" : undefined}
                  className={
                    "flex min-h-11 items-center gap-3 rounded-ds-sm px-3 text-[14px] font-semibold transition-colors " +
                    (courante ? "bg-ds-surface-teinte text-ds-accent-encre" : "text-ds-texte-fort hover:bg-ds-surface-teinte")
                  }
                >
                  <Icone aria-hidden="true" size={18} strokeWidth={1.9} />
                  {entree.libelle}
                </Composant>
              );
            })}
          </div>
        </details>
      </nav>
    );
  }

  return (
    <nav aria-label={etiquette} className="hidden md:block">
      {/*
        LES VALEURS DU KIT, MESURÉES SUR SA PAGE SERVIE : entrée de 44 px de
        haut, rayon 16, `padding 0 14px`, écart 13, 14,5/700 en blanc sur le
        DÉGRADÉ DE MARQUE quand elle est courante, 14,5/500 sur l'encre de corps
        sinon. L'écart entre deux entrées est de 4.
      */}
      <ul className="flex flex-col gap-1">
        {entrees.map((entree) => {
          const courante = estCourante(chemin, entree.href, entree.href === racine);
          const Icone = ICONES[entree.icone];
          const Composant = courante ? LienEcran : Link;
          return (
            <li key={entree.href}>
              <Composant
                href={entree.href}
                aria-current={courante ? "page" : undefined}
                className={
                  "flex h-11 items-center gap-[13px] rounded-ds-card px-[14px] text-[14.5px] leading-5 whitespace-nowrap transition-colors " +
                  (courante
                    ? "degrade-ds-marque font-bold text-ds-texte-sur-marque shadow-ds-brand"
                    : "font-medium text-ds-texte-corps hover:bg-ds-surface-teinte hover:text-ds-texte-fort")
                }
              >
                <Icone aria-hidden="true" size={19} strokeWidth={courante ? 2.1 : 1.8} />
                {entree.libelle}
              </Composant>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

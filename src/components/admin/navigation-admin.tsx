"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  BookMarked,
  ClipboardList,
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
}: {
  readonly entrees: readonly EntreeAdmin[];
  readonly etiquette: string;
  readonly variante: "colonne" | "onglets";
}) {
  const chemin = usePathname();
  const racine = hrefRacine(entrees);
  const barre = useRef<HTMLElement>(null);

  /*
   * L'ONGLET COURANT EST RAMENÉ DANS LA VUE. La barre défile (voir plus bas) :
   * sans ce geste, ouvrir « Paramètres système » depuis la colonne du bureau
   * puis passer au téléphone montrerait une barre dont l'onglet allumé est
   * hors de l'écran — on ne saurait plus où l'on est.
   */
  useEffect(() => {
    const courant = barre.current?.querySelector('[aria-current="page"]');
    if (courant instanceof HTMLElement) courant.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [chemin]);

  if (variante === "onglets") {
    return (
      /*
       * ⚠️ LA BARRE DÉFILE, ET ELLE NE LE FAISAIT PAS. Six onglets de 60 px
       * tenaient dans 390 ; le septième, « Commandes » (14/09/2026), a fait se
       * CHEVAUCHER les libellés — « PanneauCommandesComptesBoutiques » — sans
       * qu'aucune sonde le voie : rien ne déborde du document, les boîtes se
       * rétrécissent et leurs textes se recouvrent. Chaque onglet garde donc la
       * largeur de son libellé, et la barre glisse sous le pouce.
       */
      <nav
        ref={barre}
        aria-label={etiquette}
        className="defilement-discret sticky bottom-0 z-20 flex overflow-x-auto border-t border-ds-filet bg-ds-surface-carte px-2 pt-2 pb-[18px] md:hidden"
      >
        {entrees.map((entree) => {
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
                "flex min-h-11 min-w-[60px] flex-auto shrink-0 flex-col items-center justify-center gap-1 rounded-ds-sm px-1.5 py-1 " +
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
              <span className={"text-[11.5px] leading-3 whitespace-nowrap " + (courante ? "font-bold" : "font-semibold")}>
                {entree.court}
              </span>
            </Composant>
          );
        })}
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

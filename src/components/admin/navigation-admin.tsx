"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/icone";
import type { NomIcone } from "@/lib/design/traces-icones";

/**
 * LA NAVIGATION D'ADMINISTRATION, dans ses deux formes.
 *
 * POURQUOI ELLE EST CLIENTE alors que tout le reste de la surface est rendu au
 * serveur : la planche marque l'entrée COURANTE, et un layout ne connaît pas
 * l'URL de la page qu'il enveloppe. Sans cette marque, six entrées identiques
 * ne disent jamais où l'on est — sur une surface où l'on agit sur les données
 * d'un tiers, savoir sur quel écran on se trouve n'est pas du confort.
 *
 * Le coût est nul ici : l'administration n'a pas le budget de page de
 * `/p/[token]`, elle est vue par nous seuls, jamais depuis un DM en 4G.
 *
 * ⚠️ ELLE NE PROTÈGE RIEN. Masquer un lien ne ferme pas une route : chaque page
 * et chaque Server Action porte sa propre garde. Cette liste n'est qu'un moyen
 * de circuler.
 */

export interface EntreeAdmin {
  readonly href: string;
  /** Libellé complet, employé dans la colonne du bureau. */
  readonly libelle: string;
  /** Libellé court de la barre d'onglets — 10 px, six colonnes de 60 px. */
  readonly court: string;
  readonly icone: NomIcone;
}

/**
 * Une entrée est courante si l'URL EST la sienne, ou commence par elle suivie
 * d'une barre.
 *
 * Le test naïf `pathname.startsWith(href)` allumerait la racine `/fr/admin` sur
 * TOUS les écrans, puisqu'elle est le préfixe de chacun. Et un `startsWith` sans
 * la barre allumerait `/fr/admin/comptes` sur `/fr/admin/comptes-archives` si
 * une telle route naissait un jour.
 */
function estCourante(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(href + "/");
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

  if (variante === "onglets") {
    return (
      <nav
        aria-label={etiquette}
        className="flex justify-between bg-admin px-4 pt-2 pb-[18px] md:hidden"
      >
        {entrees.map((entree) => {
          const courante = estCourante(chemin, entree.href);
          return (
            <Link
              key={entree.href}
              href={entree.href}
              aria-current={courante ? "page" : undefined}
              className={
                "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 " +
                (courante ? "text-white" : "text-white/50")
              }
            >
              <Icone nom={entree.icone} className="text-[20px]" />
              <span
                className={
                  "font-headline-md text-[10px] leading-3 " +
                  (courante ? "font-bold" : "font-semibold")
                }
              >
                {entree.court}
              </span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label={etiquette} className="hidden md:block">
      <ul className="flex flex-col gap-[3px]">
        {entrees.map((entree) => {
          const courante = estCourante(chemin, entree.href);
          return (
            <li key={entree.href}>
              <Link
                href={entree.href}
                aria-current={courante ? "page" : undefined}
                className={
                  "flex h-[42px] items-center gap-[11px] rounded-[11px] px-[13px] font-headline-md text-[14px] leading-[18px] font-semibold whitespace-nowrap transition-colors " +
                  (courante
                    ? "bg-white/10 text-white"
                    : "text-white/[0.58] hover:bg-white/10 hover:text-white")
                }
              >
                <Icone nom={entree.icone} className="text-[18px]" />
                {entree.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/icone";
import type { NomIcone } from "@/lib/design/traces-icones";

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

export interface EntreeNavigation {
  readonly href: string;
  readonly libelle: string;
  readonly icone: NomIcone;
}

/**
 * L'entrée active est celle dont le chemin est un PRÉFIXE du chemin courant.
 *
 * L'égalité stricte ne suffit pas : `/fr/commandes/xxxx` est l'éditeur d'une
 * commande, et laisser la barre sans entrée active à cet endroit ferait croire
 * qu'on a quitté la section. Le préfixe est borné par un `/` pour que
 * `/fr/commandes-archivees` ne s'allume pas sur `/fr/commandes`.
 */
function estActive(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(href + "/");
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

  if (variante === "bas") {
    return (
      <nav
        aria-label={etiquette}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-container-lowest px-5 pt-2 pb-[18px] md:hidden"
      >
        <ul className="flex justify-between">
          {entrees.map((entree) => {
            const active = estActive(chemin, entree.href);
            return (
              <li key={entree.href}>
                <Link
                  href={entree.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 " +
                    (active ? "text-secondary" : "text-sourdine")
                  }
                >
                  <Icone nom={entree.icone} className="h-[21px] w-[21px]" />
                  <span className="font-label-sm text-[10px] font-bold">{entree.libelle}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={etiquette}>
      <ul className="flex flex-col gap-[3px]">
        {entrees.map((entree) => {
          const active = estActive(chemin, entree.href);
          return (
            <li key={entree.href}>
              <Link
                href={entree.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex h-[42px] items-center gap-[11px] rounded-[11px] px-[13px] font-label-md text-[14px] font-semibold transition-colors " +
                  (active
                    ? "bg-secondary-container text-secondary"
                    : "text-on-surface-variant hover:bg-surface-container")
                }
              >
                <Icone nom={entree.icone} className="h-[18px] w-[18px]" />
                {entree.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

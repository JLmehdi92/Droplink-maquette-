"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/**
 * L'EN-TÊTE DES PAGES PUBLIQUES (landing, tarifs, docs, blog, légal) — maquette,
 * `index.html` et `pages-publiques.mjs` : logo, navigation, « Se connecter »,
 * « Créer un compte », et le menu des écrans étroits.
 *
 * Collant, et SANS `backdrop-filter` : dès qu'il recouvre du contenu (une
 * sentinelle de 8 px sort de l'écran), il prend une surface presque opaque. Un
 * flou recomposerait tout ce qui défile dessous à chaque image (Tarifs passait
 * de 36 à 59 images/s sans lui, mesuré sur la maquette).
 *
 * Le sélecteur de langue du produit (absent de la maquette, qui est en français
 * seulement) est rendu par le serveur et passé en propriété.
 */
export interface LienEntete {
  readonly href: string;
  readonly libelle: string;
  readonly courant?: boolean;
}

export function EntetePublique({
  accueil,
  libelleAccueil,
  logo,
  liens,
  etiquetteNav,
  connexion,
  inscription,
  selecteurLangue,
  libellesMenu,
}: {
  readonly accueil: string;
  readonly libelleAccueil: string;
  readonly logo: ReactNode;
  readonly liens: readonly LienEntete[];
  readonly etiquetteNav: string;
  readonly connexion: LienEntete;
  readonly inscription: LienEntete;
  readonly selecteurLangue: ReactNode;
  readonly libellesMenu: { readonly ouvrir: string; readonly fermer: string };
}) {
  const [defile, setDefile] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const sentinelle = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const cible = sentinelle.current;
    if (!cible) return;
    const o = new IntersectionObserver(([e]) => setDefile(e !== undefined && !e.isIntersecting));
    o.observe(cible);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      bouton.current?.focus();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  const fermer = (): void => setOuvert(false);
  const courant = (l: LienEntete) => (l.courant === true ? ({ "aria-current": "page" } as const) : {});

  return (
    <>
      <div className="sentinelle" ref={sentinelle} aria-hidden="true" />
      <header className={"entete" + (defile ? " est-defile" : "")}>
        <div className="entete__barre">
          <Link className="logo min-h-11" href={accueil} aria-label={libelleAccueil}>
            {logo}
          </Link>
          <nav className="nav" aria-label={etiquetteNav}>
            {liens.map((l) => (
              <Link key={l.href} href={l.href} {...courant(l)}>
                {l.libelle}
              </Link>
            ))}
          </nav>
          <div className="entete__actions">
            {selecteurLangue}
            <Link className="lien-discret" href={connexion.href}>
              {connexion.libelle}
            </Link>
            <Link className="bouton bouton--plein bouton--petit" href={inscription.href}>
              {inscription.libelle}
            </Link>
            <button
              ref={bouton}
              className="bouton-icone menu-bouton"
              type="button"
              aria-expanded={ouvert}
              aria-controls="menu-mobile"
              aria-label={ouvert ? libellesMenu.fermer : libellesMenu.ouvrir}
              onClick={() => setOuvert((o) => !o)}
            >
              {ouvert ? <X aria-hidden="true" className="ic" /> : <Menu aria-hidden="true" className="ic" />}
            </button>
          </div>
        </div>
        <div className="menu-mobile" id="menu-mobile" hidden={!ouvert}>
          {liens.map((l) => (
            <Link key={l.href} href={l.href} onClick={fermer} {...courant(l)}>
              {l.libelle}
            </Link>
          ))}
          {/* Les ancres, « Se connecter », puis « Créer un compte » (décision de Mehdi du
              03/10/2026, écrite d'abord dans la maquette). Au téléphone, le bouton de la barre
              est masqué (`socle.css`) : sans cette entrée, une page publique sans appel dans
              son corps (pages légales, signalement, articles) ne menait plus à l'inscription. */}
          <Link className="menu-mobile__connexion" href={connexion.href} onClick={fermer}>
            {connexion.libelle}
          </Link>
          <Link
            className="bouton bouton--plein bouton--large menu-mobile__inscription"
            href={inscription.href}
            onClick={fermer}
          >
            {inscription.libelle}
          </Link>
        </div>
      </header>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListFilter } from "lucide-react";

/**
 * LE SOMMAIRE DE LA DOCUMENTATION (maquette, `.doc-sommaire`) : une colonne collante au
 * bureau, un volet repliable au téléphone qui dit la section en cours.
 *
 * DEUX RENDUS DU MÊME SOMMAIRE, chacun masqué à l'autre largeur (`sommaire--bureau`,
 * `sommaire--telephone`) : la colonne au bureau, un `<details>` REPLIÉ au téléphone (ses
 * vingt entrées de 44 px passaient avant la première ligne, 15/09/2026). Aucun script ne
 * décide qui s'ouvre : la relecture du 02/10 a montré qu'un volet replié au montage
 * restait fermé — et invisible — quand la fenêtre s'élargissait, et qu'ouvert au rendu
 * il faisait sauter la page à l'hydratation. L'îlot ne fait que suivre la lecture et
 * refermer le volet après un choix.
 *
 * LA SECTION EN COURS suit la lecture (`data-actif`, `aria-current="location"`) : un
 * écouteur de défilement passif, sans bibliothèque.
 */
export function SommaireDocs({
  etiquette,
  titre,
  groupes,
}: {
  readonly etiquette: string;
  readonly titre: string;
  readonly groupes: readonly (readonly [string, readonly (readonly [string, string])[]])[];
}) {
  const ids = groupes.flatMap(([, entrees]) => entrees.map(([id]) => id));
  const libelles = new Map(groupes.flatMap(([, entrees]) => entrees));
  const [active, setActive] = useState(ids[0]);
  const volet = useRef<HTMLDetailsElement>(null);
  // Les ancres sont celles du rendu serveur, fixes pour la vie de la page.
  const ancres = useRef(ids);

  useEffect(() => {
    const suivre = () => {
      let courante = ancres.current[0];
      for (const id of ancres.current) {
        const titreSection = document.getElementById(id);
        // la dernière section dont le titre a passé le tiers haut de l'écran (maquette, `public.js`)
        if (titreSection !== null && titreSection.getBoundingClientRect().top <= window.innerHeight * 0.3) courante = id;
      }
      setActive(courante);
    };
    window.addEventListener("scroll", suivre, { passive: true });
    suivre();
    return () => window.removeEventListener("scroll", suivre);
  }, []);

  const liens = (fermer: boolean) =>
    groupes.map(([groupe, entrees]) => [
      <p key={"g-" + groupe} className="doc-nav__groupe">
        {groupe}
      </p>,
      ...entrees.map(([id, libelle]) => (
        <a
          key={id}
          href={"#" + id}
          data-actif={active === id ? "" : undefined}
          aria-current={active === id ? "location" : undefined}
          onClick={() => {
            setActive(id);
            if (fermer && volet.current !== null) volet.current.open = false;
          }}
        >
          {libelle}
        </a>
      )),
    ]);

  return (
    <>
      <details ref={volet} className="doc-sommaire sommaire--telephone">
        <summary>
          <ListFilter aria-hidden="true" className="ic" />
          <span>{titre}</span>
          <b>{active === undefined ? null : libelles.get(active)}</b>
          <ChevronDown aria-hidden="true" className="ic" />
        </summary>
        <nav className="doc-nav" aria-label={etiquette}>
          {liens(true)}
        </nav>
      </details>
      <nav className="doc-nav sommaire--bureau" aria-label={etiquette}>
        {liens(false)}
      </nav>
    </>
  );
}

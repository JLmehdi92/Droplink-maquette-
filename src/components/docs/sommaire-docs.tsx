"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListFilter } from "lucide-react";

/**
 * LE SOMMAIRE DE LA DOCUMENTATION (maquette, `.doc-sommaire`) : une colonne collante au
 * bureau, un volet repliable au téléphone qui dit la section en cours.
 *
 * UN `<details>`, OUVERT AU RENDU : sans JavaScript, le sommaire se lit en entier à
 * toutes les largeurs. Au téléphone, l'îlot le replie au montage (ses vingt entrées de
 * 44 px passaient avant la première ligne, 15/09/2026) et le referme après un choix.
 *
 * LA SECTION EN COURS suit la lecture (`data-actif`, `aria-current="location"`) : un
 * écouteur de défilement passif, sans bibliothèque.
 */
const TELEPHONE = "(max-width: 980px)";

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
    if (volet.current !== null && window.matchMedia(TELEPHONE).matches) volet.current.open = false;
    const suivre = () => {
      let courante = ancres.current[0];
      for (const id of ancres.current) {
        const titreSection = document.getElementById(id);
        if (titreSection !== null && titreSection.getBoundingClientRect().top <= 120) courante = id;
      }
      setActive(courante);
    };
    window.addEventListener("scroll", suivre, { passive: true });
    suivre();
    return () => window.removeEventListener("scroll", suivre);
  }, []);

  return (
    <details ref={volet} className="doc-sommaire" open>
      <summary>
        <ListFilter aria-hidden="true" className="ic" />
        <span>{titre}</span>
        <b>{active === undefined ? null : libelles.get(active)}</b>
        <ChevronDown aria-hidden="true" className="ic" />
      </summary>
      <nav className="doc-nav" aria-label={etiquette}>
        {groupes.map(([groupe, entrees]) => [
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
                if (volet.current !== null && window.matchMedia(TELEPHONE).matches) volet.current.open = false;
              }}
            >
              {libelle}
            </a>
          )),
        ])}
      </nav>
    </details>
  );
}

"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * LE SÉLECTEUR DE PÉRIODE (maquette, `.periodes` : un curseur qui glisse sous le
 * bouton choisi).
 *
 * La période change SANS RECHARGER la page (décision n° 10 de Mehdi) : c'est une
 * navigation du routeur, l'URL reste l'état (`?periode=`), et le serveur relit
 * les chiffres — ils ne sont jamais recalculés dans le navigateur. Le curseur
 * part tout de suite (état optimiste) et le groupe porte `aria-busy` tant que
 * les chiffres de la nouvelle période ne sont pas arrivés (l'écran estompe les
 * anciens). Quand la navigation se termine SANS avoir changé la période servie
 * (échec, annulation), le curseur revient sur celle qui est réellement affichée :
 * l'interface n'affirme pas une période que le serveur n'a pas rendue.
 */
export function SelecteurPeriode({
  periodes,
  actif,
  etiquette,
}: {
  readonly periodes: ReadonlyArray<{ readonly cle: string; readonly libelle: string; readonly href: string }>;
  readonly actif: string;
  readonly etiquette: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [choisi, setChoisi] = useState(actif);
  const [servi, setServi] = useState(actif);
  // Le serveur a servi une autre période (retour arrière, lien) : on s'y range.
  if (servi !== actif) {
    setServi(actif);
    setChoisi(actif);
  } else if (!enCours && choisi !== actif) {
    // Navigation terminée sans changer la période servie : retour au vrai.
    setChoisi(actif);
  }
  const groupe = useRef<HTMLDivElement>(null);
  const curseur = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const g = groupe.current, c = curseur.current;
    if (!g || !c) return;
    const placer = () => {
      const b = g.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!b) return;
      c.style.width = `${b.offsetWidth}px`;
      c.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    placer();
    const obs = new ResizeObserver(placer);
    obs.observe(g);
    return () => obs.disconnect();
  }, [choisi]);

  // Au clavier, chaque flèche remplace l'entrée d'historique au lieu d'en
  // empiler une par période traversée.
  const aller = (cle: string, href: string, remplacer = false) => {
    if (cle === choisi) return;
    setChoisi(cle);
    demarrer(() => (remplacer ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })));
  };

  return (
    <div ref={groupe} className="periodes" role="radiogroup" aria-label={etiquette} aria-busy={enCours || undefined}>
      <i ref={curseur} className="periodes__curseur" aria-hidden="true" />
      {periodes.map((p, i) => {
        const on = p.cle === choisi;
        return (
          <button
            key={p.cle}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => aller(p.cle, p.href)}
            onKeyDown={(e) => {
              const nb = periodes.length;
              const cible =
                e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % nb
                : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + nb) % nb
                : e.key === "Home" ? 0
                : e.key === "End" ? nb - 1
                : -1;
              if (cible < 0) return;
              e.preventDefault();
              const suivante = periodes[cible];
              if (!suivante) return;
              e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[cible]?.focus();
              aller(suivante.cle, suivante.href, true);
            }}
          >
            {p.libelle}
          </button>
        );
      })}
    </div>
  );
}

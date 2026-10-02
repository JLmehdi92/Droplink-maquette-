"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * L'APERÇU DE LA PAGE CLIENT AU SURVOL D'UNE COMMANDE (décision n° 6 de Mehdi ;
 * maquette, `tableau.js` : `apercu-flottant`).
 *
 * L'aperçu est la VRAIE page, celle que la fiche commande encadre
 * (`/p/<jeton>/apercu`) : même rendu que le client, aucune vue comptée, aucun
 * geste possible (`inert`). Jamais une imitation : une page refaite pour
 * l'aperçu divergerait de la vraie au premier changement.
 *
 * Il ne s'ouvre qu'à la souris, après 450 ms d'intention (une liste qu'on
 * traverse ne déclenche rien), se pose à GAUCHE de la liste pour que la ligne
 * survolée reste lisible, et se ferme quand on quitte la liste ou qu'on défile.
 * Décoratif pour un lecteur d'écran : la ligne mène déjà à la commande.
 *
 * Chaque page déjà ouverte GARDE son cadre (cinq au plus, une par ligne) : revenir
 * sur une ligne ne recharge pas une page client entière — rendu serveur, adresses
 * signées, et le même quota que la page publique.
 */
const LARG = 236;
const HAUT = (236 * 844) / 390 + 20;

export function ApercuSurvol({ children }: { readonly children: ReactNode }) {
  const liste = useRef<HTMLDivElement>(null);
  const [jeton, setJeton] = useState<string | null>(null);
  const [vus, setVus] = useState<readonly string[]>([]);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const racine = liste.current;
    if (!racine || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let ouvert = false;
    let intention = 0;
    let fermeture = 0;
    let image = 0;
    const ouvrir = (lien: HTMLElement) => {
      const j = lien.dataset.jeton;
      if (!j) return;
      const bloc = lien.closest(".bloc")?.getBoundingClientRect();
      const l = lien.getBoundingClientRect();
      if (!bloc) return;
      setPos({
        x: Math.max(16, bloc.left - LARG - 20),
        y: Math.max(12, Math.min(innerHeight - HAUT - 12, l.top + l.height / 2 - HAUT / 2)),
      });
      setJeton(j);
      setVus((v) => (v.includes(j) ? v : [...v, j].slice(-5)));
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => setVisible(true));
    };
    const fermer = () => {
      ouvert = false;
      clearTimeout(intention);
      cancelAnimationFrame(image);
      setVisible(false);
    };
    const entrer = (e: PointerEvent) => {
      const lien = (e.target as Element | null)?.closest<HTMLElement>("[data-jeton]");
      if (!lien) return;
      clearTimeout(intention);
      clearTimeout(fermeture);
      if (ouvert) ouvrir(lien);
      else
        intention = window.setTimeout(() => {
          ouvert = true;
          ouvrir(lien);
        }, 450);
    };
    const quitter = () => {
      clearTimeout(intention);
      fermeture = window.setTimeout(fermer, 0);
    };
    racine.addEventListener("pointerover", entrer);
    racine.addEventListener("pointerleave", quitter);
    window.addEventListener("scroll", fermer, { passive: true });
    return () => {
      clearTimeout(intention);
      clearTimeout(fermeture);
      cancelAnimationFrame(image);
      racine.removeEventListener("pointerover", entrer);
      racine.removeEventListener("pointerleave", quitter);
      window.removeEventListener("scroll", fermer);
    };
  }, []);

  return (
    <div ref={liste}>
      {children}
      {jeton === null ? null : (
        <div
          className={"apercu-flottant" + (visible ? " est-visible" : "")}
          style={{ "--x": `${pos.x}px`, "--y": `${pos.y}px` } as React.CSSProperties}
          aria-hidden="true"
        >
          <div className="telephone telephone--apercu">
            <div className="telephone__ecran">
              {vus.map((j) => (
                <iframe
                  key={j}
                  className="apercu-flottant__page"
                  src={`/p/${encodeURIComponent(j)}/apercu`}
                  title=""
                  tabIndex={-1}
                  hidden={j !== jeton}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

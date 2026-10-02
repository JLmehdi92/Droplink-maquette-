"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * LA SÉLECTION ET LES ACTIONS GROUPÉES (maquette, `[data-tout]` et `.lot`).
 *
 * Les cases sont de vrais `<input name="selection">` du formulaire de lot, rendu
 * par le serveur : archiver une sélection est un POST natif, qui marche même si
 * ce script n'a pas chargé. Les deux îlots ci-dessous n'ajoutent que ce que le
 * HTML ne sait pas faire seul : « tout sélectionner », et le COMPTE de la barre.
 * La barre elle-même s'affiche par le CSS (`:has(:checked)`), compte ou pas.
 */
function formulaireDe(el: HTMLElement | null): HTMLFormElement | null {
  return el?.closest("form") ?? null;
}
const cases = (f: HTMLFormElement) => [...f.querySelectorAll<HTMLInputElement>('input[name="selection"]')];

export function CaseTout({ libelle }: { readonly libelle: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const entree = ref.current, f = formulaireDe(entree);
    if (!entree || !f) return;
    const suivre = () => {
      const toutes = cases(f), n = toutes.filter((c) => c.checked).length;
      entree.checked = n > 0 && n === toutes.length;
      entree.indeterminate = n > 0 && n < toutes.length;
    };
    const apresReset = () => window.setTimeout(suivre, 0);
    f.addEventListener("change", suivre);
    f.addEventListener("reset", apresReset);
    return () => {
      f.removeEventListener("change", suivre);
      f.removeEventListener("reset", apresReset);
    };
  }, []);
  return (
    <label className="coche">
      <input
        ref={ref}
        type="checkbox"
        aria-label={libelle}
        onChange={(e) => {
          const f = formulaireDe(e.currentTarget);
          if (!f) return;
          const coche = e.currentTarget.checked;
          cases(f).forEach((c) => (c.checked = coche));
          f.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      />
      <i />
    </label>
  );
}

export function BarreLot({
  langue,
  libelles,
  children,
}: {
  readonly langue: string;
  readonly libelles: { readonly region: string; readonly un: string; readonly plusieurs: string; readonly fermer: string };
  /** Le bouton qui soumet le lot (rendu par le serveur, il porte `name`/`value`). */
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const f = formulaireDe(ref.current);
    if (!f) return;
    const compter = () => setN(cases(f).filter((c) => c.checked).length);
    const apresReset = () => window.setTimeout(compter, 0);
    compter();
    f.addEventListener("change", compter);
    f.addEventListener("reset", apresReset);
    return () => {
      f.removeEventListener("change", compter);
      f.removeEventListener("reset", apresReset);
    };
  }, []);
  // LA BARRE SORT EN FONDU (maquette : 200 ms) quand la dernière case est décochée : le
  // CSS ne sait pas animer un `display: none`, elle reste donc posée le temps de sortir,
  // avec le dernier compte affiché.
  const [sortie, setSortie] = useState<number | null>(null);
  const [nVu, setNVu] = useState(n);
  if (nVu !== n) {
    setNVu(n);
    if (n === 0 && nVu > 0) setSortie(nVu);
    else if (n > 0) setSortie(null);
  }
  useEffect(() => {
    if (sortie === null) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const m = window.setTimeout(() => setSortie(null), reduit ? 0 : 200);
    return () => window.clearTimeout(m);
  }, [sortie]);
  const affiche = sortie ?? n;
  const forme = new Intl.PluralRules(langue).select(affiche) === "one" ? libelles.un : libelles.plusieurs;
  // Le nombre en gras, à chiffres tabulaires (maquette : `<b data-lot-n>`).
  const [avant, apres] = forme.split("#") as [string, string | undefined];
  return (
    <div
      ref={ref}
      className={"lot" + (n > 0 ? " est-visible" : "") + (sortie !== null ? " est-sortante" : "")}
      role="region"
      aria-label={libelles.region}
    >
      <p aria-live="polite">
        {avant}
        <b className="lot__n">{new Intl.NumberFormat(langue).format(affiche)}</b>
        {apres ?? ""}
      </p>
      {children}
      <button type="reset" className="lot__fermer" aria-label={libelles.fermer}>
        <X aria-hidden="true" className="ic" />
      </button>
    </div>
  );
}

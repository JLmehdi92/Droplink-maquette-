"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * LE GRAPHIQUE DU TABLEAU DE BORD (maquette, `analytique.js` : `frise` et `liens`).
 *
 * Deux vues sur la même carte, à bascule (décision n° 10 de Mehdi) : la frise des
 * douze semaines de commandes créées, ou les ouvertures des liens jour par jour
 * sur la période. Les deux séries sont LUES PAR LE SERVEUR (mêmes lectures que
 * l'écran Analyses) et arrivent ici prêtes, dates déjà formatées dans la langue :
 * ce composant ne compte rien, il dessine.
 *
 * Une seule zone de visée pour toute la frise : au doigt, douze colonnes de 25 px
 * seraient autant de cibles trop petites. Au clavier, les flèches lisent chaque
 * point ; les valeurs exactes sont aussi dans un tableau dépliable.
 */
export interface PointGraphe {
  readonly valeur: number;
  /** Date courte (axe, tableau). */
  readonly court: string;
  /** Date longue (bulle). */
  readonly long: string;
}

export interface TextesGraphe {
  readonly bascule: string;
  readonly commandes: string;
  readonly liens: string;
  readonly titreSemaines: string;
  readonly aideSemaines: string;
  readonly titreLiens: string;
  readonly aideLiens: string;
  readonly voirValeurs: string;
  readonly semaineDu: string;
  readonly creees: string;
  readonly jour: string;
  readonly ouvertures: string;
  readonly cetteSemaine: string;
  readonly zoneSemaines: string;
  readonly zoneLiens: string;
  readonly videSemaines: string;
  readonly videLiens: string;
}

const EASE = "cubic-bezier(.23,1,.32,1)";
const GAUCHE = 30, BAS = 26, HAUT = 10;

export function GrapheTableau({
  semaines,
  ouvertures,
  textes,
  fixe,
  meta,
}: {
  readonly semaines: readonly PointGraphe[] | null;
  readonly ouvertures: readonly PointGraphe[] | null;
  readonly textes: TextesGraphe;
  /**
   * Une seule vue, sans bascule : aux Analyses, la frise et les ouvertures ont
   * chacune leur carte (maquette, `analyses.html`) ; la courbe y est compacte.
   */
  readonly fixe?: "semaines" | "liens";
  /** La mention à droite du titre (« 12 dernières semaines », « 142 ouvertures »). */
  readonly meta?: string;
}) {
  const [vueChoisie, setVue] = useState<"semaines" | "liens">("semaines");
  const vue = fixe ?? vueChoisie;
  const zone = useRef<HTMLDivElement>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [vise, setVise] = useState<number | null>(null);
  const premier = useRef(true);
  const traceePour = useRef<string | null>(null);
  const [auClavier, setAuClavier] = useState(false);
  const id = useId().replace(/:/g, "");

  useLayoutEffect(() => {
    const z = zone.current;
    if (!z) return;
    const mesurer = () => setTaille((t) => (Math.abs(t.l - z.clientWidth) > 4 || t.h !== z.clientHeight ? { l: z.clientWidth, h: z.clientHeight } : t));
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(z);
    return () => obs.disconnect();
  }, []);

  const serie = vue === "semaines" ? semaines : ouvertures;
  const W = Math.max(280, taille.l), H = taille.h || 240;

  // Les barres montent une fois au premier dessin, le trait se trace à chaque bascule.
  useEffect(() => {
    const z = zone.current;
    if (!z || taille.l === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (vue !== "liens") traceePour.current = null;
    if (vue === "semaines" && premier.current) {
      premier.current = false;
      z.querySelectorAll(".graphe__barre").forEach((b, i) =>
        b.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 520, delay: i * 35, easing: EASE, fill: "backwards" }),
      );
    } else if (vue === "liens" && traceePour.current !== "liens") {
      // Le trait se trace à la bascule, pas à chaque redimensionnement.
      traceePour.current = "liens";
      z.querySelector(".graphe__trait")?.animate([{ strokeDasharray: "1", strokeDashoffset: 1 }, { strokeDasharray: "1", strokeDashoffset: 0 }], { duration: 900, easing: EASE });
      z.querySelector(".graphe__aire")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300, easing: "ease-out", fill: "backwards" });
    }
  }, [vue, taille.l]);

  const basculer = (v: "semaines" | "liens") => {
    if (v === vue) return;
    setVise(null);
    setVue(v);
  };

  let dessin: React.ReactNode = null;
  let bulle: React.ReactNode = null;
  let bulleXY: [number, number] = [0, 0];
  let lignes: ReadonlyArray<readonly [string, number]> = [];
  let viser: (e: React.PointerEvent<HTMLDivElement>) => void = () => {};
  const n = serie?.length ?? 0;

  if (serie !== null && n > 0 && taille.l > 0) {
    const brutMax = Math.max(...serie.map((p) => p.valeur));
    const max = Math.max(4, Math.ceil(brutMax / 4) * 4);
    const y = (v: number) => HAUT + (1 - v / max) * (H - BAS - HAUT);
    const grille = [0, max / 2, max];
    const axeY = grille.map((v) => (
      <text key={v} x={GAUCHE - 10} y={y(v) + 4} textAnchor="end">
        {v}
      </text>
    ));
    lignes = serie.map((p) => [p.court, p.valeur] as const);
    if (vue === "semaines") {
      const pas = (W - GAUCHE) / n, lb = Math.min(28, pas * 0.56);
      dessin = (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          <g className="graphe__grille">
            {grille.map((v) => <line key={v} x1={GAUCHE} x2={W} y1={y(v)} y2={y(v)} />)}
          </g>
          <g className="graphe__axe">
            {axeY}
            {serie.map((p, i) =>
              (pas >= 44 ? i % 2 === 0 && i < n - 2 : i % 4 === 0 && i < n - 4) || i === n - 1 ? (
                <text key={i} x={GAUCHE + pas * i + pas / 2} y={H - 6} textAnchor="middle">
                  {i === n - 1 ? textes.cetteSemaine : p.court}
                </text>
              ) : null,
            )}
          </g>
          {serie.map((p, i) => {
            const h = y(0) - y(p.valeur);
            return (
              <rect
                key={i}
                className={"graphe__barre" + (i === n - 1 ? " est-courante" : "") + (vise === i ? " est-visee" : "")}
                x={GAUCHE + pas * i + (pas - lb) / 2}
                y={y(0) - h}
                width={lb}
                height={h}
                rx={4}
              />
            );
          })}
        </svg>
      );
      viser = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setVise(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))));
      };
      if (vise !== null) {
        const p = serie[vise];
        if (p) {
          bulleXY = [(GAUCHE + pas * vise + pas / 2) * (taille.l / W), y(p.valeur)];
          bulle = (
            <>
              <p className="bulle__date">{p.long}</p>
              <p>
                <span>{textes.creees}</span>
                <b>{p.valeur}</b>
              </p>
            </>
          );
        }
      }
    } else {
      const x = (i: number) => GAUCHE + (n === 1 ? 0 : (i / (n - 1)) * (W - GAUCHE - 6));
      const d = serie.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valeur).toFixed(1)}`).join("");
      const tics = [0, Math.round((n - 1) / 2), n - 1];
      dessin = (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          <defs>
            <linearGradient id={`aire-${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".16" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="graphe__grille">
            {grille.map((v) => <line key={v} x1={GAUCHE} x2={W} y1={y(v)} y2={y(v)} />)}
          </g>
          <g className="graphe__axe">
            {axeY}
            {[...new Set(tics)].map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {serie[i]?.court}
              </text>
            ))}
          </g>
          <path className="graphe__aire" d={`${d}L${x(n - 1)},${y(0)}L${GAUCHE},${y(0)}Z`} fill={`url(#aire-${id})`} />
          <path className="graphe__trait" d={d} pathLength={1} />
          {vise !== null && serie[vise] ? (
            <>
              <line className="graphe__reticule" x1={x(vise)} x2={x(vise)} y1={HAUT} y2={y(0)} />
              <circle className="graphe__point" r={4.5} cx={x(vise)} cy={y(serie[vise].valeur)} />
            </>
          ) : null}
        </svg>
      );
      viser = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        // La zone de visée commence DÉJÀ après la marge de l'axe : sa largeur
        // couvre `W - GAUCHE` unités du dessin, sans marge à retirer.
        const brut = (((e.clientX - r.left) / r.width) * (W - GAUCHE) / (W - GAUCHE - 6)) * (n - 1);
        setVise(Math.max(0, Math.min(n - 1, Math.round(brut))));
      };
      if (vise !== null) {
        const p = serie[vise];
        if (p) {
          bulleXY = [x(vise) * (taille.l / W), y(p.valeur)];
          bulle = (
            <>
              <p className="bulle__date">{p.long}</p>
              <p>
                <span>{textes.ouvertures}</span>
                <b>{p.valeur}</b>
              </p>
            </>
          );
        }
      }
    }
  }

  const titre = vue === "semaines" ? textes.titreSemaines : textes.titreLiens;
  const aide = vue === "semaines" ? textes.aideSemaines : textes.aideLiens;
  const vide = serie === null || n === 0 || serie.every((p) => p.valeur === 0);
  const largeurBulle = 190;
  const bx = Math.round(Math.min(taille.l - largeurBulle, Math.max(0, bulleXY[0] - largeurBulle / 2)));
  const by = Math.round(Math.max(0, bulleXY[1] - 64));

  return (
    <section className="bloc bloc--graphe v4-carte" aria-labelledby={`t-graphe-${id}`}>
      <header className="bloc__tete">
        <h2 id={`t-graphe-${id}`}>{titre}</h2>
        {meta === undefined ? null : <p className="bloc__meta">{meta}</p>}
        {fixe !== undefined ? null : (
        <div className="bascule" role="group" aria-label={textes.bascule}>
          {(["semaines", "liens"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vue === v}
              onClick={() => basculer(v)}
            >
              {v === "semaines" ? textes.commandes : textes.liens}
            </button>
          ))}
        </div>
        )}
      </header>
      <p className="bloc__aide">{aide}</p>
      <div className={"graphe" + (fixe === "liens" ? " graphe--compact" : "") + (vise !== null ? " est-vise" : "")} ref={zone}>
        {dessin}
        {serie !== null && n > 0 ? (
          <div
            className="graphe__zone"
            tabIndex={0}
            role="img"
            aria-label={vue === "semaines" ? textes.zoneSemaines : textes.zoneLiens}
            style={{ left: `${(GAUCHE / W) * 100}%` }}
            onPointerMove={viser}
            onPointerLeave={() => setVise(null)}
            onFocus={() => {
              setAuClavier(true);
              setVise(n - 1);
            }}
            onBlur={() => {
              setAuClavier(false);
              setVise(null);
            }}
            onKeyDown={(e) => {
              const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!k) return;
              e.preventDefault();
              setVise((v) => Math.max(0, Math.min(n - 1, (v ?? n - 1) + k)));
            }}
          />
        ) : null}
        {/* La bulle est décorative ; au clavier, le point lu est ANNONCÉ ici. */}
        <p className="visuellement-cache" aria-live="polite">
          {auClavier && vise !== null && serie?.[vise]
            ? `${serie[vise].long} : ${serie[vise].valeur} ${vue === "semaines" ? textes.creees : textes.ouvertures}`
            : ""}
        </p>
        <div className="bulle" style={{ transform: `translate(${bx}px, ${by}px)` }} aria-hidden="true">
          {bulle}
        </div>
        {vide ? <p className="graphe__vide">{vue === "semaines" ? textes.videSemaines : textes.videLiens}</p> : null}
      </div>
      {lignes.length > 0 ? (
        <details className="table-vue">
          <summary>{textes.voirValeurs}</summary>
          <div className="table-vue__defil">
            <table>
              <thead>
                <tr>
                  <th scope="col">{vue === "semaines" ? textes.semaineDu : textes.jour}</th>
                  <th scope="col">{vue === "semaines" ? textes.creees : textes.ouvertures}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(([quand, v], i) => (
                  <tr key={i}>
                    <td>{quand}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

import { echelle } from "@/components/admin/echelle";

/**
 * LES COURBES DE L'ADMINISTRATION (maquette, `.adm-graphe` + `.adm-ligne`) : une
 * ou deux séries sur la même grille que les barres, et leur légende en ligne.
 *
 * UNE VALEUR ABSENTE COUPE LA COURBE, elle ne tombe pas à zéro : un jour sans
 * colis livré n'a pas de délai, et le tracer à 0 inventerait une livraison
 * instantanée. Le SVG est une image (`role="img"`), la légende nomme chaque série.
 */
const L = 600;
const H = 160;

export function LignesAdmin({
  series,
  etiquette,
  debut,
  fin,
}: {
  readonly series: readonly { readonly cle: string; readonly libelle: string; readonly trait: string; readonly valeurs: readonly (number | null)[] }[];
  readonly etiquette: string;
  readonly debut: string;
  readonly fin: string;
}) {
  const toutes = series.flatMap((s) => s.valeurs.filter((v): v is number => v !== null));
  const { plafond, graduations } = echelle(Math.max(0, ...toutes), 4);
  const n = Math.max(2, ...series.map((s) => s.valeurs.length));
  const x = (i: number) => (i / (n - 1)) * L;
  const y = (v: number) => H - (H * v) / (plafond || 1);
  const trace = (vs: readonly (number | null)[]) => {
    let d = "";
    let leve = true;
    vs.forEach((v, i) => {
      if (v === null) {
        leve = true;
        return;
      }
      d += `${leve ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      leve = false;
    });
    return d.trim();
  };
  return (
    <div className="adm-graphe">
      <div className="adm-graphe__plot">
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img" aria-label={etiquette}>
          {[0, 1, 2, 3, 4].map((k) => (
            <line key={k} x1="0" x2={L} y1={(H * k) / 4} y2={(H * k) / 4} className="adm-graphe__grille" />
          ))}
          {series.map((s, k) => (
            <path
              key={s.cle}
              d={trace(s.valeurs)}
              fill="none"
              stroke={s.trait}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              className="adm-ligne"
              style={{ "--k": String(k) } as React.CSSProperties}
            />
          ))}
        </svg>
        <div className="adm-graphe__axe" aria-hidden="true">
          {graduations.map((g) => (
            <span key={g}>{Math.round(g)}</span>
          ))}
        </div>
      </div>
      <p className="adm-graphe__bas" aria-hidden="true">
        <span>{debut}</span>
        <span>{fin}</span>
      </p>
      {series.length < 2 ? null : (
        <ul className="adm-legende adm-legende--ligne">
          {series.map((s) => (
            <li key={s.cle}>
              <i aria-hidden="true" style={{ background: s.trait }} />
              <span>{s.libelle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

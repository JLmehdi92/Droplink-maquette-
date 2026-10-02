import { getFormatter } from "next-intl/server";

/**
 * L'ANNEAU DE RÉPARTITION — refonte du 02/10/2026 (maquette, `.adm-anneau` et
 * `.adm-legende`) : l'anneau de 168 px, le total et son unité au centre, puis la
 * légende — pastille, libellé, nombre, part.
 *
 * LA COULEUR N'EST JAMAIS SEULE : chaque part est nommée et chiffrée dans la
 * légende, et l'anneau porte un libellé (`role="img"`). Le survol d'une part
 * donne son chiffre en info-bulle (`data-info`), un confort qui ne porte rien
 * que la légende ne dise déjà.
 */
export interface PartAnneau {
  readonly cle: string;
  readonly libelle: string;
  readonly valeur: number;
  /** Une couleur CSS résolue — un jeton `var(--…)`, jamais un hexa. */
  readonly trait: string;
}

const R = 52;
const C = 2 * Math.PI * R;

export async function Anneau({
  parts,
  total,
  unite,
  part,
  etiquette,
}: {
  readonly parts: readonly PartAnneau[];
  readonly total: number;
  /** Le mot sous le total, au centre : « commandes », « comptes ». */
  readonly unite: string;
  /** Le gabarit d'une part, « {part} % » — la langue décide de l'espace. */
  readonly part: (pourcent: number) => string;
  /** Ce que l'anneau répartit, pour qui ne le voit pas. */
  readonly etiquette: string;
}) {
  const format = await getFormatter();
  const pourcent = (v: number) => (total === 0 ? 0 : Math.round((100 * v) / total));
  // Les segments sont calculés AVANT le rendu : un cumul tenu pendant le `map`
  // serait une écriture après rendu.
  const segments = parts.reduce<{ readonly p: PartAnneau; readonly k: number; readonly acc: number }[]>((liste, p) => {
    const acc = liste.reduce((n, s) => n + s.k, 0);
    return [...liste, { p, k: total === 0 ? 0 : p.valeur / total, acc }];
  }, []);
  return (
    <>
      <div className="adm-anneau">
        <svg viewBox="0 0 128 128" role="img" aria-label={etiquette}>
          <circle r={R} cx="64" cy="64" fill="none" stroke="var(--filet)" strokeWidth="14" />
          {segments.map(({ p, k, acc }) =>
            k === 0 ? null : (
              <circle
                key={p.cle}
                r={R}
                cx="64"
                cy="64"
                fill="none"
                stroke={p.trait}
                strokeWidth="14"
                strokeDasharray={`${Math.max(0, k * C - 2).toFixed(2)} ${C.toFixed(2)}`}
                strokeDashoffset={(-acc * C).toFixed(2)}
                transform="rotate(-90 64 64)"
                data-info={`${p.libelle} : ${format.number(p.valeur)} (${part(pourcent(p.valeur))})`}
              />
            ),
          )}
        </svg>
        <p className="adm-anneau__centre">
          <b>{format.number(total)}</b>
          <span>{unite}</span>
        </p>
      </div>
      <ul className="adm-legende">
        {parts.map((p) => (
          <li key={p.cle}>
            <i aria-hidden="true" style={{ background: p.trait }} />
            <span>{p.libelle}</span>
            <b>{format.number(p.valeur)}</b>
            <small>{part(pourcent(p.valeur))}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

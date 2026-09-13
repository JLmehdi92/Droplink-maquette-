import { getFormatter } from "next-intl/server";

/**
 * L'ANNEAU DE RÉPARTITION — `AdminDonut` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : anneau de 190 de côté, rayon 70,3,
 * épaisseur 29,45 ; au centre le total en 30/800 à l'interlettrage -0,045em et
 * l'unité en 14/400 en sourdine ; la légende à l'écart 24 de l'anneau, ses
 * lignes à l'écart 14, pastille ronde de 10, libellé 14/400 en encre, valeur
 * 14/700 sur 46 px alignée à droite, part 13/400 en sourdine sur 40 px.
 *
 * ⚠️ L'ANNEAU EST STATIQUE, sans survol. Celui du kit épaissit le segment visé
 * et remplace le total par sa valeur ; la même information est déjà écrite en
 * clair dans la légende, à côté de sa part. Un état de survol qui ne dit rien de
 * neuf coûterait un composant client sur les écrans les plus lourds du produit.
 *
 * ⚠️ ET IL EST `aria-hidden`. Le dessin est une IMAGE de la légende qui le suit :
 * annoncé, il ferait entendre deux fois les mêmes chiffres.
 */

const COTE = 190;
const RAYON = COTE * 0.37;
const EPAISSEUR = COTE * 0.155;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export interface PartAnneau {
  readonly cle: string;
  readonly libelle: string;
  readonly valeur: number;
  /** Une couleur CSS résolue — un jeton `var(--color-ds-…)`, jamais un hexa. */
  readonly trait: string;
}

export async function Anneau({
  parts,
  total,
  unite,
  part,
}: {
  readonly parts: readonly PartAnneau[];
  readonly total: number;
  /** Le mot sous le total, au centre : « commandes », « comptes ». */
  readonly unite: string;
  /** Le gabarit d'une part, « {part} % » — la langue décide de l'espace. */
  readonly part: (pourcent: number) => string;
}) {
  const format = await getFormatter();

  /* Les segments sont calculés AVANT le rendu : un cumul tenu pendant le `map`
     serait une écriture après rendu, et React n'en garantit pas l'ordre. */
  const segments = parts.reduce<
    { readonly cle: string; readonly trait: string; readonly longueur: number; readonly decalage: number }[]
  >((acc, p) => {
    const longueur = total === 0 ? 0 : (p.valeur / total) * CIRCONFERENCE;
    const parcouru = acc.reduce((n, s) => n + s.longueur, 0);
    return [...acc, { cle: p.cle, trait: p.trait, longueur, decalage: -parcouru }];
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative shrink-0" style={{ width: COTE, height: COTE }}>
        <svg width={COTE} height={COTE} viewBox={`0 0 ${COTE} ${COTE}`} aria-hidden="true">
          <g transform={`rotate(-90 ${COTE / 2} ${COTE / 2})`}>
            {segments.map((segment) => (
              <circle
                key={segment.cle}
                cx={COTE / 2}
                cy={COTE / 2}
                r={RAYON}
                fill="none"
                stroke={segment.trait}
                strokeWidth={EPAISSEUR}
                strokeDasharray={`${segment.longueur} ${CIRCONFERENCE - segment.longueur}`}
                strokeDashoffset={segment.decalage}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[30px] leading-[1.15] font-extrabold tracking-[-0.045em] text-ds-texte-titre">
            {format.number(total)}
          </span>
          <span className="text-[14px] leading-[1.2] text-ds-texte-sourdine">{unite}</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col justify-center gap-3.5 self-stretch">
        {parts.map((p) => (
          <li key={p.cle} className="flex items-center gap-[11px]">
            {/* La pastille DOUBLE le libellé qui suit : c'est un repère de
                balayage vers l'anneau, jamais le seul porteur de l'information. */}
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-none rounded-ds-pill"
              style={{ background: p.trait }}
            />
            {/* ⚠️ `whitespace-nowrap` SANS `truncate`, ET C'EST CE QUE FAIT LE
                KIT. La colonne du libellé vaut 37 px dans son propre panneau :
                tronquée, elle rendrait « A » et « S. » — mesuré ici même. Le
                texte déborde donc sa boîte, ce qu'aucun conteneur ne masque. */}
            <span className="min-w-0 flex-1 text-[14px] leading-[normal] whitespace-nowrap text-ds-texte-titre">
              {p.libelle}
            </span>
            <span className="w-[46px] text-right text-[14px] leading-[normal] font-bold text-ds-texte-titre">
              {format.number(p.valeur)}
            </span>
            <span className="w-10 text-right text-[13px] leading-[normal] text-ds-texte-sourdine">
              {part(total === 0 ? 0 : Math.round((p.valeur / total) * 100))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

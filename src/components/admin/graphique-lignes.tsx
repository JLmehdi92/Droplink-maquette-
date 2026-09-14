import { echelle } from "@/components/admin/echelle";

/**
 * DES COURBES SUR UN MÊME AXE — `MultiLine` du kit admin (écran Statistiques).
 *
 * VALEURS RELEVÉES DANS LE SOURCE DU KIT : légende en tête (écart 18, pastille
 * 9, texte 12,5 en corps, 8 px sous elle), marges de 40 à gauche, 8 à droite,
 * 10 en haut et 26 en bas ; TROIS graduations (zéro, la moitié, le plafond) sur
 * le filet, étiquettes à 10,5 ; tracés à 2,3 px aux bouts arrondis.
 *
 * ⚠️ SANS JAVASCRIPT, COMME LA COURBE DES COMMANDES : grille et étiquettes en
 * HTML positionné, tracé en SVG étiré dont les traits gardent leur épaisseur
 * (`vector-effect`) — et dont la LARGEUR EST ÉCRITE : un `<svg>` absolu ne
 * s'étire pas entre `left` et `right`, il prend sa largeur intrinsèque.
 *
 * ⚠️ UNE VALEUR NULLE COUPE LE TRACÉ. Un jour sans commande n'a pas de taux de
 * consultation ; relier ses voisins par-dessus dessinerait une mesure qui n'a
 * pas eu lieu, et le ramener à zéro ferait plonger la courbe pour rien.
 */

const MARGE_HAUT = 10;
const MARGE_BAS = 26;
/** Au-delà, les dates se chevauchent dans une carte d'un tiers de largeur. */
const REPERES = 4;

export interface SerieDeLignes {
  readonly cle: string;
  readonly libelle: string;
  /** Une couleur CSS résolue — un jeton `var(--color-ds-…)`, jamais un hexa. */
  readonly trait: string;
  readonly valeurs: readonly (number | null)[];
}

export function GraphiqueLignes({
  series,
  etiquettes,
  hauteur,
  legende = true,
}: {
  readonly series: readonly SerieDeLignes[];
  /** Une étiquette par point, déjà écrite dans la langue de la page. */
  readonly etiquettes: readonly string[];
  readonly hauteur: number;
  readonly legende?: boolean;
}) {
  const points = etiquettes.length;
  const valeurs = series.flatMap((s) => s.valeurs.filter((v): v is number => v !== null));
  const { plafond, graduations } = echelle(Math.max(0, ...valeurs), 2);
  const trace = hauteur - MARGE_HAUT - MARGE_BAS;

  const x = (i: number): number => (points <= 1 ? 0 : (100 * i) / (points - 1));
  const y = (v: number): number => trace - (trace * v) / plafond;

  /** Le chemin d'une série, coupé à chaque valeur absente. */
  const chemin = (serie: SerieDeLignes): string => {
    let d = "";
    let leve = true;
    serie.valeurs.forEach((v, i) => {
      if (v === null) {
        leve = true;
        return;
      }
      d += `${leve ? "M" : "L"} ${x(i).toFixed(2)},${y(v).toFixed(2)} `;
      leve = false;
    });
    return d.trim();
  };

  /*
   * LES POINTS ISOLÉS — une mesure entre deux trous — sont dessinés en
   * pastilles HORS du SVG étiré : dans le tracé, ils ne traceraient rien (un
   * « M » seul), et un cercle étiré deviendrait une ellipse. Sans eux, un seul
   * jour mesuré sur trente se lirait « aucune donnée ».
   */
  const isoles = series.flatMap((s) =>
    s.valeurs.flatMap((v, i) =>
      v !== null && (s.valeurs[i - 1] ?? null) === null && (s.valeurs[i + 1] ?? null) === null
        ? [{ cle: `${s.cle}-${i}`, trait: s.trait, gauche: x(i), haut: y(v) }]
        : [],
    ),
  );

  const pas = Math.max(1, Math.ceil(points / REPERES));

  return (
    <div aria-hidden="true">
      {legende ? (
        <div className="mb-2 flex flex-wrap gap-[18px]">
          {series.map((s) => (
            <span key={s.cle} className="inline-flex items-center gap-[7px] text-[12.5px] leading-[normal] text-ds-texte-corps">
              <span className="h-[9px] w-[9px] rounded-ds-pill" style={{ background: s.trait }} />
              {s.libelle}
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative" style={{ height: hauteur }}>
        {graduations.map((g) => (
          <div key={g}>
            <span
              className="absolute w-8 text-right text-[11.5px] leading-[normal] text-ds-texte-tenu lg:text-[10.5px]"
              style={{ top: MARGE_HAUT + y(g) - 6 }}
            >
              {g}
            </span>
            <div className="absolute right-2 left-10 border-t border-ds-filet" style={{ top: MARGE_HAUT + y(g) }} />
          </div>
        ))}

        <svg
          className="absolute left-10 overflow-visible"
          style={{ top: MARGE_HAUT, height: trace, width: "calc(100% - 3rem)" }}
          viewBox={`0 0 100 ${trace}`}
          preserveAspectRatio="none"
        >
          {series.map((s) => (
            <path
              key={s.cle}
              d={chemin(s)}
              fill="none"
              stroke={s.trait}
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {isoles.map((p) => (
          <span
            key={p.cle}
            className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-ds-pill"
            style={{
              background: p.trait,
              left: `calc(2.5rem + (100% - 3rem) * ${p.gauche / 100})`,
              top: MARGE_HAUT + p.haut,
            }}
          />
        ))}

        {/* LE PREMIER ET LE DERNIER REPÈRE SONT TOUJOURS LÀ : ce sont les bornes
            de la fenêtre, donc les deux qu'on lit. */}
        <div className="absolute right-2 bottom-0 left-10 flex justify-between gap-2">
          {etiquettes
            .map((e, i) => ({ e, i }))
            // Un repère régulier trop proche du dernier est retiré : les deux
            // dates se toucheraient (« 3 sept.8 sept. », mesuré sur le kit).
            .filter(({ i }) => i === points - 1 || (i % pas === 0 && points - 1 - i >= pas / 2))
            .map(({ e, i }) => (
              <span
                key={i}
                className="text-[11.5px] leading-[normal] whitespace-nowrap text-ds-texte-corps lg:text-[10.5px]"
              >
                {e}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

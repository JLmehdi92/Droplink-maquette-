import { getFormatter } from "next-intl/server";
import { echelle } from "@/components/admin/echelle";

/**
 * LES BARRES DE L'ADMINISTRATION (maquette, `.adm-graphe`) : une valeur par
 * jour (ou par mois), la dernière en accent, un axe de cinq graduations, et les
 * bornes de la période sous le tracé.
 *
 * Le SVG est une IMAGE des chiffres (`role="img"` et son libellé) : un lecteur
 * d'écran qui annoncerait trente barres n'apprendrait rien de plus que le
 * libellé. Chaque barre porte son chiffre en `<title>` et en `data-info`.
 */
const L = 600;
const H = 160;

export async function BarresAdmin({
  valeurs,
  etiquette,
  debut,
  fin,
  hauteurMinimale = 0,
}: {
  readonly valeurs: readonly { readonly valeur: number; readonly info: string }[];
  readonly etiquette: string;
  readonly debut: string;
  readonly fin: string;
  /** Part de hauteur donnée à une barre nulle (la frise des colis : 2 %). */
  readonly hauteurMinimale?: number;
}) {
  const format = await getFormatter();
  const { plafond, graduations } = echelle(Math.max(0, ...valeurs.map((v) => v.valeur)), 4);
  const pas = L / Math.max(1, valeurs.length);
  const largeur = pas * 0.64;
  const y = (v: number) => H - Math.max(hauteurMinimale * H, (H * v) / (plafond || 1));
  return (
    <div className="adm-graphe">
      <div className="adm-graphe__plot">
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img" aria-label={etiquette}>
          {[0, 1, 2, 3, 4].map((k) => (
            <line key={k} x1="0" x2={L} y1={(H * k) / 4} y2={(H * k) / 4} className="adm-graphe__grille" />
          ))}
          {valeurs.map((v, i) => {
            const haut = y(v.valeur);
            return (
              <rect
                key={i}
                x={(i * pas + (pas - largeur) / 2).toFixed(1)}
                y={haut.toFixed(1)}
                width={largeur.toFixed(1)}
                height={(H - haut).toFixed(1)}
                rx="3"
                className={i === valeurs.length - 1 ? "est-dernier" : undefined}
                style={{ "--i": String(i) } as React.CSSProperties}
                data-info={v.info}
              >
                <title>{v.info}</title>
              </rect>
            );
          })}
        </svg>
        <div className="adm-graphe__axe" aria-hidden="true">
          {graduations.map((g) => (
            <span key={g}>{format.number(Math.round(g))}</span>
          ))}
        </div>
      </div>
      <p className="adm-graphe__bas" aria-hidden="true">
        <span>{debut}</span>
        <span>{fin}</span>
      </p>
    </div>
  );
}

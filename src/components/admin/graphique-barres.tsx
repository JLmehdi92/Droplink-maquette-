import { getFormatter } from "next-intl/server";
import { echelle } from "@/components/admin/echelle";

/**
 * DES BARRES — `MiniBars` du kit admin (écran Statistiques).
 *
 * VALEURS RELEVÉES DANS LE SOURCE DU KIT : marges de 44 à gauche, 8 à droite,
 * 8 en haut et 24 en bas ; trois graduations sur le filet, étiquettes à 10,5 en
 * estompé, abrégées au millier (« 1,5 k ») ; chaque barre occupe 62 % de sa
 * case, rayon 3, en violet 200.
 *
 * EN HTML, PAS EN SVG : une barre est un rectangle dont seule la hauteur varie,
 * et un `div` à hauteur en pour cent le dessine sans étirer ses coins arrondis —
 * ce qu'un SVG étiré ferait.
 */

const MARGE_HAUT = 8;
const MARGE_BAS = 24;

export async function GraphiqueBarres({
  valeurs,
  etiquettes,
  hauteur,
  reperes = 3,
}: {
  readonly valeurs: readonly number[];
  /** Une étiquette par barre, déjà écrite ; une chaîne vide n'écrit rien. */
  readonly etiquettes: readonly string[];
  readonly hauteur: number;
  /** Combien d'étiquettes écrire au plus, bornes comprises. */
  readonly reperes?: number;
}) {
  const format = await getFormatter();
  const { plafond, graduations } = echelle(Math.max(0, ...valeurs), 2);
  const trace = hauteur - MARGE_HAUT - MARGE_BAS;
  const y = (v: number): number => trace - (trace * v) / plafond;

  const pas = Math.max(1, Math.ceil(valeurs.length / reperes));
  const visible = (i: number): boolean => i % pas === 0 || i === valeurs.length - 1;

  return (
    <div aria-hidden="true" className="relative" style={{ height: hauteur }}>
      {graduations.map((g) => (
        <div key={g}>
          <span
            className="absolute w-9 text-right text-[11.5px] leading-[normal] text-ds-texte-tenu lg:text-[10.5px]"
            style={{ top: MARGE_HAUT + y(g) - 6 }}
          >
            {format.number(g, { notation: "compact", maximumFractionDigits: 1 })}
          </span>
          <div className="absolute right-2 left-11 border-t border-ds-filet" style={{ top: MARGE_HAUT + y(g) }} />
        </div>
      ))}

      <div className="absolute right-2 left-11 flex items-end" style={{ top: MARGE_HAUT, height: trace }}>
        {valeurs.map((v, i) => (
          <div key={i} className="flex h-full flex-1 items-end justify-center">
            <div
              className="w-[62%] rounded-[3px] bg-ds-violet-200"
              style={{ height: `${(100 * v) / plafond}%` }}
            />
          </div>
        ))}
      </div>

      <div className="absolute right-2 bottom-0 left-11 flex">
        {etiquettes.map((e, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[11.5px] leading-[normal] whitespace-nowrap text-ds-texte-corps lg:text-[10.5px]"
          >
            {visible(i) ? e : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

import { getFormatter, getTranslations } from "next-intl/server";
import type { JourDeCommandes } from "@/lib/audit/panneau";
import { echelle, jourCourt } from "@/components/admin/echelle";

/**
 * LA COURBE DES COMMANDES DE LA PLATEFORME — `AdminArea` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : hauteur 240, marges 36 à gauche (la
 * colonne des graduations), 8 à droite, 14 en haut, 30 en bas ; cinq
 * graduations horizontales sur le filet, étiquettes à 11 px en corps ; aire
 * dégradée de l'accent à 18 % vers zéro, tracé à 2,5 px, point final de rayon 5
 * cerclé de blanc.
 *
 * ⚠️ AUCUN JAVASCRIPT, ET C'EST UNE CONTRAINTE DE SURFACE, PAS UN GOÛT. Le kit
 * mesure sa largeur au montage et recalcule chaque coordonnée en pixels ; ici la
 * grille, les étiquettes et la légende sont du HTML positionné, et seul le
 * TRACÉ est un SVG étiré (`preserveAspectRatio="none"`) dont les traits gardent
 * leur épaisseur par `vector-effect`. Sans cela, étirer le dessin épaissirait la
 * courbe en même temps que le panneau.
 *
 * ⚠️ LES JOURS VIDES SONT RENDUS — c'est la base qui pose la grille. Une courbe
 * qui saute les jours sans commande rend ses points équidistants alors que le
 * temps ne l'est pas : une semaine morte s'y lit comme une semaine pleine.
 */

const MARGE_HAUT = 14;
const MARGE_BAS = 30;

/** Au-delà, les dates se chevauchent. C'est le `labelEvery` du kit. */
const REPERES = 7;

export async function CourbeCommandes({
  jours,
  hauteur = 240,
  reperes = REPERES,
}: {
  readonly jours: readonly JourDeCommandes[];
  /** Combien de dates écrire au plus : sept sur la vue d'ensemble, cinq dans une carte d'un tiers. */
  readonly reperes?: number;
  /** 240 sur la vue d'ensemble ; 185 dans la carte des Statistiques, comme le kit. */
  readonly hauteur?: number;
}) {
  const t = await getTranslations("admin.panneau");
  const format = await getFormatter();
  const HAUTEUR_TRACE = hauteur - MARGE_HAUT - MARGE_BAS;

  if (jours.length < 2) {
    return <p className="text-[14px] text-ds-texte-corps">{t("aucuneCommande")}</p>;
  }

  /*
   * LE PLAFOND EST UN PAS ROND, jamais le maximum brut : des graduations à 0 /
   * 4,75 / 9,5 se liraient comme une précision qu'on n'a pas. Voir `echelle`.
   */
  const { plafond: maximum, graduations } = echelle(Math.max(...jours.map((j) => j.total)), 4);

  const x = (i: number): number => (100 * i) / (jours.length - 1);
  const y = (v: number): number => HAUTEUR_TRACE - (HAUTEUR_TRACE * v) / maximum;

  /* Le lissage cubique du kit : deux poignées au milieu de chaque intervalle. */
  const points = jours.map((j, i) => [x(i), y(j.total)] as const);
  let trace = `M ${f(points[0]?.[0])},${f(points[0]?.[1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const avant = points[i - 1];
    const ici = points[i];
    if (avant === undefined || ici === undefined) continue;
    const milieu = (avant[0] + ici[0]) / 2;
    trace += ` C ${f(milieu)},${f(avant[1])} ${f(milieu)},${f(ici[1])} ${f(ici[0])},${f(ici[1])}`;
  }
  const dernier = points[points.length - 1];

  const pas = Math.max(1, Math.round(jours.length / reperes));

  return (
    /* `aria-hidden` : le graphe est une IMAGE des chiffres. Un lecteur d'écran
       qui annoncerait trente points n'apprendrait rien de plus que le total. */
    <div aria-hidden="true" className="relative" style={{ height: hauteur }}>
      {graduations.map((g) => (
        <div key={g}>
          <span
            className="absolute w-[26px] text-right text-[11.5px] leading-[normal] text-ds-texte-corps lg:text-[11px]"
            style={{ top: MARGE_HAUT + y(g) - 5 }}
          >
            {Math.round(g)}
          </span>
          <div
            className="absolute right-2 left-9 border-t border-ds-filet"
            style={{ top: MARGE_HAUT + y(g) }}
          />
        </div>
      ))}

      {/*
        ⚠️ LA LARGEUR EST ÉCRITE, ET ELLE NE L'ÉTAIT PAS. Un `<svg>` est un
        élément REMPLACÉ : positionné en absolu, `left` et `right` ne l'étirent
        pas, il prend sa largeur intrinsèque — ici la hauteur multipliée par le
        rapport du `viewBox`, soit une centaine de pixels. La courbe tenait donc
        dans le premier sixième du panneau, son point final flottait seul à
        droite, et aucune porte ne pouvait le voir : la soustraction compare des
        textes, et un tracé n'en a pas. Constaté sur la capture du 14/09/2026.
      */}
      <svg
        className="absolute left-9 overflow-visible"
        style={{ top: MARGE_HAUT, height: HAUTEUR_TRACE, width: "calc(100% - 2.75rem)" }}
        viewBox={`0 0 100 ${HAUTEUR_TRACE}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="aire-commandes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ds-accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-ds-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${trace} L 100,${HAUTEUR_TRACE} L 0,${HAUTEUR_TRACE} Z`}
          fill="url(#aire-commandes)"
        />
        <path
          d={trace}
          fill="none"
          stroke="var(--color-ds-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* LE POINT FINAL EST EN DEHORS DU SVG ÉTIRÉ : un cercle dans un dessin
          étiré devient une ellipse, et c'est le seul repère rond de la courbe. */}
      {dernier === undefined ? null : (
        <span
          className="absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-ds-pill border-[2.5px] border-white bg-ds-accent"
          style={{ left: `calc(2.25rem + (100% - 2.75rem) * ${dernier[0] / 100})`, top: MARGE_HAUT + dernier[1] }}
        />
      )}

      {/*
        ⚠️ AU TÉLÉPHONE, DEUX REPÈRES SUR TROIS DISPARAISSENT, ET CE N'EST PAS
        UN CONFORT. Huit dates de sept caractères dans les 314 px utiles d'un
        écran de 390 débordent de 86 — mesuré, pas supposé. Les tronquer rendrait
        « 1 », « 2 », « ( » : des morceaux de dates, illisibles et faux
        d'apparence. On en écrit donc moins, et le PREMIER comme le DERNIER sont
        toujours là — ce sont les bornes de la fenêtre, donc les deux qu'on lit.
      */}
      <div className="absolute right-2 bottom-0 left-9 flex justify-between gap-2">
        {jours
          /* ⚠️ UN REPÈRE RÉGULIER TROP PRÈS DU DERNIER JOUR EST OMIS, comme sur la
             planche : sur 30 jours au pas de 4, elle écrit 0, 4… 24 puis le 29e,
             jamais le 28e. Nous écrivions les deux : neuf dates au lieu de huit,
             les deux dernières collées, et à 768 px la rangée sortait de sa
             carte de 69 px (balayage du 19/09/2026). */
          .filter((_, i) => i === jours.length - 1 || (i % pas === 0 && jours.length - 1 - i >= pas))
          .map((j, rang, tous) => (
            <span
              key={j.jour}
              className={
                "text-[11.5px] leading-[normal] whitespace-nowrap text-ds-texte-corps lg:text-[11px] " +
                (rang === 0 || rang === tous.length - 1 || rang % 3 === 0 ? "" : "max-sm:hidden")
              }
            >
              {jourCourt(format, j.jour)}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Deux décimales suffisent, et évitent un chemin SVG de dix kilo-octets. */
function f(n: number | undefined): string {
  return (n ?? 0).toFixed(2);
}

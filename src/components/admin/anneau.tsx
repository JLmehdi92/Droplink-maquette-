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

/*
 * ⚠️ DEUX TAILLES, ET C'EST LE KIT QUI EN A DEUX. 190 sur la vue d'ensemble,
 * 165 sur les écrans de liste — où l'anneau partage sa colonne avec deux autres
 * panneaux. Tout en découle : le total vaut `round(cote * 0,16)` et l'unité
 * `round(cote * 0,072)`, donc 30/14 d'un côté et 26/12 de l'autre. Transposer
 * l'une à l'autre fait un anneau conforme à la mauvaise référence.
 *
 * ⚠️ ET LA LÉGENDE N'EST PAS LA MÊME NON PLUS. Sur la vue d'ensemble, la valeur
 * occupe 46 px et la part 40 ; sur les écrans de liste, la valeur se dimensionne
 * sur son contenu, la part occupe 38, et le libellé TRONQUE — sa colonne y a
 * 150 px de base, contre 37 dans le panneau étroit de la vue d'ensemble, où
 * tronquer rendrait « A » et « S. ».
 */
const COTES = { panneau: 190, liste: 165, commandes: 170, compact: 124, statistiques: 122 } as const;

/*
 * LES DEUX POLICES DU CENTRE SONT CALCULÉES, PAS ÉCRITES. Le kit les dérive de
 * la taille de l'anneau — `max(15, rond(cote × 0,16))` pour le total,
 * `max(9,5, rond(cote × 0,072))` pour l'unité — et il en pose TROIS tailles
 * d'anneau. Recopier six nombres aurait fait six occasions de se tromper ; la
 * règle, elle, tient en deux lignes et suit la prochaine taille toute seule.
 */
const policeTotal = (cote: number): number => Math.max(15, Math.round(cote * 0.16));
/*
 * ⚠️ LE PLANCHER EST 11,5 ET NON 9,5, ET C'EST LA RÈGLE 5 QUI GAGNE. Le kit
 * pose 9,5 comme minimum ; sur son plus petit anneau (124), l'unité y tombe
 * donc à 9,5 px — mesuré sous le plancher de 11,5 px du téléphone, qui est
 * architectural et non esthétique. Les deux autres tailles rendent 12 et 14 :
 * elles ne bougent pas.
 */
const policeUnite = (cote: number): number => Math.max(11.5, Math.round(cote * 0.072));

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
  variante = "panneau",
}: {
  readonly parts: readonly PartAnneau[];
  readonly total: number;
  /** Le mot sous le total, au centre : « commandes », « comptes ». */
  readonly unite: string;
  /** Le gabarit d'une part, « {part} % » — la langue décide de l'espace. */
  readonly part: (pourcent: number) => string;
  /**
   * `panneau` sur la vue d'ensemble, `liste` sur les écrans de liste, `compact`
   * quand l'anneau partage sa colonne avec deux autres panneaux.
   */
  readonly variante?: keyof typeof COTES;
}) {
  const format = await getFormatter();

  const COTE = COTES[variante];
  const RAYON = COTE * 0.37;
  const EPAISSEUR = COTE * 0.155;
  const CIRCONFERENCE = 2 * Math.PI * RAYON;
  /* La légende du kit a deux formes seulement : large sur la vue d'ensemble,
     `SplitLegend` partout ailleurs — quelle que soit la taille de l'anneau. */
  const liste = variante !== "panneau";
  /* ⚠️ ET UNE TROISIÈME SUR L'ÉCRAN DES COMMANDES, relevée sur `AdminOrders` :
     pastille 9, écart 10, libellé et valeur 13,5, part 12,5 sur 34 px, rangées
     à 13 et 20 px entre l'anneau et sa légende. */
  const commandes = variante === "commandes";

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
    <div
      className={
        variante === "statistiques"
          ? /* L'ÉCRAN DES STATISTIQUES POSE L'ANNEAU ET SA LÉGENDE EN RANGÉE QUI
               SE REPLIE (écart 18) : dans la carte étroite des statuts, la
               légende passe sous l'anneau, comme au kit. */
            "flex flex-wrap items-center gap-[18px]"
          : "flex flex-col items-center sm:flex-row " + (commandes ? "gap-5" : "gap-6")
      }
    >
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
          <span
            className="leading-[1.15] font-extrabold tracking-[-0.045em] text-ds-texte-titre"
            style={{ fontSize: policeTotal(COTE) }}
          >
            {format.number(total)}
          </span>
          {/* ⚠️ SUR L'ANNEAU DE 122 DES STATISTIQUES, LE PLANCHER EST AU TÉLÉPHONE
              SEULEMENT. À 11,5 px, « commandes » touchait le bord intérieur de
              l'anneau (trou de 71 px) ; le kit y écrit 9,5, et la règle 5 ne vise
              que le téléphone — où l'anneau prend toute la largeur de sa carte. */}
          <span
            className={
              "leading-[1.2] text-ds-texte-sourdine " +
              (variante === "statistiques" ? "text-[11.5px] lg:text-[9.5px]" : "")
            }
            style={variante === "statistiques" ? undefined : { fontSize: policeUnite(COTE) }}
          >
            {unite}
          </span>
        </div>
      </div>

      <ul
        className={
          "flex min-w-0 flex-col justify-center self-stretch " +
          (commandes ? "gap-[13px] " : "gap-3.5 ") +
          (liste ? "flex-[1_1_150px]" : "flex-1")
        }
      >
        {parts.map((p) => (
          <li key={p.cle} className={"flex items-center " + (commandes ? "gap-2.5" : "gap-[11px]")}>
            {/* La pastille DOUBLE le libellé qui suit : c'est un repère de
                balayage vers l'anneau, jamais le seul porteur de l'information. */}
            <span
              aria-hidden="true"
              className={"flex-none rounded-ds-pill " + (commandes ? "h-[9px] w-[9px]" : "h-2.5 w-2.5")}
              style={{ background: p.trait }}
            />
            {/* ⚠️ LE LIBELLÉ NE TRONQUE PAS DANS LE PANNEAU ÉTROIT, et le kit non
                plus : sa colonne y vaut 37 px, donc `truncate` rendrait « A » et
                « S. » — mesuré. Le texte déborde sa boîte, ce qu'aucun conteneur
                ne masque. Sur les écrans de liste, où la colonne a 150 px de
                base, le kit tronque et nous aussi. */}
            <span
              className={
                "min-w-0 flex-1 leading-[normal] whitespace-nowrap text-ds-texte-titre " +
                (commandes ? "text-[13.5px] " : "text-[14px] ") +
                (liste ? "overflow-hidden text-ellipsis" : "")
              }
            >
              {p.libelle}
            </span>
            <span
              className={
                "text-right leading-[normal] font-bold whitespace-nowrap text-ds-texte-titre " +
                (commandes ? "text-[13.5px] " : "text-[14px] ") +
                (liste ? "" : "w-[46px]")
              }
            >
              {format.number(p.valeur)}
            </span>
            <span
              className={
                "text-right leading-[normal] text-ds-texte-sourdine " +
                /* ⚠️ « 100 % » NE TIENT PAS DANS 38 px, ET LA PART S'ÉLARGIT
                   PLUTÔT QUE DE PASSER À LA LIGNE.
                   Cette correction n'existait que pour la variante
                   « statistiques » : sur la LISTE des comptes, vu à la capture
                   le 17/09/2026, « 100 % » se coupait en deux lignes — boîte de
                   38 × 32 là où une ligne fait 16. Un correctif posé sur une
                   seule variante hérite du champ de vision de son premier cas
                   (L-025) ; les trois le portent désormais, et seule la largeur
                   de départ les distingue. */
                "whitespace-nowrap " +
                (commandes
                  ? "min-w-[34px] text-[12.5px]"
                  : liste
                    ? "min-w-[38px] text-[13px]"
                    : "min-w-10 text-[13px]")
              }
            >
              {part(total === 0 ? 0 : Math.round((p.valeur / total) * 100))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { getFormatter, getTranslations } from "next-intl/server";
import type { RepartitionAdmin } from "@/lib/audit/panneau";

/**
 * L'ANNEAU DE RÉPARTITION DES COMMANDES — `AdminDonut` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : anneau de 190 de côté, rayon 70,3,
 * épaisseur 29,45 ; au centre le total en 30/800 à l'interlettrage -0,045em et
 * l'unité en 14/400 en sourdine ; la légende à l'écart 24 de l'anneau, ses
 * lignes à l'écart 14, pastille ronde de 10, libellé 14/400 en encre, valeur
 * 14/700 sur 46 px alignée à droite, part 13/400 en sourdine sur 40 px.
 *
 * ⚠️ QUATRE PARTS LÀ OÙ LE KIT EN DESSINE CINQ. Ses « Problème » et « Annulées »
 * n'existent pas : la décision 4 arrête la frise à quatre étapes — préparation,
 * expédié, en transit, livré — et la granularité vit dans le DÉTAIL du suivi.
 * Inventer deux états pour remplir un anneau leur donnerait une existence que la
 * base ne leur accorde pas.
 *
 * ⚠️ L'ANNEAU EST STATIQUE, sans survol. Celui du kit épaissit le segment visé
 * et remplace le total par sa valeur ; la même information est déjà écrite en
 * clair dans la légende, à côté de sa part. Un état de survol qui ne dit rien de
 * neuf coûterait un composant client sur l'écran le plus lourd du produit.
 */

const COTE = 190;
const RAYON = COTE * 0.37;
const EPAISSEUR = COTE * 0.155;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * L'ordre est celui de la frise, du plus avancé au moins avancé — comme le kit,
 * qui ouvre sur « Livrées ». C'est l'ordre dans lequel on lit un avancement.
 */
const PARTS = [
  { cle: "livre", trait: "var(--color-ds-succes)" },
  { cle: "enTransit", trait: "var(--color-ds-info)" },
  { cle: "expedie", trait: "var(--color-ds-accent)" },
  { cle: "preparation", trait: "var(--color-ds-alerte)" },
] as const;

export async function AnneauStatuts({ repartition }: { readonly repartition: RepartitionAdmin }) {
  const t = await getTranslations("admin.panneau");
  const format = await getFormatter();

  const valeurs = {
    livre: repartition.livre,
    enTransit: repartition.enTransit,
    expedie: repartition.expedie,
    preparation: repartition.preparation,
  } as const;

  /* Les segments sont calculés AVANT le rendu : un cumul tenu pendant le `map`
     serait une écriture après rendu, et React n'en garantit pas l'ordre. */
  const segments = PARTS.reduce<
    { readonly cle: (typeof PARTS)[number]["cle"]; readonly trait: string; readonly longueur: number; readonly decalage: number }[]
  >((acc, part) => {
    const longueur = (valeurs[part.cle] / repartition.total) * CIRCONFERENCE;
    const parcouru = acc.reduce((n, s) => n + s.longueur, 0);
    return [...acc, { cle: part.cle, trait: part.trait, longueur, decalage: -parcouru }];
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
            {format.number(repartition.total)}
          </span>
          <span className="text-[14px] leading-[1.2] text-ds-texte-sourdine">
            {t("statutsUnite")}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-3.5 self-stretch justify-center">
        {PARTS.map((part) => (
          <li key={part.cle} className="flex items-center gap-[11px]">
            {/* La pastille DOUBLE le libellé qui suit : c'est un repère de
                balayage vers l'anneau, jamais le seul porteur de l'information. */}
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-none rounded-ds-pill"
              style={{ background: part.trait }}
            />
            <span className="min-w-0 flex-1 truncate text-[14px] leading-[normal] text-ds-texte-titre">
              {t(`statut.${part.cle}`)}
            </span>
            <span className="w-[46px] text-right text-[14px] leading-[normal] font-bold text-ds-texte-titre">
              {format.number(valeurs[part.cle])}
            </span>
            <span className="w-10 text-right text-[13px] leading-[normal] text-ds-texte-sourdine">
              {t("statutPart", {
                part: Math.round((valeurs[part.cle] / repartition.total) * 100),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

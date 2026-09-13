import { BookOpen, Calendar, Check, Clock, Info, TriangleAlert } from "lucide-react";

/**
 * LES BRIQUES DE LA DOCUMENTATION — `DocsParts.jsx` du kit `docs`, servi à 1280.
 *
 * ⚠️ LES VALEURS ONT ÉTÉ REPRISES DU KIT LE 14/09/2026, ET CE N'ÉTAIT PAS UNE
 * RETOUCHE. Le port du 12/09 transposait à l'œil — titres à 26 contre 28, marges
 * de 38 contre 48, paragraphes à 15 contre 15,5, cercles cochés à la place des
 * coches — et il n'avait jamais été soustrait : 108 écarts de valeur au premier
 * relevé. Chaque valeur ci-dessous vient de la soustraction, pas de la lecture.
 *
 * `leading-[normal]` est posé sur la page : le kit n'écrit aucun interligne hors
 * du texte courant, et Tailwind en imposerait un.
 */

/** `H2` du kit : 28/800, -0,035em, 48 px au-dessus, ancré sous l'en-tête collant. */
export function TitreSection({ id, children }: { readonly id: string; readonly children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-12 mb-3.5 scroll-mt-24 text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em] text-balance text-ds-texte-fort max-[760px]:text-[23px] max-[560px]:text-[21px]"
    >
      {children}
    </h2>
  );
}

/** `H3` du kit : 18/700, -0,02em. */
export function SousTitre({ children }: { readonly children: React.ReactNode }) {
  return (
    <h3 className="mt-7 mb-2.5 text-[18px] leading-[1.1] font-bold tracking-[-0.02em] text-balance text-ds-texte-fort">
      {children}
    </h3>
  );
}

/** `P` du kit : 15,5 en interligne 1,7. */
export function Paragraphe({ children }: { readonly children: React.ReactNode }) {
  return <p className="mb-3.5 text-[15.5px] leading-[1.7] text-pretty text-ds-texte-corps">{children}</p>;
}

/** `UL` du kit : une coche simple à l'accent, trait 2,6 — pas un cercle coché. */
export function Liste({ items }: { readonly items: readonly React.ReactNode[] }) {
  return (
    // `pl-10` : le retrait par défaut du navigateur, que le kit ne remet pas à zéro
    // — et c'est ce qu'il rend. Mesuré : ses coches commencent 40 px plus à droite.
    <ul className="mb-4 flex flex-col gap-[9px] pl-10 max-[560px]:pl-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15.5px] leading-[1.6] text-ds-texte-corps">
          <Check aria-hidden="true" size={16} strokeWidth={2.6} className="mt-1 flex-none text-ds-accent" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Encart({
  ton = "info",
  titre,
  children,
}: {
  readonly ton?: "info" | "alerte";
  readonly titre: string;
  readonly children: React.ReactNode;
}) {
  const peau =
    ton === "alerte"
      ? { boite: "bg-ds-alerte-fond border-[#F3DFB4]", encre: "text-ds-alerte", Icone: TriangleAlert }
      : { boite: "bg-ds-surface-teinte border-ds-violet-200", encre: "text-ds-accent", Icone: Info };
  const { Icone } = peau;
  return (
    <div className={"my-5 flex gap-[13px] rounded-ds-card-lg border px-[18px] py-4 " + peau.boite}>
      <Icone aria-hidden="true" size={18} strokeWidth={2} className={"mt-px flex-none " + peau.encre} />
      <div className="min-w-0">
        <div className="mb-[3px] text-[14.5px] font-bold text-ds-texte-fort">{titre}</div>
        <div className="text-[14.5px] leading-[1.6] text-ds-texte-corps">{children}</div>
      </div>
    </div>
  );
}

export function Etapes({
  items,
}: {
  readonly items: readonly { readonly titre: string; readonly texte: React.ReactNode }[];
}) {
  return (
    <ol className="my-5 flex list-none flex-col gap-3.5 pl-10 max-[560px]:pl-4">
      {items.map((e, i) => (
        <li key={e.titre} className="flex gap-3.5">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-ds-pill degrade-ds-marque text-[13px] font-bold text-ds-texte-sur-marque">
            {i + 1}
          </span>
          <span className="min-w-0 pt-[3px]">
            <b className="text-[15px] font-bold text-ds-texte-fort">{e.titre}</b>
            <span className="mt-0.5 block text-[14.5px] leading-[1.6] text-ds-texte-corps">{e.texte}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * `Table` du kit — une grille, pas un `<table>`. Les rôles ARIA gardent la
 * lecture tabulaire aux lecteurs d'écran ; la grille donne l'écart de 14 px
 * entre colonnes que la référence porte, et que les bordures d'une table ne
 * savent pas rendre. Sous 560 px les cellules s'empilent, comme au kit.
 */
export function Tableau({
  entetes,
  lignes,
}: {
  readonly entetes: readonly string[];
  readonly lignes: readonly (readonly string[])[];
}) {
  const colonnes = { gridTemplateColumns: `repeat(${entetes.length},minmax(0,1fr))` };
  return (
    <div role="table" className="my-5 overflow-hidden rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte">
      <div
        role="row"
        style={colonnes}
        className="grid gap-3.5 bg-ds-surface-page px-[18px] py-3 text-[12.5px] font-bold text-ds-texte-sourdine max-[560px]:hidden"
      >
        {entetes.map((e, i) => (
          <span key={i} role="columnheader">
            {e}
          </span>
        ))}
      </div>
      {lignes.map((l, n) => (
        <div
          key={n}
          role="row"
          style={colonnes}
          className="grid items-center gap-3.5 border-t border-ds-filet px-[18px] py-[13px] text-[14px] text-ds-texte-corps max-[560px]:block max-[560px]:px-3.5 max-[560px]:py-3"
        >
          {l.map((c, i) => (
            <span
              key={i}
              role="cell"
              className={
                "min-w-0 max-[560px]:block max-[560px]:py-[3px] " +
                (i === 0 ? "font-semibold text-ds-texte-fort" : "text-ds-texte-corps")
              }
            >
              {c}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** La carte d'un statut : pastille à gauche, sens à droite — la liste de statuts du kit. */
export function CarteStatut({ pastille, texte }: { readonly pastille: React.ReactNode; readonly texte: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-4 py-3.5 max-[560px]:flex-wrap">
      {pastille}
      <span className="min-w-0 text-[14.5px] leading-[1.5] text-ds-texte-corps">{texte}</span>
    </div>
  );
}

export function Question({ question, reponse }: { readonly question: string; readonly reponse: string }) {
  return (
    <div className="mb-2.5 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-[18px] py-4 shadow-ds-xs">
      <div className="mb-[5px] text-[15.5px] font-bold text-ds-texte-fort">{question}</div>
      <div className="text-[14.5px] leading-[1.6] text-ds-texte-corps">{reponse}</div>
    </div>
  );
}

export function Etiquette({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-3.5 py-[7px] text-[12.5px] font-bold text-ds-accent-encre">
      <BookOpen aria-hidden="true" size={14} strokeWidth={2} />
      {children}
    </span>
  );
}

export function LigneAuteur({
  auteur,
  source,
  misAJour,
  duree,
}: {
  readonly auteur: string;
  readonly source: string;
  readonly misAJour: React.ReactNode;
  readonly duree: string;
}) {
  return (
    <div className="mt-[18px] mb-[22px] flex flex-wrap items-center gap-3.5 border-y border-ds-filet pt-3.5 pb-1">
      <span className="flex items-center gap-[9px]">
        <span className="grid h-8 w-8 place-items-center rounded-ds-pill degrade-ds-marque text-[13px] font-extrabold text-ds-texte-sur-marque">
          D
        </span>
        <span className="flex flex-col">
          <span className="text-[13.5px] font-bold text-ds-texte-fort">{auteur}</span>
          <span className="text-[12.5px] text-ds-texte-sourdine">{source}</span>
        </span>
      </span>
      <span className="min-w-5 flex-1" />
      <span className="flex items-center gap-[7px] text-[12.5px] text-ds-texte-sourdine">
        <Calendar aria-hidden="true" size={14} strokeWidth={1.9} />
        {misAJour}
      </span>
      <span className="flex items-center gap-[7px] text-[12.5px] text-ds-texte-sourdine">
        <Clock aria-hidden="true" size={14} strokeWidth={1.9} />
        {duree}
      </span>
    </div>
  );
}

import { BookOpen, Calendar, CheckCircle, Clock, Info, TriangleAlert } from "lucide-react";

/**
 * LES BRIQUES DE LA DOCUMENTATION — `ui_kits/docs` du design system.
 *
 * LES VALEURS SONT CELLES DU KIT, RELEVÉES SUR SA PAGE SERVIE À 1280 px :
 *
 *   colonne de texte   780 px au plus
 *   h1                 46 / 800 / interligne 1,05 / tracking -0,045em
 *   h2                 26 / 800 / tracking -0,03em, 38 px au-dessus
 *   h3                 17,5 / 700, 24 au-dessus, 8 en dessous
 *   paragraphe         15 / 400 / interligne 1,72, couleur de corps
 *   encart             `16px 18px`, rayon carte-lg, filet teinté, écart 13
 *   étape              pastille 28 au dégradé de marque, titre 15 / 700
 *   tableau            en-tête 13 / 700 sur fond creux, cellules 14 / 1,55
 *   question           `16px 18px`, rayon carte-lg, filet, ombre xs, 15,5 / 700
 *
 * ⚠️ CES BRIQUES NE SONT PAS DANS `components/core` DU DESIGN SYSTEM : elles
 * vivent dans le kit `docs`, qui les déclare pour lui seul. Les poser dans le
 * dossier partagé laisserait croire qu'elles servent ailleurs, et le premier
 * écran qui les emploierait hériterait de valeurs réglées pour une page de
 * documentation.
 */

export function TitreSection({ id, children }: { readonly id: string; readonly children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-[38px] mb-3 scroll-mt-24 text-[26px] leading-[1.2] font-extrabold tracking-[-0.03em] text-ds-texte-titre"
    >
      {children}
    </h2>
  );
}

export function Paragraphe({ children }: { readonly children: React.ReactNode }) {
  return <p className="my-3 text-[15px] leading-[1.72] text-ds-texte-corps">{children}</p>;
}

export function Liste({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="my-4 flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[15px] leading-[1.6] text-ds-texte-corps">
          <CheckCircle aria-hidden="true" size={17} strokeWidth={2} className="mt-[3px] flex-none text-ds-accent" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * L'ENCART, EN TROIS TONS.
 *
 * ⚠️ LE TON N'EST PAS DÉCORATIF : `alerte` dit « ceci peut vous surprendre »,
 * `info` dit « voici un détail utile ». Les peindre tous pareil reviendrait à
 * n'en signaler aucun.
 */
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
      ? { boite: "bg-ds-alerte-fond border-ds-amber-200", encre: "text-ds-alerte", Icone: TriangleAlert }
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
  readonly items: readonly { readonly titre: string; readonly texte: string }[];
}) {
  return (
    <ol className="my-5 flex list-none flex-col gap-3.5">
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
 * ⚠️ `table-fixed` ET UN `<colgroup>`, MÊME ICI. Sans `table-layout: fixed`, les
 * largeurs ne sont que des suggestions et le navigateur dimensionne par le
 * contenu — le défaut qui a coûté le plus cher sur l'écran des commandes.
 */
export function Tableau({
  entetes,
  lignes,
}: {
  readonly entetes: readonly string[];
  readonly lignes: readonly (readonly string[])[];
}) {
  const largeur = Math.round(100 / entetes.length);
  return (
    <div className="my-5 overflow-x-auto">
      <table className="w-full table-fixed border-collapse overflow-hidden rounded-ds-card border border-ds-filet text-left">
        <colgroup>
          {entetes.map((e) => (
            <col key={e} style={{ width: `${largeur}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-ds-surface-creux">
            {entetes.map((e, i) => (
              <th
                key={i}
                scope="col"
                className="border-b border-ds-filet px-[14px] py-2.5 text-[13px] leading-[18px] font-bold text-ds-texte-fort"
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l[0]} className="border-t border-ds-filet">
              {l.map((c, i) => (
                <td
                  key={i}
                  className={
                    "px-[14px] py-2.5 text-[14px] leading-[1.55] " +
                    (i === 0 ? "font-semibold text-ds-texte-fort" : "text-ds-texte-corps")
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  readonly misAJour: string;
  readonly duree: string;
}) {
  return (
    <div className="my-[18px] flex flex-wrap items-center gap-3.5 border-y border-ds-filet pt-3.5 pb-1">
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

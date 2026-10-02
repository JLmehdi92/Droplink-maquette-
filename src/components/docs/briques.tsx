import { CalendarDays, Check, CircleAlert, Clock, FileText, Plus, Sparkles } from "lucide-react";
import Image from "next/image";
import symbole from "@/../public/marque/logo-symbole.png";

/**
 * LES BRIQUES DE LA DOCUMENTATION (refonte du 02/10/2026) : le vocabulaire de
 * `docs.html` — `.doc-section`, `.doc-liste`, `.doc-etapes`, `.doc-encart`,
 * `.doc-tableau`, `.doc-q`. Le texte reste celui du produit (`messages/*.json`,
 * « docs ») : la maquette l'avait recopié à un commit donné, le produit fait foi.
 */

/** Une section de la documentation : son titre `h2` porte l'ancre du sommaire. */
export function Section({
  id,
  titre,
  children,
}: {
  readonly id: string;
  readonly titre: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="doc-section" id={id} aria-labelledby={"h-" + id}>
      <h2 id={"h-" + id}>{titre}</h2>
      {children}
    </section>
  );
}

export function SousTitre({ children }: { readonly children: React.ReactNode }) {
  return <h3>{children}</h3>;
}

export function Paragraphe({ children }: { readonly children: React.ReactNode }) {
  return <p>{children}</p>;
}

export function Liste({ items }: { readonly items: readonly React.ReactNode[] }) {
  return (
    <ul className="doc-liste">
      {items.map((item, i) => (
        <li key={i}>
          <Check aria-hidden="true" className="ic" />
          <span>{item}</span>
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
  const Icone = ton === "alerte" ? CircleAlert : Sparkles;
  return (
    <aside className="doc-encart" data-ton={ton}>
      <Icone aria-hidden="true" className="ic" />
      <div>
        <b>{titre}</b>
        <p>{children}</p>
      </div>
    </aside>
  );
}

export function Etapes({
  items,
}: {
  readonly items: readonly { readonly titre: string; readonly texte: React.ReactNode }[];
}) {
  return (
    <ol className="doc-etapes">
      {items.map((e, i) => (
        <li key={e.titre}>
          <span>{i + 1}</span>
          <div>
            <b>{e.titre}</b>
            <p>{e.texte}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Un VRAI tableau (la maquette en pose un) : la première colonne est l'en-tête de ligne. */
export function Tableau({
  entetes,
  lignes,
}: {
  readonly entetes: readonly string[];
  readonly lignes: readonly (readonly string[])[];
}) {
  return (
    <div className="doc-tableau">
      <table>
        <thead>
          <tr>
            {entetes.map((e, i) => (
              <th key={i} scope="col">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, n) => (
            <tr key={n}>
              {l.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={i}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Une question de la FAQ, repliable ; `name` partagé : en ouvrir une ferme l'autre. */
export function Question({ question, reponse }: { readonly question: string; readonly reponse: string }) {
  return (
    <details className="doc-q" name="doc-faq">
      <summary>
        {question}
        <Plus aria-hidden="true" className="ic" />
      </summary>
      <p>{reponse}</p>
    </details>
  );
}

export function Etiquette({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="l4-etiquette">
      <span>
        <FileText aria-hidden="true" className="ic" />
      </span>
      {children}
    </p>
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
    <p className="doc-auteur">
      <span className="doc-auteur__avatar">
        <Image src={symbole} alt="" width={14} sizes="14px" />
      </span>
      <span>
        <b>{auteur}</b>
        <small>{source}</small>
      </span>
      <span className="doc-auteur__meta">
        <CalendarDays aria-hidden="true" className="ic" />
        {misAJour}
        <span aria-hidden="true">·</span>
        <Clock aria-hidden="true" className="ic" />
        {duree}
      </span>
    </p>
  );
}

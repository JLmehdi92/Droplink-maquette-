import type { Bloc } from "@/lib/blog/types";

/**
 * LE RENDU D'UN ARTICLE — un `switch` exhaustif, pas un moteur de gabarits.
 *
 * ⚠️ LE `never` DE LA BRANCHE PAR DÉFAUT EST LA GARDE PRINCIPALE DE CE FICHIER.
 * Ajouter un type de bloc à l'union sans l'écrire ici ne compile pas : le
 * compilateur refuse d'affecter le bloc restant à `never`. C'est le TYPAGE qui
 * l'exige, pas une relecture — et c'est la seule forme de garde qui ne s'oublie
 * pas.
 *
 * ⚠️ AUCUN HTML BRUT NE TRAVERSE CE CHEMIN. Le texte des blocs est du texte,
 * rendu par React, donc échappé. Un article ne peut pas injecter de balise,
 * même par accident.
 *
 * Les valeurs sont celles de `blog/index.html#<slug>` du design system, écrit
 * le 14/09/2026 : corps 17/1,75 au bureau — un cran au-dessus des pages légales
 * (15,5/1,7), parce qu'un article se lit en entier et non en diagonale —,
 * intertitres au 28/800 des pages légales, citation sur la teinte violette.
 */
export function CorpsArticle({ blocs }: { blocs: readonly Bloc[] }) {
  return (
    <>
      {blocs.map((bloc, i) => {
        // L'index suffit comme clé : la liste est FIGÉE à la compilation, elle
        // n'est ni réordonnée, ni filtrée, ni complétée côté client.
        const cle = `${bloc.type}-${i}`;

        switch (bloc.type) {
          case "chapeau":
            return (
              <p key={cle} className="mb-2 text-[17px] leading-[1.65] text-pretty text-ds-texte-fort md:text-[19px]">
                {bloc.texte}
              </p>
            );

          case "titre":
            return (
              <h2
                key={cle}
                className="mt-9 mb-3.5 text-[22px] leading-[1.15] font-extrabold tracking-[-0.035em] text-balance text-ds-texte-fort md:mt-11 md:text-[28px]"
              >
                {bloc.texte}
              </h2>
            );

          case "paragraphe":
            return (
              <p key={cle} className="mb-[18px] text-[16px] leading-[1.75] text-pretty text-ds-texte-corps md:text-[17px]">
                {bloc.texte}
              </p>
            );

          case "citation":
            return (
              <div
                key={cle}
                className="my-[26px] rounded-r-ds-lg border-l-[3px] border-ds-accent bg-ds-surface-teinte px-[22px] py-[18px]"
              >
                <p className="text-[16px] leading-[1.75] text-ds-texte-fort md:text-[17px]">{bloc.texte}</p>
              </div>
            );

          case "liste":
            return (
              <ul key={cle} className="mb-[18px] flex flex-col gap-2.5">
                {bloc.items.map((item, j) => (
                  <li
                    key={`${cle}-${j}`}
                    className="flex gap-3 text-[16px] leading-[1.75] text-ds-texte-corps md:text-[17px]"
                  >
                    {/* La puce est décorative : elle ne porte aucune
                        information que le texte ne porte pas déjà. */}
                    <span aria-hidden="true" className="mt-3 size-1.5 shrink-0 rounded-ds-pill bg-ds-accent" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );

          default: {
            const jamais: never = bloc;
            return jamais;
          }
        }
      })}
    </>
  );
}

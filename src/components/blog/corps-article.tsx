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
 * même par accident — ce qui vaut aussi le jour où un article sera écrit par
 * quelqu'un d'autre que celui qui a écrit ce composant.
 *
 * Les valeurs viennent des planches `BlogArticle` et `BlogArticleMobile`,
 * mesurées dans un navigateur : corps 16/28 en téléphone et 17/30 en bureau —
 * un cran au-dessus des pages légales (15/25), parce qu'un article se lit en
 * entier et non en diagonale.
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
              <p
                key={cle}
                className="mb-1.5 font-body-lg text-[17px] leading-[29px] text-[#2c2d33] md:text-[19px] md:leading-8"
              >
                {bloc.texte}
              </p>
            );

          case "titre":
            return (
              <h2
                key={cle}
                className="mt-[34px] mb-3 font-headline-md text-[21px] leading-[27px] font-bold tracking-[-0.02em] text-on-surface md:mt-11 md:mb-3.5 md:text-[26px] md:leading-8"
              >
                {bloc.texte}
              </h2>
            );

          case "paragraphe":
            return (
              <p
                key={cle}
                className="mb-4 font-body-lg text-[16px] leading-7 text-ardoise md:mb-[18px] md:text-[17px] md:leading-[30px]"
              >
                {bloc.texte}
              </p>
            );

          case "citation":
            return (
              <div
                key={cle}
                className="my-[22px] rounded-r-xl border-l-[3px] border-violet bg-[#fafafc] px-[18px] py-4 md:my-[26px] md:px-6 md:py-5"
              >
                <p className="font-body-lg text-[16px] leading-7 text-[#2c2d33] md:text-[17px] md:leading-[30px]">
                  {bloc.texte}
                </p>
              </div>
            );

          case "liste":
            return (
              <ul key={cle} className="mb-4 md:mb-[18px]">
                {bloc.items.map((item, j) => (
                  <li
                    key={`${cle}-${j}`}
                    className="mb-2.5 flex gap-3 font-body-lg text-[16px] leading-7 text-ardoise md:text-[17px] md:leading-[30px]"
                  >
                    {/* La puce est décorative : elle ne porte aucune
                        information que le texte ne porte pas déjà. */}
                    <span aria-hidden="true" className="mt-[11px] size-1.5 shrink-0 rounded-full bg-violet" />
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

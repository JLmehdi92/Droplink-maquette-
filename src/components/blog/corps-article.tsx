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
  // Le vocabulaire de la maquette (`.art-corps`) : la feuille peint des éléments
  // sémantiques — titre, paragraphe, citation, liste —, sans une classe par bloc.
  return (
    <div className="art-corps">
      {blocs.map((bloc, i) => {
        // L'index suffit comme clé : la liste est FIGÉE à la compilation, elle
        // n'est ni réordonnée, ni filtrée, ni complétée côté client.
        const cle = `${bloc.type}-${i}`;
        switch (bloc.type) {
          case "chapeau":
            return (
              <p key={cle} className="art-chapeau">
                {bloc.texte}
              </p>
            );
          case "titre":
            return <h2 key={cle}>{bloc.texte}</h2>;
          case "paragraphe":
            return <p key={cle}>{bloc.texte}</p>;
          case "citation":
            return <blockquote key={cle}>{bloc.texte}</blockquote>;
          case "liste":
            return (
              <ul key={cle}>
                {bloc.items.map((item, j) => (
                  <li key={`${cle}-${j}`}>{item}</li>
                ))}
              </ul>
            );
          default: {
            const jamais: never = bloc;
            return jamais;
          }
        }
      })}
    </div>
  );
}

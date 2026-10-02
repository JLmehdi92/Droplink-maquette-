import { getTranslations } from "next-intl/server";
/**
 * L'ÉCRAN RÉPOND AU CLIC, MÊME QUAND LA DONNÉE N'EST PAS ENCORE LÀ.
 *
 * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026 : le produit n'avait AUCUN
 * `loading.tsx`, sur aucune de ses vingt routes. Sans lui, un clic sur un lien
 * ne change RIEN à l'écran tant que le rendu serveur complet n'est pas revenu —
 * session, requêtes, instrumentation. Le navigateur reste sur la page
 * précédente, le curseur ne bouge pas, et l'utilisateur reclique en concluant
 * que le bouton est cassé.
 *
 * C'est littéralement le symptôme rapporté : « c'est lent quand je clique sur
 * des boutons ». Le temps total ne change pas d'une milliseconde ; ce qui
 * change, c'est que l'écran bascule tout de suite au lieu de paraître figé.
 *
 * IL NE PORTE AUCUNE INFORMATION. Des blocs neutres, la même géométrie que ce
 * qui va s'afficher, et surtout AUCUN chiffre, AUCUN libellé de donnée : un
 * squelette qui annonce « 12 commandes » affirmerait ce que la base n'a pas
 * encore dit. Les dimensions sont fixées pour que rien ne saute quand le
 * contenu arrive — un décalage de mise en page est plus désagréable que
 * l'attente qu'il prétend masquer.
 *
 * PORTÉ SUR LE DESIGN SYSTEM LE 14/09/2026 (la géométrie de l'ancien en-tête d'écran) et
 * des cartes du kit (filet, rayon 20, fond carte), des blocs sur le creux.
 *
 * `animate-pulse` est décoratif et disparaît sous `prefers-reduced-motion` :
 * la règle est posée dans `globals.css`, et une animation ne porte jamais
 * d'information.
 */
export default async function Chargement() {
  const t = await getTranslations("commun");
  // Refonte du 02/10/2026 (`chargement.html`) : le squelette reste muet pour
  // l'œil d'un lecteur d'écran (`aria-hidden`), et UNE annonce dit qu'on charge.
  // AUCUNE DONNÉE dans un squelette : il affirmerait ce que la base n'a pas dit.
  return (
    <main id="contenu" className="tableau squelette" aria-busy="true">
      <p className="sr" role="status">
        {t("chargement")}
      </p>
      <div className="squelette__corps" aria-hidden="true">
        <i className="sq sq--titre" />
        <i className="sq sq--ligne" />
        <div className="squelette__liste">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="squelette__rangee">
              <i className="sq sq--tuile" />
              <div>
                <i className="sq sq--l1" />
                <i className="sq sq--l2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

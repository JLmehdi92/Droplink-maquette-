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
 * PORTÉ SUR LE DESIGN SYSTEM LE 14/09/2026 : la géométrie d'`EnTeteEcranDs` et
 * des cartes du kit (filet, rayon 20, fond carte), des blocs sur le creux.
 *
 * `animate-pulse` est décoratif et disparaît sous `prefers-reduced-motion` :
 * la règle est posée dans `globals.css`, et une animation ne porte jamais
 * d'information.
 */
export default function Chargement() {
  const bloc = "rounded-ds-sm bg-ds-surface-creux animate-pulse";
  return (
    <div className="px-margin-mobile pt-4 pb-6 md:px-8 md:pt-[30px] md:pb-[26px]" aria-hidden="true">
      <div className={`h-9 w-56 md:h-10 ${bloc}`} />
      <div className={`mt-2 h-4 w-80 max-w-full ${bloc}`} />

      <div className="mt-[26px] flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-4 shadow-ds-card"
          >
            <div className={`h-12 w-12 shrink-0 ${bloc}`} />
            <div className="flex-1">
              <div className={`h-4 w-40 max-w-full ${bloc}`} />
              <div className={`mt-2 h-3 w-64 max-w-full ${bloc}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

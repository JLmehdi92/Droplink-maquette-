/**
 * L'ÉDITEUR — l'écran le plus cliqué du produit.
 *
 * Un fournisseur à 200 commandes par semaine ouvre cet écran des dizaines de
 * fois par jour, depuis la liste. C'est donc là que l'absence d'état de
 * chargement se paie le plus : chaque ouverture paraissait figée le temps du
 * rendu serveur.
 *
 * Le squelette reprend la géométrie à deux colonnes du bureau pour qu'aucun
 * décalage n'ait lieu à l'arrivée du contenu.
 */
export default function Chargement() {
  return (
    <div className="px-margin-mobile py-6 md:px-[30px] md:py-[26px]" aria-hidden="true">
      <div className="h-8 w-64 max-w-full rounded-md bg-outline-variant animate-pulse" />

      <div className="mt-gutter grid grid-cols-1 gap-gutter md:grid-cols-12">
        <div className="flex flex-col gap-gutter md:col-span-7">
          {[0, 1].map((i) => (
            <div key={i} className="carte rounded-lg p-[22px]">
              <div className="h-4 w-32 rounded bg-outline-variant animate-pulse" />
              <div className="mt-4 h-11 w-full rounded-md bg-outline-variant animate-pulse" />
              <div className="mt-3 h-11 w-full rounded-md bg-outline-variant animate-pulse" />
            </div>
          ))}
        </div>
        <div className="md:col-span-5">
          <div className="carte rounded-lg p-[22px]">
            <div className="h-4 w-24 rounded bg-outline-variant animate-pulse" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-square rounded-md bg-outline-variant animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

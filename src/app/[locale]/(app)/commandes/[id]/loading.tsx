/**
 * L'ÉDITEUR — l'écran le plus cliqué du produit.
 *
 * Un fournisseur à 200 commandes par semaine ouvre cet écran des dizaines de
 * fois par jour, depuis la liste. C'est donc là que l'absence d'état de
 * chargement se paie le plus : chaque ouverture paraissait figée le temps du
 * rendu serveur.
 *
 * Le squelette reprend la géométrie à deux colonnes du bureau pour qu'aucun
 * décalage n'ait lieu à l'arrivée du contenu. Porté sur les jetons du design
 * system le 15/09/2026, comme celui de la liste.
 */
export default function Chargement() {
  const bloc = "rounded-ds-sm bg-ds-surface-creux animate-pulse";
  const carte = "rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-[22px] shadow-ds-card";
  return (
    <div className="px-margin-mobile pt-4 pb-6 md:px-8 md:pt-[30px] md:pb-[26px]" aria-hidden="true">
      <div className={`h-9 w-64 max-w-full md:h-10 ${bloc}`} />

      <div className="mt-[26px] grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-7">
          {[0, 1].map((i) => (
            <div key={i} className={carte}>
              <div className={`h-4 w-32 ${bloc}`} />
              <div className={`mt-4 h-11 w-full ${bloc}`} />
              <div className={`mt-3 h-11 w-full ${bloc}`} />
            </div>
          ))}
        </div>
        <div className="md:col-span-5">
          <div className={carte}>
            <div className={`h-4 w-24 ${bloc}`} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`aspect-square ${bloc}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

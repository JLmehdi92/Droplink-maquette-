/**
 * La page client, pendant que le serveur répond.
 *
 * ⚠️ AUCUNE COULEUR EN DUR ICI. Cette surface porte la couleur DU VENDEUR, et
 * la couleur n'est pas encore connue quand ce squelette s'affiche — elle vient
 * de la même lecture qu'on attend. On emploie donc les tons neutres du produit,
 * jamais un accent inventé : un bandeau bleu qui deviendrait vert une seconde
 * plus tard serait pire que pas de bandeau du tout.
 *
 * PAS DE FLOU, comme partout sur cette page : sur un aplat uni, le flou n'a
 * rien à flouter, et c'est ce qui rame le plus sur un mobile d'entrée de gamme.
 *
 * Le squelette est volontairement minuscule — quelques centaines d'octets — :
 * cette page a un budget de 300 Ko hors médias, et un écran d'attente n'a pas
 * à en consommer une part mesurable.
 */
export default function Chargement() {
  return (
    <div aria-hidden="true">
      <div className="h-[120px] w-full bg-outline-variant animate-pulse" />
      <div className="px-margin-mobile py-6 md:px-margin-desktop">
        <div className="mx-auto max-w-container-max">
          <div className="h-5 w-48 max-w-full rounded bg-outline-variant animate-pulse" />
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-square rounded-md bg-outline-variant animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

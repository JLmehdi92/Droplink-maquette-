/**
 * L'EN-TÊTE DE CHAQUE ÉCRAN D'ADMINISTRATION.
 *
 * DEUX FORMES, ET C'EST LA PLANCHE QUI LES SÉPARE. Au bureau, le titre est posé
 * sur le fond clair de la zone de contenu, la colonne sombre suffisant à dire
 * où l'on est. Au téléphone, il RESTE DANS LE NOIR : la colonne sombre y est
 * devenue une bande supérieure, et laisser le titre passer au clair
 * couperait en deux le seul repère qui distingue cette surface de l'espace
 * vendeur.
 *
 * Le bandeau sombre du téléphone est donc la SUITE de celui du layout : même
 * fond, aucun écart entre les deux, un seul bloc à l'œil. C'est aussi pourquoi
 * il porte le bas de la marge (`pb-5`) alors que le layout porte le haut.
 *
 * SOUS-TITRE OBLIGATOIRE, et sur tous les écrans : chacun dit ce que la page
 * montre, et la plupart rappellent que la consultation est tracée. Le rendre
 * facultatif aurait fait disparaître ce rappel du premier écran où l'on aurait
 * oublié de le passer.
 */
export function EnTeteAdmin({
  titre,
  sousTitre,
}: {
  readonly titre: string;
  readonly sousTitre: string;
}) {
  return (
    <div className="bg-admin px-4 pb-5 md:bg-transparent md:px-0 md:pb-0">
      <h1 className="font-headline-xl text-[26px] leading-[33px] font-extrabold tracking-[-0.03em] text-white md:text-[28px] md:leading-[35px] md:text-on-surface">
        {titre}
      </h1>
      <p className="mt-1 font-headline-md text-[13px] leading-4 font-normal text-white/50 md:mt-[5px] md:font-body-sm md:text-[14px] md:leading-[17px] md:text-sourdine">
        {sousTitre}
      </p>
    </div>
  );
}

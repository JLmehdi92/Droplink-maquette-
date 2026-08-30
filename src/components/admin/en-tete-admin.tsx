import type { ReactNode } from "react";

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
 * SOUS-TITRE OBLIGATOIRE, et sur tous les écrans par défaut : chacun dit ce que
 * la page montre, et la plupart rappellent que la consultation est tracée. Le
 * rendre facultatif aurait fait disparaître ce rappel du premier écran où l'on
 * aurait oublié de le passer. `sousTitreAuBureauSeulement` existe pour le seul
 * cas que les planches dessinent : quand un ENCART reprend le même avertissement
 * juste en dessous, le répéter dans le noir n'ajoute rien et repousse le champ
 * de recherche hors de l'écran.
 *
 * `sousTitreMobile` couvre le cas voisin mais distinct du Journal : les deux
 * planches n'y disent pas la même chose. Le bureau annonce la PORTÉE de ce
 * qu'on va lire (« chaque accès administrateur… »), parce qu'un encart voisin
 * porte déjà la garantie d'inaltérabilité ; le téléphone, où cet encart est
 * masqué faute de place, met la garantie dans le sous-titre avec le décompte.
 * Servir un seul texte aux deux gabarits disait donc, au bureau, ce que la
 * planche fait dire au téléphone — et le répétait deux fois au téléphone.
 *
 * `children` est l'espace de l'action de l'écran — un champ de recherche. Au
 * bureau la planche le pose À DROITE du titre, au téléphone SOUS lui, dans le
 * noir : c'est là qu'on tape avant de lire quoi que ce soit.
 */
export function EnTeteAdmin({
  titre,
  sousTitre,
  sousTitreMobile,
  sousTitreAuBureauSeulement = false,
  children,
}: {
  readonly titre: string;
  readonly sousTitre: string;
  readonly sousTitreMobile?: string;
  readonly sousTitreAuBureauSeulement?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className="bg-admin px-4 pb-5 md:bg-transparent md:px-0 md:pb-0 xl:flex xl:items-center xl:justify-between xl:gap-8">
      <div className="min-w-0">
        <h1 className="font-headline-xl text-[26px] leading-[33px] font-extrabold tracking-[-0.03em] text-white md:text-[28px] md:leading-[35px] md:text-on-surface">
          {titre}
        </h1>
        <p
          className={
            "font-headline-md text-[13px] leading-4 font-normal text-white/50 md:mt-[5px] md:font-body-sm md:text-[14px] md:leading-[17px] md:text-sourdine " +
            (sousTitreAuBureauSeulement ? "hidden md:block" : "mt-1")
          }
        >
          {sousTitreMobile === undefined ? (
            sousTitre
          ) : (
            <>
              <span className="md:hidden">{sousTitreMobile}</span>
              <span className="hidden md:inline">{sousTitre}</span>
            </>
          )}
        </p>
      </div>

      {children === undefined ? null : (
        <div className="mt-3.5 xl:mt-0 xl:shrink-0">{children}</div>
      )}
    </div>
  );
}

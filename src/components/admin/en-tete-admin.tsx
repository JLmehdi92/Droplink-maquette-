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
    <div className="px-margin-mobile pt-4 pb-3.5 md:px-0 md:pt-[30px] md:pb-[26px] xl:flex xl:items-center xl:justify-between xl:gap-8">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre max-[560px]:text-[24px] md:text-[36px] md:leading-[37.8px]">
          {titre}
        </h1>
        <p
          className={
            "mt-2 text-[14px] leading-[19px] text-ds-texte-corps md:text-[15px] md:leading-[1.55] " +
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

import type { ReactNode } from "react";

/**
 * UNE CARTE DE RÉGLAGES — `SCard` du kit admin.
 *
 * VALEURS RELEVÉES SUR LE KIT SERVI : carte au rayon `card-lg`, filet, ombre de
 * carte, remplissage 20 ; en-tête à l'écart 12 et 16 px de marge basse — tuile
 * d'icône de 38 au rayon `sm` sur la teinte, icône 18 au trait 1,9 ; titre
 * 16,5/700 à l'interlettrage -0,025em, sous-titre 13/400 en corps à 2 px.
 *
 * LE SOUS-TITRE DIT CE QUE LA CARTE GARANTIT, pas ce qu'elle contient :
 * « vérifiés en base, pas seulement dans l'interface » et « effet immédiat sur
 * toute la plateforme » sont les deux phrases qu'on veut avoir lues avant de
 * toucher à un chiffre. « Quatre réglages » ne se relit pas.
 *
 * ⚠️ AUCUN BOUTON « ENREGISTRER » DANS L'EN-TÊTE, ET C'EST UNE DÉCISION. Le kit
 * en pose un par carte, donc une carte entière par soumission. Chaque réglage
 * s'écrit ici INDIVIDUELLEMENT, par sa propre action, parce que la trace est
 * écrite par un DÉCLENCHEUR qui consigne l'ancienne et la nouvelle valeur : un
 * enregistrement groupé rendrait une seule ligne de journal pour quatre
 * changements, et l'on ne saurait plus lequel a été fait exprès.
 */
export function CarteReglages({
  titre,
  sousTitre,
  children,
}: {
  readonly titre: string;
  readonly sousTitre: string;
  readonly children: ReactNode;
}) {
  const id = `reglages-${titre.replace(/\W+/g, "-")}`;
  return (
    <section className="bloc adm-bloc" aria-labelledby={id}>
      <header className="bloc__tete">
        <div>
          <h2 id={id}>{titre}</h2>
          <p className="adm-aide">{sousTitre}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

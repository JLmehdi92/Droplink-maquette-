import type { LigneCommande } from "@/lib/commandes/liste";

/**
 * LA FRISE DE SUIVI D'UNE LIGNE — `ProgressTracker` du design system.
 *
 * Quatre pastilles reliées par un trait, chacune avec son libellé sous elle.
 *
 * ⚠️ ELLE REDIT LA PASTILLE DE STATUT POSÉE JUSTE À CÔTÉ, ET C'EST VOULU. Le
 * kit met les deux dans la même ligne, et la raison se voit à cinquante lignes :
 * la pastille se LIT, la frise se BALAIE. Un fournisseur qui cherche « où en
 * sont mes colis » parcourt une colonne de traits, pas une colonne de mots.
 *
 * ⚠️ LES QUATRE ÉTAPES SONT EXACTEMENT L'ÉNUMÉRATION DE LA BASE. Le kit en
 * dessine quatre — Commandé, En transit, En livraison, Livré — et le produit en
 * porte quatre — préparation, expédié, en transit, livré. La correspondance est
 * donc totale : aucune étape n'est inventée, aucune n'est perdue, et la frise ne
 * peut pas afficher un état que la commande n'a pas.
 *
 * LES VALEURS, RELEVÉES SUR LA RÉFÉRENCE SERVIE :
 *   pastille  11 × 11, rayon pilule ; pleine à l'accent quand l'étape est
 *             atteinte, blanche bordée de 2 px `--ink-200` sinon
 *   trait     2 px de haut, accent quand l'étape précédente est atteinte
 *   libellé   10 px, 600 et encre d'accent quand atteinte, 400 et couleur
 *             tenue sinon, 7 px sous la pastille
 *
 * ⚠️ 10 px EST SOUS LE PLANCHER DE 11,5 px DE LA RÈGLE 5, ET C'EST ADMIS ICI :
 * ce plancher porte sur le TÉLÉPHONE, et cette frise ne s'y rend pas — le
 * tableau bascule en cartes sous 1 024 px. Le kit applique d'ailleurs la même
 * borne à lui-même : sa feuille remonte ses 10 px à 11,5 sous 760.
 */

const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;

export function FriseSuivi({
  statut,
  libelles,
}: {
  readonly statut: LigneCommande["statut"];
  /**
   * Résolus par l'appelant : ce composant ne tire aucun catalogue.
   *
   * ⚠️ UN ENREGISTREMENT CLOS, PAS UN QUADRUPLET. Indexé par un nombre, un
   * quadruplet rend `string | undefined` sous `noUncheckedIndexedAccess` — donc
   * une étape sans libellé passerait la compilation et rendrait du vide. Ici une
   * cinquième étape ne compile pas, et une manquante non plus.
   */
  readonly libelles: Readonly<Record<(typeof ETAPES)[number], string>>;
}) {
  const courante = ETAPES.indexOf(statut);

  return (
    <div className="flex min-w-0 items-start">
      {ETAPES.map((etape, i) => {
        const atteinte = i <= courante;
        const traitAtteint = i <= courante;
        return (
          <div
            key={etape}
            className="relative flex min-w-0 flex-1 flex-col items-center"
          >
            {i > 0 ? (
              <span
                aria-hidden="true"
                className={
                  "absolute top-[5px] right-1/2 h-0.5 w-full " +
                  (traitAtteint ? "bg-ds-accent" : "bg-ds-ink-200")
                }
              />
            ) : null}
            <span
              aria-hidden="true"
              className={
                "relative z-1 inline-flex h-[11px] w-[11px] rounded-ds-pill " +
                (atteinte ? "bg-ds-accent" : "border-2 border-ds-ink-200 bg-ds-surface-carte")
              }
            />
            <span
              className={
                "mt-[7px] whitespace-nowrap text-[10px] " +
                (atteinte ? "font-semibold text-ds-accent-encre" : "text-ds-texte-tenu")
              }
            >
              {libelles[etape]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

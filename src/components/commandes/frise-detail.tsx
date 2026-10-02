import { ETAPES, type Etape } from "@/lib/tracking/normalize";

export interface EtapeFrise {
  readonly etape: Etape;
  readonly libelle: string;
  /** La date à laquelle un point de passage a daté l'étape, déjà formatée ; `null` sinon. */
  readonly quand: string | null;
  /** Ce que le transporteur a dit en la franchissant ; `null` sinon. */
  readonly note: string | null;
}

/**
 * LA FRISE DU SUIVI (maquette, `commande.html` : `.ed-frise`, quatre étapes en ligne).
 *
 * L'ÉTAPE COURANTE EST CELLE DU STATUT DE LA COMMANDE : les précédentes sont
 * faites, la courante est « actuelle », et « Livrée » se coche quand elle est
 * atteinte — c'est la dernière, il n'y a plus rien à franchir.
 *
 * LA DATE EST CELLE D'UN POINT DE PASSAGE, ou rien : une étape franchie sans date
 * connue n'en invente pas (principe XII). Une étape à venir dit « En attente », la
 * seule phrase qui ne prétend rien. La NOTE du transporteur, quand il en a publié
 * une, reste sous sa date : la maquette n'en montre pas, parce que son jeu n'en a pas.
 */
export function FriseDetail({
  etapes,
  courante,
  libelleAttente,
}: {
  readonly etapes: readonly EtapeFrise[];
  readonly courante: Etape;
  readonly libelleAttente: string;
}) {
  const rangCourant = ETAPES.indexOf(courante);
  const dernier = ETAPES.length - 1;

  return (
    <ol className="ed-frise">
      {etapes.map((e) => {
        const rang = ETAPES.indexOf(e.etape);
        const etat =
          rang < rangCourant || (rang === dernier && rangCourant === dernier)
            ? "fait"
            : rang === rangCourant
              ? "actuel"
              : undefined;
        return (
          <li key={e.etape} data-etat={etat} aria-current={etat === "actuel" ? "step" : undefined}>
            <i aria-hidden="true" />
            <b>{e.libelle}</b>
            {etat === undefined ? <small>{libelleAttente}</small> : e.quand === null ? null : <small>{e.quand}</small>}
            {e.note === null || etat === undefined ? null : <small className="ed-frise__note" title={e.note}>{e.note}</small>}
          </li>
        );
      })}
    </ol>
  );
}

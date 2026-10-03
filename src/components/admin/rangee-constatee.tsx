/**
 * UNE RANGÉE QUE L'ÉCRAN MONTRE SANS L'OUVRIR.
 *
 * Trois formes, et la distinction n'est pas cosmétique :
 *
 *   `valeur`  — le produit applique ce nombre, il se change ailleurs (variable
 *               d'environnement, module pur). On le montre parce qu'un
 *               administrateur DÉCIDE : il lui faut voir ce qui s'applique, même
 *               là où la décision passe par un déploiement.
 *   `absent`  — RIEN n'applique ce plafond. Écrire « 100 Go » serait inventer un
 *               garde ; ne rien écrire du tout ferait croire qu'il n'y a rien à
 *               surveiller. On NOMME l'absence. C'est la règle du brief pour la
 *               surface d'administration, l'inverse exact de la page publique où
 *               une information absente est omise : un client consulte, un
 *               administrateur décide.
 */
export type FormeConstatee =
  | { readonly forme: "valeur"; readonly valeur: string }
  | { readonly forme: "absent"; readonly mention: string };

export function RangeeConstatee({
  titre,
  aide,
  etat,
}: {
  readonly titre: string;
  readonly aide?: string;
  readonly etat: FormeConstatee;
}) {
  return (
    <div className="adm-constate">
      <div>
        <p>{titre}</p>
        {aide === undefined ? null : <small>{aide}</small>}
      </div>
      <b>{etat.forme === "valeur" ? etat.valeur : etat.mention}</b>
    </div>
  );
}

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
 *   `eteint`  — la capacité n'est pas déployée. La bascule est dessinée, en
 *               position basse, et n'est PAS un bouton : rendre cliquable ce qui
 *               ne pilote rien est la façon la plus courante de faire croire
 *               qu'un réglage existe.
 */
export type FormeConstatee =
  | { readonly forme: "valeur"; readonly valeur: string }
  | { readonly forme: "absent"; readonly mention: string }
  | { readonly forme: "eteint" };

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
      {etat.forme === "valeur" ? (
        <b>{etat.valeur}</b>
      ) : etat.forme === "absent" ? (
        <b>{etat.mention}</b>
      ) : (
        /* ÉTEINT ET NON CLIQUABLE : rien ne le pilote encore, et un
           interrupteur qui ne commande rien serait un réglage qui ment. */
        <span className="interrupteur" aria-hidden="true">
          <input type="checkbox" disabled tabIndex={-1} />
          <i />
        </span>
      )}
    </div>
  );
}

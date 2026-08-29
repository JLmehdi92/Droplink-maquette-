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
  /**
   * ABSENTE SUR LES TROIS RANGÉES DE DÉBIT, comme sur la planche : « Jeton
   * inconnu » n'appelle aucune glose, et une phrase de remplissage sous chacune
   * ferait de la carte un mur de texte là où elle est censée se lire d'un coup
   * d'œil. La rangée garde sa hauteur : elle est dictée par la boîte de valeur,
   * pas par le texte.
   */
  readonly aide?: string;
  readonly etat: FormeConstatee;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-filet-ligne py-4">
      <div className="min-w-0">
        <p className="font-headline-md text-[14px] leading-[18px] font-semibold text-on-surface">
          {titre}
        </p>
        {aide === undefined ? null : (
          <p className="mt-[2px] font-body-sm text-[12px] leading-[15px] text-sourdine">{aide}</p>
        )}
      </div>

      {etat.forme === "valeur" ? (
        // MÊME GÉOMÉTRIE QUE LE CHAMP DE LA PLANCHE — 120 × 42, rayon 11, chiffre
        // à droite — mais un fond neutre et aucune bordure de contrôle : rien
        // n'invite à cliquer là où rien ne se saisit.
        <span className="flex h-[42px] w-[120px] shrink-0 items-center justify-end rounded-[11px] bg-fond-neutre px-[13px] font-mono text-[14px] text-sourdine">
          {etat.valeur}
        </span>
      ) : etat.forme === "absent" ? (
        <span className="flex h-[42px] w-[120px] shrink-0 items-center justify-end rounded-[11px] bg-fond-neutre px-[13px] font-body-sm text-[12px] leading-[16px] text-sourdine">
          {etat.mention}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex h-[27px] w-[46px] shrink-0 items-center justify-start rounded-full bg-[#dcdce4] px-[3px]"
        >
          <span className="block h-[21px] w-[21px] rounded-full bg-white" />
        </span>
      )}
    </div>
  );
}

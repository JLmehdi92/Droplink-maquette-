import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";

/**
 * LE BOUTON DE DÉCONNEXION — vendeur et administration.
 *
 * ⚠️ UN `<form method="post">`, PAS UN BOUTON PILOTÉ PAR DU JAVASCRIPT. Ce
 * composant n'est pas un Client Component et n'en a pas besoin : il rend un
 * formulaire HTML ordinaire, qui fonctionne script bloqué, script en échec, ou
 * paquet client jamais arrivé. Sur le seul geste dont le rôle est de protéger un
 * compte, dépendre du chargement d'un script serait un choix étrange — c'est
 * précisément quand quelque chose ne marche pas qu'on veut se déconnecter.
 *
 * ⚠️ ET C'EST AUSSI CE QUI LUI DONNE SA GARDE CSRF GRATUITEMENT : un POST natif
 * porte toujours un en-tête `Origin`, que la route compare à son hôte.
 *
 * TROIS VARIANTES, PARCE QUE LES PLANCHES EN DESSINENT TROIS :
 *
 *   - `cote`          : bloc de compte de la barre latérale vendeur, 32 px ;
 *   - `sombre`        : bloc d'identité de la colonne d'administration ;
 *   - `sombre-mobile` : bande sombre du téléphone côté administration, 44 px ;
 *   - `rond`          : en-tête téléphone de Commandes, 44 px sur pastille
 *                       claire — seul endroit du téléphone vendeur qui porte le
 *                       compte, la barre latérale n'y existant pas.
 *
 * ⚠️ LES DEUX VARIANTES DE TÉLÉPHONE FONT 44 px, celles de bureau 32. Ce n'est
 * pas une incohérence : au bureau la cible est un pointeur, au téléphone c'est
 * un doigt, et le brief pose 44 points comme minimum tactile.
 *
 * L'ICÔNE EST SEULE, DONC ELLE EST NOMMÉE. `titre` la transforme en image
 * accessible et le bouton porte le même libellé : sans cela, un lecteur d'écran
 * annoncerait « bouton », sans dire lequel — sur le geste qui ferme la session.
 */

type Variante = "cote" | "sombre" | "sombre-mobile" | "rond" | "menu" | "lien";

const CLASSES: Readonly<Record<Variante, string>> = {
  /*
   * ⚠️ LES CINQ VARIANTES SONT AU DESIGN SYSTEM DEPUIS LE 12/09/2026. Ce bloc
   * annonçait que les deux variantes d'administration « suivront avec leurs six
   * écrans », parce que poser des surfaces claires dans une colonne noire y
   * aurait fait un trou blanc. La colonne n'est plus noire.
   *
   * ⚠️ LEURS NOMS RESTENT `sombre` ET `sombre-mobile`, et ce n'est pas un
   * oubli : les renommer toucherait les deux appels du layout d'administration
   * pour ne rien changer au rendu, et un nom hérité qui dit d'où vient une
   * valeur vaut mieux qu'un renommage qui efface l'histoire. Ce qu'ils
   * désignent est le bloc d'identité de la colonne et la bande du téléphone.
   */
  cote: "h-9 w-9 shrink-0 rounded-ds-sm text-ds-texte-tenu hover:bg-ds-surface-teinte hover:text-ds-texte-fort",
  sombre: "h-8 w-8 shrink-0 rounded-ds-sm text-ds-texte-tenu hover:bg-ds-surface-teinte hover:text-ds-texte-fort",
  "sombre-mobile":
    "h-11 w-11 shrink-0 rounded-ds-sm text-ds-texte-tenu hover:bg-ds-surface-teinte hover:text-ds-texte-fort",
  // 44 px : la cible tactile minimale du produit. Le rond décoratif que cette
  // pastille remplace n'en faisait que 40, parce qu'il ne se cliquait pas.
  rond: "h-11 w-11 shrink-0 rounded-ds-pill bg-ds-surface-teinte text-ds-accent-encre hover:bg-ds-lavender-200",
  /*
   * ⚠️ LA SEULE VARIANTE QUI PORTE SON MOT. Les quatre autres sont des icônes
   * seules, parce qu elles vivent dans une barre ou un coin ; celle-ci vit dans
   * un menu déroulant, où une icône nue obligerait à deviner ce qu on ouvre
   * juste avant de fermer sa session.
   */
  menu: "compte__lien",
  /*
   * `lien` : « Ce n'est pas votre compte ? Se déconnecter », sur l'écran de
   * vérification en deux étapes. Un mot EN LIGNE dans une phrase, sans icône —
   * la règle 5 laisse les liens de la prose à leur hauteur de texte. C'est la
   * même route et le même POST : un second formulaire de déconnexion serait une
   * seconde garde CSRF à tenir.
   */
  lien: "inline font-bold text-ds-texte-lien hover:underline",
};

export async function BoutonDeconnexion({
  langue,
  variante,
}: {
  readonly langue: string;
  readonly variante: Variante;
}) {
  const t = await getTranslations("navigation");
  const libelle = t("seDeconnecter");

  const dansUnMenu = variante === "menu";
  const enLigne = variante === "lien";

  return (
    <form
      action={`/${langue}/deconnexion`}
      method="post"
      className={dansUnMenu ? "w-full" : enLigne ? "inline" : "shrink-0"}
    >
      <button
        type="submit"
        title={libelle}
        /*
         * ⚠️ PAS D `aria-label` QUAND LE MOT EST ÉCRIT. Un libellé accessible
         * posé par-dessus un texte visible REMPLACE ce texte : un lecteur
         * d écran annoncerait alors le libellé et jamais le contenu, et les deux
         * pourraient diverger sans que personne le voie.
         */
        {...(dansUnMenu || enLigne ? {} : { "aria-label": libelle })}
        className={
          (enLigne || dansUnMenu ? "" : "flex items-center justify-center transition-colors ") + CLASSES[variante]
        }
      >
        {enLigne ? libelle : <LogOut aria-hidden="true" size={17} strokeWidth={1.9} />}
        {dansUnMenu ? <span>{libelle}</span> : null}
      </button>
    </form>
  );
}

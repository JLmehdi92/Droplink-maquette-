import { getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";

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

type Variante = "cote" | "sombre" | "sombre-mobile" | "rond";

const CLASSES: Readonly<Record<Variante, string>> = {
  /*
   * ⚠️ LES DEUX VARIANTES VENDEUR SONT PASSÉES AU DESIGN SYSTEM, LES DEUX
   * VARIANTES ADMIN NON. La coque vendeur et l'écran Commandes sont migrés ;
   * l'administration ne l'est pas, et son chrome est encore sombre. Poser des
   * surfaces claires du design system dans une colonne noire y ferait un trou
   * blanc. Elles suivront avec leurs six écrans.
   */
  cote: "h-9 w-9 shrink-0 rounded-ds-sm text-ds-texte-tenu hover:bg-ds-surface-teinte hover:text-ds-texte-fort",
  sombre: "h-8 w-8 shrink-0 rounded-[9px] text-white/60 hover:bg-white/10",
  "sombre-mobile": "h-11 w-11 shrink-0 rounded-[11px] text-white/60 hover:bg-white/10",
  // 44 px : la cible tactile minimale du produit. Le rond décoratif que cette
  // pastille remplace n'en faisait que 40, parce qu'il ne se cliquait pas.
  rond: "h-11 w-11 shrink-0 rounded-ds-pill bg-ds-surface-teinte text-ds-accent-encre hover:bg-ds-lavender-200",
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

  return (
    <form action={`/${langue}/deconnexion`} method="post" className="shrink-0">
      <button
        type="submit"
        title={libelle}
        aria-label={libelle}
        className={
          "flex items-center justify-center transition-colors " + CLASSES[variante]
        }
      >
        <Icone nom="logout" className="text-[17px]" />
      </button>
    </form>
  );
}

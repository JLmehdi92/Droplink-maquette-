import { getTranslations } from "next-intl/server";
import type { ParametresListe } from "@/lib/commandes/liste";
import { lienListe } from "@/lib/commandes/url";
import { PilulesFiltresAnimees } from "./pilules-filtres-animees";

/**
 * LES QUATRE VUES QU'ON OUVRE VINGT FOIS PAR JOUR, en pilules.
 *
 * Ce ne sont pas des filtres de plus : ce sont des RACCOURCIS vers des
 * combinaisons du panneau de filtres, qui existe toujours pour tout le reste. Un
 * fournisseur à 200 commandes par semaine ne déroule pas deux listes déroulantes
 * pour voir ce qui est en transit.
 *
 * ⚠️ ELLES ÉTAIENT CINQ, LA PLANCHE EN DESSINE QUATRE. « Livrées » a été retirée
 * — et ce n'est pas une perte de fonction : le compteur « Livrées » de la rangée
 * du dessus est juste au-dessus, et le panneau de filtres porte le statut au
 * complet. Ce qui disparaît, c'est un raccourci de plus dans une barre qui doit
 * rester lisible d'un coup d'œil.
 *
 * DES LIENS, PAS DES BOUTONS. L'URL décrit ce qui est affiché : elle se met en
 * favori, se recopie, revient par l'historique. Un état client ne fait rien de
 * tout cela.
 */
export async function PilulesFiltres({
  base,
  parametres,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
}) {
  const t = await getTranslations("commandes");

  /*
   * ⚠️ LES QUATRE PILULES SONT UN CHOIX UNIQUE, PAS QUATRE INTERRUPTEURS.
   *
   * DÉFAUT MONTRÉ EN CAPTURE PAR WASSIM LE 03/09/2026, et les planches lui
   * donnaient raison depuis le début : `Commandes` et `CommandesFiltreVide`
   * n'en dessinent qu'UNE SEULE allumée — fond encre `#111117` — les trois
   * autres au repos. Le code, lui, les laissait se cumuler.
   *
   * CE QU'ON VOYAIT À L'ÉCRAN : on clique « En transit », puis « Bloquées », et
   * les DEUX restent noires, la rangée « Filtres actifs » apparaît, et la liste
   * affiche « Aucune commande ne correspond ». Trois choses fausses d'un coup,
   * pour un geste que personne ne pense à interdire.
   *
   * LA CAUSE EST QU'ELLES N'ÉTAIENT PAS DE LA MÊME NATURE : « En transit » pose
   * un FILTRE de statut, les deux suivantes posent un TRI restrictif. Un filtre
   * et un tri se cumulent sans se contredire — le produit ne pouvait donc pas
   * s'en apercevoir tout seul.
   *
   * ⚠️ ET C'EST MOI QUI L'AI AGGRAVÉ LA VEILLE. « Bloquées » posait
   * `statut: null` ; je l'ai retiré le 03/09 au matin au nom de la cohérence
   * des critères — ce qui a rendu le cumul possible sur la dernière pilule qui
   * y échappait encore. La cohérence était le bon objectif, le mauvais niveau :
   * ce ne sont pas les critères qu'il faut préserver ici, c'est L'EXCLUSIVITÉ
   * des vues.
   *
   * LA RÈGLE, DÉSORMAIS : une pilule choisit un ENSEMBLE de commandes. Elle
   * pose donc son propre couple `(statut, tri)` et efface ce qui appartient aux
   * autres pilules — rien de plus. La recherche, la période, le filtre photos
   * et les archives ne lui appartiennent pas : ils ont leurs puces et le lien
   * « tout effacer ». C'est ce qui garantit qu'exactement UNE pilule est
   * allumée à tout instant, sans jamais produire un écran vide par accident.
   *
   * ⚠️ LE MENU DE TRI CONTINUE DE FONCTIONNER À L'INTÉRIEUR D'UNE VUE. Un tri
   * ORDINAIRE — plus récentes, plus anciennes, modifiées — ne change pas
   * l'ensemble regardé, donc ne change pas la pilule allumée. Seuls les deux
   * tris RESTRICTIFS le font, parce qu'ils sont eux-mêmes des vues.
   */
  const restrictif = parametres.tri === "jamais-ouvert" || parametres.tri === "bloquees";

  // Une vue non restrictive ne touche au tri QUE s'il faut sortir d'un tri
  // restrictif : sinon on écraserait l'ordre que le vendeur vient de choisir.
  const sortirDuRestrictif = restrictif ? { tri: "recentes" as const } : {};

  const vues = [
    {
      clef: "toutes",
      href: lienListe(base, parametres, { statut: null, ...sortirDuRestrictif }),
      actif: parametres.statut === null && !restrictif,
    },
    {
      clef: "enTransit",
      href: lienListe(base, parametres, { statut: "en_transit", ...sortirDuRestrictif }),
      actif: parametres.statut === "en_transit" && !restrictif,
    },
    {
      clef: "jamaisOuvertes",
      href: lienListe(base, parametres, { tri: "jamais-ouvert", statut: null }),
      actif: parametres.tri === "jamais-ouvert",
    },
    {
      /*
       * LA PILULE QUI FAIT GAGNER DU TEMPS. Elle répond à « quels colis dois-je
       * relancer », et c'est la seule question de cet écran dont la réponse
       * n'est pas visible en parcourant la liste.
       *
       * Elle repose sur le TRI et non sur un filtre de statut : le statut dit
       * « en transit », il ne dit pas depuis combien de temps rien ne bouge.
       * Elle efface donc le statut, comme sa jumelle juste au-dessus — non par
       * redondance, mais parce qu'une vue en remplace une autre.
       */
      clef: "bloquees",
      href: lienListe(base, parametres, { tri: "bloquees", statut: null }),
      actif: parametres.tri === "bloquees",
    },
  ] as const;

  /*
   * ⚠️ LE RENDU EST DÉLÉGUÉ À UN COMPOSANT CLIENT, LA DÉCISION RESTE ICI.
   *
   * Ce fichier garde ce qui compte — quel couple `(statut, tri)` chaque vue
   * pose, et laquelle est allumée. Le composant client ne fait que peindre, et
   * il reçoit ses libellés DÉJÀ RÉSOLUS : aucun catalogue de traduction ne part
   * dans le navigateur, comme pour la barre de navigation du vendeur.
   *
   * Ce qu'il apporte : la pastille d'accent GLISSE d'une pilule à l'autre au
   * lieu de sauter. Elle ne le pouvait pas avant le 09/09/2026 — sous Next 15,
   * cliquer une pilule détruisait le document, et il n'y avait pas deux rendus
   * entre lesquels animer quoi que ce soit.
   */
  return (
    <PilulesFiltresAnimees
      vues={vues.map((vue) => ({
        clef: vue.clef,
        href: vue.href,
        actif: vue.actif,
        libelle: t("vues." + vue.clef),
      }))}
    />
  );
}

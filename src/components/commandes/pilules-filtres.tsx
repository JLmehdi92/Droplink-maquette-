import { getTranslations } from "next-intl/server";
import type { ParametresListe } from "@/lib/commandes/liste";
import { lienListe } from "@/lib/commandes/url";
import { LienEcran } from "@/components/lien-ecran";

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

  const vues = [
    {
      clef: "toutes",
      href: lienListe(base, parametres, { statut: null, qc: null, tri: "recentes" }),
      actif: parametres.statut === null && parametres.tri === "recentes",
    },
    {
      clef: "enTransit",
      href: lienListe(base, parametres, { statut: "en_transit" }),
      actif: parametres.statut === "en_transit",
    },
    {
      clef: "jamaisOuvertes",
      href: lienListe(base, parametres, { tri: "jamais-ouvert" }),
      actif: parametres.tri === "jamais-ouvert",
    },
    {
      /*
       * LA PILULE QUI FAIT GAGNER DU TEMPS. Elle répond à « quels colis dois-je
       * relancer », et c'est la seule question de cet écran dont la réponse n'est
       * pas visible en parcourant la liste.
       *
       * Elle repose sur le TRI et non sur un filtre de statut : le statut dit
       * « en transit », il ne dit pas depuis combien de temps rien ne bouge.
       *
       * ⚠️ ELLE POSAIT `statut: null`, ET C'ÉTAIT LE DÉFAUT QUE WASSIM A DÉCRIT
       * PAR « des fois ça enlève les autres filtres ». Mesuré le 03/09/2026 sur
       * `?q=veste&tri=anciennes&statut=en_transit` : de tous les contrôles de
       * l'écran, elle était LA SEULE à perdre un critère qu'elle ne prétend pas
       * changer — sa jumelle « Jamais ouvertes », bâtie sur le même mécanisme de
       * tri, conservait tout.
       *
       * L'intention était bonne : « bloquées » restreint déjà aux colis en
       * transit, donc garder le statut est redondant. Mais l'écran EFFAÇAIT en
       * silence un filtre que le vendeur avait posé, et le même tri gardait ce
       * statut quand on le choisissait depuis le MENU de tri. Deux contrôles,
       * un seul effet, deux comportements : c'est l'incohérence qui se voit,
       * pas la redondance qu'elle évitait.
       */
      clef: "bloquees",
      href: lienListe(base, parametres, { tri: "bloquees" }),
      actif: parametres.tri === "bloquees",
    },
  ] as const;

  return (
    <>
      {vues.map((vue) => (
        <LienEcran
          key={vue.clef}
          href={vue.href}
          aria-current={vue.actif ? "true" : undefined}
          className={
            // 44 px au doigt, 34 px à la souris : la planche téléphone écrit
            // `min-height: 44px` là où la planche bureau écrit `height: 34px`.
            "flex min-h-11 shrink-0 items-center rounded-full border px-3.5 font-label-md text-[13px] font-semibold whitespace-nowrap transition-colors md:h-[34px] md:min-h-0 " +
            (vue.actif
              ? "border-primary bg-primary text-on-primary"
              : "border-filet-controle bg-surface-container-lowest text-ardoise hover:bg-fond-neutre")
          }
        >
          {t("vues." + vue.clef)}
        </LienEcran>
      ))}
    </>
  );
}

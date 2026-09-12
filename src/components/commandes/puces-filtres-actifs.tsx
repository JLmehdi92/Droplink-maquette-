import { getFormatter, getTranslations } from "next-intl/server";
import type { ParametresListe } from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";
import { LienEcran } from "@/components/lien-ecran";

/**
 * LES CRITÈRES ACTIFS, VISIBLES ET RETIRABLES UN PAR UN.
 *
 * C'est la planche `CommandesFiltreVide` qui les impose, et sa raison est écrite
 * dedans : « les critères restent VISIBLES et retirables un par un, et le retour
 * à l'état complet se fait EN UN GESTE ».
 *
 * SANS ELLES, LE PANNEAU DE FILTRES EST REPLIÉ ET LA LISTE EST RESTREINTE SANS
 * QUE RIEN NE LE DISE. Un vendeur qui revient sur un signet posé la semaine
 * dernière voit alors trente commandes là où il en a neuf mille, et conclut à
 * une perte de données — pas à un filtre. C'est le même défaut que Wassim avait
 * relevé sur l'état vide : le produit avait raison sur les données et se taisait
 * sur la cause.
 *
 * « TOUT EFFACER » N'APPARAÎT QUE S'IL EFFACE QUELQUE CHOSE. Un lien dont
 * l'action est déjà l'état courant enseigne que l'interface ne répond pas.
 */
export async function PucesFiltresActifs({
  base,
  parametres,
}: {
  readonly base: string;
  readonly parametres: ParametresListe;
}) {
  /*
   * ⚠️ IL Y AVAIT ICI UNE PUCE POUR LE TRI, ET ELLE FAISAIT DOUBLON.
   *
   * Deux des cinq tris RESTREIGNENT en plus d'ordonner — « jamais ouvertes »,
   * « bloquées » — et cette rangée en portait une puce. La raison écrite était
   * qu'un vendeur tombé sur zéro résultat n'avait aucun moyen de revenir,
   * « la planche `CommandesFiltreVide` n'y dessinant pas les pilules ».
   *
   * CETTE PRÉMISSE EST MORTE, et c'est le correctif du 02/09/2026 qui l'a tuée :
   * la planche porte désormais la rangée de vues sur l'écran vide, et le code
   * la rend. Le vendeur voit donc la pilule « Jamais ouvertes » SURLIGNÉE et
   * « Toutes » à un clic — et par-dessus, une puce qui redisait la même chose.
   *
   * LE VOCABULAIRE DU CANEVAS TRANCHE AUSSI : cette rangée s'intitule
   * « Filtres actifs », et les planches n'y dessinent que des FILTRES —
   * recherche, statut, période. Un tri est une VUE, et une vue se dit par sa
   * pilule. La puce s'annonçait d'ailleurs « Vue : … » dans une rangée de
   * filtres, ce qui était l'aveu du problème.
   */
  if (!listeFiltree(parametres)) return null;

  const t = await getTranslations("commandes");
  const format = await getFormatter();

  const jour = (valeur: string): string =>
    format.dateTime(new Date(valeur + "T00:00:00Z"), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  // Une période est UNE puce, comme sur la planche, même quand une seule borne
  // est posée : trois libellés pour un seul critère, et un seul geste pour le
  // retirer.
  const periode =
    parametres.du !== null && parametres.au !== null
      ? t("puce.periodeEntre", { du: jour(parametres.du), au: jour(parametres.au) })
      : parametres.du !== null
        ? t("puce.periodeDepuis", { du: jour(parametres.du) })
        : parametres.au !== null
          ? t("puce.periodeJusqua", { au: jour(parametres.au) })
          : null;

  const puces = [
    parametres.q !== ""
      ? {
          clef: "q",
          libelle: t("puce.recherche", { q: parametres.q }),
          href: lienListe(base, parametres, { q: "" }),
        }
      : null,
    /*
     * ⚠️ PAS DE PUCE POUR UN STATUT QU'UNE PILULE DIT DÉJÀ.
     *
     * DÉFAUT MONTRÉ EN CAPTURE PAR WASSIM LE 03/09/2026 : cliquer « En transit »
     * faisait apparaître une rangée « Filtres actifs » portant « Statut : En
     * transit », alors que la pilule du même nom venait de s'allumer juste en
     * dessous. Aucune des trois autres pilules ne produisait de rangée — elles
     * posent un tri, pas un filtre. On voyait donc un contrôle sur quatre
     * ouvrir une rangée de plus, sans raison lisible.
     *
     * LA PLANCHE LE DIT DEPUIS LE DÉBUT : `CommandesFiltreVide` dessine
     * « Recherche », « Période » et « Statut : LIVRÉ » — un statut qui n'a PAS
     * de pilule. Jamais « Statut : En transit ».
     *
     * C'est le même raisonnement qui a retiré la puce de tri la veille : la
     * rangée ne montre que ce qu'aucun autre contrôle ne montre. Et la sortie
     * reste à un clic — la pilule « Toutes » est dans la même barre.
     *
     * ⚠️ LES AUTRES STATUTS GARDENT LEUR PUCE, et c'est le point : « préparation »,
     * « expédié » et « livré » viennent du panneau de filtres et n'ont aucune
     * pilule. Sans leur puce, rien à l'écran ne dirait qu'ils sont posés.
     */
    parametres.statut !== null && parametres.statut !== "en_transit"
      ? {
          clef: "statut",
          libelle: t("puce.statut", { valeur: t("statut." + parametres.statut) }),
          href: lienListe(base, parametres, { statut: null }),
        }
      : null,
    parametres.qc !== null
      ? {
          clef: "qc",
          libelle: t("puce.qc", { valeur: t("qc." + parametres.qc) }),
          href: lienListe(base, parametres, { qc: null }),
        }
      : null,
    periode !== null
      ? {
          clef: "periode",
          libelle: periode,
          href: lienListe(base, parametres, { du: null, au: null }),
        }
      : null,
    parametres.archivees
      ? {
          clef: "archivees",
          libelle: t("puce.archivees"),
          href: lienListe(base, parametres, { archivees: false }),
        }
      : null,
  ].filter((p) => p !== null);

  /*
   * ⚠️ UNE RANGÉE SANS AUCUNE PUCE NE SE REND PAS.
   *
   * `listeFiltree` répond « oui, un filtre est posé » dès qu'un statut existe —
   * mais depuis que « en transit » n'a plus de puce, ce critère peut être le
   * SEUL, et la rangée rendait alors « Filtres actifs : » suivi de rien, puis
   * « Tout effacer ». Une étiquette qui annonce une liste vide, exactement le
   * genre de détail que Wassim voit et que rien ne signale.
   *
   * Ce garde est le pendant de la puce retirée juste au-dessus : les deux
   * décisions se tiennent, et séparer l'une de l'autre rouvrirait le défaut.
   */
  if (puces.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-margin-mobile md:px-0">
      <span className="mr-0.5 text-[13px] text-ds-texte-corps">{t("filtresActifsLabel")}</span>

      {puces.map((puce) => (
        <span
          key={puce.clef}
          /* Le `Badge tone="brand"` du design system : fond teinté, encre d'accent,
             AUCUN filet — le kit ne borde pas ses surfaces teintées. */
          className="inline-flex h-[34px] items-center gap-[7px] rounded-ds-pill bg-ds-surface-teinte pr-2 pl-[13px] text-[13px] font-bold text-ds-accent-encre"
        >
          {puce.libelle}
          <LienEcran
            href={puce.href}
            // LA CIBLE TACTILE EST AGRANDIE SANS QUE LA CROIX GROSSISSE. La
            // planche dessine un rond de 20 px ; au doigt, 20 px se rate une
            // fois sur trois. Le pseudo-élément agrandit la zone de clic sans
            // rien changer à ce qui est dessiné.
            //
            // ⚠️ HORIZONTALEMENT, L'AGRANDISSEMENT NE DÉPASSE PAS 8 PX, qui est
            // exactement le `gap` de la rangée. À 12 px, la zone de clic mordait
            // de quatre pixels sur la puce SUIVANTE : viser le bord gauche d'un
            // critère retirait le précédent, et rien à l'écran ne l'expliquait.
            className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-pill bg-ds-accent/[0.16] transition-colors after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:bg-ds-accent/30"
            aria-label={t("retirerFiltre", { filtre: puce.libelle })}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </LienEcran>
        </span>
      ))}

      <LienEcran
        href={base}
        className="ml-1 text-[13px] font-bold text-ds-texte-lien underline-offset-2 hover:text-ds-texte-lien-survol hover:underline"
      >
        {t("toutEffacer")}
      </LienEcran>
    </div>
  );
}

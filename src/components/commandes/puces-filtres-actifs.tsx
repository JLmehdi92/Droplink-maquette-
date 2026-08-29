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
  // LE TRI COMPTE ICI, ALORS QU'IL NE COMPTE PAS DANS `listeFiltree`.
  //
  // Deux des cinq tris RESTREIGNENT en plus d'ordonner : « jamais ouvertes »
  // n'affiche que les commandes à zéro vue, « bloquées » que les colis en transit
  // dont le mouvement s'est arrêté. Sans puce, un vendeur qui tombe sur zéro
  // résultat avec l'un des deux n'a aucun moyen de revenir en arrière depuis
  // l'écran vide — la planche `CommandesFiltreVide` n'y dessine pas les pilules.
  //
  // `listeFiltree` reste inchangée pour autant : elle sert à ouvrir le panneau de
  // filtres, et un raccourci de vue n'a pas à déplier un panneau.
  const triRestreint = parametres.tri === "jamais-ouvert" || parametres.tri === "bloquees";
  if (!listeFiltree(parametres) && !triRestreint) return null;

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
    parametres.statut !== null
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
    triRestreint
      ? {
          clef: "tri",
          libelle: t("puce.tri", { valeur: t("tri." + parametres.tri) }),
          href: lienListe(base, parametres, { tri: "recentes" }),
        }
      : null,
  ].filter((p) => p !== null);

  return (
    <div className="flex flex-wrap items-center gap-2 px-margin-mobile md:px-0">
      <span className="mr-0.5 font-body-sm text-[13px] text-sourdine">{t("filtresActifsLabel")}</span>

      {puces.map((puce) => (
        <span
          key={puce.clef}
          className="inline-flex h-[34px] items-center gap-[7px] rounded-full border border-violet bg-violet-fond pr-2 pl-[13px] font-label-md text-[13px] font-semibold text-violet-encre"
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
            className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/[0.18] transition-colors after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:bg-violet/30"
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
        className="ml-1 font-label-md text-[13px] font-bold text-violet hover:text-violet-survol"
      >
        {t("toutEffacer")}
      </LienEcran>
    </div>
  );
}

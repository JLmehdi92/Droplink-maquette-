import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ParametresListe } from "@/lib/commandes/liste";
import { lienListe } from "@/lib/commandes/url";

/**
 * LES QUATRE VUES QU'ON OUVRE VINGT FOIS PAR JOUR, en pilules.
 *
 * Ce ne sont pas des filtres de plus : ce sont des RACCOURCIS vers des
 * combinaisons du panneau de filtres, qui existe toujours en dessous pour tout
 * le reste. Un fournisseur à 200 commandes par semaine ne déroule pas deux
 * listes déroulantes pour voir ce qui est en transit.
 *
 * ÉCART ASSUMÉ AVEC LA PLANCHE, et il faut le dire plutôt que le maquiller :
 * la quatrième pilule dessinée est « Bloquées ». Le tri « bloqué en transit »
 * n'existe pas encore dans le produit — il est au reste du lot 4. Rendre une
 * pilule qui filtre sur autre chose que ce qu'elle annonce serait pire que
 * l'absence : ici elle mène aux commandes livrées, et elle le dit.
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
      clef: "livrees",
      href: lienListe(base, parametres, { statut: "livre" }),
      actif: parametres.statut === "livre",
    },
  ] as const;

  return (
    // Le débordement horizontal est ASSUMÉ au téléphone : quatre pilules ne
    // tiennent pas sur 390 px, et les replier sur deux lignes coûterait la
    // hauteur d'une commande dans la liste.
    <ul className="flex gap-2 overflow-x-auto px-margin-mobile pb-1 md:px-0">
      {vues.map((vue) => (
        <li key={vue.clef}>
          <Link
            href={vue.href}
            aria-current={vue.actif ? "true" : undefined}
            className={
              "flex min-h-11 items-center rounded-full border px-3.5 font-label-md text-[13px] font-semibold whitespace-nowrap transition-colors md:min-h-0 md:h-[34px] " +
              (vue.actif
                ? "border-primary bg-primary text-on-primary"
                : "border-outline bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container")
            }
          >
            {t("vues." + vue.clef)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

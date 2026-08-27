import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ParametresListe } from "@/lib/commandes/liste";
import { lienListe } from "@/lib/commandes/url";

/**
 * LES CINQ VUES QU'ON OUVRE VINGT FOIS PAR JOUR, en pilules.
 *
 * Ce ne sont pas des filtres de plus : ce sont des RACCOURCIS vers des
 * combinaisons du panneau de filtres, qui existe toujours en dessous pour tout
 * le reste. Un fournisseur à 200 commandes par semaine ne déroule pas deux
 * listes déroulantes pour voir ce qui est en transit.
 *
 * ⚠️ CE BLOC DÉCRIVAIT UN ÉCART QUI N'EXISTE PLUS. Il annonçait que le tri
 * « bloqué en transit » n'était pas implémenté et que la pilule « Bloquées »
 * menait aux commandes livrées. Le tri existe depuis, la pilule y mène — et le
 * commentaire, lui, est resté. C'est le mensonge en attente que le projet
 * s'interdit : il décrivait une INTENTION passée là où le lecteur cherche le
 * comportement présent, et il aurait fait chercher un défaut là où il n'y en a
 * plus. Les cinq pilules mènent chacune à ce qu'elles annoncent.
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
       * relancer », et c'est la seule question de cet écran dont la réponse
       * n'est pas visible en parcourant la liste.
       *
       * Elle repose sur le TRI et non sur un filtre de statut : le statut dit
       * « en transit », il ne dit pas depuis combien de temps rien ne bouge. Le
       * tri place le colis le plus immobile en tête — et l'état d'un colis vient
       * désormais du transporteur, sans que le vendeur ait à toucher quoi que
       * ce soit.
       */
      clef: "bloquees",
      href: lienListe(base, parametres, { tri: "bloquees", statut: null }),
      actif: parametres.tri === "bloquees",
    },
    {
      clef: "livrees",
      href: lienListe(base, parametres, { statut: "livre" }),
      actif: parametres.statut === "livre",
    },
  ] as const;

  return (
    // Le débordement horizontal est ASSUMÉ au téléphone : cinq pilules ne
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

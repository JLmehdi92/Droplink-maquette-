"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * LE BLOC DE DROITE DE L'EN-TÊTE D'ENVOIS — bouton « Actualiser » et fraîcheur
 * des données. `ShippingView` du kit vendeur.
 *
 * LES VALEURS DU KIT, MESURÉES SUR LA PAGE SERVIE (jamais lues dans son source,
 * qui ne dit pas ce que le navigateur rend) :
 *
 *   bouton       hauteur 48, largeur 128, `padding: 0 18px`, écart 10,
 *                rayon carte, filet `--border-subtle`, fond carte, ombre xs,
 *                libellé 14 / 600, icône 17 px en trait 2, teinte accent
 *   « Dernière mise à jour »  12 / 400, texte sourdine — relevé rgb(139,144,168)
 *   la date      13 / 500, texte de corps — relevé rgb(107,111,140)
 *   écart bouton ↔ bloc de date : 18 ; entre les deux lignes de date : 2
 *   le bloc est aligné en HAUT et descendu de 6 px : sur la référence, le titre
 *   commence à y=119 et le bouton à y=125
 *
 * ⚠️ CE BOUTON NE RÉINTERROGE PAS LE TRANSPORTEUR, ET C'EST UNE DÉCISION DE
 * COÛT, PAS UNE FACILITÉ.
 *
 * Chaque interrogation du fournisseur de suivi se paie, et le palier dont
 * dispose le produit est de 200 prises en charge À VIE. Un bouton qui lance une
 * interrogation à chaque clic est un bouton qu'un vendeur impatient martèle
 * pendant que son colis dort en douane — et la cadence de `lib/tracking` existe
 * précisément pour espacer ces appels selon l'âge du colis. Lui donner un
 * contournement manuel reviendrait à écrire la règle puis à livrer sa
 * dérogation.
 *
 * Il rafraîchit donc l'AFFICHAGE : le rendu serveur est rejoué et la liste
 * montre ce que le webhook et la cadence ont écrit depuis l'ouverture de la
 * page. C'est exactement ce que le mot « Actualiser » promet, et rien de plus —
 * le principe VIII veut qu'on n'affirme jamais ce que la base n'a pas
 * enregistré ; il vaut aussi pour ce qu'un bouton laisse croire qu'il a fait.
 */
export function EnTeteEnvois({
  libelleActualiser,
  libelleFraicheur,
  fraicheur,
}: {
  readonly libelleActualiser: string;
  readonly libelleFraicheur: string;
  /** Déjà formatée par le serveur, pour que les trois langues suivent la même
      règle de date que le reste de l'écran. `null` quand le compte n'a aucun
      colis : on omet la ligne plutôt que d'inventer une date. */
  readonly fraicheur: string | null;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  return (
    /*
      ⚠️ `self-start` ET NON L'ALIGNEMENT DU PARENT. La rangée de l'en-tête est
      centrée — c'est ce que veulent Commandes, Analyses et Marque, qui la
      partagent. Le kit, lui, aligne ce bloc-ci EN HAUT et le descend de 6 px :
      sur la référence servie, le titre commence à y=119 et le bouton à y=125.
      Centré, le nôtre tombait à 135.

      Corriger le parent aurait déplacé le bloc de droite des trois autres
      écrans pour l'unique besoin de celui-ci — dont un, `/commandes`, est déjà
      mesuré à zéro écart. L'alignement se pose donc sur l'enfant qui le
      demande.
    */
    <div className="flex items-center gap-[18px] md:self-start md:pt-1.5">
      <button
        type="button"
        onClick={() => {
          demarrer(() => {
            router.refresh();
          });
        }}
        className="inline-flex h-12 items-center gap-2.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] font-semibold text-ds-texte-fort shadow-ds-xs transition-shadow hover:shadow-ds-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {/*
          L'ICÔNE TOURNE PENDANT LA TRANSITION, et s'arrête quand elle finit —
          le kit fait tourner la sienne 900 ms au hasard, c'est-à-dire qu'elle
          ment sur la durée réelle. `animate-spin` porte `motion-reduce:animate-none`
          par le préréglage du projet : la règle 4 veut qu'aucune animation ne
          porte d'information, et l'attente est ici redondante avec le bouton
          désactivé.
        */}
        <RefreshCw
          aria-hidden="true"
          strokeWidth={2}
          className={
            "h-[17px] w-[17px] text-ds-accent" + (enCours ? " motion-safe:animate-spin" : "")
          }
        />
        {libelleActualiser}
      </button>

      {/*
        ⚠️ `leading-[normal]` ET NON `leading-normal` — DEUX CHOSES DIFFÉRENTES,
        et c'est le piège le plus discret de cette migration.

        `leading-normal` est une valeur de l'échelle Tailwind : elle vaut **1,5**.
        Le `line-height: normal` du CSS, celui que pose le kit, s'écrit
        `leading-[normal]` entre crochets. La date rendait donc 19,5 px de haut
        au lieu de 17 — et l'écrire `leading-normal` ne changeait rien, puisque
        1,5 était déjà la valeur héritée.

        Et il faut la poser sur CHAQUE ligne, pas sur leur parent : en Tailwind
        v4, `text-[13px]` emporte sa propre hauteur de ligne, qui écrase celle du
        parent. Une classe juste, posée au mauvais niveau, est une classe servie
        qui ne gagne pas.
      */}
      {fraicheur === null ? null : (
        <span className="hidden flex-col gap-0.5 text-right md:flex">
          <span className="text-[12px] leading-[normal] text-ds-texte-sourdine">
            {libelleFraicheur}
          </span>
          <span className="text-[13px] leading-[normal] font-medium text-ds-texte-corps">
            {fraicheur}
          </span>
        </span>
      )}
    </div>
  );
}

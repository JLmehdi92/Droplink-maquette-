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

  /* La fraîcheur d'abord, puis le bouton (maquette, `.fraicheur`). L'icône
     tourne pendant la VRAIE relecture, et s'arrête quand elle finit. `null` quand
     le compte n'a aucun colis : on omet la ligne plutôt que d'inventer une date. */
  return (
    <div className="fraicheur">
      {fraicheur === null ? null : (
        <p>
          <span>{libelleFraicheur}</span>
          <time>{fraicheur}</time>
        </p>
      )}
      <button
        type="button"
        className={"bouton-outil" + (enCours ? " est-en-cours" : "")}
        aria-busy={enCours || undefined}
        disabled={enCours}
        onClick={() => {
          demarrer(() => {
            router.refresh();
          });
        }}
      >
        <RefreshCw aria-hidden="true" className="ic" />
        <span>{libelleActualiser}</span>
      </button>
    </div>
  );
}

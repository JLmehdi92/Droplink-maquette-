import { Check } from "lucide-react";
import { ETAPES, type Etape } from "@/lib/tracking/normalize";

/**
 * LA FRISE VERTICALE DU DÉTAIL — `DetailTimeline`, mesurée sur le kit servi.
 *
 * ⚠️ C'EST LA TROISIÈME FRISE DU PRODUIT, ET CE N'EST PAS UNE DE TROP.
 * `FriseSuivi` (`ProgressTracker`) est horizontale avec libellés, sur la liste
 * des commandes ; `FriseCompacte` (`MiniProgress`) est horizontale sans libellé,
 * sur les envois ; celle-ci est VERTICALE et porte, sous chaque étape, sa date
 * et le point de passage qui l'a produite. Le kit emploie bien trois composants
 * distincts aux trois endroits — la leçon du 12/09 était précisément d'arrêter
 * de réutiliser le même parce qu'il porte la même donnée.
 *
 * VALEURS RELEVÉES : pastille 26, grille `26px 1fr` à l'écart 14, trait de 2 px,
 * libellé 15/700, date 13/400 sourdine, note 13/400 corps, 22 px sous chaque
 * bloc sauf le dernier.
 *
 * ⚠️ LE BADGE « EN ATTENTE » EST À 11,5 px, PAS À 10. Le kit l'écrit à 10 dans
 * son source ET LE REMONTE LUI-MÊME À 11,5 par une règle `!important` de sa page
 * (`span[style*="font-size: 10px"]{font-size:11.5px!important}`) : c'est la règle
 * 5 du projet, appliquée par le kit à son propre dessin. La valeur SERVIE fait
 * foi, pas celle écrite.
 */
export interface EtapeFrise {
  readonly etape: Etape;
  readonly libelle: string;
  /** La date à laquelle l'étape a été franchie, quand un point de passage la dit. */
  readonly quand: string | null;
  /** Ce que le transporteur a dit. Absent tant qu'il n'a rien dit. */
  readonly note: string | null;
}

export function FriseDetail({
  etapes,
  courante,
  libelleAttente,
}: {
  readonly etapes: readonly EtapeFrise[];
  /** L'étape ATTEINTE. Celles d'avant sont faites, la suivante est en cours. */
  readonly courante: Etape;
  readonly libelleAttente: string;
}) {
  const rangCourant = ETAPES.indexOf(courante);

  return (
    <ol className="flex flex-col">
      {etapes.map((e, i) => {
        const rang = ETAPES.indexOf(e.etape);
        const faite = rang <= rangCourant;
        // L'étape qui SUIT la dernière atteinte est celle en cours : c'est elle
        // que le colis est en train de franchir, et le kit la dessine en anneau
        // plein plutôt qu'en anneau vide.
        const encours = rang === rangCourant + 1;
        const derniere = i === etapes.length - 1;

        return (
          <li key={e.etape} className="grid grid-cols-[26px_1fr] gap-[14px]">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={
                  "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-ds-pill " +
                  (faite
                    ? "bg-ds-accent text-white"
                    : encours
                      ? "border-2 border-ds-accent bg-ds-surface-carte"
                      : "border-2 border-ds-ink-200 bg-ds-surface-carte")
                }
              >
                {faite ? (
                  <Check size={13} strokeWidth={3.2} />
                ) : encours ? (
                  <span className="h-2.5 w-2.5 rounded-ds-pill bg-ds-accent" />
                ) : null}
              </span>
              {derniere ? null : (
                <span
                  aria-hidden="true"
                  className={
                    "min-h-[26px] w-0.5 flex-1 " + (faite ? "bg-ds-accent" : "bg-ds-ink-200")
                  }
                />
              )}
            </div>

            <div className={derniere ? "" : "pb-[22px]"}>
              <div className="flex flex-wrap items-center gap-[9px]">
                <span
                  className={
                    "text-[15px] font-bold " +
                    (encours
                      ? "text-ds-accent-encre"
                      : faite
                        ? "text-ds-texte-fort"
                        : "text-ds-texte-corps")
                  }
                >
                  {e.libelle}
                </span>
                {faite ? null : (
                  <span className="rounded-ds-pill bg-ds-accent-doux px-2 py-[3px] text-[11.5px] font-semibold text-ds-accent-encre">
                    {libelleAttente}
                  </span>
                )}
              </div>
              {/*
                LA DATE ET LA NOTE SONT OMISES QUAND ELLES N'EXISTENT PAS, jamais
                remplacées. Le kit écrit une phrase sous chaque étape, y compris
                sous celles qu'aucun colis n'a franchies (« Le colis sera marqué
                comme livré. ») : c'est de la prose de maquette, pas une donnée.
                Écrite chez nous, elle affirmerait à chaque commande un fait que
                la base n'a pas enregistré — principe XII.
              */}
              {e.quand === null ? null : (
                <div className="mt-[3px] text-[13px] text-ds-texte-sourdine">{e.quand}</div>
              )}
              {e.note === null ? null : (
                <div className="mt-1 text-[13px] text-ds-texte-corps">{e.note}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

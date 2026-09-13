import { Check, Clock, MapPin, Truck } from "lucide-react";
import { CARTE, TitreCarte } from "@/components/publique/carte-client";
import type { SuiviPublic } from "@/lib/page-publique/lecture";
import type { AccentResolu } from "@/lib/design/contraste";

/**
 * « HISTORIQUE DU SUIVI » — les passages du transporteur, datés.
 *
 * Le dessin est celui du kit : une pastille reliée à la suivante par un trait,
 * une tuile d'icône, la date dans une colonne de 190 px, puis le titre du
 * passage et sa ligne de détail. La pastille et la tuile du passage le plus
 * récent portent l'accent : c'est ce qui distingue « où en est le colis » de
 * « par où il est passé », sans un mot de plus.
 *
 * ⚠️ LE TITRE EST LA PHRASE DU TRANSPORTEUR, PAS UN LIBELLÉ À NOUS. Le kit écrit
 * « Arrivé dans votre région » puis une phrase d'explication ; la base porte
 * une description et un lieu, rien d'autre. Réécrire la description en un
 * titre court demanderait d'INTERPRÉTER ce que dit le transporteur, et une
 * interprétation fausse sur un colis bloqué est exactement ce qui fait écrire
 * « c'est où mon colis ». La description devient donc le titre, et le lieu, la
 * ligne de détail — quand il existe.
 *
 * ⚠️ ET LES ICÔNES NE DEVINENT PAS L'ÉTAPE. Le kit en choisit une par passage —
 * avion, colis, camion. L'étape d'un passage est une chaîne du fournisseur de
 * suivi, sans correspondance fermée avec nos quatre étapes : le passage récent
 * prend le camion, les autres l'épingle de lieu, et aucun n'affirme un mode de
 * transport que personne n'a rapporté.
 *
 * LES DEUX ÉTATS QUE LE KIT NE DESSINE PAS restent portés, parce qu'ils sont
 * le cas de chaque commande à un moment de sa vie : le colis tout juste
 * confié au transporteur (aucun passage), et le numéro que le transporteur a
 * cessé de suivre.
 */

export interface LibellesHistorique {
  readonly titre: string;
  readonly arrete: string;
  readonly attenteTitre: string;
  readonly attenteTexte: string;
}

export function HistoriqueSuivi({
  suivi,
  libelles,
  accent,
  formaterDate,
}: {
  readonly suivi: SuiviPublic;
  readonly libelles: LibellesHistorique;
  readonly accent: AccentResolu;
  readonly formaterDate: (instant: Date) => string;
}) {
  return (
    <section className={CARTE}>
      <TitreCarte>{libelles.titre}</TitreCarte>

      {/* Le fournisseur a cessé de suivre ce numéro. C'est DIT : un suivi qui
          s'arrête sans le dire se lit comme un suivi qui ne marche pas. */}
      {suivi.abandonne ? (
        <p className="mb-[18px] rounded-ds-sm border border-ds-alerte bg-ds-alerte-fond p-3 text-[14px] text-ds-alerte">
          {libelles.arrete}
        </p>
      ) : null}

      {/*
        « EXPÉDIÉ, PAS ENCORE SCANNÉ ». ZÉRO PASSAGE VEUT DIRE ZÉRO MOUVEMENT, et
        ce n'est pas une supposition : `appliquer_etat_colis` calcule le dernier
        mouvement par `max(occurred_at)` sur les passages. CALME, JAMAIS AMBRE —
        l'ambre est la couleur du silence ANORMAL, et la décision 7 nomme
        l'absence : « pas encore d'information du transporteur », jamais
        « numéro introuvable ».
      */}
      {suivi.passages.length === 0 && !suivi.abandonne ? (
        <div className="flex items-start gap-3.5 rounded-ds-card bg-ds-surface-creux p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-icon-tile bg-ds-surface-carte text-ds-texte-sourdine">
            <Clock size={17} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <p className="mb-1 text-[15px] font-bold text-ds-texte-fort">{libelles.attenteTitre}</p>
            <p className="text-[13px] leading-[1.55] text-ds-texte-corps">{libelles.attenteTexte}</p>
          </div>
        </div>
      ) : null}

      {suivi.passages.length > 0 ? (
        <ol className="flex flex-col">
          {suivi.passages.map((p, rang) => {
            const recent = rang === 0;
            const dernier = rang === suivi.passages.length - 1;
            const Icone = recent ? Truck : MapPin;

            return (
              <li
                key={p.instant + p.description}
                className="grid grid-cols-[22px_36px_minmax(0,1fr)] items-start gap-3 lg:grid-cols-[22px_40px_minmax(0,1fr)] lg:gap-3.5"
              >
                <div className="flex flex-col items-center self-stretch">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={
                      recent
                        ? { backgroundColor: accent.remplissage, color: accent.surRemplissage }
                        : { backgroundColor: "var(--color-ds-filet-appuye)" }
                    }
                  >
                    {recent ? <Check size={11} strokeWidth={3.4} aria-hidden="true" /> : null}
                  </span>
                  {!dernier ? (
                    <span className="min-h-[26px] w-0.5 flex-1 bg-ds-filet-appuye" />
                  ) : null}
                </div>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-ds-icon-tile"
                  style={
                    recent
                      ? { backgroundColor: accent.teinte, color: accent.interface }
                      : {
                          backgroundColor: "var(--color-ds-surface-creux)",
                          color: "var(--color-ds-texte-sourdine)",
                        }
                  }
                  aria-hidden="true"
                >
                  <Icone size={17} strokeWidth={1.8} />
                </span>
                <div
                  className={
                    "grid grid-cols-[minmax(0,1fr)] gap-1 min-[1080px]:grid-cols-[190px_minmax(0,1fr)] min-[1080px]:gap-[18px] " +
                    (dernier ? "" : "pb-[22px]")
                  }
                >
                  <span className="pt-px text-[13px] text-ds-texte-sourdine">
                    {formaterDate(new Date(p.instant))}
                  </span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="text-[15px] font-bold break-words text-ds-texte-fort">
                      {p.description}
                    </span>
                    {p.lieu !== null ? (
                      <span className="text-[13px] text-ds-texte-corps">{p.lieu}</span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

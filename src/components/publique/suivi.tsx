import type { SuiviPublic } from "@/lib/page-publique/lecture";

/**
 * LE DÉTAIL DU SUIVI : le numéro, puis les passages du transporteur.
 *
 * IL A MAIGRI AVEC LE CANEVAS, et ce n'est pas cosmétique. L'ancienneté du
 * dernier mouvement, la fourchette d'arrivée et le silence nommé sont montés
 * dans la CARTE D'ÉTAT, en haut de page — voir `etat-expedition.tsx`. Ils y
 * répondent à la question que le client se pose avant de dérouler quoi que ce
 * soit ; ici, en bas, ils n'étaient lus que par ceux qui allaient déjà bien.
 *
 * CE QUI RESTE ICI EST CE QU'ON CONSULTE QUAND ON VEUT LE DÉTAIL : le numéro,
 * pour le recopier ailleurs, et la liste datée des passages.
 *
 * AUCUNE INFORMATION INVENTÉE. Pas de « livraison prévue sous 3 à 5 jours »
 * quand le transporteur n'a rien dit : une information absente est OMISE.
 */

export interface LibellesSuivi {
  readonly numero: string;
  readonly arrete: string;
}

export function Suivi({
  suivi,
  libelles,
  accent,
  formaterDate,
}: {
  readonly suivi: SuiviPublic;
  readonly libelles: LibellesSuivi;
  /** Couleur de la pastille du passage le plus récent. */
  readonly accent: string;
  readonly formaterDate: (instant: Date) => string;
}) {
  return (
    <div>
      {/* SUR GRAND ÉCRAN, LE NUMÉRO EST SÉPARÉ PAR UN FILET des passages qui le
          suivent : la planche `PageClientDesktop` le pose dans une carte, et
          sans ce trait la ligne se lirait comme un premier passage. Au
          téléphone la section entière est déjà bornée par son propre filet. */}
      <dl
        className={
          "flex items-baseline justify-between gap-4 " +
          /* LE FILET NE SE TRACE QUE S'IL SÉPARE DE QUELQUE CHOSE. Un colis
             tout juste enregistré n'a aucun passage : la carte affichait alors
             un numéro, un trait, puis du vide — la forme exacte d'un bloc qui
             n'a pas fini de charger. */
          (suivi.passages.length > 0 || suivi.abandonne
            ? "mb-[18px] lg:border-b lg:border-filet-ligne lg:pb-4"
            : "")
        }
      >
        <dt className="font-body-md text-[14px] text-on-surface-variant">{libelles.numero}</dt>
        <dd className="text-right font-label-md text-[14px] font-bold break-all text-on-surface">
          {suivi.numero}
        </dd>
      </dl>

      {/* Le fournisseur a cessé de suivre ce numéro. C'est DIT : un suivi qui
          s'arrête sans le dire se lit comme un suivi qui ne marche pas. */}
      {suivi.abandonne ? (
        <p className="mb-[18px] rounded-lg border border-attention-filet bg-attention-fond p-3 font-body-sm text-body-sm text-attention-doux">
          {libelles.arrete}
        </p>
      ) : null}

      {suivi.passages.length > 0 ? (
        <ol className="flex flex-col gap-[15px]">
          {suivi.passages.map((p, rang) => (
            <li key={p.instant + p.description} className="flex gap-3">
              {/* La pastille du plus récent porte l'accent, les autres le
                  filet : c'est ce qui distingue « où en est le colis » de
                  « par où il est passé », sans un mot de plus. */}
              <span
                className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full"
                style={{ backgroundColor: rang === 0 ? accent : "var(--color-filet-pastille)" }}
              />
              <div>
                <p
                  className={
                    "font-body-md text-[15px] leading-[21px] text-on-surface " +
                    (rang === 0 ? "font-semibold" : "")
                  }
                >
                  {p.description}
                </p>
                <p className="mt-0.5 font-body-sm text-[13px] text-on-surface-variant">
                  {formaterDate(new Date(p.instant))}
                  {p.lieu !== null ? " · " + p.lieu : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

import { decrireSilence, SEUIL_SILENCE_JOURS } from "@/lib/tracking/silence";
import type { SuiviPublic } from "@/lib/page-publique/lecture";

/**
 * LE DÉTAIL DU SUIVI, sous la frise.
 *
 * L'ANCIENNETÉ DU DERNIER MOUVEMENT EST LE SEUL ÉLÉMENT DE CETTE PAGE QUI CHANGE
 * TOUS LES JOURS QUAND LE COLIS NE BOUGE PAS. C'est sa raison d'être : sans
 * elle, une page figée pendant trois semaines est indiscernable d'une page
 * cassée, et le client écrit à son vendeur — c'est-à-dire exactement ce que le
 * produit doit tuer.
 *
 * UN SILENCE NOMMÉ EST UNE INFORMATION, UN SILENCE SUBI SE LIT COMME UNE PANNE.
 * Au-delà de dix jours, on le dit. En deçà, on ne dit rien de particulier : une
 * semaine sans scan sur un trajet Chine → Europe est banale, et signaler trop tôt
 * apprend à ignorer les signalements.
 *
 * AUCUNE INFORMATION INVENTÉE. Pas de « livraison prévue sous 3 à 5 jours » quand
 * le transporteur n'a rien dit : une information absente est OMISE.
 */

export interface LibellesSuivi {
  readonly titre: string;
  readonly numero: string;
  readonly aucunMouvement: string;
  readonly dernierMouvement: string;
  readonly aujourdHui: string;
  readonly hier: string;
  readonly silence: string;
  readonly estimation: string;
  readonly arrete: string;
  readonly passages: string;
}

export function Suivi({
  suivi,
  libelles,
  maintenant,
  formaterDate,
}: {
  readonly suivi: SuiviPublic;
  readonly libelles: LibellesSuivi;
  /**
   * L'instant est PASSÉ EN ARGUMENT, jamais lu ici.
   *
   * Un composant qui lit l'horloge rend une chose au serveur et une autre à
   * l'hydratation, et React signale une différence que personne ne sait
   * expliquer. C'est aussi ce qui rend l'ancienneté testable.
   */
  readonly maintenant: Date;
  readonly formaterDate: (instant: Date) => string;
}) {
  const dernier = suivi.dernierMouvement === null ? null : new Date(suivi.dernierMouvement);
  const silence = decrireSilence(dernier, maintenant);

  const ancienneté =
    silence.etat === "aucun-mouvement"
      ? libelles.aucunMouvement
      : silence.jours === 0
        ? libelles.aujourdHui
        : silence.jours === 1
          ? libelles.hier
          : libelles.dernierMouvement.replace("{n}", String(silence.jours));

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant/40 pb-2">
          <dt className="font-body-sm text-body-sm text-on-surface-variant">{libelles.numero}</dt>
          <dd className="text-right font-label-md text-label-md break-all text-on-surface">
            {suivi.numero}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="font-body-sm text-body-sm text-on-surface-variant">
            {libelles.dernierMouvement.replace(" {n} ", " ").replace("{n}", "")}
          </dt>
          <dd className="text-right font-label-md text-label-md text-on-surface">{ancienneté}</dd>
        </div>

        {/* OMISE quand le transporteur n'a rien annoncé. Une fourchette inventée
            serait indiscernable d'une vraie, et c'est celle qu'on croirait. */}
        {suivi.estimationDu !== null ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="font-body-sm text-body-sm text-on-surface-variant">
              {libelles.estimation}
            </dt>
            <dd className="text-right font-label-md text-label-md text-on-surface">
              {formaterDate(new Date(suivi.estimationDu))}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* LE SILENCE, NOMMÉ. Au-delà de dix jours seulement. */}
      {silence.etat === "silencieux" ? (
        <p className="rounded-lg bg-surface-container-high p-3 font-body-sm text-body-sm text-on-surface">
          {libelles.silence
            .replace("{n}", String(silence.jours))
            .replace("{seuil}", String(SEUIL_SILENCE_JOURS))}
        </p>
      ) : null}

      {/* Le fournisseur a cessé de suivre ce numéro. C'est DIT : un suivi qui
          s'arrête sans le dire se lit comme un suivi qui ne marche pas. */}
      {suivi.abandonne ? (
        <p className="rounded-lg bg-surface-container-high p-3 font-body-sm text-body-sm text-on-surface">
          {libelles.arrete}
        </p>
      ) : null}

      {suivi.passages.length > 0 ? (
        <div>
          <h3 className="mb-3 font-label-md text-label-md text-on-surface">{libelles.passages}</h3>
          <ol className="flex flex-col gap-3">
            {suivi.passages.map((p) => (
              <li key={p.instant + p.description} className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {formaterDate(new Date(p.instant))}
                  {p.lieu !== null ? " · " + p.lieu : ""}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface">{p.description}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

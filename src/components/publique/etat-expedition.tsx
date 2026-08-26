import { Frise } from "@/components/publique/frise";
import { decrireSilence } from "@/lib/tracking/silence";
import type { CommandePublique, SuiviPublic } from "@/lib/page-publique/lecture";

/**
 * LA CARTE D'ÉTAT — le premier objet de la page, avant même les photos.
 *
 * Elle répond d'abord à la SEULE question que le client se pose en ouvrant le
 * lien : quand est-ce que ça arrive. La frise vient ensuite, en subordonné.
 *
 * DEUX VISAGES, ET C'EST UNE DÉCISION PRODUIT, PAS UNE VARIANTE DE STYLE.
 *
 *  1. Le colis bouge : aplat à la couleur du vendeur, date d'arrivée en grand,
 *     ancienneté du dernier mouvement en dessous.
 *  2. Le colis est silencieux depuis plus de dix jours : la carte change de
 *     nature. Fond d'attention, silence NOMMÉ en titre, et **la date d'arrivée
 *     disparaît** — elle n'est plus crédible, et une estimation qu'on sait
 *     fausse est pire qu'une absence d'estimation. On ne la remplace pas : on
 *     omet.
 *
 * AUCUNE COULEUR DE TEXTE EN DUR SUR L'APLAT D'ACCENT. `resoudreAccent()` a
 * déjà choisi ce qui se lit dessus ; écrire `#ffffff` ici court-circuiterait
 * exactement le mécanisme qui empêche le blanc sur jaune.
 *
 * L'INSTANT ARRIVE EN PROPRIÉTÉ. Un composant qui lit l'horloge rend une chose
 * au serveur et une autre à l'hydratation.
 */

export interface LibellesEtat {
  readonly arriveeEstimee: string;
  readonly aucunMouvement: string;
  readonly dernierMouvement: string;
  readonly aujourdHui: string;
  readonly hier: string;
  readonly silenceTitre: string;
  readonly silenceTexte: string;
  readonly etapes: Readonly<Record<"preparation" | "expedie" | "en_transit" | "livre", string>>;
}

export function EtatExpedition({
  statut,
  suivi,
  maintenant,
  libelles,
  accent,
  formaterJour,
}: {
  readonly statut: CommandePublique["statut"];
  readonly suivi: SuiviPublic | null;
  readonly maintenant: Date;
  readonly libelles: LibellesEtat;
  readonly accent: {
    readonly remplissage: string;
    readonly surRemplissage: string;
    readonly surRemplissageDoux: string;
    readonly surRemplissageFaible: string;
    readonly interface: string;
  };
  readonly formaterJour: (instant: Date) => string;
}) {
  const dernier =
    suivi === null || suivi.dernierMouvement === null ? null : new Date(suivi.dernierMouvement);
  const silence = decrireSilence(dernier, maintenant);

  const anciennete =
    silence.etat === "aucun-mouvement"
      ? libelles.aucunMouvement
      : silence.jours === 0
        ? libelles.aujourdHui
        : silence.jours === 1
          ? libelles.hier
          : libelles.dernierMouvement.replace("{n}", String(silence.jours));

  /*
   * LA FOURCHETTE D'ARRIVÉE. Les deux bornes existent en base ; quand elles
   * tombent le même jour, on n'écrit pas « 2 — 2 septembre ». Et quand le
   * transporteur n'a rien annoncé, tout le bloc disparaît : une fourchette
   * inventée serait indiscernable d'une vraie, et c'est celle qu'on croirait.
   */
  const du = suivi?.estimationDu == null ? null : new Date(suivi.estimationDu);
  const au = suivi?.estimationAu == null ? null : new Date(suivi.estimationAu);
  const estimation =
    du === null
      ? null
      : au === null || formaterJour(au) === formaterJour(du)
        ? formaterJour(du)
        : formaterJour(du) + " — " + formaterJour(au);

  const frise = (
    <Frise
      statut={statut}
      libelles={libelles.etapes}
      rempli={silence.etat === "silencieux" ? accent.interface : accent.surRemplissage}
      vide={silence.etat === "silencieux" ? "var(--color-outline-variant)" : accent.surRemplissageFaible}
      texteAtteint={silence.etat === "silencieux" ? accent.interface : accent.surRemplissage}
      texteAVenir={
        silence.etat === "silencieux" ? "var(--color-sourdine)" : accent.surRemplissageDoux
      }
    />
  );

  if (silence.etat === "silencieux") {
    return (
      <section className="rounded-lg border border-attention-filet bg-attention-fond p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-attention-puce">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-attention-icone"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div>
            <p className="font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-attention">
              {libelles.silenceTitre.replace("{n}", String(silence.jours))}
            </p>
            <p className="mt-1 font-body-sm text-[14px] leading-[22px] text-attention-doux">
              {libelles.silenceTexte}
            </p>
          </div>
        </div>
        <div className="mt-5">{frise}</div>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg p-5"
      style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
    >
      {estimation !== null ? (
        <>
          <p
            className="font-body-sm text-[11px] leading-[15px] font-bold tracking-[0.09em] uppercase"
            style={{ color: accent.surRemplissageDoux }}
          >
            {libelles.arriveeEstimee}
          </p>
          <p className="mt-1.5 font-headline-lg text-[27px] leading-[32px] font-extrabold tracking-[-0.03em]">
            {estimation}
          </p>
        </>
      ) : null}
      <p
        className={
          "font-body-md text-[14px] leading-[20px] " + (estimation === null ? "" : "mt-1")
        }
        style={{ color: accent.surRemplissageDoux }}
      >
        {anciennete}
      </p>
      <div className="mt-4">{frise}</div>
    </section>
  );
}

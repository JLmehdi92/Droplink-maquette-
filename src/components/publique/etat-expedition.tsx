import { Frise } from "@/components/publique/frise";
import type { CommandePublique } from "@/lib/page-publique/lecture";
import type { Silence } from "@/lib/tracking/silence";

/**
 * L'ÉTAT DU COLIS — le premier objet de la page au téléphone, une carte de la
 * colonne de droite sur grand écran.
 *
 * DEUX VARIANTES, ET C'EST LE CANEVAS QUI LES SÉPARE, pas une préférence.
 *
 *  - `accent` (planche `PageClient`) : aplat à la couleur du vendeur, DATE
 *    D'ARRIVÉE EN GRAND. C'est la seule question que le client se pose en
 *    ouvrant le lien, et sur un écran de 390 px elle doit être la première
 *    chose lue.
 *  - `carte` (planche `PageClientDesktop`) : carte blanche encadrée, titrée
 *    « Expédition », qui porte le NOM DE L'ÉTAPE en grand. La date d'arrivée
 *    n'est plus ici : sur grand écran elle est montée dans l'en-tête, à droite
 *    du titre, où elle est visible sans descendre.
 *
 * LES DEUX SONT RENDUES ET L'UNE EST MASQUÉE PAR LA LARGEUR. C'est du texte,
 * quelques centaines d'octets ; distribuer la même information à deux endroits
 * selon la largeur ne se fait pas autrement sans JavaScript, et cette page n'en
 * dépense pas pour de la mise en page.
 *
 * LE SILENCE CHANGE LA NATURE DE LA CARTE, dans les deux variantes. Au-delà de
 * dix jours sans mouvement : fond d'attention, silence NOMMÉ, et **la date
 * d'arrivée disparaît** — elle n'est plus crédible, et une estimation qu'on
 * sait fausse est pire qu'une absence d'estimation. On ne la remplace pas.
 *
 * AUCUNE COULEUR DE TEXTE EN DUR SUR L'APLAT D'ACCENT. `resoudreAccent()` a
 * déjà choisi ce qui se lit dessus ; écrire `#ffffff` ici court-circuiterait
 * exactement le mécanisme qui empêche le blanc sur jaune.
 */

export interface LibellesEtat {
  readonly titre: string;
  readonly arriveeEstimee: string;
  /** Le surtitre quand l'arrivée n'est pas calculable — « Statut ». */
  readonly statut: string;
  readonly silenceTitre: string;
  readonly silenceTexte: string;
  readonly etapes: Readonly<Record<"preparation" | "expedie" | "en_transit" | "livre", string>>;
}

export interface AccentEtat {
  readonly remplissage: string;
  readonly surRemplissage: string;
  readonly surRemplissageDoux: string;
  readonly surRemplissageFaible: string;
  readonly interface: string;
}

export function EtatExpedition({
  variante,
  statut,
  silence,
  estimation,
  anciennete,
  ancienneteCourte,
  libelles,
  accent,
}: {
  readonly variante: "accent" | "carte";
  readonly statut: CommandePublique["statut"];
  readonly silence: Silence;
  /** La fourchette d'arrivée déjà formatée, ou `null` si le transporteur n'a rien annoncé. */
  readonly estimation: string | null;
  /** « Dernier mouvement il y a 3 jours » — la forme longue, sous la date. */
  readonly anciennete: string;
  /** « il y a 3 jours » — la forme courte, à droite du nom de l'étape. */
  readonly ancienneteCourte: string;
  readonly libelles: LibellesEtat;
  readonly accent: AccentEtat;
}) {
  const silencieux = silence.etat === "silencieux";

  const frise = (
    <Frise
      statut={statut}
      libelles={libelles.etapes}
      rempli={
        silencieux || variante === "carte" ? accent.interface : accent.surRemplissage
      }
      vide={
        silencieux || variante === "carte"
          ? "var(--color-ds-filet)"
          : accent.surRemplissageFaible
      }
      texteAtteint={
        silencieux || variante === "carte" ? accent.interface : accent.surRemplissage
      }
      texteAVenir={
        silencieux || variante === "carte"
          ? "var(--color-ds-texte-sourdine)"
          : accent.surRemplissageDoux
      }
    />
  );

  if (silencieux) {
    return (
      <section className="rounded-ds-card-lg border border-ds-alerte bg-ds-alerte-fond p-5 lg:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-ds-sm bg-ds-alerte-fond">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ds-alerte"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div>
            <p className="text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-ds-alerte">
              {libelles.silenceTitre.replace("{n}", String(silence.jours))}
            </p>
            <p className="mt-[5px] text-[14px] leading-[22px] text-ds-alerte">
              {libelles.silenceTexte}
            </p>
          </div>
        </div>
        <div className="mt-[18px]">{frise}</div>
      </section>
    );
  }

  if (variante === "carte") {
    return (
      <section className="rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte p-6 shadow-ds-card">
        <p className="mb-3.5 text-[11.5px] leading-[16px] font-bold tracking-[0.09em] text-ds-texte-sourdine uppercase">
          {libelles.titre}
        </p>
        <div className="mb-3.5 flex items-baseline justify-between gap-4">
          <span className="text-[18px] leading-[23px] font-extrabold tracking-[-0.02em] text-ds-texte-fort">
            {libelles.etapes[statut]}
          </span>
          <span className="shrink-0 text-[13px] text-ds-texte-corps">
            {ancienneteCourte}
          </span>
        </div>
        {frise}
      </section>
    );
  }

  return (
    <section
      className="rounded-ds-card-lg p-5"
      style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
    >
      {/*
        SANS ARRIVÉE CALCULABLE, LA CARTE MONTRE LE STATUT — planche
        `PageClientAttente`.

        ⚠️ ELLE NE MONTRAIT RIEN. Le surtitre et la grande ligne étaient tous
        deux conditionnés à l'estimation : un colis tout juste expédié, dont le
        transporteur n'a encore rien scanné, réduisait cette carte à une seule
        ligne sourdine sur un aplat de la couleur du vendeur. C'est l'état de
        CHAQUE commande dans ses premiers jours, donc le premier objet que
        voient la plupart des clients — et il ressemblait à un bloc raté.

        ON NE FABRIQUE PAS DE DATE POUR AUTANT : on affiche ce qui EST connu,
        l'étape posée par le vendeur, et la ligne du dessous dit en clair que
        le transporteur n'a rien rapporté.
      */}
      <p
        className="mb-1.5 text-[11.5px] leading-[16px] font-bold tracking-[0.09em] uppercase"
        style={{ color: accent.surRemplissageDoux }}
      >
        {estimation !== null ? libelles.arriveeEstimee : libelles.statut}
      </p>
      <p className="mb-[3px] text-[27px] leading-[33px] font-extrabold tracking-[-0.03em]">
        {estimation !== null ? estimation : libelles.etapes[statut]}
      </p>
      <p
        className="text-[14px] leading-[20px]"
        style={{ color: accent.surRemplissageDoux }}
      >
        {anciennete}
      </p>
      <div className="mt-[18px]">{frise}</div>
    </section>
  );
}

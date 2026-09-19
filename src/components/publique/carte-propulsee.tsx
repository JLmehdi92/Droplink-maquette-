import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import symbole from "@/../public/marque/logo-symbole.png";
import { CARTE } from "@/components/publique/carte-client";

/**
 * « PROPULSÉ PAR DROPLINK » — la carte promo de la page client, planche `client_link`
 * (`PoweredCard`), sur décision de Wassim du 19/09/2026 : un compte GRATUIT la porte, un compte
 * Pro peut la retirer depuis « Ma marque » (migration 167, `marque_masquee`).
 *
 * ⚠️ ELLE PORTE LA COULEUR DU VENDEUR, PAS LA NÔTRE — ET ELLE L'A D'ABORD PORTÉE À TORT.
 * Elle était écrite au dégradé et à la teinte DropLink, « comme la planche ». Mesuré le 19/09 :
 * la planche client RHABILLE ses variables aux couleurs du vendeur (`brandVars` de
 * `ClientPage.jsx` : `--gradient-brand`, `--gradient-tint`, `--violet-200`, `--accent-ink`
 * dérivent de SA couleur). Le bouton du kit est donc `primaire → secondaire` du vendeur, et la
 * règle 3 tient : aucun dégradé DropLink sur cette page. Seul le symbole est le nôtre.
 *
 * Le produit n'a qu'UNE couleur (la secondaire du kit est refusée, règle 1) : le dégradé
 * primaire → secondaire se réduit à l'aplat de l'accent, texte en `surRemplissage`, jamais un
 * blanc écrit en dur. Fond et filet suivent les proportions de la planche (9 → 7 %, 26 %).
 * Ils passent par `color-mix`, comme la planche, sur la couleur d'interface déjà ajustée.
 *
 * ⚠️ ET SEULEMENT AU BUREAU. Au téléphone, la planche aplatit chaque carte de la page
 * (`.cl-card` : fond transparent, ni cadre ni ombre, un filet en haut) — celle-ci comprise,
 * dont la teinte disparaît donc. `CARTE` le fait déjà par `lg:` ; la teinte suit le même palier.
 *
 * Composant SERVEUR, sans une ligne de JavaScript : la page client est la plus contrainte du
 * produit (< 300 Ko hors médias). Le symbole passe par `next/image` (compressé à la taille
 * affichée) et se charge en différé — la carte est en bas de page.
 *
 * Le lien ouvre la landing HORS de la page, dans la langue du vendeur : le client est venu voir
 * sa commande, pas nous.
 */
export function CartePropulsee({
  langue,
  accent,
  libelles,
}: {
  readonly langue: string;
  /** Les valeurs de `resoudreAccent()` pour la couleur de la boutique. */
  readonly accent: {
    readonly interface: string;
    readonly texte: string;
    readonly remplissage: string;
    readonly surRemplissage: string;
  };
  readonly libelles: {
    readonly surtitre: string;
    readonly titre: string;
    readonly texte: string;
    readonly bouton: string;
  };
}) {
  return (
    <section
      aria-label={libelles.surtitre}
      className={
        CARTE +
        " grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 lg:border-(--filet-carte-propulsee) lg:bg-(image:--fond-carte-propulsee)"
      }
      style={
        {
          "--fond-carte-propulsee": `linear-gradient(135deg, color-mix(in srgb, ${accent.interface} 9%, var(--color-ds-surface-carte)) 0%, color-mix(in srgb, ${accent.interface} 7%, var(--color-ds-surface-carte)) 100%)`,
          "--filet-carte-propulsee": `color-mix(in srgb, ${accent.interface} 26%, var(--color-ds-surface-carte))`,
        } as CSSProperties
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-[11.5px] leading-[normal] font-bold tracking-[0.1em] lg:text-[11px]" style={{ color: accent.texte }}>
          {libelles.surtitre}
        </span>
        <span className="text-[20px] leading-[1.15] font-extrabold tracking-[-0.035em] text-ds-texte-fort">
          {libelles.titre}
        </span>
        <span className="text-[13px] leading-[normal] text-ds-texte-corps">{libelles.texte}</span>
        <a
          href={`/${langue}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex h-11 items-center gap-2 self-start rounded-ds-pill border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] shadow-ds-brand transition-opacity hover:opacity-90"
          style={{ backgroundColor: accent.remplissage, color: accent.surRemplissage }}
        >
          {libelles.bouton}
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.9} />
        </a>
      </div>
      <Image src={symbole} alt="" width={92} sizes="92px" loading="lazy" className="block h-auto w-[92px]" />
    </section>
  );
}

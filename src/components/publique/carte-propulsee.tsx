import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import symbole from "@/../public/marque/logo-symbole.png";

/**
 * « PROPULSÉ PAR DROPLINK » (maquette v3, `.cv-propulse`) : une ligne discrète, en
 * pointillés, sur la page d'un compte GRATUIT — un compte Pro la retire (décision de
 * Wassim, 19/09/2026, migration 167 ; la page ne l'appelle alors pas).
 *
 * ⚠️ AUX COULEURS DU VENDEUR, JAMAIS AU DÉGRADÉ DROPLINK (règle 3, décision du
 * 19/09/2026) : le surtitre prend `--cl-texte`, et seul le symbole est le nôtre.
 */
export function CartePropulsee({
  langue,
  libelles,
}: {
  readonly langue: string;
  /** `aria` : le nom de la maquette (« Propulsé par DropLink. Découvrir DropLink »), traduit. */
  readonly libelles: { readonly surtitre: string; readonly titre: string; readonly aria: string };
}) {
  return (
    <a
      href={`/${langue}`}
      target="_blank"
      rel="noopener noreferrer"
      className="cv-propulse cv-entree"
      aria-label={libelles.aria}
    >
      <Image src={symbole} alt="" width={14} sizes="14px" loading="lazy" />
      <span>
        <small>{libelles.surtitre}</small>
        <b>{libelles.titre}</b>
      </span>
      <ArrowUpRight aria-hidden="true" className="ic" />
    </a>
  );
}

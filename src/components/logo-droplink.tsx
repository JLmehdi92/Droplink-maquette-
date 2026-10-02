import Image from "next/image";
import symbole from "@/../public/marque/logo-symbole.png";

/**
 * LE LOGO DE LA REFONTE : le symbole et le mot « DropLink » écrit en texte
 * (maquette, `.logo`). Le mot est une marque, il ne se traduit pas ; il est en
 * texte et non en image pour suivre la police et rester net à toute taille.
 *
 * Le symbole est décoratif (`alt=""`) : le lien qui l'entoure porte le nom, et
 * la classe `logo` (la boîte de 44 px de haut, la graisse, l'interlettrage).
 */
export function LogoDropLink({ hauteur = 28 }: { readonly hauteur?: number }) {
  return (
    <>
      <Image
        src={symbole}
        alt=""
        height={hauteur}
        width={Math.round((hauteur * 520) / 724)}
        loading="eager"
      />
      <span>DropLink</span>
    </>
  );
}

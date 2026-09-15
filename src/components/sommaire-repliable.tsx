import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * LE SOMMAIRE AU TÉLÉPHONE : REPLIÉ EN TÊTE DE PAGE, OUVERT AU BUREAU.
 *
 * ⚠️ MESURÉ LE 15/09/2026 EN PASSANT LES ÉCRANS À 390 px : le sommaire de la
 * documentation — une vingtaine d'entrées de 44 px — passait tout entier AVANT
 * le contenu, et il fallait défiler un écran plein pour lire la première ligne ;
 * les conditions et la confidentialité en faisaient autant avec dix. Replié dans
 * un `<details>` fermé, il coûte une barre de 48 px et reste à un geste. Sans
 * JavaScript, comme les autres menus du produit.
 *
 * Il ne se rend QUE sous le palier de la colonne (`masque`) : au-delà, la page
 * rend son sommaire dans la colonne latérale, inchangé.
 */
export function SommaireRepliable({
  titre,
  masque,
  children,
}: {
  readonly titre: string;
  /** La classe qui le retire au palier où la colonne latérale apparaît. */
  readonly masque: string;
  readonly children: ReactNode;
}) {
  return (
    <details className={"group rounded-ds-card border border-ds-filet bg-ds-surface-carte " + masque}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-semibold text-ds-texte-fort">
        {titre}
        <ChevronDown
          aria-hidden="true"
          size={18}
          strokeWidth={1.9}
          className="shrink-0 text-ds-texte-tenu transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-ds-filet p-2">{children}</div>
    </details>
  );
}

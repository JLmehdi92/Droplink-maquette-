import { Icone } from "@/components/icone";

/**
 * L'ENCART « CETTE CONSULTATION EST TRACÉE ».
 *
 * IL EST AU-DESSUS DE CE QU'IL DÉCRIT, PAS EN DESSOUS. Un administrateur qui
 * sait que ses lectures laissent une trace nominative ne consulte pas de la même
 * façon, et c'est précisément l'effet recherché — mais seulement s'il le lit
 * AVANT de regarder. Placé sous le tableau, il ne serait plus qu'une mention
 * légale.
 *
 * IL EST VIOLET, PAS GRIS. La planche le sort du texte courant : c'est le seul
 * élément de l'écran qui parle de l'administrateur lui-même et non des comptes
 * qu'il regarde. Un paragraphe gris de plus se lit comme une légende de tableau.
 */
export function EncartTrace({ texte }: { readonly texte: string }) {
  return (
    <p className="flex items-start gap-[9px] rounded-ds-control border border-ds-filet bg-ds-surface-teinte px-3.5 py-3 md:items-center md:gap-2.5">
      <Icone
        nom="error"
        className="mt-px shrink-0 text-[15px] text-ds-accent-encre md:mt-0 md:text-[16px]"
      />
      <span className="text-[12px] leading-[18px] font-normal text-ds-accent-encre md:text-[13px] md:leading-4">
        {texte}
      </span>
    </p>
  );
}

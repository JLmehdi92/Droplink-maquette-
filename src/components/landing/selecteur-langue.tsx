import Image, { type StaticImageData } from "next/image";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import drapeauFr from "@/../public/marque/drapeaux/fr.png";
import drapeauGb from "@/../public/marque/drapeaux/gb.png";
import drapeauCn from "@/../public/marque/drapeaux/cn.png";

/**
 * LE SÉLECTEUR DE LANGUE DE LA LANDING — `LangSwitch` de la planche.
 *
 * ⚠️ UN `<details>`, PAS UN ÎLOT CLIENT. La planche l'ouvre avec un état React ;
 * ici le panneau est natif, comme les sélecteurs de l'administration : il
 * s'ouvre et se ferme sans une ligne de JavaScript, et la page reste rendue par
 * le serveur.
 *
 * ⚠️ LES DRAPEAUX SONT HÉBERGÉS CHEZ NOUS. La planche les prend chez
 * `flagcdn.com`, que notre CSP BLOQUE — ils auraient rendu trois trous. Ce sont
 * les mêmes fichiers, récupérés une fois et servis depuis le dépôt, en imports
 * statiques : un chemin en chaîne sous `/marque/` passerait par le middleware de
 * langue, qui y répond 307.
 *
 * `compact` : dans l'en-tête, le drapeau seul ; dans le pied, drapeau et libellé.
 * La cible fait 44 px au téléphone (règle 5) et reprend les 36 du kit au-delà.
 */
const LANGUES: ReadonlyArray<{
  readonly code: "fr" | "en" | "zh-CN";
  readonly hreflang: string;
  readonly drapeau: StaticImageData;
}> = [
  { code: "fr", hreflang: "fr", drapeau: drapeauFr },
  { code: "en", hreflang: "en", drapeau: drapeauGb },
  { code: "zh-CN", hreflang: "zh-CN", drapeau: drapeauCn },
];

export async function SelecteurLangue({
  locale,
  compact = false,
  versLeHaut = false,
}: {
  readonly locale: string;
  readonly compact?: boolean;
  /** Dans le pied de page, le panneau s'ouvre au-dessus : en dessous il n'y a plus de page. */
  readonly versLeHaut?: boolean;
}) {
  const t = await getTranslations("landing.kit");
  const courante = LANGUES.find((l) => l.code === locale) ?? LANGUES[0]!;
  return (
    <details className="group relative flex-none self-start">
      <summary
        aria-label={t("langueChoisir")}
        className="inline-flex h-11 cursor-pointer list-none items-center gap-[7px] rounded-ds-card border border-ds-filet bg-ds-surface-carte px-2.5 text-[13px] leading-[normal] font-semibold text-ds-texte-fort md:h-9 [&::-webkit-details-marker]:hidden"
      >
        <Image src={courante.drapeau} alt="" width={18} height={13} className="h-[13px] w-[18px] rounded-[2px] object-cover" />
        {compact ? null : <span>{t(`langues.${courante.code}`)}</span>}
        <ChevronDown aria-hidden="true" size={13} className="text-ds-texte-tenu" />
      </summary>
      <span
        className={
          "absolute right-0 z-40 flex min-w-[168px] flex-col gap-0.5 rounded-ds-card border border-ds-filet bg-ds-surface-carte p-1.5 shadow-ds-lg " +
          (versLeHaut ? "bottom-[calc(100%+6px)] left-0 right-auto" : "top-[42px]")
        }
      >
        {LANGUES.map((l) => {
          const active = l.code === courante.code;
          return (
            <a
              key={l.code}
              href={`/${l.code}`}
              hrefLang={l.hreflang}
              lang={l.hreflang}
              className={
                "flex min-h-11 items-center gap-[9px] rounded-ds-sm px-2.5 py-2 text-[13.5px] md:min-h-0 " +
                (active
                  ? "bg-ds-surface-teinte font-bold text-ds-accent-encre"
                  : "font-medium text-ds-texte-corps hover:bg-ds-surface-creux")
              }
            >
              <Image src={l.drapeau} alt="" width={18} height={13} className="h-[13px] w-[18px] rounded-[2px] object-cover" />
              {t(`langues.${l.code}`)}
            </a>
          );
        })}
      </span>
    </details>
  );
}

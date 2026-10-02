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
  /*
   * Habillé au vocabulaire de la refonte (`.langue`, feuille `app.css`) : la
   * maquette n'a pas de sélecteur — elle est en français seulement —, il garde
   * donc le dessin des contrôles discrets de l'en-tête. Le menu s'ouvre TOUJOURS
   * aligné à droite : ouvert depuis la gauche, il sortait de l'écran à 390 px.
   */
  return (
    <details className={"langue" + (versLeHaut ? " langue--haut" : "")}>
      <summary {...(compact ? { "aria-label": t("langueChoisir") } : { title: t("langueChoisir") })}>
        <Image src={courante.drapeau} alt="" width={18} height={13} />
        {compact ? null : <span>{t(`langues.${courante.code}`)}</span>}
        <ChevronDown aria-hidden="true" className="ic" />
      </summary>
      <span className="langue__menu">
        {LANGUES.map((l) => {
          const active = l.code === courante.code;
          return (
            <a
              key={l.code}
              href={`/${l.code}`}
              hrefLang={l.hreflang}
              lang={l.hreflang}
              {...(active ? { "aria-current": "true" as const } : {})}
            >
              <Image src={l.drapeau} alt="" width={18} height={13} />
              {t(`langues.${l.code}`)}
            </a>
          );
        })}
      </span>
    </details>
  );
}

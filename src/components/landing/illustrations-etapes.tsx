import { Check, Copy, Truck, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * LES TROIS ILLUSTRATIONS DES CARTES D'ÉTAPE — `StepCard` du kit `marketing_site`,
 * portées le 17/09/2026 sur décision de Wassim.
 *
 * Chacune montre un MORCEAU DU PRODUIT : la zone de dépôt de l'éditeur, le champ
 * de lien copiable, la frise de suivi de la page client. Le kit les dessine, et
 * elles disent en une image ce que la phrase de l'étape annonce.
 *
 * ⚠️ ELLES SONT DÉCORATIVES : `aria-hidden`, aucun bouton, aucun champ. Une zone
 * de dépôt qui ne dépose rien et un lien qui ne mène nulle part seraient, pour
 * qui navigue au clavier ou au lecteur d'écran, des promesses que la page ne
 * tient pas — le principe XII appliqué à une image.
 *
 * LE LIEN EST CELUI DE LA PLANCHE, `https://droplink.fr/c/8F2k9` — décision de
 * Wassim du 18/09/2026, qui a écarté l'« exemple » lisible : un jeton court et
 * opaque est ce à quoi ressemble un vrai lien DropLink.
 */
export async function ZoneDeDepot() {
  const t = await getTranslations("landing.kit");
  return (
    <div
      aria-hidden="true"
      className="flex flex-col items-center gap-2 rounded-ds-card border border-dashed border-ds-violet-300 bg-ds-surface-teinte p-[26px] text-center"
    >
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-ds-sm bg-ds-surface-carte text-ds-accent shadow-ds-sm">
        <Upload size={16} strokeWidth={1.9} />
      </span>
      <span className="text-[12px] leading-[normal] font-bold text-ds-accent-encre">{t("s1c")}</span>
      <span className="text-[11.5px] leading-[normal] font-medium text-ds-texte-sourdine md:text-[11px]">{t("s1d")}</span>
    </div>
  );
}

export function ChampDeLien() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-2.5 rounded-ds-pill border border-ds-filet bg-ds-surface-carte py-2.5 pr-2.5 pl-4 shadow-ds-xs"
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[normal] text-ds-texte-corps">https://droplink.fr/c/8F2k9</span>
      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-control border border-ds-filet bg-ds-surface-carte text-ds-texte-corps">
        <Copy size={15} strokeWidth={2} />
      </span>
    </div>
  );
}

/**
 * La frise de l'étape 3 — `TrackingTimeline compact` du design system, valeurs
 * relevées dans son source : grille `22px 1fr auto` à l'écart 10, pastille de
 * 14 px, trait vertical de 2 px (vert sous une étape franchie, filet appuyé
 * sinon), libellé 13/700, heure 11/500 au gris estompé.
 *
 * ⚠️ ELLE PORTAIT UNE ICÔNE DE COLIS OU DE CAMION SUR CHAQUE LIGNE, ET PAS DE
 * TRAIT. Le kit n'en dessine aucune : l'icône vit DANS la pastille (coche
 * blanche, camion blanc pour l'étape courante), et c'est le trait qui fait une
 * frise d'une liste. Vu capture contre capture le 18/09/2026.
 */
export async function FriseDeSuivi() {
  const t = await getTranslations("landing.kit");
  /* L'état est NOMMÉ, jamais déduit de la présence d'un drapeau : trois valeurs,
     et le typage refuse la quatrième. */
  const etapes: ReadonlyArray<{
    readonly cle: string;
    readonly date: string;
    readonly etat: "faite" | "courante" | "a-venir";
  }> = [
    { cle: "tl1", date: "12/03 · 10:24", etat: "faite" },
    { cle: "tl2", date: "15/03 · 09:12", etat: "faite" },
    { cle: "tl3", date: "17/03 · 09:32", etat: "courante" },
    { cle: "tl4", date: "18/03 · 16:03", etat: "a-venir" },
  ];
  return (
    <ul aria-hidden="true" className="flex flex-col">
      {etapes.map((e, rang) => {
        const derniere = rang === etapes.length - 1;
        return (
          <li key={e.cle} className="grid grid-cols-[22px_1fr_auto] items-start gap-2.5">
            <span className="flex flex-col items-center self-stretch">
              <span
                className={
                  "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-ds-texte-sur-marque " +
                  (e.etat === "faite"
                    ? "bg-ds-succes-encre"
                    : e.etat === "courante"
                      ? "bg-ds-info"
                      : "border-2 border-ds-filet-appuye bg-ds-surface-carte")
                }
              >
                {e.etat === "faite" ? <Check size={8} strokeWidth={3} /> : null}
                {e.etat === "courante" ? <Truck size={8} strokeWidth={3} /> : null}
              </span>
              {derniere ? null : (
                <span
                  className={"min-h-4 w-0.5 flex-1 " + (e.etat === "faite" ? "bg-ds-succes" : "bg-ds-filet-appuye")}
                />
              )}
            </span>
            <span className={derniere ? "" : "pb-3"}>
              <span
                className={
                  "block text-[13px] leading-[normal] font-bold " +
                  (e.etat === "a-venir" ? "text-ds-texte-sourdine" : "text-ds-texte-fort")
                }
              >
                {t(e.cle)}
              </span>
            </span>
            <span className="pt-0.5 text-[11.5px] leading-[normal] font-medium whitespace-nowrap text-ds-texte-tenu md:text-[11px]">
              {e.date}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

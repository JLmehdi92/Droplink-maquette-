import { Check, Copy, Package, Truck, Upload } from "lucide-react";
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
 * ⚠️ LE LIEN EST UN EXEMPLE, ET IL LE DIT : `droplink.fr/c/exemple`. Le kit écrit
 * `8F2k9`, qui a l'air d'un vrai jeton ; un visiteur pourrait le recopier et
 * tomber sur une page morte. Un jeton, ici, ne prouverait rien de plus.
 */
export async function ZoneDeDepot() {
  const t = await getTranslations("landing.illustrations");
  return (
    <div
      aria-hidden="true"
      className="mt-4 flex flex-col items-center gap-2 rounded-ds-card border border-dashed border-ds-filet-appuye bg-ds-surface-teinte/60 px-4 py-6 text-center"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-ds-sm bg-ds-surface-carte text-ds-accent shadow-ds-xs">
        <Upload size={17} strokeWidth={1.9} />
      </span>
      <span className="text-[12px] leading-[normal] font-bold text-ds-accent-encre">{t("deposerTitre")}</span>
      <span className="text-[11.5px] leading-[normal] font-medium text-ds-texte-sourdine">{t("deposerTexte")}</span>
    </div>
  );
}

export function ChampDeLien() {
  return (
    <div
      aria-hidden="true"
      className="mt-4 flex items-center gap-2 rounded-ds-card border border-ds-filet bg-ds-surface-carte py-2 pr-2 pl-3.5 shadow-ds-xs"
    >
      <span className="flex-1 truncate font-mono text-[12px] text-ds-texte-corps">droplink.fr/c/exemple</span>
      <span className="flex h-7 w-7 items-center justify-center rounded-ds-sm bg-ds-surface-creux text-ds-texte-sourdine">
        <Copy size={14} strokeWidth={1.9} />
      </span>
    </div>
  );
}

/** La frise du kit : quatre étapes, les deux premières franchies. */
export async function FriseDeSuivi() {
  const t = await getTranslations("landing.illustrations");
  /* L'état est NOMMÉ, jamais déduit de la présence d'un drapeau : trois valeurs,
     et le typage refuse la quatrième. */
  const etapes: ReadonlyArray<{
    readonly cle: string;
    readonly date: string;
    readonly etat: "faite" | "courante" | "a-venir";
  }> = [
    { cle: "friseCreee", date: "12/03 · 10:24", etat: "faite" },
    { cle: "friseTransit", date: "15/03 · 09:12", etat: "faite" },
    { cle: "friseLivraison", date: "17/03 · 09:32", etat: "courante" },
    { cle: "friseLivre", date: "18/03 · 16:03", etat: "a-venir" },
  ];
  return (
    <ul aria-hidden="true" className="mt-4 flex flex-col gap-2.5">
      {etapes.map((e) => (
        <li key={e.cle} className="flex items-center gap-2.5">
          <span
            className={
              "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full " +
              (e.etat === "faite"
                ? "bg-ds-succes text-ds-texte-sur-marque"
                : e.etat === "courante"
                  ? "border-2 border-ds-accent bg-ds-surface-carte"
                  : "border-2 border-ds-filet-appuye bg-ds-surface-carte")
            }
          >
            {e.etat === "faite" ? <Check size={11} strokeWidth={3.4} /> : null}
          </span>
          {e.cle === "friseTransit" ? (
            <Truck size={13} className="shrink-0 text-ds-texte-sourdine" strokeWidth={1.9} />
          ) : (
            <Package size={13} className="shrink-0 text-ds-texte-sourdine" strokeWidth={1.9} />
          )}
          <span
            className={
              "flex-1 text-[13px] leading-[normal] font-bold " +
              (e.etat === "courante" ? "text-ds-accent-encre" : "text-ds-texte-fort")
            }
          >
            {t(e.cle)}
          </span>
          <span className="text-[11.5px] leading-[normal] font-medium whitespace-nowrap text-ds-texte-tenu">{e.date}</span>
        </li>
      ))}
    </ul>
  );
}

import { getTranslations } from "next-intl/server";
import { Icone } from "@/components/icone";

/**
 * Volet de contexte des écrans d'accès, à droite, masqué sous `lg`.
 *
 * REPRIS DE LA MAQUETTE : `hidden lg:flex w-1/2 relative
 * bg-surface-container-lowest border-l border-outline-variant overflow-hidden`,
 * avec un visuel de fond, un dégradé qui le fond vers le bas, et une carte de
 * verre posée en bas (`bg-white/80 backdrop-blur-[20px] rounded-xl p-8 border
 * border-white/50 shadow-md`).
 *
 * DEUX ÉCARTS :
 *
 * 1. LE VISUEL DE FOND est un bouchon dans la maquette — une photo de « centre
 *    de contrôle logistique ». Il est remplacé par un aplat travaillé, aux mêmes
 *    dimensions : mettre une photo d'agence de stock reviendrait à illustrer un
 *    produit avec l'image d'un autre.
 *
 * 2. LES DEUX CHIFFRES. La maquette affiche « 99.9% Uptime » et « SOC2
 *    Compliant ». Nous n'avons ni l'un ni l'autre, et une certification qu'on ne
 *    détient pas est un mensonge, pas un élément de décor. Le bloc garde sa
 *    géométrie — deux valeurs séparées d'un filet vertical — et porte deux faits
 *    vrais : le client n'a aucun compte à créer, et le lien vaut à vie.
 */
export async function PanneauAcces() {
  const t = await getTranslations("connexion");

  return (
    <div className="relative hidden w-1/2 overflow-hidden border-l border-outline-variant bg-surface-container-lowest lg:flex">
      <div aria-hidden="true" className="absolute inset-0 z-0">
        <div className="h-full w-full bg-gradient-to-br from-surface-container-low via-surface-container to-surface-container-high opacity-80" />
        {/* Dégradé de la maquette, qui fond le visuel vers le bas. */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/40 to-transparent" />
      </div>

      <div className="relative z-10 flex w-full max-w-xl flex-col justify-end p-12 pb-24">
        <div className="carte rounded-xl p-8 shadow-md">
          <div className="mb-4 flex items-center gap-2 text-[var(--accent-texte)]">
            <Icone nom="link" />
            <span className="font-label-md text-label-md uppercase tracking-wider">
              {t("panneauEtiquette")}
            </span>
          </div>

          <h2 className="mb-3 font-headline-md text-headline-md text-on-surface">
            {t("panneauTitre")}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">{t("panneauTexte")}</p>

          <div className="mt-6 flex gap-4">
            <div className="flex flex-col items-center">
              <span className="font-headline-md text-headline-md text-[var(--accent-texte)]">
                {t("chiffre1")}
              </span>
              <span className="text-center font-label-sm text-label-sm text-on-surface-variant">
                {t("chiffre1Libelle")}
              </span>
            </div>
            <div aria-hidden="true" className="h-12 w-px bg-outline-variant" />
            <div className="flex flex-col items-center">
              <span className="font-headline-md text-headline-md text-[var(--accent-texte)]">
                {t("chiffre2")}
              </span>
              <span className="text-center font-label-sm text-label-sm text-on-surface-variant">
                {t("chiffre2Libelle")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

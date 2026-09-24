import { getTranslations } from "next-intl/server";
import { ArrowRight, Check, Crown } from "lucide-react";
import { LienEcran } from "@/components/lien-ecran";

/**
 * LA CARTE « PASSEZ AU PRO » DU TABLEAU DE BORD — planche `DashboardHome`, quatrième
 * panneau de la seconde rangée.
 *
 * ⚠️ ELLE MANQUAIT DEPUIS LE 20/09/2026 (audit avant mise en ligne, 24/09). Le tableau
 * de bord l'écartait « faute d'offre » (contrainte n° 1) ; l'offre existe depuis que
 * Wassim a levé la contrainte pour l'abonnement, la barre latérale et l'écran « Passer au
 * Pro » avaient suivi, pas cet écran.
 *
 * Les quatre lignes sont les VRAIES fonctions du plan (167, 175-176, 181, 182-184) : la
 * planche en inventait trois sur quatre avant d'être corrigée, et une carte qui mène à un
 * paiement ne promet que ce qui existe. Elle n'est jamais rendue à un compte qui paie
 * déjà — l'appelant en décide, sur le plan lu en base.
 */
export async function CartePro({ langue }: { readonly langue: string }) {
  const t = await getTranslations("tableau.pro");
  return (
    <section
      aria-label={t("titre")}
      // Bureau seulement : au téléphone, le tableau de bord suit sa planche à part
      // (`TableauPhone`), qui n'a pas de carte Pro.
      className="hidden flex-col gap-3.5 rounded-ds-card-lg lg:flex border border-ds-violet-200 bg-[image:var(--degrade-ds-teinte)] p-[22px]"
    >
      <span className="flex items-center gap-[11px]">
        <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-ds-pill bg-ds-surface-carte text-ds-accent">
          <Crown aria-hidden="true" size={17} strokeWidth={1.9} />
        </span>
        <span className="text-[17px] leading-[normal] font-bold tracking-[-0.025em] text-ds-texte-fort">
          {t("titre")}
        </span>
      </span>
      <ul className="flex flex-col gap-[9px]">
        {(["lien", "marque", "plafond", "colis"] as const).map((cle) => (
          <li key={cle} className="flex items-center gap-2.5 text-[13.5px] leading-[normal] text-ds-texte-corps">
            <Check aria-hidden="true" size={15} strokeWidth={2.6} className="shrink-0 text-ds-accent" />
            {t(cle)}
          </li>
        ))}
      </ul>
      <LienEcran
        href={`/${langue}/passer-pro`}
        className="degrade-ds-marque mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-ds-card border border-transparent px-[22px] text-[14px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
      >
        {t("bouton")}
        <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
      </LienEcran>
    </section>
  );
}

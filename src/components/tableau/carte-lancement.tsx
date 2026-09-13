import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { BoutonAction } from "@/components/bouton-action";
import { creerBrouillon } from "@/lib/commandes/actions";
import illustration from "@/../public/marque/illus-colis.png";

/**
 * LA CARTE D'APPEL DU TABLEAU DE BORD — illustration, titre, et l'action qu'on
 * vient faire.
 *
 * ⚠️ LE TEXTE DU KIT N'EST PAS REPRIS MOT POUR MOT. Il promet de « suivre vos
 * envois en temps réel » et que « DropLink simplifie toute votre logistique » :
 * le suivi est interrogé à une cadence de plusieurs heures, et le produit ne
 * touche à aucune logistique — le brief l'exclut en toutes lettres. La phrase
 * dit ce que le produit fait.
 *
 * LE DÉGRADÉ EST ICI, ET NULLE PART AILLEURS SUR L'ÉCRAN — règle 3. Le bouton
 * est la même Server Action que celui de la liste des commandes : créer écrit
 * en base, donc jamais par un lien.
 */
export async function CarteLancement({ langue }: { readonly langue: string }) {
  const t = await getTranslations("tableau.lancement");
  const tc = await getTranslations("commandes");

  return (
    <section className="flex flex-wrap items-center gap-6 rounded-ds-card-lg border border-ds-violet-200 bg-[image:var(--degrade-ds-teinte)] p-6">
      <Image src={illustration} alt="" sizes="210px" className="h-auto w-[210px] flex-none" />
      <div className="min-w-0 flex-[1_1_260px]">
        <h2 className="text-[22px] leading-[1.1] font-extrabold tracking-[-0.035em] text-ds-texte-titre">
          {t("titre")}
        </h2>
        <p className="mt-2.5 mb-[18px] text-[14px] leading-[1.55] text-ds-texte-corps">{t("texte")}</p>
        <form action={creerBrouillon}>
          <input type="hidden" name="langue" value={langue} />
          <BoutonAction
            libelles={{
              repos: (
                <>
                  {tc("nouvelle")}
                  <ArrowRight aria-hidden="true" size={18} strokeWidth={1.9} />
                </>
              ),
              enCours: tc("nouvelleEnCours"),
              reussi: tc("nouvelle"),
              echoue: tc("nouvelle"),
            }}
            gapLibelle="gap-2"
            className="degrade-ds-marque inline-flex h-[52px] items-center gap-2 rounded-ds-card border border-transparent px-7 text-[15px] font-semibold tracking-[-0.02em] text-ds-texte-sur-marque shadow-ds-brand transition-shadow hover:shadow-ds-brand-hover"
          />
        </form>
      </div>
    </section>
  );
}

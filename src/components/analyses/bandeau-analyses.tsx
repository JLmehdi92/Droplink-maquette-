import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ChartColumn } from "lucide-react";
import logoDropLink from "@/../public/marque/logo-droplink.png";

/**
 * LE BANDEAU DE PIED DE L'ÉCRAN DES ANALYSES — la dernière carte du kit.
 *
 * Valeurs relevées : carte au rayon `card-lg`, filet fin, ombre de carte,
 * `20px 24px` de remplissage, écart 20, `flex-wrap` ; pastille de 46 au rayon
 * de carte portant une icône de 22 au trait 1,9 ; titre 15/700, sous-titre
 * 13/400 ; à droite le logo sur 44 px de haut, puis « Propulsé par DropLink »
 * en 14 avec la marque à l'accent en 800, et le slogan à 13 en sourdine.
 *
 * ⚠️ CE BANDEAU NE VEND RIEN, ET C'EST CE QUI LE REND ACCEPTABLE DANS L'ESPACE
 * VENDEUR. Il ne porte aucun appel à l'action, aucun lien vers une offre : il
 * dit ce que l'écran fait et qui le rend. Un bandeau publicitaire dans un outil
 * qu'on ouvre tous les jours s'apprend à ignorer, puis rend invisible ce qui
 * est posé juste à côté — l'encart « Passez au Pro » de la barre latérale tient
 * déjà ce rôle, et un seul suffit.
 *
 * ⚠️ LE LOGO EST `next/image` AVEC SES DIMENSIONS, pas une balise nue. Sans
 * elles, la carte se dessine, puis le logo arrive et pousse la ligne — un
 * décalage de mise en page après le premier affichage, que le budget de
 * performance interdit explicitement.
 */
export async function BandeauAnalyses() {
  const t = await getTranslations("analyses.bandeau");

  return (
    <section className="flex flex-wrap items-center gap-5 rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-6 py-5 shadow-ds-card">
      <span className="inline-flex h-[46px] w-[46px] flex-none items-center justify-center rounded-ds-card bg-ds-surface-teinte text-ds-accent">
        <ChartColumn aria-hidden="true" size={22} strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[15px] leading-[normal] font-bold text-ds-texte-fort">
          {t("titre")}
        </span>
        <span className="text-[13px] leading-[normal] text-ds-texte-corps">{t("aide")}</span>
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-3.5">
        {/* LE LOGO COMPLET, PAS LA MARQUE SEULE : le dépôt ne porte que celui-ci,
            et le kit met sa pastille carrée là où nous avons un logotype large.
            Les proportions d'origine sont 2172 × 724 — les recalculer ici évite
            l'écrasement qu'une largeur fixe produirait. */}
        <Image
          src={logoDropLink}
          alt=""
          height={36}
          width={Math.round((36 * 2172) / 724)}
          className="h-9 w-auto"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[14px] leading-[normal] text-ds-texte-corps">
            {t("propulse")}{" "}
            <strong className="font-extrabold text-ds-accent">DropLink</strong>
          </span>
          <span className="text-[13px] leading-[normal] text-ds-texte-sourdine">{t("slogan")}</span>
        </span>
      </span>
    </section>
  );
}

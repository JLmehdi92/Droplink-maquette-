import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flag, Info } from "lucide-react";
import { CoquePublique } from "@/components/coque-publique";
import { FormulaireSignalement } from "@/components/formulaire-signalement";
import { TraductionsClient } from "@/components/traductions-client";
import { adresseAbus } from "@/lib/contact";
import { routing } from "@/i18n/routing";
import { alternatesDe, openGraphDe } from "@/lib/seo/alternates";
import { estLangueSupportee, LANGUE_DEFAUT } from "@/i18n/config";

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  const langue = estLangueSupportee(locale) ? locale : LANGUE_DEFAUT;
  return {
    title: t("signalementMetaTitre"),
    description: t("signalementMetaDescription"),
    alternates: alternatesDe(langue, "/signalement"),
    openGraph: openGraphDe(langue, "/signalement", {
      titre: t("signalementMetaTitre"),
      description: t("signalementMetaDescription"),
    }),
  };
}

/**
 * LA PAGE DE SIGNALEMENT — `legal/signalement.html` du design system, écrite le
 * 14/09/2026 avant ce fichier.
 *
 * Au bureau, deux colonnes : à gauche la pastille, le titre, l'intention, les
 * TROIS ÉTAPES et l'avertissement ; à droite le formulaire dans sa carte. Au
 * téléphone tout s'empile, et l'avertissement passe APRÈS le formulaire : le
 * remonter repousserait le formulaire sous la ligne de flottaison.
 *
 * Les étapes portent des pastilles TEINTÉES, pas le dégradé : il est réservé au
 * bouton du formulaire, la seule action principale de l'écran.
 *
 * ELLE N'EXISTE PAS tant qu'aucune adresse de contact n'est configurée. Ce n'est
 * pas une dégradation, c'est le comportement voulu : publier une procédure de
 * signalement sans destinataire ferait croire qu'un canal existe. Un signalement
 * envoyé dans le vide est un signalement non traité que tout le monde croit
 * traité — y compris nous. Le lien du pied de page disparaît de la même façon.
 */
export default async function Signalement({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const adresse = adresseAbus();
  if (adresse === null) {
    notFound();
  }

  const t = await getTranslations("legal");

  const etapes = [
    { titre: t("signalement.etape1Titre"), texte: t("signalement.etape1Texte") },
    { titre: t("signalement.etape2Titre"), texte: t("signalement.etape2Texte") },
    { titre: t("signalement.etape3Titre"), texte: t("signalement.etape3Texte") },
  ];

  const avertissement = (
    <aside
      role="note"
      className="flex gap-[13px] rounded-ds-card-lg border border-ds-filet bg-ds-surface-carte px-[18px] py-4"
    >
      <Info aria-hidden="true" size={18} strokeWidth={2} className="mt-px shrink-0 text-ds-texte-sourdine" />
      <p className="text-[14px] leading-[1.6] text-ds-texte-corps">{t("signalement.avertissement")}</p>
    </aside>
  );

  return (
    <CoquePublique locale={locale} pastille={t("pastille")} enteteSecondaire>
      <main
        id="contenu"
        className="mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-[minmax(0,1fr)] items-start gap-8 px-4 pt-6 pb-12 min-[980px]:grid-cols-[minmax(0,1fr)_minmax(0,520px)] min-[980px]:gap-16 min-[980px]:px-[34px] min-[980px]:pt-12 min-[980px]:pb-20"
      >
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte px-3.5 py-[7px] text-[12.5px] font-bold text-ds-accent-encre">
            <Flag aria-hidden="true" size={14} strokeWidth={2} />
            {t("signalementSurTitre")}
          </span>
          <h1 className="mt-5 text-[27px] leading-[1.06] font-extrabold tracking-[-0.045em] text-balance text-ds-texte-fort sm:text-[32px] md:text-[44px]">
            {t("signalementTitre")}
          </h1>
          <p className="mt-[18px] text-[15.5px] leading-[1.7] text-pretty text-ds-texte-corps">
            {t("signalement.intro")}
          </p>

          {/* LES TROIS ÉTAPES DISENT CE QUI SE PASSE APRÈS L'ENVOI. Sans elles,
              un signalement part dans le silence — et c'est ce silence qui fait
              recommencer, ou renoncer. */}
          <ol className="mt-[30px] flex flex-col gap-[18px]">
            {etapes.map((e, i) => (
              <li key={e.titre} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-ds-pill border border-ds-violet-200 bg-ds-surface-teinte text-[13px] font-extrabold text-ds-accent-encre"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 pt-1">
                  <p className="text-[15.5px] font-bold text-ds-texte-fort">{e.titre}</p>
                  <p className="mt-[3px] text-[14.5px] leading-[1.6] text-ds-texte-corps">{e.texte}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-[30px] hidden min-[980px]:block">{avertissement}</div>
        </div>

        <TraductionsClient espaces={["legal"]}>
          <div className="flex flex-col gap-[18px]">
            <FormulaireSignalement adresse={adresse} />
            <div className="min-[980px]:hidden">{avertissement}</div>
          </div>
        </TraductionsClient>
      </main>
    </CoquePublique>
  );
}

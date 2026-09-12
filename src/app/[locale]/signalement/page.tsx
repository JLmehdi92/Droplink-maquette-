import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CoquePublique } from "@/components/coque-publique";
import { FormulaireSignalement } from "@/components/formulaire-signalement";
import { TraductionsClient } from "@/components/traductions-client";
import { Icone } from "@/components/icone";
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
 * LA PAGE DE SIGNALEMENT, portée sur ses deux planches.
 *
 * Deux colonnes égales au bureau, écartées de 80 : à gauche le sur-titre, le
 * titre, l'intention et les TROIS ÉTAPES numérotées ; à droite le formulaire
 * dans sa carte grise. Au téléphone, tout s'empile dans le même ordre — la
 * planche mobile met l'avertissement APRÈS le formulaire, là où le bureau le met
 * avant : au téléphone, le remonter repousserait le formulaire sous la ligne de
 * flottaison.
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
      className="flex gap-[11px] rounded-[14px] border border-outline-variant bg-[#fafafc] px-4 py-[15px] md:gap-3 md:px-[18px] md:py-4"
    >
      <Icone nom="error" className="mt-0.5 shrink-0 text-[17px] text-sourdine" />
      <p className="font-body-sm text-[13px] leading-[21px] text-sourdine">
        {t("signalement.avertissement")}
      </p>
    </aside>
  );

  return (
    <CoquePublique
      locale={locale}
      action={
        <Link
          href={`/${locale}/conditions`}
          /* LA CIBLE MONTE A 44 px PAR UN REMPLISSAGE COMPENSE : ce lien vit
             SEUL dans l en-tete, il n est pas en ligne dans une prose, donc
             l exception de la regle 5 ne le couvre pas. Mesure a 390 : 69 x 16. */
          className="-my-3.5 inline-flex min-h-11 items-center py-3.5 text-[13px] leading-4 font-semibold text-ds-texte-corps transition-colors hover:text-ds-texte-fort md:text-[14px]"
        >
          {t("piedConditions")}
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-8 px-5 pt-7 pb-8 md:grid-cols-2 md:gap-20 md:px-[88px] md:py-[52px]">
        <div>
          <p className="mb-2.5 text-[11.5px] leading-[15px] font-bold tracking-[0.09em] text-ds-texte-sourdine md:mb-3">
            {t("signalementSurTitre")}
          </p>
          <h1 className="mb-3 font-headline-xl text-[32px] leading-[37px] font-extrabold tracking-[-0.035em] text-on-surface md:mb-4 md:text-[42px] md:leading-[48px]">
            {t("signalementTitre")}
          </h1>
          <p className="mb-7 font-body-md text-[15px] leading-[25px] text-sourdine md:mb-9 md:text-[16px] md:leading-[26px]">
            {t("signalement.intro")}
          </p>

          {/* LES TROIS ÉTAPES DISENT CE QUI SE PASSE APRÈS L'ENVOI. Sans elles,
              un signalement part dans le silence — et c'est ce silence qui fait
              recommencer, ou renoncer. */}
          <ol className="flex flex-col gap-5 md:gap-[22px]">
            {etapes.map((e, i) => (
              <li key={e.titre} className="flex items-start gap-3 md:gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-violet-fond font-headline-md text-[12px] font-extrabold text-violet md:h-7 md:w-7 md:text-[13px]"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-headline-md text-[15px] leading-[19px] font-bold text-on-surface">
                    {e.titre}
                  </p>
                  <p className="mt-1 font-body-sm text-[14px] leading-[22px] text-sourdine">
                    {e.texte}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-[34px] hidden md:block">{avertissement}</div>
        </div>

        <TraductionsClient espaces={["legal"]}>
          <div className="flex flex-col gap-[18px]">
            <FormulaireSignalement adresse={adresse} />
            <div className="md:hidden">{avertissement}</div>
          </div>
        </TraductionsClient>
      </div>
    </CoquePublique>
  );
}

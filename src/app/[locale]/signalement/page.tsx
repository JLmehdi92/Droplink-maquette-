import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EnTete } from "@/components/en-tete";
import { PiedDePage } from "@/components/pied-de-page";
import { FormulaireSignalement } from "@/components/formulaire-signalement";
import { TraductionsClient } from "@/components/traductions-client";
import { Icone } from "@/components/icone";
import { adresseAbus } from "@/lib/contact";
import { routing } from "@/i18n/routing";

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
  return { title: t("signalementTitre") };
}

/**
 * Page de signalement de contenu, portée sur la maquette
 * `droplink_signaler_un_probl_me_final_harmonization` : grille de 12 colonnes,
 * cartes bento de contexte sur 4 colonnes, formulaire sur 8.
 *
 * Elle N'EXISTE PAS tant qu'aucune adresse de contact n'est configurée. Ce n'est
 * pas une dégradation, c'est le comportement voulu : publier une procédure de
 * signalement sans destinataire ferait croire qu'un canal existe. Un signalement
 * envoyé dans le vide est un signalement non traité que tout le monde croit
 * traité — y compris nous.
 *
 * Le lien du pied de page disparaît de la même façon et pour la même raison.
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

  return (
    <>
      <EnTete locale={locale} />

      <main
        id="contenu"
        className="mx-auto w-full max-w-container-max px-margin-mobile pt-24 pb-12 md:px-margin-desktop md:pb-16"
      >
        <div className="grid grid-cols-1 items-start gap-gutter lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-4">
            <div className="bento-item p-8">
              <h1 className="mb-4 font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-xl md:text-headline-xl">
                {t("signalementTitre")}
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                {t("signalement.intro")}
              </p>
            </div>

            <div className="bento-item flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3 text-[var(--accent-texte)]">
                <Icone nom="policy" className="text-[24px]" />
                <h2 className="font-label-md text-label-md text-on-surface">
                  {t("signalement.quoiTitre")}
                </h2>
              </div>
              <ul className="flex list-disc flex-col gap-2 pl-5 font-body-sm text-body-sm text-on-surface-variant">
                <li>{t("signalement.quoi1")}</li>
                <li>{t("signalement.quoi2")}</li>
                <li>{t("signalement.quoi3")}</li>
              </ul>
            </div>

            <div className="bento-item flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3 text-[var(--accent-texte)]">
                <Icone nom="support_agent" className="text-[24px]" />
                <h2 className="font-label-md text-label-md text-on-surface">
                  {t("signalement.suiteTitre")}
                </h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("signalement.suiteTexte")}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("signalement.adresseDirecte")}{" "}
                <a
                  href={`mailto:${adresse}`}
                  className="font-label-md text-label-md text-[var(--accent-texte)] underline"
                >
                  {adresse}
                </a>
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="bento-item p-8 md:p-10">
              <TraductionsClient espaces={["legal"]}>
                <FormulaireSignalement adresse={adresse} />
              </TraductionsClient>
            </div>
          </div>
        </div>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

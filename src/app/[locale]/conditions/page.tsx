import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PageLegale, type SectionLegale } from "@/components/page-legale";
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
  return { title: t("conditionsTitre") };
}

/**
 * LES CONDITIONS D'UTILISATION.
 *
 * HUIT SECTIONS, DANS L'ORDRE DE LA PLANCHE. L'écran en portait six, disposées
 * en cartes ; les planches en dessinent huit, en prose. Trois manquaient
 * réellement au document — compte et accès, résiliation, droit applicable — et
 * deux des six existantes ont été fondues là où la planche les met : le
 * paiement dans l'objet du service, les limites dans la disponibilité.
 *
 * ⚠️ LES LACUNES SONT ÉCRITES, PAS COMBLÉES. Trois sections portent une mention
 * entre crochets : clauses de limitation, durée de conservation, droit
 * applicable. C'est la planche, et c'est plus honnête que d'inventer une clause
 * — un texte juridique présenté comme complet alors qu'il ne l'est pas engage
 * davantage que le même texte annoncé comme incomplet. Le brief le tranche
 * ainsi : faire valider par un avocat avant tout lancement public.
 */
export default async function Conditions({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections: readonly SectionLegale[] = [
    {
      id: "objet",
      titre: t("conditions.objetTitre"),
      paragraphes: [t("conditions.objetP1"), t("conditions.objetP2")],
    },
    {
      id: "compte",
      titre: t("conditions.compteTitre"),
      paragraphes: [t("conditions.compteP1"), t("conditions.compteP2")],
    },
    {
      id: "contenus",
      titre: t("conditions.contenusTitre"),
      paragraphes: [t("conditions.contenusP1"), t("conditions.contenusP2")],
    },
    {
      id: "retrait",
      titre: t("conditions.retraitTitre"),
      paragraphes: [t("conditions.retraitP1"), t("conditions.retraitP2")],
    },
    {
      id: "disponibilite",
      titre: t("conditions.disponibiliteTitre"),
      paragraphes: [t("conditions.disponibiliteP1")],
      lacune: t("conditions.disponibiliteLacune"),
    },
    {
      id: "donnees",
      titre: t("conditions.donneesTitre"),
      paragraphes: [t("conditions.donneesP1")],
    },
    {
      id: "resiliation",
      titre: t("conditions.resiliationTitre"),
      paragraphes: [t("conditions.resiliationP1")],
      lacune: t("conditions.resiliationLacune"),
    },
    {
      id: "droit",
      titre: t("conditions.droitTitre"),
      paragraphes: [],
      lacune: t("conditions.droitLacune"),
    },
  ];

  return (
    <PageLegale
      locale={locale}
      surTitre={t("conditionsSurTitre")}
      titre={t("conditionsTitre")}
      sections={sections}
    />
  );
}

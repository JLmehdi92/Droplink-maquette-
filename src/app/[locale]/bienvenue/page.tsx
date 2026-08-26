import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { FormulaireOnboarding } from "@/components/formulaire-onboarding";
import { TraductionsClient } from "@/components/traductions-client";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
import { estLangueSupportee } from "@/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * Onboarding. Vu une fois, juste après la première connexion.
 *
 * Un vendeur qui l'a déjà fait est renvoyé chez lui plutôt que de le refaire :
 * réafficher un écran d'accueil à quelqu'un qui a déjà cent commandes est le
 * genre de détail qui fait douter de tout le reste.
 */
export default async function Bienvenue({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const profil = await lireProfilVendeur();
  // Le layout a déjà écarté l'absence de session. On revérifie ici sans s'en
  // remettre à lui : une page qui suppose qu'un parent l'a protégée devient
  // fausse le jour où elle est déplacée.
  if (profil === null) redirect(`/${langue}/connexion?erreur=session`);
  if (profil.statut !== "active") redirect(`/${langue}/connexion?erreur=suspendu`);
  if (!onboardingAFaire(profil)) redirect(`/${langue}`);

  const t = await getTranslations("onboarding");

  return (
    <div className="min-h-dvh bg-surface-container-lowest md:bg-canvas md:p-7">
      <main
        id="contenu"
        className="mx-auto w-full max-w-[1000px] bg-surface-container-lowest px-margin-mobile py-10 md:rounded-xl md:px-14 md:py-12"
      >
        <h1 className="font-headline-xl text-[30px] leading-[36px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[38px] md:leading-[44px]">
          {t("titre")}
        </h1>
        <p className="mt-2.5 font-body-lg text-[15px] leading-6 text-on-surface-variant">
          {t("sousTitre")}
        </p>

      <div className="mt-8">
        <TraductionsClient espaces={["onboarding"]}>
          <FormulaireOnboarding locale={langue} />
        </TraductionsClient>
      </div>
      </main>
    </div>
  );
}

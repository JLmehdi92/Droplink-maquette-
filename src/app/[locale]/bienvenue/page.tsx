import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { FormulaireOnboarding } from "@/components/formulaire-onboarding";
import { libellesApercu } from "@/lib/boutique/libelles-apercu";
import { TraductionsClient } from "@/components/traductions-client";
import { lireEtatDuCompte, onboardingAFaire } from "@/lib/comptes/profil";
import { estLangueSupportee } from "@/i18n/config";
import { FondAcces, LogoMarque } from "@/components/acces/coque-acces";

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

  const etat = await lireEtatDuCompte();
  if (etat.etat === "verification") redirect(`/${langue}/verification`);
  const profil = etat.etat === "profil" ? etat.profil : null;
  // Le layout a déjà écarté l'absence de session. On revérifie ici sans s'en
  // remettre à lui : une page qui suppose qu'un parent l'a protégée devient
  // fausse le jour où elle est déplacée.
  if (profil === null) redirect(`/${langue}/connexion?erreur=session`);
  if (profil.statut !== "active") redirect(`/${langue}/connexion?erreur=suspendu`);
  // ⚠️ CHEZ LUI, C'EST SON TABLEAU DE BORD, PAS NOTRE PAGE DE VENTE. Cette
  // ligne renvoyait sur `/${langue}`, la landing : un vendeur déjà inscrit qui
  // rouvrait un ancien lien vers l'onboarding se retrouvait devant l'argumentaire
  // commercial du produit qu'il utilise déjà. L'en-tête de ce fichier annonçait
  // pourtant « renvoyé chez lui » — le commentaire décrivait une intention que le
  // code ne tenait pas. C'est aussi la destination que l'action choisit
  // elle-même quand l'onboarding réussit.
  if (!onboardingAFaire(profil)) redirect(`/${langue}/commandes`);

  const t = await getTranslations("onboarding");

  return (
    <>
      {/*
        ⚠️ LE CADRE LAVANDE ET LA CARTE-PAGE À RAYON 28 SONT PARTIS LE 14/09/2026 :
        l'onboarding suit l'inscription d'une minute, et il portait l'ancien
        canevas pendant que l'inscription portait le design system. Même fond et
        même logo que la connexion (`OnboardingScreen` du kit `auth`).
      */}
      <FondAcces />
      <div className="relative flex min-h-dvh flex-col px-4 pt-[22px] pb-6 leading-[normal] md:px-14 md:pt-10 md:pb-8">
        <header className="flex flex-wrap items-center gap-3">
          <LogoMarque hauteur={44} className="md:h-13 md:w-auto" />
          <div className="flex-1" />
          <span className="text-[13px] font-semibold text-ds-texte-sourdine">{t("etape")}</span>
        </header>

        <main id="contenu" className="flex flex-1 flex-col justify-start pt-5 pb-6 md:justify-center md:pt-10">
          <TraductionsClient espaces={["onboarding"]}>
            <FormulaireOnboarding locale={langue} libelles={await libellesApercu(langue)} />
          </TraductionsClient>
        </main>
      </div>
    </>
  );
}

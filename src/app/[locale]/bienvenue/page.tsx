import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { FormulaireOnboarding } from "@/components/formulaire-onboarding";
import { libellesApercu } from "@/lib/boutique/libelles-apercu";
import { TraductionsClient } from "@/components/traductions-client";
import { lireEtatDuCompte, onboardingAFaire } from "@/lib/comptes/profil";
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

  return (
    <div className="min-h-dvh bg-canvas p-3 md:p-7">
      {/*
        ⚠️ LE CONTENEUR FAIT 1384, PAS 1000, et la carte-page porte les DEUX
        colonnes de la planche : les réglages à gauche, l'aperçu en direct à
        droite. Le formulaire les rend lui-même — l'aperçu dépend de ce qu'on
        est en train de saisir, donc il ne peut pas vivre dans un composant
        serveur qui ne verra jamais ces frappes.
      */}
      <main
        id="contenu"
        className="mx-auto w-full max-w-[1384px] overflow-hidden rounded-[24px] bg-surface-container-lowest md:rounded-page-publique"
      >
        <TraductionsClient espaces={["onboarding"]}>
          <FormulaireOnboarding locale={langue} libelles={await libellesApercu(langue)} />
        </TraductionsClient>
      </main>
    </div>
  );
}

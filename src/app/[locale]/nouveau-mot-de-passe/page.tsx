import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormulaireNouveauMotDePasse } from "@/components/formulaire-nouveau-mot-de-passe";
import { TraductionsClient } from "@/components/traductions-client";
import { PanneauAcces } from "@/components/panneau-acces";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { sessionParEmail } from "@/lib/auth/recuperation";
import { creerClientServeur } from "@/lib/supabase/server";
import { cheminDeRefus } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";
import { routing } from "@/i18n/routing";

/**
 * CHOISIR UN NOUVEAU MOT DE PASSE.
 *
 * ⚠️ CETTE PAGE EXIGE UNE SESSION, et c'est tout ce qui la protège — parce que
 * c'est tout ce qui la protège CORRECTEMENT. La récupération fonctionne ainsi :
 * le lien reçu par email authentifie, la route de retour échange son code, et
 * l'on arrive ici DÉJÀ CONNECTÉ. Il n'y a donc aucun jeton à vérifier dans
 * l'URL ; ce qui sépare cet écran de n'importe qui est la possession de la
 * boîte mail.
 *
 * ⚠️ ET LA PAGE N'EST PAS LA PROTECTION. La Server Action revérifie la session
 * elle-même, par `getUser()` : dans un module `"use server"`, chaque export est
 * atteignable par une requête forgée, et le fait que cette page ne s'affiche pas
 * n'empêche rien.
 *
 * ELLE N'EST PAS DANS LE GROUPE `(app)` : ce groupe redirige vers l'onboarding
 * tant que le type de compte est nul, et quelqu'un qui répare son mot de passe
 * avant d'avoir fini son installation rebondirait indéfiniment entre les deux
 * écrans.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "motDePasse" });
  return { title: t("nouveauTitre"), robots: { index: false, follow: false } };
}

export default async function NouveauMotDePasse({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";
  setRequestLocale(langue);

  const profil = await lireProfilVendeur();
  if (profil === null) {
    // Arrivée sans session : un lien périmé, déjà consommé, ou une visite
    // directe. Les trois se réparent en redemandant un lien, et l'écran de
    // connexion le dit.
    redirect(cheminDeRefus(langue, "profil"));
  }
  if (profil.statut === "suspended") {
    redirect(cheminDeRefus(langue, "suspendu"));
  }

  /*
   * ⚠️ UNE SESSION ORDINAIRE N'A RIEN À FAIRE ICI, et c'est le défaut que cet
   * écran portait : il s'ouvrait pour n'importe quelle session valide, donc pour
   * un cookie volé. Mesuré — formulaire rendu en 200 avec le cookie de quelqu'un
   * simplement connecté par mot de passe.
   *
   * La page n'est PAS la protection — l'action revérifie de son côté, parce
   * qu'elle est atteignable par requête forgée. Mais laisser l'écran s'ouvrir
   * inviterait à taper un mot de passe qui serait ensuite refusé, ce qui est la
   * pire façon de dire non.
   */
  const supabase = await creerClientServeur();
  if (!(await sessionParEmail(supabase))) {
    redirect(cheminDeRefus(langue, "profil"));
  }

  const t = await getTranslations("motDePasse");

  return (
    <div className="min-h-dvh bg-canvas p-3 md:p-7">
      <main
        id="contenu"
        className="mx-auto grid min-h-[calc(100dvh-24px)] w-full max-w-[1384px] overflow-hidden rounded-[24px] bg-surface-container-lowest md:min-h-[calc(100dvh-56px)] md:rounded-page-publique lg:grid-cols-2"
      >
        <div className="flex flex-col px-[22px] pt-7 pb-[26px] md:px-[76px] md:py-10">
          <span className="font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-on-surface md:text-[18px] md:leading-[23px]">
            DropLink
          </span>

          <div className="flex max-w-[400px] flex-grow flex-col justify-center py-[30px]">
            <h1 className="font-headline-xl text-[32px] leading-[37px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[38px] md:leading-[44px]">
              {t("nouveauTitre")}
            </h1>

            {/* L'ADRESSE CONCERNÉE EST RAPPELÉE, EN CLAIR ET NON MODIFIABLE.
                Quelqu'un qui gère deux comptes doit voir lequel il change avant
                de taper — et elle vient de la SESSION, jamais de l'URL. */}
            <p className="mt-2.5 font-body-md text-[15px] leading-6 text-sourdine">
              {t.rich("nouveauSousTitre", {
                email: profil.email,
                adresse: (morceaux) => (
                  <span className="font-semibold text-on-surface">{morceaux}</span>
                ),
              })}
            </p>

            {/* CE QUE LE GESTE COÛTE EST DIT AVANT, pas découvert après : les
                autres appareils devront se reconnecter. C'est précisément ce
                qu'on vient chercher quand on soupçonne une intrusion. */}
            <div className="mt-[26px] rounded-[13px] border border-outline-variant bg-surface-container-low px-4 py-3.5">
              <p className="font-body-sm text-[13px] leading-5 text-sourdine">
                {t("avertissement")}
              </p>
            </div>

            <div className="mt-[26px]">
              <TraductionsClient espaces={["connexion", "inscription", "motDePasse"]}>
                <FormulaireNouveauMotDePasse locale={langue} />
              </TraductionsClient>
            </div>
          </div>
        </div>

        <PanneauAcces />
      </main>
    </div>
  );
}

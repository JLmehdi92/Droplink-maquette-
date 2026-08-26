import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { PanneauAcces } from "@/components/panneau-acces";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { TraductionsClient } from "@/components/traductions-client";
import { routing } from "@/i18n/routing";

/**
 * Inscription, porté sur le canevas Claude Design.
 *
 * STRUCTURE REPRISE : deux volets, formulaire à gauche
 * (`w-full lg:w-1/2 flex flex-col justify-center px-margin-mobile lg:px-[10%]
 * xl:px-[15%] py-12 relative`), marque ancrée en haut à gauche en absolu, bloc
 * de formulaire en `max-w-md mx-auto`, volet visuel à droite sur
 * `bg-primary-container` avec sa carte de verre flottante en bas à droite.
 *
 * CE QUI TOMBE, ET POURQUOI :
 *
 * - « Full Name » : ce qui compte est le nom de la BOUTIQUE, demandé à
 *   l'onboarding. Le demander deux fois fait abandonner.
 * - Le mot de passe, sa règle de huit caractères et l'œil qui le dévoile : il
 *   n'y a pas de mot de passe dans ce produit.
 * - « Or continue with », Google et le SSO : le SSO d'entreprise n'est pas notre
 *   produit, et la connexion Google n'est PAS implémentée — un bouton qui ne
 *   fait rien est pire que pas de bouton.
 * - « 99.9% Uptime » et « SOC2 Certified » : nous n'avons ni l'un ni l'autre.
 *   Une certification qu'on ne détient pas est un mensonge, pas un décor.
 * - « Join the leader in B2B logistics visibility » : hors positionnement.
 *
 * Ce qui reste tient en une adresse email, parce que c'est réellement tout ce
 * qu'il faut. La carte de verre du volet droit garde sa géométrie et porte ce
 * qui va concrètement se passer ensuite — un utilisateur qui sait où il va
 * abandonne moins.
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
  const t = await getTranslations({ locale, namespace: "inscription" });
  return { title: t("titre"), robots: { index: false, follow: false } };
}

export default async function Inscription({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("inscription");
  const tc = await getTranslations("connexion");

  const etapes = [t("ceQuiSuit1"), t("ceQuiSuit2"), t("ceQuiSuit3")];

  return (
    <div className="min-h-dvh bg-surface-container-lowest md:bg-canvas md:p-7">
      <main
        id="contenu"
        className="mx-auto grid w-full max-w-[1384px] overflow-hidden bg-surface-container-lowest md:min-h-[calc(100dvh-56px)] md:rounded-xl lg:grid-cols-2"
      >
        <div className="flex flex-col px-margin-mobile py-8 md:px-[76px] md:py-10">
          <Link
            href={`/${locale}`}
            className="font-headline-md text-[18px] font-extrabold tracking-[-0.02em] text-on-surface"
          >
            DropLink
          </Link>

          <div className="flex max-w-[400px] flex-grow flex-col justify-center py-10">
            <h1 className="font-headline-xl text-[30px] leading-[36px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[38px] md:leading-[44px]">
              {t("titre")}
            </h1>
            <p className="mt-2.5 font-body-md text-[15px] leading-6 text-on-surface-variant">
              {t("sousTitre")}
            </p>

            {/*
              Même composant que la connexion, et c'est délibéré : le serveur se
              comporte strictement pareil dans les deux cas. Deux formulaires
              distincts dériveraient l'un de l'autre, et la première différence
              de comportement deviendrait un moyen de savoir si une adresse a
              déjà un compte.
            */}
            <div className="mt-[34px]">
              <TraductionsClient espaces={["connexion"]}>
                <FormulaireConnexion locale={locale} intention="inscription" />
              </TraductionsClient>
            </div>

            <p className="mt-4 font-body-sm text-[13px] text-on-surface-variant">{t("gratuit")}</p>

            {/* CE QUI SUIT L'INSCRIPTION, dit AVANT de s'inscrire. Trois étapes
                de soixante secondes annoncées à l'avance ne surprennent
                personne ; découvertes après coup, elles ressemblent à un
                formulaire qui n'en finit pas. */}
            <ol className="mt-8 flex flex-col gap-3 border-t border-outline-variant pt-6">
              {etapes.map((etape, index) => (
                <li key={etape} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary-container font-label-sm text-label-sm text-secondary"
                  >
                    {index + 1}
                  </span>
                  <span className="font-body-md text-[14px] text-on-surface-variant">{etape}</span>
                </li>
              ))}
            </ol>

            <p className="mt-8 font-body-md text-[13px] leading-[21px] text-on-surface-variant">
              {t("dejaCompteTexte")}{" "}
              <Link
                href={`/${locale}/connexion`}
                className="font-semibold text-secondary hover:underline"
              >
                {tc("titre")}
              </Link>
            </p>
          </div>
        </div>

        <PanneauAcces />
      </main>
    </div>
  );
}

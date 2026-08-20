import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { EnTete } from "@/components/en-tete";
import { PiedDePage } from "@/components/pied-de-page";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { TraductionsClient } from "@/components/traductions-client";
import { routing } from "@/i18n/routing";

/**
 * Écran d'inscription.
 *
 * CORRECTIONS OBLIGATOIRES SUR LA MAQUETTE STITCH. Elle montrait un champ « Full
 * Name », un « Corporate Email », un mot de passe avec sa règle de huit
 * caractères, un bouton « Enterprise SSO », un badge « SOC2 Certified », un
 * « 99.9% Uptime » et la promesse de rejoindre « the leader in B2B logistics
 * visibility ». Tout cela est retiré :
 *
 *   - le mot de passe et le SSO n'existent pas dans ce produit ;
 *   - le nom complet ne sert à rien ici — ce qui compte est le nom de la
 *     BOUTIQUE, demandé à l'onboarding, et le demander deux fois ferait
 *     abandonner ;
 *   - « SOC2 Certified » et « 99,9 % d'uptime » sont des affirmations que rien
 *     n'étaye. Une certification qu'on n'a pas est un mensonge, pas un élément
 *     de décor ;
 *   - le vocabulaire de logistique B2B est hors positionnement.
 *
 * Ce qui reste tient en une adresse email, parce que c'est réellement tout ce
 * qu'il faut. Le bloc de droite de la maquette, qui vantait la « transparence
 * qualité », est remplacé par ce qui va concrètement se passer ensuite : un
 * utilisateur qui sait où il va abandonne moins.
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

  return (
    <>
      <EnTete locale={locale} />

      <main
        id="contenu"
        className="mx-auto grid w-full max-w-[960px] gap-12 px-4 py-16 md:grid-cols-2 md:py-24"
      >
        <div className="max-w-[440px]">
          <h1 className="font-[family-name:var(--font-titre)] text-3xl font-bold tracking-[-0.02em] text-encre">
            {t("titre")}
          </h1>
          <p className="mt-3 text-base leading-7 text-encre-douce">{t("sousTitre")}</p>

          <div className="mt-8">
            {/*
              Même composant que la connexion, et c'est délibéré : le serveur se
              comporte strictement pareil dans les deux cas. Deux formulaires
              distincts dériveraient l'un de l'autre, et la première différence
              de comportement deviendrait un moyen de savoir si une adresse a
              déjà un compte.
            */}
            <TraductionsClient espaces={["connexion"]}>
              <FormulaireConnexion locale={locale} intention="inscription" />
            </TraductionsClient>
          </div>

          <p className="mt-4 text-sm leading-6 text-encre-douce">{t("gratuit")}</p>

          <div className="mt-10 border-t border-trait pt-6">
            <h2 className="text-sm font-semibold text-encre">{t("dejaCompteTitre")}</h2>
            <p className="mt-1 text-sm leading-6 text-encre-douce">{t("dejaCompteTexte")}</p>
            <Link
              href={`/${locale}/connexion`}
              className="mt-2 inline-block text-sm font-semibold text-[var(--accent-texte)] underline"
            >
              {t("titre")}
            </Link>
          </div>
        </div>

        <aside className="rounded-xl border border-trait bg-surface-basse p-6 md:mt-4 md:self-start">
          <h2 className="font-[family-name:var(--font-titre)] text-lg font-semibold text-encre">
            {t("ceQuiSuitTitre")}
          </h2>
          <ol className="mt-4 flex flex-col gap-4">
            {[t("ceQuiSuit1"), t("ceQuiSuit2"), t("ceQuiSuit3")].map((etape, index) => (
              <li key={etape} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-remplissage)] text-sm font-semibold text-[var(--accent-sur-remplissage)]"
                >
                  {index + 1}
                </span>
                <span className="text-sm leading-6 text-encre-douce">{etape}</span>
              </li>
            ))}
          </ol>
        </aside>
      </main>

      <PiedDePage locale={locale} />
    </>
  );
}

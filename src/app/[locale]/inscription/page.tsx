import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { TraductionsClient } from "@/components/traductions-client";
import { Icone } from "@/components/icone";
import { routing } from "@/i18n/routing";

/**
 * Inscription, portée sur la maquette `droplink_cr_ation_de_compte_inscription`.
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
    <main id="contenu" className="flex min-h-dvh w-full bg-surface-container-lowest">
      <div className="relative flex w-full flex-col justify-center px-margin-mobile py-12 lg:w-1/2 lg:px-[10%] xl:px-[15%]">
        {/* Ancre de marque en haut à gauche, en absolu, comme la maquette. */}
        <div className="absolute top-8 left-margin-mobile flex items-center gap-2 lg:left-12">
          <Link
            href={`/${locale}`}
            className="font-headline-md text-headline-md font-bold text-on-surface"
          >
            DropLink
          </Link>
        </div>

        <div className="mx-auto mt-12 w-full max-w-md lg:mt-24">
          <h1 className="mb-3 font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            {t("titre")}
          </h1>
          <p className="mb-10 font-body-md text-body-md text-on-surface-variant">
            {t("sousTitre")}
          </p>

          {/*
            Même composant que la connexion, et c'est délibéré : le serveur se
            comporte strictement pareil dans les deux cas. Deux formulaires
            distincts dériveraient l'un de l'autre, et la première différence de
            comportement deviendrait un moyen de savoir si une adresse a déjà un
            compte.
          */}
          <TraductionsClient espaces={["connexion"]}>
            <FormulaireConnexion locale={locale} intention="inscription" />
          </TraductionsClient>

          <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">{t("gratuit")}</p>

          <div className="mt-10 border-t border-outline-variant pt-6">
            <h2 className="font-label-md text-label-md text-on-surface">{t("dejaCompteTitre")}</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {t("dejaCompteTexte")}
            </p>
            <Link
              href={`/${locale}/connexion`}
              className="mt-2 inline-block font-label-md text-label-md text-[var(--accent-texte)] underline"
            >
              {tc("titre")}
            </Link>
          </div>
        </div>
      </div>

      {/* Volet visuel, masqué sous `lg`. Le rendu 3D de la maquette est un
          bouchon hors périmètre : l'aplat garde ses dimensions et sa teinte. */}
      <div className="relative hidden items-center justify-center overflow-hidden bg-primary-container lg:flex lg:w-1/2">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-primary-container via-tertiary-container to-primary-container opacity-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary-container/90 via-primary-container/20 to-transparent"
        />

        <div className="absolute bottom-16 right-16 z-10 w-full max-w-sm">
          <div className="glass-card rounded-xl p-8 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-remplissage)]/10 text-[var(--accent-texte)]">
                <Icone nom="check_circle" className="text-2xl" />
              </div>
              <div>
                <h2 className="mb-2 font-headline-md text-headline-md text-on-background">
                  {t("ceQuiSuitTitre")}
                </h2>
                <ol className="flex flex-col gap-3">
                  {etapes.map((etape, index) => (
                    <li key={etape} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-remplissage)] font-label-sm text-label-sm text-[var(--accent-sur-remplissage)]"
                      >
                        {index + 1}
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {etape}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

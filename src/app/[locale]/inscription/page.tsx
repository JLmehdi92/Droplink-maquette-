import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { BoutonGoogle } from "@/components/bouton-google";
import { FormulaireInscription } from "@/components/formulaire-inscription";
import { Icone } from "@/components/icone";
import { TraductionsClient } from "@/components/traductions-client";
import { routing } from "@/i18n/routing";

/**
 * L'INSCRIPTION, portée sur `Inscription` et `InscriptionMobile`.
 *
 * ⚠️ SA CHARPENTE N'ÉTAIT PAS LA BONNE. Le code servait celle de la connexion —
 * deux volets, le formulaire à gauche, l'aperçu du téléphone à droite. Les deux
 * planches d'inscription dessinent tout autre chose : une carte pleine largeur,
 * la marque en haut, puis DEUX COLONNES ÉGALES — à gauche l'argumentaire, à
 * droite le formulaire dans sa propre carte encadrée. Ce n'était pas un écart de
 * valeurs, c'était un écran différent.
 *
 * POURQUOI CE DESSIN TIENT. La connexion s'adresse à quelqu'un qui sait déjà ce
 * qu'il vient faire : elle n'a rien à argumenter, d'où l'aperçu du produit. Une
 * inscription, elle, se décide — et ce qui la décide tient en trois phrases que
 * la planche met à la même hauteur que le champ email.
 *
 * MÊME COMPOSANT DE FORMULAIRE QUE LA CONNEXION, et c'est délibéré : le serveur
 * se comporte strictement pareil dans les deux cas. Deux formulaires distincts
 * dériveraient l'un de l'autre, et la première différence de comportement
 * deviendrait un moyen de savoir si une adresse a déjà un compte.
 *
 * ⚠️ LA MENTION LÉGALE EST RENDUE SUR LES DEUX LARGEURS, alors que seule la
 * planche mobile la dessine. C'est l'écran où l'on accepte les conditions ; la
 * procédure de notification et retrait fonde notre statut d'hébergeur (brief
 * §12), et la faire dépendre de la largeur de l'écran n'a aucun sens juridique.
 * L'omission au bureau est très probablement un oubli du canevas — la planche
 * de connexion, elle, la porte des deux côtés.
 */

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * ⚠️ RENDU À LA REQUÊTE, ET C'EST UN CORRECTIF, PAS UN RÉGLAGE.
 *
 * DÉFAUT CONSTATÉ EN PILOTANT LE PRODUIT : avec `AUTH_GOOGLE_ACTIF=1` posé au
 * DÉMARRAGE et absent au build, la page de connexion affichait le bouton Google
 * et celle-ci NON. Les deux lisent pourtant le même drapeau, par la même
 * fonction. La connexion attend `searchParams`, donc Next la rend à chaque
 * requête et lit l'environnement du SERVEUR ; l'inscription, elle, était
 * entièrement pré-rendue, et `process.env` y était figé à la COMPILATION.
 *
 * Deux écrans que l'utilisateur enchaîne, sur la même décision, avec deux
 * réponses différentes — et rien ne le signale : chacun a l'air correct
 * isolément. Un drapeau de configuration doit décider au moment où la page est
 * servie, sinon ce n'est pas un drapeau, c'est une constante de build.
 *
 * LE COÛT EST NUL À NOTRE ÉCHELLE : cette page ne lit aucune base, ne pèse rien,
 * et n'est ouverte qu'une fois par compte créé.
 */
export const dynamic = "force-dynamic";

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
  const nav = await getTranslations("navigation");

  // Trois appels littéraux, et non une clé composée : la sonde des chaînes
  // mortes ne voit pas ce qu'un `+` assemble, et une phrase d'argumentaire
  // retirée du catalogue ne se signalerait alors nulle part.
  const arguments_ = [t("argument1"), t("argument2"), t("argument3")];

  const mention = (
    <p className="text-center font-body-sm text-[11px] leading-[17px] text-sourdine">
      {tc("cgvAvant")}{" "}
      <Link href={`/${locale}/conditions`} className="text-violet hover:underline">
        {tc("cgvConditions")}
      </Link>{" "}
      {tc("cgvEt")}{" "}
      <Link href={`/${locale}/confidentialite`} className="text-violet hover:underline">
        {tc("cgvConfidentialite")}
      </Link>
      .
    </p>
  );

  return (
    <div className="min-h-dvh bg-canvas p-3 md:p-7">
      <main
        id="contenu"
        className="mx-auto flex min-h-[calc(100dvh-24px)] w-full max-w-[1384px] flex-col rounded-[24px] bg-surface-container-lowest px-5 pt-[26px] pb-[22px] md:min-h-[calc(100dvh-56px)] md:rounded-page-publique md:px-0 md:pt-0 md:pb-0"
      >
        <Link
          href={`/${locale}`}
          className="mb-[26px] font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-on-surface md:mb-0 md:px-10 md:py-[26px] md:text-[18px] md:leading-[23px]"
        >
          DropLink
        </Link>

        <div className="flex flex-grow flex-col md:grid md:grid-cols-2 md:items-center md:gap-[90px] md:px-24 md:pb-10">
          {/* ---- L'ARGUMENTAIRE ------------------------------------------ */}
          <div className="contents md:block">
            <span className="mb-4 inline-flex self-start items-center gap-[7px] rounded-full border border-filet-controle px-3 py-1.5 font-headline-md text-[10px] leading-3 font-bold tracking-[0.05em] text-ardoise md:mb-0 md:gap-2 md:px-3.5 md:py-[7px] md:text-[11px] md:leading-[13px] md:font-semibold">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-succes" />
              {t("badge")}
            </span>

            <h1 className="mb-3 font-headline-xl text-[30px] leading-[35px] font-extrabold tracking-[-0.035em] text-on-surface md:mt-[22px] md:mb-4 md:text-[46px] md:leading-[52px]">
              {t("accroche")}
            </h1>

            {/* La planche mobile SUPPRIME ce paragraphe : les trois arguments
                qui suivent disent déjà ce qu'il annonçait, et l'écran doit tenir
                sans défilement jusqu'au champ email. */}
            <p className="hidden font-body-lg text-[16px] leading-[26px] text-sourdine md:mb-[34px] md:block">
              {t("sousTitre")}
            </p>

            <ul className="mb-[26px] flex flex-col gap-[11px] md:mb-0 md:gap-4">
              {arguments_.map((argument) => (
                <li key={argument} className="flex items-start gap-[11px]">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-succes-fond"
                  >
                    <Icone nom="done" className="text-[12px] text-succes" />
                  </span>
                  <span className="font-headline-md text-[14px] leading-[21px] text-on-surface md:text-[15px] md:leading-[22px]">
                    {argument}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ---- LE FORMULAIRE, dans sa propre carte au bureau ------------ */}
          <div className="contents md:block md:rounded-[22px] md:border md:border-outline-variant md:bg-surface-container-low md:p-[38px]">
            <h2 className="hidden font-headline-md text-[24px] leading-[30px] font-bold tracking-[-0.02em] text-on-surface md:mb-[26px] md:block">
              {t("formulaireTitre")}
            </h2>

            {/* ⚠️ CE N'EST PLUS LE MÊME COMPOSANT QUE LA CONNEXION. Il l'était,
                avec une propriété `intention` qui ne changeait que le libellé du
                bouton — parce qu'avec un lien magique le serveur faisait
                strictement la même chose des deux côtés. Depuis le mot de passe,
                l'un vérifie et l'autre crée : ils ont deux jeux de refus, deux
                compteurs et deux actions. */}
            <TraductionsClient espaces={["connexion", "inscription"]}>
              <FormulaireInscription locale={locale} />
            </TraductionsClient>

            <BoutonGoogle locale={locale} />

            <p className="mt-6 text-center font-body-md text-[14px] leading-[22px] text-sourdine md:mt-6 md:text-[13px] md:leading-[21px]">
              {t("dejaCompteTexte")}{" "}
              <Link
                href={`/${locale}/connexion`}
                className="font-semibold text-violet hover:underline"
              >
                {nav("seConnecter")}
              </Link>
            </p>
          </div>

          {/* Au téléphone, la mention légale est poussée en bas de carte par
              l'espace qui reste ; au bureau elle ferme la page sous les deux
              colonnes. */}
          <div className="mt-auto pt-5 md:hidden">{mention}</div>
        </div>

        <div className="hidden md:block md:px-24 md:pb-10">{mention}</div>
      </main>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireInscription } from "@/components/formulaire-inscription";
import { BoutonGoogle } from "@/components/bouton-google";
import { TraductionsClient } from "@/components/traductions-client";
import {
  ArgumentAcces,
  FondAcces,
  LogoMarque,
  NoteSecurite,
} from "@/components/acces/coque-acces";
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
  return (
    <>
      <FondAcces />
      {/*
       * ⚠️ LA GRILLE DE L'INSCRIPTION N'EST PAS CELLE DE LA CONNEXION. La
       * référence donne 620 px à la carte au lieu de 520, un espacement de 72
       * au lieu de 80, et aligne les deux colonnes en HAUT et non au centre :
       * le formulaire y est plus long que l'argument, donc un centrage
       * laisserait la colonne de gauche flotter au milieu du vide.
       */}
      {/* `leading-[normal]` : le kit ne pose aucun interligne sur ses libellés,
          et la page héritait de 1,5 — 3 à 6 px de trop par libellé. */}
      <div className="relative flex min-h-dvh flex-col px-5 pt-8 pb-6 leading-[normal] md:px-14 md:pt-10 md:pb-8">
        <main
          id="contenu"
          // AUCUN REMPLISSAGE VERTICAL : au kit, les 40 px du haut sont ceux de la
          // page, et la grille commence juste dessous. Les 16 px de trop
          // descendaient les deux colonnes d'autant.
          /* ⚠️ UNE COLONNE DÉCLARÉE SOUS `lg`, ET NON LA PISTE IMPLICITE. Sans
             modèle, la grille crée une piste `auto` qui prend la largeur
             MINIMALE de son contenu : le champ mot de passe en réclamait 330,
             et la carte débordait l'écran de 8 px à 390 — mesuré le
             13/09/2026, dans les trois langues. `minmax(0,1fr)` borne la piste
             à la largeur disponible. */
          className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-[72px] lg:grid-cols-[minmax(0,1fr)_620px]"
        >
          <div className="hidden flex-col gap-[34px] pt-1 lg:flex">
            <Link href={`/${locale}`} className="inline-flex min-h-11 items-center self-start">
              <LogoMarque hauteur={52} />
            </Link>
            <ArgumentAcces variante="inscription" />
          </div>

          <div className="mx-auto flex w-full max-w-[620px] flex-col gap-5 rounded-ds-3xl bg-ds-surface-carte p-6 shadow-ds-lg md:px-11 md:pt-[30px] md:pb-10">
            <p className="text-right text-[14px] text-ds-texte-corps">
              {t("dejaCompteTexte")}{" "}
              <Link
                href={`/${locale}/connexion`}
                className="font-semibold text-ds-texte-lien underline hover:text-ds-texte-lien-survol"
              >
                {t("lienSeConnecter")}
              </Link>
            </p>

            <div className="flex flex-col items-center gap-2.5">
              <LogoMarque hauteur={48} />
              <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.04em] text-ds-texte-titre md:text-[32px]">
                {t("titreCarte")}
              </h1>
              <p className="text-center text-[15px] leading-[1.55] text-ds-texte-corps">
                {t("sousTitreCarte")}
              </p>
            </div>

            {/* ⚠️ GOOGLE EN PREMIER ICI, ET APRÈS LE FORMULAIRE SUR LA CONNEXION —
                ce n'est pas une incohérence, c'est la référence. S'INSCRIRE par
                Google évite de choisir un mot de passe ; SE CONNECTER par Google
                suppose de l'avoir déjà fait. Et le fournisseur en Chine, pour qui
                Google est inaccessible, trouve le formulaire juste en dessous. */}
            <BoutonGoogle locale={locale} separateur={{ position: "apres", cle: "ou" }} />

            <TraductionsClient espaces={["inscription", "connexion"]}>
              <FormulaireInscription locale={locale} />
            </TraductionsClient>

            {/* ⚠️ LA RÉFÉRENCE EN FAIT UNE CASE À COCHER QUI BLOQUE LE BOUTON.
                Le produit consent PAR LA CONTINUATION, et passer à un
                consentement bloquant est un changement de PRODUIT, pas de
                design : c'est une étape de plus sur le seul écran qui doit être
                court, et rien dans le brief ne la demande. La phrase reste. */}
            {/* AU DESSIN DE LA PHRASE DU KIT — 14 / 400 en corps, liens 600
                soulignés —, SANS SA CASE : voir ci-dessus. */}
            <p className="text-[14px] leading-[1.5] text-ds-texte-corps">
              {tc("cgvAvant")}{" "}
              <Link
                href={`/${locale}/conditions`}
                className="font-semibold whitespace-nowrap text-ds-texte-lien underline hover:text-ds-texte-lien-survol"
              >
                {tc("cgvConditions")}
              </Link>{" "}
              {tc("cgvEt")}{" "}
              <Link
                href={`/${locale}/confidentialite`}
                className="font-semibold whitespace-nowrap text-ds-texte-lien underline hover:text-ds-texte-lien-survol"
              >
                {tc("cgvConfidentialite")}
              </Link>
              .
            </p>

            <NoteSecurite />
          </div>
        </main>
      </div>
    </>
  );
}

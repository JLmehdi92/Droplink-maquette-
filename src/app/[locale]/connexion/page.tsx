import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { BoutonGoogle } from "@/components/bouton-google";
import { TraductionsClient } from "@/components/traductions-client";
import { PanneauAcces } from "@/components/panneau-acces";
import { routing } from "@/i18n/routing";

/**
 * Connexion, portée sur la maquette `droplink_connexion_acc_s_portail`.
 *
 * STRUCTURE REPRISE : mise en page en deux volets, formulaire à gauche dans une
 * carte de verre (`bg-white/70 backdrop-blur-[20px] rounded-xl border
 * border-white/50 shadow-lg p-8 md:p-12`), volet de contexte à droite masqué
 * sous `lg`. Les classes sont celles de la maquette.
 *
 * TROIS ÉCARTS, tous imposés par le produit :
 *
 * 1. PAS DE CHAMP MOT DE PASSE, ni de « Forgot password ». Il n'y a pas de mot
 *    de passe dans ce produit : le lien envoyé par email EST le mode d'accès.
 * 2. PAS DE BOUTON GOOGLE NI « ENTERPRISE SSO ». Le SSO d'entreprise n'est pas
 *    notre produit, et la connexion Google n'est PAS implémentée à ce jour —
 *    afficher un bouton qui ne fait rien est pire que ne pas l'afficher.
 * 3. LES CHIFFRES DU VOLET DROIT. « 99.9% Uptime » et « SOC2 Compliant » sont
 *    des affirmations que rien n'étaye. Une certification qu'on ne détient pas
 *    est un mensonge, pas un élément de décor. La géométrie du bloc est
 *    conservée, avec deux chiffres vrais.
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
  const t = await getTranslations({ locale, namespace: "connexion" });
  // Une page de connexion n'a rien à faire dans un index de moteur de recherche.
  return { title: t("titre"), robots: { index: false, follow: false } };
}

/**
 * Les motifs d'échec que la page sait expliquer.
 *
 * INVENTAIRE CLOS, ET LU AVEC. Un motif inconnu — forgé dans l'URL, ou émis par
 * un chemin qui aurait oublié d'ajouter sa traduction — n'affiche RIEN plutôt
 * qu'une clé brute. Mais ce silence a un prix : c'est ainsi que les quatre
 * motifs de la route de retour sont restés muets. Le test de non-régression
 * compare donc cette liste aux motifs réellement émis par le produit.
 */
const MOTIFS = [
  "lien",
  "expire",
  "profil",
  "session",
  "suspendu",
  "indisponible",
  "trop",
] as const;

function motifConnu(brut: string | undefined): (typeof MOTIFS)[number] | null {
  return MOTIFS.find((m) => m === brut) ?? null;
}

export default async function Connexion({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("connexion");

  const brut = (await searchParams)["erreur"];
  const motif = motifConnu(typeof brut === "string" ? brut : undefined);

  return (
    <main id="contenu" className="flex w-full flex-grow">
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col justify-center px-margin-mobile py-12 md:px-margin-desktop lg:w-1/2 lg:py-24">
        <div className="carte relative w-full overflow-hidden rounded-xl p-8 shadow-lg md:p-12">
          {/* Le liseré intérieur de la maquette, qui simule le bord du verre. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl border border-white/40"
          />

          <div className="mb-10 flex flex-col items-start gap-4">
            <Link
              href={`/${locale}`}
              className="mb-6 font-headline-lg text-headline-lg-mobile font-bold tracking-[-0.02em] text-on-surface"
            >
              DropLink
            </Link>
            <h1 className="mb-2 font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
              {t("titre")}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">{t("sousTitre")}</p>
          </div>

          {/* CE QUI A ÉCHOUÉ EST DIT. La route de retour redirige ici avec son
              motif depuis le premier jour, et rien ne l'affichait : un lien
              expiré ramenait l'utilisateur sur un écran identique à celui qu'il
              venait de quitter, sans un mot. Il recommence, échoue pareil, et
              conclut que le produit ne marche pas.

              `role="alert"` et non un simple paragraphe : le message apparaît
              après une navigation, donc hors du champ de l'utilisateur qui
              emploie un lecteur d'écran. */}
          {motif === null ? null : (
            <p
              role="alert"
              className="mb-6 rounded-lg border border-error bg-error-container p-4 font-body-sm text-body-sm text-on-error-container"
            >
              {t(`motif.${motif}`)}
            </p>
          )}

          <TraductionsClient espaces={["connexion"]}>
            <FormulaireConnexion locale={locale} />
          </TraductionsClient>

          {/* APRÈS le lien magique, et non avant : c'est la seule porte du
              fournisseur en Chine, Google lui étant inaccessible. Le placer en
              tête ferait passer pour secondaire le chemin qui, pour toute une
              part des utilisateurs, est le seul qui existe. */}
          <BoutonGoogle locale={locale} />

          <p className="mt-6 text-center font-body-md text-body-md text-on-surface-variant">
            {t("pasDeCompteTitre")}{" "}
            <Link
              href={`/${locale}/inscription`}
              className="font-label-md text-[var(--accent-texte)] hover:underline"
            >
              {t("lienCreerCompte")}
            </Link>
          </p>

          <p className="mt-8 text-center font-body-sm text-body-sm text-on-surface-variant">
            {t("cgvAvant")}{" "}
            <Link
              href={`/${locale}/conditions`}
              className="text-[var(--accent-texte)] hover:underline"
            >
              {t("cgvConditions")}
            </Link>{" "}
            {t("cgvEt")}{" "}
            <Link
              href={`/${locale}/confidentialite`}
              className="text-[var(--accent-texte)] hover:underline"
            >
              {t("cgvConfidentialite")}
            </Link>
            .
          </p>
        </div>
      </div>

      <PanneauAcces />
    </main>
  );
}

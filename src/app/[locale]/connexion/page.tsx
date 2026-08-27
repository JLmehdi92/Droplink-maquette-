import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { BoutonGoogle } from "@/components/bouton-google";
import { TraductionsClient } from "@/components/traductions-client";
import { PanneauAcces } from "@/components/panneau-acces";
import { routing } from "@/i18n/routing";

/**
 * CONNEXION — deux volets dans la carte-page du canevas.
 *
 * PAS DE CHAMP MOT DE PASSE, ni de « mot de passe oublié » : il n'existe pas de
 * mot de passe dans ce produit. Le lien envoyé par email EST le mode d'accès,
 * et c'est la SEULE porte d'un fournisseur en Chine, à qui Google est
 * inaccessible. Tout ce qui pourrait le faire passer pour secondaire est donc
 * écarté : il est en premier, en grand, et le bouton Google vient après.
 *
 * LA CARTE DE VERRE A DISPARU avec le reste du flou. Le formulaire n'est plus
 * dans une carte du tout : à cette largeur, un cadre autour d'un seul champ
 * n'encadre rien.
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
    <div className="min-h-dvh bg-surface-container-lowest md:bg-canvas md:p-7">
      <main
        id="contenu"
        className="mx-auto grid w-full max-w-[1384px] overflow-hidden bg-surface-container-lowest md:min-h-[calc(100dvh-56px)] md:rounded-page-publique lg:grid-cols-2"
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

            {/* CE QUI A ÉCHOUÉ EST DIT. La route de retour redirige ici avec son
                motif depuis le premier jour, et rien ne l'affichait : un lien
                expiré ramenait l'utilisateur sur un écran identique à celui
                qu'il venait de quitter, sans un mot. Il recommence, échoue
                pareil, et conclut que le produit ne marche pas.

                `role="alert"` et non un simple paragraphe : le message apparaît
                après une navigation, donc hors du champ de quelqu'un qui
                emploie un lecteur d'écran. */}
            {motif === null ? null : (
              <p
                role="alert"
                className="mt-6 rounded-md border border-error bg-error-container p-4 font-body-sm text-body-sm text-on-error-container"
              >
                {t(`motif.${motif}`)}
              </p>
            )}

            <div className="mt-[34px]">
              <TraductionsClient espaces={["connexion"]}>
                <FormulaireConnexion locale={locale} />
              </TraductionsClient>
            </div>

            <div className="my-[26px] flex items-center gap-3.5">
              <span className="h-px flex-grow bg-outline-variant" />
              <span className="font-body-sm text-[12px] text-on-surface-variant">{t("ou")}</span>
              <span className="h-px flex-grow bg-outline-variant" />
            </div>

            {/* APRÈS le lien magique, et non avant : c'est la seule porte du
                fournisseur en Chine, Google lui étant inaccessible. Le placer en
                tête ferait passer pour secondaire le chemin qui, pour toute une
                part des utilisateurs, est le seul qui existe. */}
            <BoutonGoogle locale={locale} />

            <p className="mt-[30px] font-body-md text-[13px] leading-[21px] text-on-surface-variant">
              {t("pasDeCompteTitre")}{" "}
              <Link
                href={`/${locale}/inscription`}
                className="font-semibold text-secondary hover:underline"
              >
                {t("lienCreerCompte")}
              </Link>
            </p>
          </div>

          <p className="font-body-sm text-[12px] text-on-surface-variant">
            {t("cgvAvant")}{" "}
            <Link href={`/${locale}/conditions`} className="text-secondary hover:underline">
              {t("cgvConditions")}
            </Link>{" "}
            {t("cgvEt")}{" "}
            <Link href={`/${locale}/confidentialite`} className="text-secondary hover:underline">
              {t("cgvConfidentialite")}
            </Link>
            .
          </p>
        </div>

        <PanneauAcces />
      </main>
    </div>
  );
}

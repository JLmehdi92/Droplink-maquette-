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
 * ⚠️ CE COMMENTAIRE DISAIT « PAS DE CHAMP MOT DE PASSE » — décision renversée
 * par Wassim le 01/09/2026. Le lien magique est supprimé du produit : email et
 * mot de passe, et le bouton Google vient après.
 *
 * Ce que l'ancienne rédaction protégeait reste vrai et se déplace : le
 * fournisseur en Chine n'a pas accès à Google, donc le formulaire est en
 * premier et en grand. Mais il n'a plus besoin qu'un email ARRIVE pour entrer —
 * seulement pour réparer un oubli. Voir §2 du brief, amendé le même jour.
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
  /*
   * `service` : le serveur d'authentification n'a pas répondu. DISTINCT de
   * `session`, qui affirme une expiration, et distinct d'`indisponible`, qui
   * parle de Google. Mesuré le 02/09/2026 : deux éjections sur 200 requêtes,
   * à 11,1 s et 11,4 s — un délai de connexion dépassé — et l'écran disait
   * « Votre session a expiré ». Une affirmation que la base n'avait jamais
   * enregistrée.
   */
  "service",
  "trop",
  "fermees",
  /*
   * `confirmez` : `signUp` a rendu un utilisateur SANS session, ce qui est la
   * façon documentée d'apprendre que la confirmation d'email est active sur le
   * projet. Wassim l'a tranchée à « désactivée », donc ce motif ne devrait
   * jamais s'afficher — mais le réglage vit dans le tableau de bord, hors du
   * dépôt, et personne ici ne peut le garantir. Sans ce motif, l'inscription
   * ramènerait à un écran de connexion muet après avoir bel et bien créé le
   * compte et envoyé l'email.
   */
  "confirmez",
] as const;

function motifConnu(brut: string | undefined): (typeof MOTIFS)[number] | null {
  return MOTIFS.find((m) => m === brut) ?? null;
}

/**
 * Ce que la page sait ANNONCER, par opposition à ce qu'elle sait expliquer.
 *
 * Inventaire clos comme celui des motifs d'échec, et pour la même raison : une
 * valeur forgée dans l'URL n'affiche rien plutôt qu'une clé brute. Mais il est
 * SÉPARÉ, parce qu'un encart rouge sur une déconnexion réussie annoncerait un
 * échec à quelqu'un dont le geste vient de fonctionner.
 */
const INFOS = ["deconnecte", "deconnexion-partielle"] as const;

function infoConnue(brut: string | undefined): (typeof INFOS)[number] | null {
  return INFOS.find((i) => i === brut) ?? null;
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

  const parametres = await searchParams;
  const brut = parametres["erreur"];
  const motif = motifConnu(typeof brut === "string" ? brut : undefined);
  const brutInfo = parametres["info"];
  const info = infoConnue(typeof brutInfo === "string" ? brutInfo : undefined);

  return (
    <div className="min-h-dvh bg-canvas p-3 md:p-7">
      <main
        id="contenu"
        className="mx-auto grid min-h-[calc(100dvh-24px)] w-full max-w-[1384px] overflow-hidden rounded-[24px] bg-surface-container-lowest md:min-h-[calc(100dvh-56px)] md:rounded-page-publique lg:grid-cols-2"
      >
        <div className="flex flex-col px-[22px] pt-7 pb-[26px] md:px-[76px] md:py-10">
          <Link
            href={`/${locale}`}
            className="font-headline-md text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-on-surface md:text-[18px] md:leading-[23px]"
          >
            DropLink
          </Link>

          <div className="flex max-w-[400px] flex-grow flex-col justify-center py-[30px]">
            <h1 className="font-headline-xl text-[32px] leading-[37px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[38px] md:leading-[44px]">
              {t("titre")}
            </h1>
            <p className="mt-2.5 font-body-md text-[15px] leading-6 text-sourdine">
              <span className="md:hidden">{t("sousTitreCourt")}</span>
              <span className="hidden md:inline">{t("sousTitre")}</span>
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

            {/* NEUTRE, PAS ROUGE. Une déconnexion réussie est une confirmation :
                `role="status"` et non `alert`, filet ordinaire et non filet
                d'erreur. Elle est annoncée parce que l'écran de connexion
                ressemble beaucoup à celui qu'on quitte — sans un mot, on peut
                croire que le bouton n'a rien fait. */}
            {info === null ? null : (
              <p
                role="status"
                className="mt-6 rounded-md border border-outline-variant bg-surface-container-low p-4 font-body-sm text-body-sm text-on-surface-variant"
              >
                {t(`info.${info}`)}
              </p>
            )}

            <div className="mt-7 md:mt-[34px]">
              <TraductionsClient espaces={["connexion"]}>
                <FormulaireConnexion locale={locale} />
              </TraductionsClient>
            </div>

            {/* APRÈS le formulaire, et non avant : Google est inaccessible au
                fournisseur en Chine. Le placer en tête ferait passer pour
                secondaire le chemin qui, pour toute une part des utilisateurs,
                est le seul qui existe. */}
            <BoutonGoogle locale={locale} />

            <p className="mt-[26px] text-center font-body-md text-[14px] leading-[22px] text-sourdine md:mt-[30px] md:text-left md:text-[13px] md:leading-[21px]">
              {t("pasDeCompteTitre")}{" "}
              <Link
                href={`/${locale}/inscription`}
                className="font-semibold text-violet hover:underline"
              >
                {t("lienCreerCompte")}
              </Link>
            </p>
          </div>

          <p className="text-center font-body-sm text-[11px] leading-[18px] text-sourdine md:text-left md:text-[12px] md:leading-[15px]">
            {t("cgvAvant")}{" "}
            <Link href={`/${locale}/conditions`} className="text-violet hover:underline">
              {t("cgvConditions")}
            </Link>{" "}
            {t("cgvEt")}{" "}
            <Link href={`/${locale}/confidentialite`} className="text-violet hover:underline">
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

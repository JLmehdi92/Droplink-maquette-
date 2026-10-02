import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FormulaireConnexion } from "@/components/formulaire-connexion";
import { BoutonGoogle } from "@/components/bouton-google";
import { TraductionsClient } from "@/components/traductions-client";
import { PageAcces } from "@/components/acces/page-acces";
import { routing } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { estLangueSupportee } from "@/i18n/config";
import { entreeDejaOuverte } from "@/lib/comptes/apres-session";

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
const INFOS = ["deconnecte", "deconnexion-partielle", "compte-supprime"] as const;

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

  // Une session déjà ouverte ne repasse pas par le formulaire : voir `entreeDejaOuverte`.
  const dejaOuverte = await entreeDejaOuverte(estLangueSupportee(locale) ? locale : "fr");
  if (dejaOuverte !== null) redirect(dejaOuverte);

  const t = await getTranslations("connexion");

  const parametres = await searchParams;
  const brut = parametres["erreur"];
  const motif = motifConnu(typeof brut === "string" ? brut : undefined);
  const brutInfo = parametres["info"];
  const info = infoConnue(typeof brutInfo === "string" ? brutInfo : undefined);

  /*
   * LA CONNEXION DE LA REFONTE (maquette, `connexion.html`) : la colonne du
   * formulaire, le film « Pendant votre absence » à côté (bureau seulement).
   * La phrase « En continuant, vous acceptez… » n'y est PAS : se reconnecter
   * n'accepte rien de nouveau (arbitrage du § 5 de refonte-design.md).
   */
  return (
    <PageAcces locale={locale} film="absence" legal={false}>
      <header className="acces__tete">
        <h1 tabIndex={-1}>{t("titre")}</h1>
        <p>{t("sousTitre")}</p>
      </header>

      {/* CE QUI A ÉCHOUÉ EST DIT : un lien expiré ramenait sinon sur un écran
          identique, sans un mot. `role="alert"` : le message arrive après une
          navigation, hors du champ d'un lecteur d'écran. */}
      {motif === null ? null : (
        <p role="alert" className="formulaire__statut formulaire__statut--erreur">
          {t(`motif.${motif}`)}
        </p>
      )}
      {/* NEUTRE, PAS ROUGE : une déconnexion réussie est une confirmation. */}
      {info === null ? null : (
        <p role="status" className="formulaire__statut">
          {t(`info.${info}`)}
        </p>
      )}

      <TraductionsClient espaces={["connexion"]}>
        <FormulaireConnexion locale={locale} />
      </TraductionsClient>

      {/* APRÈS le formulaire : Google est inaccessible au fournisseur en Chine,
          le placer en tête ferait passer pour secondaire son seul chemin. */}
      <BoutonGoogle locale={locale} separateur={{ position: "avant", cle: "ou" }} />

      <p className="acces__bascule">
        {t("pasDeCompteTitre")}{" "}
        <Link className="lien-texte" href={`/${locale}/inscription`}>
          {t("lienCreerCompte")}
        </Link>
      </p>
    </PageAcces>
  );
}

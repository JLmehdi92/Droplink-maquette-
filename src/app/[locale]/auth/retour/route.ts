import { NextResponse, type NextRequest } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { lireProfilAvec } from "@/lib/comptes/profil";
import { cheminDeRefus, suivreApresSession } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";
import { verifierQuotaAuthAdresse } from "@/lib/limitation/quota";
import { redirigerVers } from "@/lib/http/rediriger";

/**
 * Retour d'un aller-retour d'authentification portant un code PKCE.
 *
 * DEUX CHEMINS Y ARRIVENT DEPUIS LE 01/09/2026, et un troisième l'a quittée :
 *
 *   - Google, qui rend la main ici après avoir identifié la personne ;
 *   - la RÉINITIALISATION de mot de passe, qui y arrive avec `suite=mot-de-passe` ;
 *   - le lien magique, SUPPRIMÉ. Il n'existe plus de `signInWithOtp` dans le
 *     produit.
 *
 * Route handler et non Server Action : c'est le navigateur qui arrive ici par
 * une navigation, avec un code dans l'URL. Le brief réserve les route handlers
 * aux webhooks ET aux callbacks d'authentification — celui-ci en est un.
 *
 * ⚠️ La surface /api est exclue du middleware, mais celle-ci ne l'est pas :
 * elle vit sous [locale] précisément pour que la langue du destinataire soit
 * conservée entre le clic dans l'email et l'arrivée dans l'application.
 *
 * ⚠️ CE FICHIER PORTAIT SEUL DEUX GARDES DE TOUT LE PRODUIT — l'interrupteur
 * d'inscription et le comptage des inscriptions. Elles vivent désormais dans
 * `lib/comptes/apres-session`, appelée par les trois chemins qui ouvrent une
 * session. La raison complète y est écrite ; en deux mots : elles sont restées
 * ici tant qu'il n'y avait qu'un chemin, et ce n'est plus le cas.
 */
export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";

  const code = requete.nextUrl.searchParams.get("code");
  /*
   * ⚠️ DEUX FORMES DE PREUVE ARRIVENT ICI, ET LA SECONDE MANQUAIT.
   *
   * DÉFAUT MESURÉ LE 02/09/2026 en suivant un vrai lien de récupération :
   * `/auth/v1/verify` de Supabase répond `303` vers notre route avec le jeton
   * dans un **FRAGMENT** — `#access_token=…`. Un fragment n'est JAMAIS envoyé au
   * serveur : la route ne voyait donc rien et répondait « lien incomplet ».
   *
   * Le `code` PKCE, lui, n'arrive que si le lien est ouvert DANS LE MÊME
   * NAVIGATEUR que la demande : le vérificateur vit dans un cookie posé à ce
   * moment-là. Or on demande une réinitialisation sur son ordinateur et on ouvre
   * ses mails sur son téléphone — c'est même le cas le plus courant.
   *
   * `token_hash` est la forme que Supabase documente POUR LE SERVEUR : elle
   * voyage dans la requête, elle ne dépend d'aucun cookie, donc elle traverse
   * les appareils. On accepte les deux, et on refuse toujours ce qui n'est ni
   * l'un ni l'autre.
   */
  const empreinteJeton = requete.nextUrl.searchParams.get("token_hash");
  const versMotDePasse = requete.nextUrl.searchParams.get("suite") === "mot-de-passe";
  /*
   * LA CONFIRMATION D'UNE NOUVELLE ADRESSE, demandée depuis les paramètres.
   *
   * Elle ne connecte personne de nouveau : elle termine un geste fait depuis
   * une session. Le retour se fait donc vers l'écran d'où il est parti, et
   * c'est cet écran qui LIT l'adresse en base pour dire si la bascule est faite
   * — le serveur d'authentification peut exiger une seconde confirmation, sur
   * l'ancienne adresse, et l'écran n'affirme que ce que la base porte.
   */
  const versAdresse = requete.nextUrl.searchParams.get("suite") === "adresse";

  // Un lien sans preuve est un lien tronqué par une messagerie, ou une visite
  // directe. On renvoie vers la connexion plutôt que d'afficher une erreur
  // technique : la personne n'a rien fait de mal et n'a qu'une action utile.
  if (code === null && empreinteJeton === null) {
    return redirigerVers(`/${langue}/connexion?erreur=lien`);
  }

  /*
   * ⚠️ CETTE ROUTE N'AVAIT AUCUN PLAFOND, et c'était le SEUL chemin du produit
   * à la fois non authentifié et sans compteur.
   *
   * Mesuré le 02/09/2026 : 60 appels parallèles avec des codes inventés, tous
   * traités, aucun refus. Chacun déclenche un `exchangeCodeForSession` — donc
   * nous fait payer un échange PKCE chez le fournisseur d'authentification, et
   * ronge la limite de requêtes qu'il nous impose par adresse IP. Un point
   * d'entrée gratuit à solliciter et coûteux à servir.
   *
   * LE COMPTEUR EST CELUI DES ENVOIS (`auth-ip`), pas un quatrième : on arrive
   * ici APRÈS avoir cliqué un lien reçu par email, donc dans la continuité du
   * geste que ce compteur borne déjà. Un compteur à part offrirait un budget de
   * plus à qui alterne les deux.
   *
   * LE REFUS EMPRUNTE LE CHEMIN DES LIENS PÉRIMÉS : un code refusé pour cause de
   * quota et un code réellement expiré se réparent de la même façon — en
   * redemandant un lien — et les distinguer n'apprendrait rien d'utile à qui a
   * cliqué, tout en renseignant qui sonde.
   */
  const quota = await verifierQuotaAuthAdresse();
  if (!quota.autorise) {
    return redirigerVers(`/${langue}/connexion?erreur=expire`);
  }

  const supabase = await creerClientServeur();

  /*
   * UNE SEULE SORTIE D'ÉCHEC POUR LES DEUX FORMES. Lien expiré, déjà consommé,
   * émis pour un autre navigateur, ou empreinte inconnue : les quatre se
   * corrigent de la même façon — en redemandant un lien — et les distinguer
   * n'apprendrait rien à qui a cliqué, tout en renseignant qui sonde.
   */
  const { error } =
    empreinteJeton !== null
      ? await supabase.auth.verifyOtp({
          token_hash: empreinteJeton,
          // `recovery` sur le chemin du mot de passe, `email` sinon — c'est le
          // type que Supabase attend pour une confirmation d'inscription.
          type: versMotDePasse ? "recovery" : versAdresse ? "email_change" : "email",
        })
      : await supabase.auth.exchangeCodeForSession(code ?? "");

  if (error !== null) {
    return redirigerVers(`/${langue}/connexion?erreur=expire`);
  }

  if (versAdresse) {
    return redirigerVers(`/${langue}/parametres?adresse=suivie`);
  }

  if (versMotDePasse) {
    /*
     * RÉINITIALISATION : ON NE PASSE PAS PAR `suivreApresSession`.
     *
     * Elle enverrait vers les commandes ou vers l'onboarding — c'est-à-dire
     * partout sauf à l'écran de saisie que cette personne vient d'ouvrir un
     * email pour atteindre. Les deux gardes qui comptent ici sont reprises
     * telles quelles : un compte introuvable ou suspendu ne choisit pas de
     * nouveau mot de passe.
     *
     * ⚠️ ET LA SESSION EST DÉJÀ OUVERTE À CET INSTANT. C'est ainsi que
     * fonctionne la récupération : le lien AUTHENTIFIE. L'écran de saisie n'est
     * donc pas protégé par un jeton qu'il faudrait vérifier, mais par le fait
     * que seul le possesseur de la boîte a pu arriver jusqu'ici.
     */
    const profil = await lireProfilAvec(supabase);
    if (profil === null) {
      return redirigerVers(cheminDeRefus(langue, "profil"));
    }
    if (profil.statut === "suspended") {
      return redirigerVers(cheminDeRefus(langue, "suspendu"));
    }
    return redirigerVers(`/${langue}/nouveau-mot-de-passe`);
  }

  const suite = await suivreApresSession(langue, supabase);

  return redirigerVers(suite.ok ? suite.chemin : cheminDeRefus(langue, suite.motif));
}

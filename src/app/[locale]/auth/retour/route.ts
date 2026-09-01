import { NextResponse, type NextRequest } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { lireProfilAvec } from "@/lib/comptes/profil";
import { cheminDeRefus, suivreApresSession } from "@/lib/comptes/apres-session";
import { estLangueSupportee } from "@/i18n/config";

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
  const versMotDePasse = requete.nextUrl.searchParams.get("suite") === "mot-de-passe";

  // Un lien sans code est un lien tronqué par une messagerie, ou une visite
  // directe. On renvoie vers la connexion plutôt que d'afficher une erreur
  // technique : la personne n'a rien fait de mal et n'a qu'une action utile.
  if (code === null) {
    return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=lien`, requete.url));
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    // Lien expiré, déjà consommé, ou émis pour un autre navigateur. Les trois
    // se corrigent de la même façon : en redemandant un lien.
    return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=expire`, requete.url));
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
      return NextResponse.redirect(new URL(cheminDeRefus(langue, "profil"), requete.url));
    }
    if (profil.statut === "suspended") {
      return NextResponse.redirect(new URL(cheminDeRefus(langue, "suspendu"), requete.url));
    }
    return NextResponse.redirect(new URL(`/${langue}/nouveau-mot-de-passe`, requete.url));
  }

  const suite = await suivreApresSession(langue, supabase);

  return NextResponse.redirect(
    new URL(suite.ok ? suite.chemin : cheminDeRefus(langue, suite.motif), requete.url),
  );
}

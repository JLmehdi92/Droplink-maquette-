import { NextResponse, type NextRequest } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { lireProfilVendeur, onboardingAFaire } from "@/lib/comptes/profil";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { emettre } from "@/lib/instrumentation/emettre";
import { estLangueSupportee } from "@/i18n/config";

/**
 * Retour du lien de connexion envoye par email.
 *
 * Route handler et non Server Action : c'est le navigateur qui arrive ici par
 * une navigation, avec un code dans l'URL. Le brief reserve les route handlers
 * aux webhooks ET aux callbacks d'authentification — celui-ci en est un.
 *
 * ⚠️ La surface /api est exclue du middleware, mais celle-ci ne l'est pas :
 * elle vit sous [locale] precisement pour que la langue du destinataire soit
 * conservee entre le clic dans l'email et l'arrivee dans l'application.
 */
export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";

  const code = requete.nextUrl.searchParams.get("code");

  // Un lien sans code est un lien tronque par une messagerie, ou une visite
  // directe. On renvoie vers la connexion plutot que d'afficher une erreur
  // technique : l'utilisateur n'a rien fait de mal et n'a qu'une action utile.
  if (code === null) {
    return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=lien`, requete.url));
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    // Lien expire, deja consomme, ou emis pour un autre navigateur. Les trois
    // se corrigent de la meme facon : en redemandant un lien.
    return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=expire`, requete.url));
  }

  const profil = await lireProfilVendeur();
  if (profil === null) {
    // La session existe mais le profil est introuvable : le declencheur de
    // creation n'a pas tourne, ou la ligne a ete supprimee. On ne laisse pas
    // l'utilisateur dans un espace authentifie sans profil, ou chaque ecran
    // echouerait separement sans expliquer pourquoi.
    return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=profil`, requete.url));
  }

  if (profil.statut === "suspended") {
    return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=suspendu`, requete.url));
  }

  if (onboardingAFaire(profil)) {
    /*
     * ⚠️ LA PORTE D'ENTRÉE SE FERME ICI, ET NULLE PART AILLEURS.
     *
     * Le geste naturel serait `shouldCreateUser: false` à l'envoi du lien. Il
     * est INTERDIT sur ce produit, et la mesure le dit : un email sans compte
     * rend 422 `otp_disabled` en 49 ms, un email avec compte autre chose en
     * 778 ms. Seize fois d'écart, lisible depuis l'extérieur même après
     * uniformisation des codes — n'importe qui pourrait balayer des adresses et
     * apprendre lesquelles ont un compte ici, ce qui est exactement la liste que
     * ce marché achète.
     *
     * Ici, la personne a cliqué : elle possède la boîte, et aucun balayage
     * anonyme n'atteint ce chemin. Fermer coûte donc un message à quelqu'un de
     * réel, et rien à personne d'autre.
     *
     * LA LECTURE QUI ÉCHOUE LAISSE ENTRER. Le défaut de la fonction en base est
     * « ouvert » ; le répéter ici évite qu'une base momentanément illisible
     * ferme le produit sans que personne l'ait décidé.
     */
    const { data: ouvertes, error: erreurPorte } = await supabase.rpc(
      "lire_inscriptions_ouvertes",
    );
    if (erreurPorte !== null) {
      console.error("[auth] interrupteur d'inscription illisible — " + erreurPorte.message);
    } else if (ouvertes === false) {
      return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=fermees`, requete.url));
    }

    /*
     * L'INSCRIPTION EST COMPTÉE ICI, UNE SEULE FOIS, ET LA MARQUE EST EN BASE.
     *
     * Pas au moment de la demande de lien : mesuré sur ce projet, une demande
     * crée `auth.users`, `profiles` et `shops` AVANT tout clic. Compter là
     * gonflerait le dénombrement de toutes les fautes de frappe et de tout
     * balayage d'adresses.
     *
     * Ici, la personne a prouvé qu'elle possède la boîte : elle a cliqué.
     *
     * MAIS LE CRITÈRE « ONBOARDING À FAIRE » NE RENDAIT PAS L'ÉMISSION UNIQUE,
     * contrairement à ce qui était écrit ici. Il vaut `account_type is null`,
     * donc il reste vrai tant que l'onboarding n'est pas soumis : un vendeur qui
     * clique son lien trois jours de suite avant de le remplir produisait TROIS
     * inscriptions pour UN compte. Sur un DÉNOMINATEUR, cela fait baisser le
     * taux d'activation — et le biais est corrélé au comportement mesuré, donc
     * il amplifie sa propre erreur.
     *
     * La marque est donc réclamée en base, et RENDUE si l'émission échoue : une
     * marque consommée avant une opération qui peut échouer perd l'événement
     * définitivement.
     */
    const supabaseMarque = await creerClientServeur();
    const { data: reclamee } = await supabaseMarque.rpc("reclamer_evenement_inscription");

    if (reclamee === true) {
      const parti = await emettre(EVENEMENTS.INSCRIPTION, { sujet: profil.profilId }, { langue });
      if (!parti) {
        await supabaseMarque.rpc("liberer_evenement_inscription");
      }
    }

    return NextResponse.redirect(new URL(`/${langue}/bienvenue`, requete.url));
  }

  // Un vendeur qui se connecte veut ses commandes, pas la page de presentation
  // du produit qu'il utilise deja.
  return NextResponse.redirect(new URL(`/${langue}/commandes`, requete.url));
}

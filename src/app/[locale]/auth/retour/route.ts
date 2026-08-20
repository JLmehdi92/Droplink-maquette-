import { NextResponse, type NextRequest } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
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

  // Le tableau de bord arrive au lot 4. En attendant, la racine localisee est la
  // seule destination qui existe reellement — rediriger vers une route absente
  // produirait un 404 juste apres une connexion reussie, ce qui se lit comme un
  // echec de connexion.
  return NextResponse.redirect(new URL(`/${langue}`, requete.url));
}

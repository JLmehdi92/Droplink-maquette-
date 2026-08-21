import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { clePubliable, urlSupabase } from "@/lib/supabase/config";

/**
 * CHAQUE EXCLUSION DE CE MATCHER EST UNE PORTE.
 *
 * Le middleware négocie la langue ET rafraîchit la session. Il portera plus tard
 * la protection de `/admin`. Ses exclusions se justifient donc une par une :
 * une exclusion posée sans raison devient une faille dès qu'on ajoute une
 * responsabilité au middleware.
 *
 * Les deux premieres portent `(?:/|$)` et non le nom nu. Sans cette precision,
 * `api|p` excluait TOUT chemin commencant par ces lettres : `/pricing`,
 * `/partenaires`, `/apidocs` et `/pages` tombaient hors du middleware. Une
 * exclusion prevue pour UNE route en couvrait une famille entiere, et rien ne
 * l aurait signale tant que le middleware ne fait que choisir une langue.
 *
 * - `api`      : surface machine. Elle est HORS du middleware par nécessité,
 *                donc CHAQUE route y porte sa propre garde. Le préfixe
 *                `/api/admin/...` donnerait l'impression contraire à qui relit.
 * - `p`        : la page publique par jeton. Hors langue par conception.
 * - `_next`,
 *   `_vercel`  : artefacts du framework.
 * - `.*\\..*`   : LA PLUS LARGE, et la plus dangereuse. Elle vise les fichiers
 *                statiques, mais elle exclut aussi n'importe quel segment de
 *                route contenant un point — un `rapport.png` en sortirait sans
 *                que rien ne le signale. Une sonde inventorie les routes réelles
 *                et vérifie qu'aucune ne tombe dedans par accident.
 */
export const config = {
  matcher: "/((?!api(?:/|$)|p(?:/|$)|_next|_vercel|.*\\..*).*)",
};

const gestionLangue = createMiddleware(routing);

/**
 * LE MIDDLEWARE NE PROTÈGE AUCUNE DONNÉE À LUI SEUL.
 *
 * Il fait UNE chose de sécurité : garder les cookies de session à jour, pour
 * qu'une session valide ne s'éteigne pas en cours de route. La garde qui fait
 * autorité vit dans le code qui LIT les données — `exigerSession()` en tête de
 * chaque page authentifiée, et la vérification du rôle EN BASE pour l'admin.
 * Un middleware qui semblerait suffire ferait qu'on n'écrirait plus la vraie
 * garde, et la première route ajoutée hors du matcher serait ouverte.
 *
 * L'ORDRE COMPTE. La réponse de next-intl est construite d'abord, puis les
 * cookies rafraîchis y sont posés. Créer une réponse APRÈS le rafraîchissement
 * perdrait les cookies mis à jour : ils auraient été écrits sur un objet qu'on
 * jette, et la session expirerait silencieusement au bout d'une heure sans que
 * rien ne l'explique.
 */
/**
 * Vrai quand le chemin vise la surface d'administration.
 *
 * Le segment est RÉEL — `/fr/admin/...` — et jamais un groupe entre parenthèses.
 * Un groupe n'ajoute rien à l'URL : les écrans tomberaient hors de ce filtre
 * tout en paraissant rangés au bon endroit, ce qui est la pire combinaison.
 *
 * La langue est acceptée sous n'importe quelle casse et le préfixe peut manquer :
 * ne reconnaître que `/fr/admin` laisserait `/FR/admin` et `/admin` franchir le
 * filtre. Ils ne mèneraient nulle part aujourd'hui — mais une protection qui
 * tient à ce qu'une redirection ait lieu D'ABORD n'est pas une protection.
 */
function viseAdmin(chemin: string): boolean {
  return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?admin(?:\/|$)/i.test(chemin);
}

export default async function middleware(requete: NextRequest): Promise<NextResponse> {
  const reponse = gestionLangue(requete);

  const supabase = createServerClient(urlSupabase(), clePubliable(), {
    cookies: {
      getAll() {
        return requete.cookies.getAll();
      },
      setAll(aPoser) {
        for (const { name, value, options } of aPoser) {
          reponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getSession()` déclenche le renouvellement quand le jeton d'accès a expiré,
  // et ne fait AUCUN appel réseau quand il est encore valide — donc rien du tout
  // pour un visiteur anonyme, qui n'a pas de cookie de session. C'est ce qui
  // rend ce middleware indolore sur la landing, la page qui doit être la plus
  // rapide du produit.
  //
  // On ne vérifie pas l'identité ici : ce n'est pas le rôle du middleware, et le
  // faire donnerait l'illusion d'une protection. Voir `lib/auth/session.ts`.
  const { data } = await supabase.auth.getSession();

  /*
   * PREMIÈRE COUCHE SUR `/admin`, ET RIEN DE PLUS.
   *
   * Elle écarte les visiteurs SANS SESSION. Elle ne vérifie PAS le rôle : le
   * middleware s'exécute au bord, sur chaque navigation, et y lire `profiles`
   * ajouterait un aller-retour vers la base à toutes les pages du produit. La
   * garde qui fait autorité est `exigerAdmin()`, qui lit le rôle EN BASE dans
   * chaque page et chaque Server Action — et qui reste indispensable, puisque
   * les Server Actions ne passent jamais par ici.
   *
   * 404 ET JAMAIS 403. Un 403 confirme que la surface existe ; un 404 ne dit
   * rien. C'est ce qui sépare « il y a un back-office ici, cherchons une
   * faille » de « il n'y a rien ». Le corps de la réponse est vide pour la même
   * raison : une page d'erreur reconnaissable serait un aveu.
   */
  if (data.session === null && viseAdmin(requete.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  return reponse;
}

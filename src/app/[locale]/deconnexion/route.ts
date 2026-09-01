import { NextResponse, type NextRequest } from "next/server";
import { estLangueSupportee } from "@/i18n/config";
import { memeOrigine } from "@/lib/auth/meme-origine";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * SE DÉCONNECTER.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ELLE N'EXISTAIT PAS, ET CE N'ÉTAIT PAS UN OUBLI DE CONFORT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 01/09/2026, le dépôt entier ne contenait qu'UNE occurrence du mot
 * `logout` : le TRACÉ de l'icône dans le système de design. Le geste avait été
 * dessiné puis jamais branché.
 *
 * Ce que ça coûtait, concrètement : le cookie de session vaut QUATRE CENTS
 * JOURS et le middleware le rafraîchit à chaque passage. Sur un téléphone prêté
 * ou un ordinateur partagé — le persona qui revend en messagerie privée —, le
 * suivant qui ouvre le navigateur avait l'éditeur, l'export CSV, et les NOTES
 * INTERNES, qui portent le prix d'achat.
 *
 * Avec un lien magique, une session traînante était déjà gênante. Avec un mot
 * de passe, elle est incompréhensible : on s'attend à pouvoir fermer ce qu'on a
 * ouvert.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN ROUTE HANDLER, ET NON UNE SERVER ACTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même raison que les gestes de la liste : il faut une VRAIE redirection HTTP
 * que le navigateur suit, et un formulaire qui fonctionne SANS JavaScript. Une
 * Server Action exige le paquet client de React ; un `<form method="post">`
 * n'exige rien du tout. Sur le seul geste dont le rôle est de protéger un
 * compte, dépendre du chargement d'un script serait un choix étrange : c'est
 * précisément quand quelque chose ne marche pas qu'on veut se déconnecter.
 *
 * ⚠️ SOUS `[locale]`, JAMAIS SOUS `/api`. Le matcher du middleware exclut
 * `/api` : une route `/api/deconnexion` ne serait couverte par RIEN, et son
 * préfixe donnerait l'impression contraire à qui la relit.
 *
 * ⚠️ UNE SEULE ROUTE POUR LES DEUX SURFACES. Le vendeur et l'administrateur ne
 * ferment pas deux choses différentes : ils ferment la même session. Deux routes
 * auraient fini par diverger, et c'est celle qu'on emprunte le moins — celle de
 * l'administration — qui serait restée en arrière.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PAS DE `GET`. Une déconnexion atteignable par une simple navigation se
 * déclencherait sur une image, un préchargement de lien, ou un `<img src>` posé
 * dans une page tierce. Ce ne serait pas une faille — personne n'y gagne rien —
 * mais une nuisance parfaitement évitable, et l'absence de méthode `GET` la
 * ferme d'elle-même.
 */
export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params;
  const langue = estLangueSupportee(locale) ? locale : "fr";

  if (!memeOrigine(requete)) {
    // Une déconnexion forcée depuis un site tiers est une nuisance, pas un vol
    // de données. On la ferme quand même : c'est gratuit, et une garde qu'on
    // n'applique qu'aux gestes « importants » est une garde qu'on oublie
    // d'appliquer le jour où l'on se trompe sur ce qui est important.
    return new NextResponse(null, { status: 403 });
  }

  const supabase = await creerClientServeur();

  /*
   * `signOut()` FAIT DEUX CHOSES, ET LES DEUX COMPTENT.
   *
   * Il révoque le jeton de rafraîchissement CÔTÉ SERVEUR d'authentification, et
   * il émet l'événement qui fait réécrire nos cookies à `maxAge: 0` par le
   * `setAll` de `creerClientServeur`. Effacer les cookies sans révoquer
   * laisserait une session parfaitement valide entre les mains de qui aurait
   * copié le cookie ; révoquer sans effacer laisserait le navigateur renvoyer un
   * jeton mort à chaque requête.
   *
   * ⚠️ PORTÉE PAR DÉFAUT, C'EST-À-DIRE `global` : toutes les sessions du compte
   * tombent, pas seulement celle de ce navigateur. C'est ce qu'attend quelqu'un
   * qui se déconnecte d'un appareil qu'il ne possède pas — et c'est la seule
   * portée qui rende le geste utile sur le téléphone prêté.
   *
   * L'ÉCHEC NE RETIENT PAS L'UTILISATEUR. Si le serveur d'authentification est
   * injoignable, les cookies sont tout de même effacés et l'on redirige : garder
   * quelqu'un connecté parce qu'on n'a pas pu enregistrer sa déconnexion serait
   * le pire des deux mondes. Le journal porte la trace, pour qu'une révocation
   * qui échoue en série ne passe pas inaperçue.
   */
  const { error } = await supabase.auth.signOut();
  if (error !== null) {
    console.error("[auth] déconnexion incomplète — " + error.message);
  }

  /*
   * `303`, JAMAIS `307`. Un `307` conserverait la méthode : le navigateur
   * reposterait sur l'écran de connexion, et chaque rafraîchissement rejouerait
   * la déconnexion. `303 See Other` impose un `GET` — c'est le motif
   * POST-redirect-GET.
   */
  /*
   * ⚠️ `info`, ET NON `erreur`. L'écran de connexion rend les motifs d'`erreur`
   * dans un encart rouge : y faire passer une déconnexion réussie annoncerait
   * un échec à quelqu'un dont le geste vient de fonctionner. Deux paramètres,
   * deux traitements — et l'inventaire des valeurs admises est clos des deux
   * côtés, donc un motif forgé dans l'URL n'affiche rien.
   */
  return NextResponse.redirect(new URL(`/${langue}/connexion?info=deconnecte`, requete.url), 303);
}
